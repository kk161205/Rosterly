"""
Rosterly command line — one-off admin tasks run from a developer machine.

    python -m app.cli bootstrap --email admin@company.com --name "Asha Rao" \
        [--designation "IT Head"] [--department Engineering --department HR ...]

`bootstrap` sets up a fresh database (after `alembic upgrade head`): it creates
the first super admin and, optionally, the starting departments, then prints a
single-use set-password link (72 hours). It refuses to run once any super
admin exists — after that, people are added through onboarding.
There is no public registration page, by design (zero trust).
"""
import argparse
import secrets
import sys
import uuid
from datetime import date

from app.core.password_tokens import issue_password_token, link_minutes
from app.core.role_policy import user_holds_role_names
from app.core.security import get_password_hash
from app.db.session import SessionLocal
from app.models.auth import Department, PasswordTokenPurpose, Role, User, UserStatus
from app.models.system import AuditLog
from app.modules.admin.user_service import UserManagementService
from app.modules.notifications.email import set_password_link

SYSTEM_IP = "cli"


def bootstrap(email: str, name: str, designation: str, departments: list[str]) -> int:
    db = SessionLocal()
    try:
        if db.query(User.id).filter(user_holds_role_names(["super_admin"])).first():
            print("A super admin already exists. Add people through Onboarding instead.", file=sys.stderr)
            return 1
        role = db.query(Role).filter(Role.name == "super_admin").first()
        if role is None:
            print("Roles are missing. Run `alembic upgrade head` first.", file=sys.stderr)
            return 1
        clean_email = email.strip().lower()
        if db.query(User.id).filter(User.email == clean_email).first():
            print(f"Someone already has the email {clean_email}.", file=sys.stderr)
            return 1

        for dept_name in departments:
            clean = dept_name.strip()
            if clean and not db.query(Department.id).filter(Department.name == clean).first():
                db.add(Department(id=uuid.uuid4(), name=clean))

        employee_code = UserManagementService(db, current_user=None)._generate_next_employee_code()  # type: ignore[arg-type]
        admin = User(
            id=uuid.uuid4(),
            employee_code=employee_code,
            full_name=name.strip(),
            email=clean_email,
            password_hash=get_password_hash(secrets.token_urlsafe(32)),
            role_id=role.id,
            designation=designation.strip() or "Administrator",
            status=UserStatus.inactive,  # becomes active when the link is used
            date_of_joining=date.today(),
        )
        db.add(admin)
        db.add(
            AuditLog(
                id=uuid.uuid4(),
                actor_id=None,
                action="user.bootstrapped",
                entity_type="user",
                entity_id=admin.id,
                before_state=None,
                after_state={"email": clean_email, "role_name": "super_admin"},
                ip_address=SYSTEM_IP,
            )
        )
        db.flush()
        token = issue_password_token(db, admin.id, PasswordTokenPurpose.invite)
        db.commit()
        minutes = link_minutes(PasswordTokenPurpose.invite)
        print(f"Created super admin {clean_email} ({employee_code}).")
        print(f"Set-password link (single use, {minutes // 60} hours):")
        print(set_password_link(token))
        return 0
    finally:
        db.close()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    sub = parser.add_subparsers(dest="command", required=True)
    boot = sub.add_parser("bootstrap", help="create the first super admin on a fresh database")
    boot.add_argument("--email", required=True)
    boot.add_argument("--name", required=True)
    boot.add_argument("--designation", default="Administrator")
    boot.add_argument("--department", action="append", default=[], help="starting department (repeatable)")
    args = parser.parse_args(argv)
    if args.command == "bootstrap":
        return bootstrap(args.email, args.name, args.designation, args.department)
    return 2


if __name__ == "__main__":
    sys.exit(main())
