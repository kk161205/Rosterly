"""
Departments — list for every signed-in user; create, rename, set head
and delete for HR and super admins. Writes are audited.
A department that still has people can't be deleted.
"""
import uuid
from typing import Optional
from uuid import UUID

from sqlalchemy import func
from sqlalchemy.orm import Session, aliased

from app.core.errors import ConflictError, NotFoundError, ValidationAppError
from app.core.security import CurrentUser, check_permission
from app.models.auth import Department, User, UserStatus
from app.models.system import AuditLog
from app.modules.employees.departments_schemas import DepartmentCreate, DepartmentItem, DepartmentUpdate


def _code(name: str) -> str:
    return "".join(w[0] for w in name.split() if w).upper() or "DEPT"


class DepartmentService:
    def __init__(self, db: Session, current_user: CurrentUser, ip_address: str = "unknown"):
        self.db = db
        self.current_user = current_user
        self.ip_address = ip_address

    def list(self) -> list[DepartmentItem]:
        Head = aliased(User)
        Member = aliased(User)
        rows = (
            self.db.query(
                Department.id,
                Department.name,
                Department.manager_id,
                Head.full_name.label("manager_name"),
                func.count(Member.id).filter(Member.status == UserStatus.active).label("head_count"),
            )
            .outerjoin(Member, Member.department_id == Department.id)
            .outerjoin(Head, Head.id == Department.manager_id)
            .group_by(Department.id, Department.name, Department.manager_id, Head.full_name)
            .order_by(Department.name.asc())
            .all()
        )
        return [
            DepartmentItem(
                id=r.id,
                name=r.name,
                code=_code(r.name),
                head_count=r.head_count or 0,
                manager_id=r.manager_id,
                manager_name=r.manager_name,
            )
            for r in rows
        ]

    def _item(self, department_id: UUID) -> DepartmentItem:
        return next(d for d in self.list() if d.id == department_id)

    def _check_name(self, name: str, exclude: Optional[UUID] = None) -> str:
        clean = name.strip()
        if not clean:
            raise ValidationAppError("Validation failed", field_errors={"name": "Enter a name."})
        clash = self.db.query(Department.id).filter(func.lower(Department.name) == clean.lower())
        if exclude:
            clash = clash.filter(Department.id != exclude)
        if clash.first():
            raise ConflictError(f"There is already a department called '{clean}'.")
        return clean

    def _check_head(self, manager_id: Optional[UUID]) -> None:
        if manager_id and not self.db.query(User.id).filter(User.id == manager_id).first():
            raise NotFoundError("That person was not found.")

    def _audit(self, action: str, entity_id: UUID, before: Optional[dict], after: Optional[dict]) -> None:
        self.db.add(
            AuditLog(
                id=uuid.uuid4(),
                actor_id=self.current_user.user_id,
                action=action,
                entity_type="department",
                entity_id=entity_id,
                before_state=before,
                after_state=after,
                ip_address=self.ip_address,
            )
        )

    @staticmethod
    def _snapshot(d: Department) -> dict:
        return {"name": d.name, "manager_id": str(d.manager_id) if d.manager_id else None}

    def create(self, data: DepartmentCreate) -> DepartmentItem:
        check_permission(self.current_user, "department", "create", self.db)
        name = self._check_name(data.name)
        self._check_head(data.manager_id)
        dept = Department(id=uuid.uuid4(), name=name, manager_id=data.manager_id)
        self.db.add(dept)
        self._audit("department.created", dept.id, None, self._snapshot(dept))
        self.db.commit()
        return self._item(dept.id)

    def update(self, department_id: UUID, data: DepartmentUpdate) -> DepartmentItem:
        check_permission(self.current_user, "department", "update", self.db)
        dept = self.db.query(Department).filter(Department.id == department_id).with_for_update().first()
        if dept is None:
            raise NotFoundError("Department not found.")
        before = self._snapshot(dept)
        sent = data.model_fields_set
        if "name" in sent and data.name is not None:
            dept.name = self._check_name(data.name, exclude=dept.id)
        if "manager_id" in sent:
            self._check_head(data.manager_id)
            dept.manager_id = data.manager_id
        self._audit("department.updated", dept.id, before, self._snapshot(dept))
        self.db.commit()
        return self._item(dept.id)

    def delete(self, department_id: UUID) -> None:
        check_permission(self.current_user, "department", "delete", self.db)
        dept = self.db.query(Department).filter(Department.id == department_id).with_for_update().first()
        if dept is None:
            raise NotFoundError("Department not found.")
        members = self.db.query(func.count(User.id)).filter(User.department_id == dept.id).scalar() or 0
        if members:
            who = "person is" if members == 1 else "people are"
            raise ConflictError(f"{members} {who} still in {dept.name}. Move them to another department first.")
        self._audit("department.deleted", dept.id, self._snapshot(dept), None)
        self.db.delete(dept)
        self.db.commit()
