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

from app.core.password_tokens import cancel_password_tokens
from app.core.config import settings
from app.core.approver_resolution import reroute_pending_steps
from app.core.errors import AppError, FileInvalidError
from app.core.file_storage import delete_file, detect_type, load_file, save_file
from app.core.role_policy import (
    assert_can_manage_user,
    set_additional_roles,
    user_role_names,
    validate_role_set,
)
from app.core.access_scope import (
    can_manage_all_documents,
    can_read_non_confidential_documents,
    scope_for,
)
from app.core.security import CurrentUser, check_permission
from app.models.assets import Asset, AssetAssignment
from app.models.auth import Department, Role, User, UserStatus
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


class EmployeeProfileService:
    """Service providing fine-grained ABAC for Employee Profile Detail."""

    def __init__(self, db: Session, current_user: CurrentUser, ip_address: str | None = None):
        self.db = db
        self.current_user = current_user
        self.ip_address = ip_address or "unknown"

    def get_employee_profile(self, employee_id: UUID) -> dict[str, Any]:
        """
        Get detailed employee profile record with row-level ABAC department scoping.
        Allowed: everyone for their own profile; manager (own dept), hr_admin,
        super_admin and auditor for others. An IT admin can open only their own.
        """
        scope = scope_for(self.current_user, "profile")
        is_self = str(self.current_user.user_id) == str(employee_id)
        # Your own profile is always yours (as with documents and the phone
        # edit). Anyone else's needs employee:read, then the scope check below.
        if not is_self:
            check_permission(self.current_user, "employee", "read", self.db)

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

        # Direct reports (Overview Tab reporting hierarchy tree) — the
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
        Update employee profile details with strict field-level access control.

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
        # (step 3); the not-self branch below is a pure role check (step
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
        # Everything an edit can change, so the audit row names exactly what did
        tracked = ("full_name", "designation", "phone", "emergency_contact_name", "emergency_contact_phone",
                   "role_id", "status", "department_id", "manager_id")

        def snapshot() -> dict[str, Any]:
            values = {f: getattr(target_user, f) for f in tracked}
            return {f: (v.value if hasattr(v, "value") else str(v) if isinstance(v, UUID) else v) for f, v in values.items()}

        before = snapshot()

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
            # is included Overview Tab spec ("inline pencil edit
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
            # privileged-role rule applies here too: HR can't change a
            # super_admin/it_admin user's role or status, or grant either role.
            changes_access = ("role_id" in set_fields and payload.role_id is not None) or (
                "status" in set_fields and payload.status is not None
            )
            if changes_access:
                # Every role the target holds counts, primary and additional.
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
                    # Same multi-role rule as User Management: the new
                    # primary must not clash with the roles already held; if it
                    # was one of the additional roles, it moves to primary.
                    extra = validate_role_set(self.db, self.current_user, role_obj, list(target_user.additional_roles))
                    target_user.role_id = role_obj.id
                    set_additional_roles(self.db, target_user, extra, self.current_user.user_id)

            if "status" in set_fields and payload.status is not None and payload.status != before_status:
                # Same account-status rules as PATCH /users/{id}/status: only
                # active/inactive are set by hand; onboarding, offboarding and
                # termination belong to their workflows, and an account that is
                # leaving (or has left) is never moved back from here.
                if payload.status not in (UserStatus.active, UserStatus.inactive):
                    raise AppError(
                        status_code=400,
                        code="invalid_status",
                        message="Status can only be set to 'active' or 'inactive' here.",
                        field_errors={"status": "Use active or inactive."},
                    )
                if before_status in (UserStatus.offboarding, UserStatus.terminated):
                    raise AppError(
                        status_code=400,
                        code="invalid_status_transition",
                        message=f"Cannot change status of user in '{before_status.value}' status.",
                    )
                target_user.status = payload.status
                if payload.status == UserStatus.inactive:
                    reroute_pending_steps(self.db, target_user.id)
                    cancel_password_tokens(self.db, target_user.id)

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

        if role_changed:
            # critical account_updated notification to the affected user
            new_role_name = self.db.query(Role.name).filter(Role.id == target_user.role_id).scalar() or ""
            notify_role_changed(self.db, target_user.id, new_role_name)

        # Every change is audited, a person's own phone edit included: only the fields that changed
        after = snapshot()
        changed = [f for f in tracked if before[f] != after[f]]
        if changed:
            self.db.add(
                AuditLog(
                    id=uuid.uuid4(),
                    actor_id=self.current_user.user_id,
                    action="employee.profile_updated",
                    entity_type="user",
                    entity_id=target_user.id,
                    before_state={f: before[f] for f in changed},
                    after_state={f: after[f] for f in changed},
                    ip_address=self.ip_address,
                )
            )

        self.db.commit()
        self.db.refresh(target_user)

        # Doc: role/status changes force full re-authentication — a demoted
        # or deactivated user's existing session is killed, not just left to the
        # live per-request revocation check to catch on its next call.
        if role_changed or status_changed:
            logout_all_user_sessions(self.db, target_user.id)

        return self.get_employee_profile(employee_id=employee_id)

    def get_employee_documents(self, employee_id: UUID) -> list[dict[str, Any]]:
        """
        Get categorized documents for an employee with confidentiality filtering.
        Allowed roles: self (own profile), hr_admin, super_admin, auditor.
        Denied roles: manager (403), it_admin (403).
        Auditor receives non-confidential documents only (is_confidential == False).
        """
        # Explicit rule (app/core/access_scope.py): HR/super admins see every
        # document, auditors everyone's non-confidential ones, everyone their own.
        cu = self.current_user
        full_access = can_manage_all_documents(cu)
        auditor_access = can_read_non_confidential_documents(cu)
        is_self = str(cu.user_id) == str(employee_id)
        if not (full_access or auditor_access or is_self):
            raise AppError(
                status_code=403,
                code="forbidden",
                message="You can only view your own documents.",
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

    def _can_see_document(self, employee_id: UUID, is_confidential: bool) -> bool:
        cu = self.current_user
        if can_manage_all_documents(cu) or str(cu.user_id) == str(employee_id):
            return True
        return can_read_non_confidential_documents(cu) and not is_confidential

    def _audit_document(self, action: str, doc: Document, after: dict | None, before: dict | None = None) -> None:
        self.db.add(
            AuditLog(
                id=uuid.uuid4(),
                actor_id=self.current_user.user_id,
                action=action,
                entity_type="document",
                entity_id=doc.id,
                before_state=before,
                after_state=after,
                ip_address=self.ip_address,
            )
        )

    @staticmethod
    def _snapshot(doc: Document) -> dict:
        return {
            "employee_id": str(doc.employee_id),
            "file_name": doc.file_name,
            "doc_type": doc.doc_type.value if hasattr(doc.doc_type, "value") else str(doc.doc_type),
            "is_confidential": bool(doc.is_confidential),
        }

    def upload_employee_document(
        self,
        employee_id: UUID,
        file_name: str,
        file_bytes: bytes,
        doc_type: DocumentType,
        is_confidential: bool = False,
    ) -> dict[str, Any]:
        """
        Upload a document to someone's vault.
        HR/super admins upload for anyone; everyone else only to their own
        profile. PDF, PNG or JPG only — checked from the file's content, not just
        its name — and at most MAX_UPLOAD_SIZE_MB. Stored in Postgres
        (app/core/file_storage.py) and audited.
        """
        cu = self.current_user
        is_self = str(cu.user_id) == str(employee_id)
        if not (can_manage_all_documents(cu) or is_self):
            raise AppError(
                status_code=403,
                code="forbidden",
                message="You can only upload documents to your own profile.",
            )

        target_user = self.db.query(User).filter(User.id == employee_id).first()
        if not target_user:
            raise AppError(status_code=404, code="not_found", message="Employee not found.")

        max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
        if len(file_bytes) > max_bytes:
            raise FileInvalidError(f"The file is larger than {settings.MAX_UPLOAD_SIZE_MB} MB.")
        if not file_bytes:
            raise FileInvalidError("The file is empty.")

        display_name = os.path.basename(file_name.replace("\\", "/")) or "document"
        display_name = re.sub(r"[\x00-\x1f\x7f]", "", display_name)[:255]
        extension = os.path.splitext(display_name)[1].lower()
        content_type = detect_type(file_bytes, extension)
        if content_type is None:
            raise FileInvalidError("Only PDF, PNG or JPG files can be uploaded.")

        now = datetime.now(timezone.utc)
        doc_id = uuid.uuid4()
        doc = Document(
            id=doc_id,
            employee_id=employee_id,
            doc_type=doc_type,
            file_name=display_name,
            # The authenticated download route, relative to the API base.
            file_url=f"/employees/{employee_id}/documents/{doc_id}/download",
            is_confidential=is_confidential,
            uploaded_by=cu.user_id,
            uploaded_at=now,
        )
        self.db.add(doc)
        self.db.flush()
        save_file(self.db, doc_id, file_bytes, content_type)
        self._audit_document("document.uploaded", doc, self._snapshot(doc))
        self.db.commit()

        return {
            "id": doc.id,
            "employee_id": doc.employee_id,
            "doc_type": doc.doc_type,
            "file_name": doc.file_name,
            "file_url": doc.file_url,
            "is_confidential": doc.is_confidential,
            "uploaded_by": doc.uploaded_by,
            "uploaded_by_name": cu.full_name,
            "uploaded_at": doc.uploaded_at or now,
        }

    def download_employee_document(self, employee_id: UUID, doc_id: UUID) -> tuple[bytes, str, str]:
        """GET /employees/{id}/documents/{doc_id}/download — the same rule as the
        list: HR/super admins any, auditors non-confidential, everyone their own.
        Returns (bytes, content type, file name)."""
        doc = (
            self.db.query(Document)
            .filter(Document.id == doc_id, Document.employee_id == employee_id)
            .first()
        )
        # A document the caller may not see is indistinguishable from a missing one.
        if doc is None or not self._can_see_document(employee_id, bool(doc.is_confidential)):
            raise AppError(status_code=404, code="not_found", message="Document not found.")
        stored = load_file(self.db, doc.id)
        if stored is None:
            raise AppError(
                status_code=404,
                code="file_missing",
                message="This document's file isn't available. Upload it again.",
            )
        content, content_type = stored
        return content, content_type, doc.file_name

    def delete_employee_document(self, employee_id: UUID, doc_id: UUID) -> None:
        """
        Delete a document from the vault. HR and super admins only
        people can't delete their own documents. The stored file goes with it.
        Audited.
        """
        if not can_manage_all_documents(self.current_user):
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

        self._audit_document("document.deleted", doc, None, before=self._snapshot(doc))
        delete_file(self.db, doc.id)
        self.db.delete(doc)
        self.db.commit()

    def get_employee_assets(self, employee_id: UUID) -> dict[str, list[dict[str, Any]]]:
        """
        Get hardware devices and licenses assigned to employee, split into current and history.
        Allowed roles: self (own profile), manager (own dept), hr_admin, it_admin, super_admin, auditor.
        Manager gets 403 if target employee is outside manager's department.
        """
        scope = scope_for(self.current_user, "employee_assets")

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
        Get active or latest onboarding/offboarding lifecycle checklist for employee.
        Allowed roles: self, manager (own dept), hr_admin, it_admin, super_admin, auditor.
        """
        scope = scope_for(self.current_user, "lifecycle")
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
            .order_by(Checklist.created_at.desc(), Checklist.id.desc())
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

