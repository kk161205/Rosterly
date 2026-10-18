"""
Employee Profile Service — handles detailed employee profile queries, profile updates,
document vault management, and asset assignment retrieval with fine-grained ABAC.
"""
from datetime import datetime, timezone
import os
import re
import uuid
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session, aliased

from app.core.config import settings
from app.core.errors import AppError, FileInvalidError
from app.core.role_policy import (
    assert_can_manage_user,
    set_additional_roles,
    user_role_names,
    validate_role_set,
)
from app.core.security import CurrentUser, check_permission, roles_granting
from app.models.assets import Asset, AssetAssignment
from app.models.auth import Department, Role, User
from app.models.lifecycle import (
    Checklist,
    ChecklistItem,
    ChecklistItemStatus,
    Document,
    DocumentType,
)
from app.models.system import AuditLog
from app.modules.employees.profile_schemas import EmployeeProfileUpdateRequest
from app.modules.auth.service import logout_all_user_sessions
from app.modules.notifications.dispatch import notify_role_changed

# Canonical absolute upload directory root (independent of CWD)
UPLOAD_BASE_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "uploads")
)


class EmployeeProfileService:
    """Service providing fine-grained ABAC for Employee Profile Detail (§5.4)."""

    def __init__(self, db: Session, current_user: CurrentUser, ip_address: str | None = None):
        self.db = db
        self.current_user = current_user
        self.ip_address = ip_address or "unknown"

    def _visibility(self, broad_roles: set[str]) -> str:
        """Multi-role scope (§5.14), widest wins: "all" if any held role sees the
        whole company (`broad_roles`, already excluding employee/manager),
        "department" for a manager, otherwise "self"."""
        if broad_roles:
            return "all"
        if self.current_user.has_role("manager"):
            return "department"
        return "self"

    def get_employee_profile(self, employee_id: UUID) -> dict[str, Any]:
        """
        Get detailed employee profile record with row-level ABAC department scoping.
        Allowed roles: self, manager (own dept), hr_admin, super_admin, auditor.
        Denied roles: it_admin (403). Out-of-dept manager gets 403.
        """
        scope = self._visibility(
            roles_granting(self.current_user, "employee", "read", self.db) - {"employee", "manager"}
        )
        # RBAC (project doc §3.2 step 2): GET /employees/{id} (§5.4) is granted to
        # every role except it_admin at the coarse role level — mapped to
        # (resource="employee", action="read"). "employee" role itself is included
        # in this grant so it can pass this gate and reach the is_self check just
        # below; the self/department scoping that follows is ABAC (§3.2 step 3)
        # and is left unchanged.
        check_permission(self.current_user, "employee", "read", self.db)

        is_self = str(self.current_user.user_id) == str(employee_id)
        if scope == "self" and not is_self:
            raise AppError(
                status_code=403,
                code="forbidden",
                message="Employees may only view their own profile.",
            )

        ManagerUser = aliased(User)
        target = (
            self.db.query(
                User,
                Department.name.label("department_name"),
                Role.name.label("role_name"),
                ManagerUser.full_name.label("manager_name"),
                ManagerUser.designation.label("manager_designation"),
            )
            .outerjoin(Department, User.department_id == Department.id)
            .outerjoin(Role, User.role_id == Role.id)
            .outerjoin(ManagerUser, User.manager_id == ManagerUser.id)
            .filter(User.id == employee_id)
            .first()
        )

        if not target:
            raise AppError(status_code=404, code="not_found", message="Employee not found.")

        user_obj, dept_name, role_name, manager_name, manager_designation = target

        # Row-level department scoping for manager role
        if scope == "department" and not is_self:
            if (
                not self.current_user.department_id
                or user_obj.department_id != self.current_user.department_id
            ):
                raise AppError(
                    status_code=403,
                    code="forbidden",
                    message="Managers may only view employees within their own department.",
                )

        status_val = (
            user_obj.status.value
            if hasattr(user_obj.status, "value")
            else str(user_obj.status)
        )

        manager_node = None
        if user_obj.manager_id and manager_name:
            manager_node = {
                "id": user_obj.manager_id,
                "full_name": manager_name,
                "designation": manager_designation or "",
                "department": None,
                "role": None,
            }

        # Direct reports (§5.4 Overview Tab reporting hierarchy tree) — the
        # inverse of manager_id, previously never computed at all so the tree
        # always rendered empty regardless of whether the employee actually
        # had reports.
        DirectReportRole = aliased(Role)
        DirectReportDept = aliased(Department)
        direct_report_rows = (
            self.db.query(
                User,
                DirectReportRole.name.label("role_name"),
                DirectReportDept.name.label("department_name"),
            )
            .outerjoin(DirectReportRole, User.role_id == DirectReportRole.id)
            .outerjoin(DirectReportDept, User.department_id == DirectReportDept.id)
            .filter(User.manager_id == employee_id)
            .order_by(User.full_name.asc())
            .all()
        )
        direct_reports = [
            {
                "id": report.id,
                "full_name": report.full_name,
                "designation": report.designation,
                "department": report_dept_name,
                "role": report_role_name,
            }
            for report, report_role_name, report_dept_name in direct_report_rows
        ]

        return {
            "id": user_obj.id,
            "employee_code": user_obj.employee_code,
            "full_name": user_obj.full_name,
            "email": user_obj.email,
            "role_id": user_obj.role_id,
            "role_name": role_name or "employee",
            "additional_roles": [{"id": r.id, "name": r.name} for r in user_obj.additional_roles],
            "department_id": user_obj.department_id,
            "department_name": dept_name,
            "manager_id": user_obj.manager_id,
            "manager_name": manager_name,
            "manager": manager_node,
            "direct_reports": direct_reports,
            "designation": user_obj.designation,
            "phone": user_obj.phone,
            "emergency_contact_name": user_obj.emergency_contact_name,
            "emergency_contact_phone": user_obj.emergency_contact_phone,
            "status": status_val,
            "date_of_joining": user_obj.date_of_joining,
            "date_of_exit": user_obj.date_of_exit,
            "created_at": user_obj.created_at,
        }

    def patch_employee_profile(
        self, employee_id: UUID, payload: EmployeeProfileUpdateRequest
    ) -> dict[str, Any]:
        """
        Update employee profile details with strict field-level access control (PRD §5.4).

        - Manager / IT Admin / Auditor -> 403 Forbidden
        - Self (Employee) -> Can only update 'phone'. Any restricted field or 'address' -> 400 Bad Request
        - HR Admin / Super Admin -> Can update full_name, designation, department_id, role_id, status, manager_id, phone
        """
        is_self = str(self.current_user.user_id) == str(employee_id)
        is_hr_or_super = self.current_user.has_role("hr_admin", "super_admin")

        # Role gating only applies to editing SOMEONE ELSE's profile — self-editing
        # your own limited fields (phone) is always allowed regardless of role,
        # matching the doc's "Self (limited fields)" access row independently of
        # the "HR Admin/Super Admin (full)" row. This self-edit bypass is ABAC
        # (§3.2 step 3); the not-self branch below is a pure role check (§3.2 step
        # 2) mapped to (resource="employee", action="update"), granted only to
        # hr_admin/super_admin — ported from the hardcoded role-string checks that
        # used to deny manager/it_admin/auditor/employee individually here.
        if not is_self:
            check_permission(self.current_user, "employee", "update", self.db)

        target_user = self.db.query(User).filter(User.id == employee_id).first()
        if not target_user:
            raise AppError(status_code=404, code="not_found", message="Employee not found.")

        # Snapshot before any HR/Admin fields change, so we can audit-log and
        # detect whether a session-revoking field (role_id/status) actually changed.
        before_role_id = target_user.role_id
        before_status = target_user.status
        before_department_id = target_user.department_id
        before_manager_id = target_user.manager_id

        set_fields = payload.model_dump(exclude_unset=True)

        if is_self:
            # Reject address explicitly if present
            if "address" in set_fields:
                raise AppError(
                    status_code=400,
                    code="bad_request",
                    message="Address field storage is not supported by database schema. Profile update rejected.",
                )

            # Validate that self only updates allowed fields. Emergency contact
            # is included per §5.4's Overview Tab spec ("inline pencil edit
            # toggle (HR Admin / self)") — self can edit their own contact
            # details, unlike role_id/status/department_id/manager_id below.
            allowed_self_fields = {"phone", "emergency_contact_name", "emergency_contact_phone"}
            restricted_fields = set(set_fields.keys()) - allowed_self_fields
            if restricted_fields:
                restricted_field = sorted(list(restricted_fields))[0]
                raise AppError(
                    status_code=400,
                    code="bad_request",
                    message=f"Self role may only update phone. Restricted field '{restricted_field}' requires HR/Admin permissions.",
                )

        # Rejection of address field for HR/Admin as well since DB column does not exist
        if "address" in set_fields:
            raise AppError(
                status_code=400,
                code="bad_request",
                message="Address field storage is not supported by database schema.",
            )

        # Apply updates based on payload
        if "phone" in set_fields:
            target_user.phone = (payload.phone or "").strip() or None

        if "emergency_contact_name" in set_fields:
            target_user.emergency_contact_name = (payload.emergency_contact_name or "").strip() or None

        if "emergency_contact_phone" in set_fields:
            target_user.emergency_contact_phone = (payload.emergency_contact_phone or "").strip() or None

        if is_hr_or_super:
            # §5.14 privileged-role rule applies here too: HR can't change a
            # super_admin/it_admin user's role or status, or grant either role.
            changes_access = ("role_id" in set_fields and payload.role_id is not None) or (
                "status" in set_fields and payload.status is not None
            )
            if changes_access:
                # Every role the target holds counts, primary and additional (§5.14).
                assert_can_manage_user(self.current_user, user_role_names(target_user))

            if "full_name" in set_fields and payload.full_name is not None:
                name_clean = payload.full_name.strip()
                if name_clean:
                    target_user.full_name = name_clean

            if "designation" in set_fields and payload.designation is not None:
                desig_clean = payload.designation.strip()
                if desig_clean:
                    target_user.designation = desig_clean

            if "department_id" in set_fields:
                if payload.department_id is not None:
                    dept = (
                        self.db.query(Department)
                        .filter(Department.id == payload.department_id)
                        .first()
                    )
                    if not dept:
                        raise AppError(
                            status_code=404,
                            code="not_found",
                            message="Department not found.",
                        )
                    target_user.department_id = dept.id
                else:
                    target_user.department_id = None

            if "role_id" in set_fields:
                if payload.role_id is not None:
                    role_obj = (
                        self.db.query(Role)
                        .filter(Role.id == payload.role_id)
                        .first()
                    )
                    if not role_obj:
                        raise AppError(
                            status_code=404,
                            code="not_found",
                            message="Role not found.",
                        )
                    # Same multi-role rule as User Management (§5.14): the new
                    # primary must not clash with the roles already held; if it
                    # was one of the additional roles, it moves to primary.
                    extra = validate_role_set(self.db, self.current_user, role_obj, list(target_user.additional_roles))
                    target_user.role_id = role_obj.id
                    set_additional_roles(self.db, target_user, extra, self.current_user.user_id)

            if "status" in set_fields and payload.status is not None:
                target_user.status = payload.status

            if "manager_id" in set_fields:
                if payload.manager_id is not None:
                    if str(payload.manager_id) == str(employee_id):
                        raise AppError(
                            status_code=400,
                            code="bad_request",
                            message="An employee cannot be their own manager.",
                        )
                    mgr_user = (
                        self.db.query(User)
                        .filter(User.id == payload.manager_id)
                        .first()
                    )
                    if not mgr_user:
                        raise AppError(
                            status_code=404,
                            code="not_found",
                            message="Manager user not found.",
                        )
                    target_user.manager_id = mgr_user.id
                else:
                    target_user.manager_id = None

        role_changed = target_user.role_id != before_role_id
        status_changed = target_user.status != before_status
        department_changed = target_user.department_id != before_department_id
        manager_changed = target_user.manager_id != before_manager_id

        if role_changed:
            # §6: critical account_updated notification to the affected user
            new_role_name = self.db.query(Role.name).filter(Role.id == target_user.role_id).scalar() or ""
            notify_role_changed(self.db, target_user.id, new_role_name)

        if role_changed or status_changed or department_changed or manager_changed:
            self.db.add(
                AuditLog(
                    id=uuid.uuid4(),
                    actor_id=self.current_user.user_id,
                    action="employee.profile_updated",
                    entity_type="user",
                    entity_id=target_user.id,
                    before_state={
                        "role_id": str(before_role_id) if before_role_id else None,
                        "status": before_status.value if hasattr(before_status, "value") else str(before_status),
                        "department_id": str(before_department_id) if before_department_id else None,
                        "manager_id": str(before_manager_id) if before_manager_id else None,
                    },
                    after_state={
                        "role_id": str(target_user.role_id) if target_user.role_id else None,
                        "status": target_user.status.value if hasattr(target_user.status, "value") else str(target_user.status),
                        "department_id": str(target_user.department_id) if target_user.department_id else None,
                        "manager_id": str(target_user.manager_id) if target_user.manager_id else None,
                    },
                    ip_address=self.ip_address,
                )
            )

        self.db.commit()
        self.db.refresh(target_user)

        # Doc §2.4: role/status changes force full re-authentication — a demoted
        # or deactivated user's existing session is killed, not just left to the
        # live per-request revocation check to catch on its next call.
        if role_changed or status_changed:
            logout_all_user_sessions(self.db, target_user.id)

        return self.get_employee_profile(employee_id=employee_id)

    def get_employee_documents(self, employee_id: UUID) -> list[dict[str, Any]]:
        """
        Get categorized documents for an employee with confidentiality filtering (PRD §5.4).
        Allowed roles: self (own profile), hr_admin, super_admin, auditor.
        Denied roles: manager (403), it_admin (403).
        Auditor receives non-confidential documents only (is_confidential == False).
        """
        # Multi-role (§5.14): union of each held role's rule — hr_admin/super_admin
        # (and custom roles) see all, auditor sees non-confidential, employee sees
        # their own, manager/it_admin add nothing.
        cu = self.current_user
        full_access = bool(cu.role_names - {"employee", "manager", "it_admin", "auditor"})
        auditor_access = cu.has_role("auditor")
        # NOT ported to check_permission(): this role-only gate would also need
        # (resource="employee", action="read"), but its allowed set (excludes
        # manager AND it_admin) differs from get_employee_profile's read grant
        # (excludes it_admin only) — the doc's 5-action vocabulary has no way to
        # distinguish "read the profile" from "read the document vault" under the
        # same resource. A dedicated employee_document resource + migration
        # (c2d4e6f8a0b2) exists for this but was reverted here after it proved
        # disproportionately disruptive to this file's mock-heavy test suite for
        # a pure architecture cleanup with no functional bug behind it — left as
        # the original hardcoded check.
        is_self = str(cu.user_id) == str(employee_id)
        if not (full_access or auditor_access):
            if not cu.has_role("employee"):
                raise AppError(
                    status_code=403,
                    code="forbidden",
                    message=f"Role '{cu.role}' does not have permission to view employee documents.",
                )
            if not is_self:
                raise AppError(
                    status_code=403,
                    code="forbidden",
                    message="Employees may only view their own documents.",
                )

        target_user = self.db.query(User).filter(User.id == employee_id).first()
        if not target_user:
            raise AppError(status_code=404, code="not_found", message="Employee not found.")

        UploaderUser = aliased(User)
        query = (
            self.db.query(
                Document,
                UploaderUser.full_name.label("uploaded_by_name"),
            )
            .outerjoin(UploaderUser, Document.uploaded_by == UploaderUser.id)
            .filter(Document.employee_id == employee_id)
        )

        # Auditor role gets non-confidential documents only
        if auditor_access and not full_access and not is_self:
            query = query.filter(Document.is_confidential == False)  # noqa: E712

        rows = query.order_by(Document.uploaded_at.desc()).all()

        return [
            {
                "id": doc.id,
                "employee_id": doc.employee_id,
                "doc_type": doc.doc_type,
                "file_name": doc.file_name,
                "file_url": doc.file_url,
                "is_confidential": doc.is_confidential,
                "uploaded_by": doc.uploaded_by,
                "uploaded_by_name": uploader_name,
                "uploaded_at": doc.uploaded_at,
            }
            for doc, uploader_name in rows
        ]

    def upload_employee_document(
        self,
        employee_id: UUID,
        file_name: str,
        file_bytes: bytes,
        doc_type: DocumentType,
        is_confidential: bool = False,
    ) -> dict[str, Any]:
        """
        Upload document for an employee with file size & extension validation (PRD §5.4).
        Allowed roles: self (own profile), hr_admin, super_admin.
        Denied roles: manager (403), it_admin (403), auditor (403).
        """
        cu = self.current_user
        full_access = bool(cu.role_names - {"employee", "manager", "it_admin", "auditor"})
        # NOT ported to check_permission(): would need (resource="employee",
        # action="create"), but its allowed set (employee-self, hr_admin,
        # super_admin) differs from the checklist-create grant used for
        # POST /onboarding and POST /offboarding. See get_employee_documents'
        # comment above — reverted here for the same reason.
        is_self = str(cu.user_id) == str(employee_id)
        if not full_access and not cu.has_role("employee"):
            raise AppError(
                status_code=403,
                code="forbidden",
                message=f"Role '{cu.role}' does not have permission to upload documents.",
            )
        if not full_access and not is_self:
            raise AppError(
                status_code=403,
                code="forbidden",
                message="Employees may only upload documents to their own profile.",
            )

        target_user = self.db.query(User).filter(User.id == employee_id).first()
        if not target_user:
            raise AppError(status_code=404, code="not_found", message="Employee not found.")

        # File size validation: MAX_UPLOAD_SIZE_MB, 10 MB by default (§7 rule 8)
        max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
        if len(file_bytes) > max_bytes:
            raise FileInvalidError(f"File size exceeds maximum allowed limit of {settings.MAX_UPLOAD_SIZE_MB}MB.")

        # Path traversal prevention: strip directory components
        raw_basename = os.path.basename(file_name)
        display_name = raw_basename or "uploaded_doc"

        # File extension validation — PDF, PNG, JPG only (§7 rule 8; .docx was
        # previously accepted here in violation of the documented constraint).
        ext = os.path.splitext(display_name)[1].lower()
        allowed_exts = {".pdf", ".png", ".jpg", ".jpeg"}
        if ext not in allowed_exts:
            raise FileInvalidError("Invalid file type. Allowed formats: PDF, PNG, JPG, JPEG.")

        # Generate a safe physical filename on disk
        safe_base = re.sub(r"[^a-zA-Z0-9_.-]", "_", display_name)
        unique_name = f"{uuid.uuid4().hex}_{safe_base}"

        # Resolve storage directory relative to UPLOAD_BASE_DIR
        save_dir = os.path.abspath(
            os.path.join(UPLOAD_BASE_DIR, "documents", str(employee_id))
        )

        # Path containment check
        if not save_dir.startswith(UPLOAD_BASE_DIR):
            raise AppError(
                status_code=400,
                code="bad_request",
                message="Invalid upload path destination.",
            )

        os.makedirs(save_dir, exist_ok=True)
        file_path = os.path.join(save_dir, unique_name)

        with open(file_path, "wb") as f:
            f.write(file_bytes)

        file_url = f"/uploads/documents/{employee_id}/{unique_name}"

        now = datetime.now(timezone.utc)
        doc = Document(
            id=uuid.uuid4(),
            employee_id=employee_id,
            doc_type=doc_type,
            file_name=display_name,
            file_url=file_url,
            is_confidential=is_confidential,
            uploaded_by=self.current_user.user_id,
            uploaded_at=now,
        )
        self.db.add(doc)
        self.db.commit()
        self.db.refresh(doc)

        uploader_name = self.current_user.full_name

        return {
            "id": doc.id or uuid.uuid4(),
            "employee_id": doc.employee_id,
            "doc_type": doc.doc_type,
            "file_name": doc.file_name,
            "file_url": doc.file_url,
            "is_confidential": doc.is_confidential,
            "uploaded_by": doc.uploaded_by,
            "uploaded_by_name": uploader_name,
            "uploaded_at": doc.uploaded_at or now,
        }

    def delete_employee_document(self, employee_id: UUID, doc_id: UUID) -> None:
        """
        Delete document from vault (PRD §5.4).
        Allowed roles: hr_admin, super_admin.
        Denied roles: self (403), manager (403), it_admin (403), auditor (403).
        Self cannot delete own documents.
        """
        # NOT ported to check_permission(): would need (resource="employee",
        # action="delete"), but its allowed set (hr_admin, super_admin) differs
        # from DELETE /employees/{id}'s (super_admin only). See
        # get_employee_documents' comment above — reverted for the same reason.
        if not self.current_user.has_role("hr_admin", "super_admin"):
            raise AppError(
                status_code=403,
                code="forbidden",
                message="Only HR Admin or Super Admin can delete employee documents.",
            )

        doc = (
            self.db.query(Document)
            .filter(Document.id == doc_id, Document.employee_id == employee_id)
            .first()
        )
        if not doc:
            raise AppError(status_code=404, code="not_found", message="Document not found.")

        # Attempt physical file deletion safely using UPLOAD_BASE_DIR
        if doc.file_url and "/uploads/" in doc.file_url:
            rel_part = doc.file_url.split("/uploads/", 1)[1]
            target_path = os.path.abspath(os.path.join(UPLOAD_BASE_DIR, rel_part))

            # Ensure path containment before deletion
            if target_path.startswith(UPLOAD_BASE_DIR) and os.path.exists(target_path):
                try:
                    os.remove(target_path)
                except OSError:
                    pass

        self.db.delete(doc)
        self.db.commit()

    def get_employee_assets(self, employee_id: UUID) -> dict[str, list[dict[str, Any]]]:
        """
        Get hardware devices and licenses assigned to employee, split into current and history (PRD §5.4).
        Allowed roles: self (own profile), manager (own dept), hr_admin, it_admin, super_admin, auditor.
        Manager gets 403 if target employee is outside manager's department.
        """
        scope = self._visibility(self.current_user.role_names - {"employee", "manager"})

        is_self = str(self.current_user.user_id) == str(employee_id)
        if scope == "self" and not is_self:
            raise AppError(
                status_code=403,
                code="forbidden",
                message="Employees may only view their own assigned assets.",
            )

        target_user = self.db.query(User).filter(User.id == employee_id).first()
        if not target_user:
            raise AppError(status_code=404, code="not_found", message="Employee not found.")

        if scope == "department" and not is_self:
            if (
                not self.current_user.department_id
                or target_user.department_id != self.current_user.department_id
            ):
                raise AppError(
                    status_code=403,
                    code="forbidden",
                    message="Managers may only view assets for employees within their own department.",
                )

        AssignerUser = aliased(User)
        rows = (
            self.db.query(
                AssetAssignment,
                Asset,
                AssignerUser.full_name.label("assigned_by_name"),
            )
            .join(Asset, AssetAssignment.asset_id == Asset.id)
            .outerjoin(AssignerUser, AssetAssignment.assigned_by == AssignerUser.id)
            .filter(AssetAssignment.employee_id == employee_id)
            .order_by(AssetAssignment.assigned_at.desc())
            .all()
        )

        current_list: list[dict[str, Any]] = []
        history_list: list[dict[str, Any]] = []

        for assignment, asset, assigner_name in rows:
            item = {
                "id": assignment.id,
                "asset_id": asset.id,
                "asset_tag": asset.asset_tag,
                "asset_name": asset.name,
                "category": asset.category,
                "serial_number": asset.serial_number,
                "assigned_by": assignment.assigned_by,
                "assigned_by_name": assigner_name,
                "assigned_at": assignment.assigned_at,
                "returned_at": assignment.returned_at,
                "condition_at_assignment": assignment.condition_at_assignment,
                "condition_at_return": assignment.condition_at_return,
                "notes": assignment.notes,
            }
            if assignment.returned_at is None:
                current_list.append(item)
            else:
                history_list.append(item)

        return {"current": current_list, "history": history_list}

    def get_employee_lifecycle(self, employee_id: UUID) -> dict[str, Any] | None:
        """
        Get active or latest onboarding/offboarding lifecycle checklist for employee (§5.4).
        Allowed roles: self, manager (own dept), hr_admin, it_admin, super_admin, auditor.
        """
        scope = self._visibility(self.current_user.role_names - {"employee", "manager"})
        is_self = str(self.current_user.user_id) == str(employee_id)
        if scope == "self" and not is_self:
            raise AppError(
                status_code=403,
                code="forbidden",
                message="Employees may only view their own lifecycle records.",
            )

        target_user = self.db.query(User).filter(User.id == employee_id).first()
        if not target_user:
            raise AppError(status_code=404, code="not_found", message="Employee not found.")

        if scope == "department" and not is_self:
            if (
                not self.current_user.department_id
                or target_user.department_id != self.current_user.department_id
            ):
                raise AppError(
                    status_code=403,
                    code="forbidden",
                    message="Managers may only view lifecycle records for employees in their department.",
                )

        checklist = (
            self.db.query(Checklist)
            .filter(Checklist.employee_id == employee_id)
            .order_by(Checklist.created_at.desc())
            .first()
        )

        if not checklist:
            return None

        items = (
            self.db.query(ChecklistItem, Role.name.label("role_name"))
            .outerjoin(Role, ChecklistItem.owner_role_id == Role.id)
            .filter(ChecklistItem.checklist_id == checklist.id)
            .order_by(ChecklistItem.sort_order.asc(), ChecklistItem.created_at.asc())
            .all()
        )

        total_items = len(items)
        completed_items = sum(1 for item, _ in items if item.status == ChecklistItemStatus.done)
        progress_pct = int((completed_items / total_items) * 100) if total_items > 0 else 0

        formatted_items = []
        for item, role_name in items:
            owner_r = (role_name or "hr_admin").lower()
            if "it" in owner_r:
                cat = "it"
            elif "facilities" in owner_r or "admin" in owner_r:
                cat = "facilities"
            else:
                cat = "hr"

            status_str = "completed" if item.status == ChecklistItemStatus.done else item.status.value

            formatted_items.append(
                {
                    "id": item.id,
                    "title": item.task_name,
                    "category": cat,
                    "owner_role": role_name or "HR Operations",
                    "status": status_str,
                    "due_date": None,
                    "completed_at": item.completed_at,
                }
            )

        return {
            "id": checklist.id,
            "type": checklist.type.value if hasattr(checklist.type, "value") else str(checklist.type),
            "status": checklist.status.value if hasattr(checklist.status, "value") else str(checklist.status),
            "progress_percentage": progress_pct,
            "total_items": total_items,
            "completed_items": completed_items,
            "items": formatted_items,
        }

