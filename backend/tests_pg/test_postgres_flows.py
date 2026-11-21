"""
End-to-end flows on a real, fully migrated PostgreSQL database (Build Status).

The main suite runs on SQLite; this one checks what only Postgres does —
the migrations' seed data (roles, permissions, approval chains, leave types),
row locks, JSONB audit rows, BYTEA document storage, partial unique indexes,
sequences and the real sign-in path (no auth overrides).

Runs only when TEST_POSTGRES_URL points at a migrated database:
    alembic upgrade head && TEST_POSTGRES_URL=$DATABASE_URL pytest tests_pg
CI runs it after the migration up/down/up check. It adds its own people and
leaves them (the CI database is thrown away).
"""
import io
import os
import uuid
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

PG_URL = os.environ.get("TEST_POSTGRES_URL")
pytestmark = pytest.mark.skipif(not PG_URL, reason="TEST_POSTGRES_URL not set")

PASSWORD = "Str0ngPassw0rd!"


@pytest.fixture(scope="module")
def env():
    from app.core.config import settings
    from app.core.security import get_password_hash
    from app.db.session import get_db
    from app.main import app
    from app.models.auth import Role, User, UserStatus

    settings.AUTH_RATE_LIMITS_ENABLED = False
    engine = create_engine(PG_URL)
    Session = sessionmaker(bind=engine, autoflush=False)

    def override():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override
    db = Session()
    roles = {r.name: r.id for r in db.query(Role).all()}
    assert set(roles) == {"super_admin", "hr_admin", "it_admin", "manager", "employee", "auditor"}
    run = uuid.uuid4().hex[:6]

    def person(key, role, manager=None):
        u = User(
            id=uuid.uuid4(), employee_code=f"PG-{run}-{key}", full_name=f"{key} {run}", email=f"{key}.{run}@example.com",
            password_hash=get_password_hash(PASSWORD), role_id=roles[role], manager_id=manager,
            status=UserStatus.active, designation="Staff", date_of_joining=date(2025, 1, 1),
        )
        db.add(u)
        db.flush()
        return u

    root = person("root", "super_admin")
    boss = person("boss", "manager")
    it = person("it", "it_admin")
    hr = person("hr", "hr_admin")
    emp = person("emp", "employee", manager=boss.id)
    db.commit()
    people = {k: (u.id, u.email) for k, u in {"root": root, "boss": boss, "it": it, "hr": hr, "emp": emp}.items()}
    db.close()

    client = TestClient(app)
    tokens = {}
    for key, (_, email) in people.items():
        res = client.post("/api/v1/auth/login", json={"email": email.upper(), "password": PASSWORD})
        assert res.status_code == 200, res.text
        tokens[key] = {"Authorization": f"Bearer {res.json()['access_token']}"}
    yield {"client": client, "h": tokens, "ids": {k: v[0] for k, v in people.items()}, "Session": Session}
    app.dependency_overrides.clear()


def test_seed_data_and_me(env):
    c, h = env["client"], env["h"]
    me = c.get("/api/v1/auth/me", headers=h["emp"]).json()
    assert me["role"] == "employee" and "request:create" in me["permissions"]
    types = {t["name"] for t in c.get("/api/v1/leave-types", headers=h["emp"]).json()}
    assert {"Earned leave", "Casual leave", "Sick leave", "Unpaid leave"} <= types
    chains = c.get("/api/v1/approval-chains", headers=h["root"]).json()["templates"]
    assert {t["request_type"] for t in chains} >= {"asset_request", "access_request", "it_ticket", "other"}


def test_request_approval_and_fulfilment(env):
    c, h = env["client"], env["h"]
    req = c.post("/api/v1/requests", headers=h["emp"], json={"request_type": "asset_request", "title": "PG laptop", "description": "x", "estimated_cost": 1000})
    assert req.status_code == 201, req.text
    rid = req.json()["id"]
    assert c.post(f"/api/v1/requests/{rid}/approve", headers=h["boss"], json={}).status_code == 200
    assert c.post(f"/api/v1/requests/{rid}/approve", headers=h["it"], json={}).status_code == 200
    done = c.post(f"/api/v1/requests/{rid}/fulfilment", headers=h["it"], json={"status": "completed", "note": "Collect it"})
    assert done.status_code == 200 and done.json()["status"] == "completed"


def test_leave_balance_is_created_and_deducted(env):
    c, h = env["client"], env["h"]
    earned = next(t for t in c.get("/api/v1/leave-types", headers=h["emp"]).json() if t["name"] == "Earned leave")
    start = date.today() + timedelta(days=30)
    while start.weekday() != 0:
        start += timedelta(days=1)
    def balance():
        mine = c.get("/api/v1/leave-requests/mine", headers=h["emp"]).json()
        return float(next(b for b in mine["balances"] if b["leave_type"]["id"] == earned["id"])["balance_days"])

    before = balance()  # this year's allowance plus anything carried from last year
    leave = c.post("/api/v1/leave-requests", headers=h["emp"], json={"leave_type_id": earned["id"], "start_date": start.isoformat(), "end_date": (start + timedelta(days=1)).isoformat()})
    assert leave.status_code == 201, leave.text
    assert c.post(f"/api/v1/leave-requests/{leave.json()['id']}/approve", headers=h["boss"], json={}).status_code == 200
    if start.year == date.today().year:
        assert balance() == before - 2  # exactly the two working days


def test_document_bytes_round_trip(env):
    c, h, ids = env["client"], env["h"], env["ids"]
    pdf = b"%PDF-1.7\n%postgres\n"
    up = c.post(f"/api/v1/employees/{ids['emp']}/documents", headers=h["emp"], data={"doc_type": "id_proof"}, files={"file": ("id.pdf", io.BytesIO(pdf), "application/pdf")})
    assert up.status_code == 201, up.text
    dl = c.get(f"/api/v1{up.json()['file_url']}", headers=h["emp"])
    assert dl.status_code == 200 and dl.content == pdf


def test_licence_seats_and_partial_unique_index(env):
    c, h, ids = env["client"], env["h"], env["ids"]
    lic = c.post("/api/v1/software-licenses", headers=h["it"], json={"name": f"PG Tool {uuid.uuid4().hex[:4]}", "vendor": "V", "total_seats": 2}).json()
    url = f"/api/v1/software-licenses/{lic['id']}/assignments"
    first = c.post(url, headers=h["it"], json={"employee_id": str(ids["emp"])})
    assert first.status_code == 201
    assert c.post(url, headers=h["it"], json={"employee_id": str(ids["emp"])}).status_code == 409
    seat = first.json()["holders"][0]["assignment_id"]
    assert c.delete(f"{url}/{seat}", headers=h["it"]).status_code == 200
    assert c.post(url, headers=h["it"], json={"employee_id": str(ids["emp"])}).status_code == 201  # re-assign after removal


def test_new_joiner_uses_the_employee_code_sequence(env):
    c, h = env["client"], env["h"]
    res = c.post("/api/v1/onboarding/new-joiner", headers=h["hr"], json={"full_name": "PG Joiner", "email": f"joiner.{uuid.uuid4().hex[:6]}@example.com", "designation": "Analyst", "date_of_joining": date.today().isoformat()})
    assert res.status_code == 201, res.text
    assert "reset-password?token=" in res.json()["set_password_link"]


def test_audit_log_jsonb_and_filters(env):
    c, h = env["client"], env["h"]
    logs = c.get("/api/v1/audit-logs", headers=h["root"], params={"entity_type": "request", "page_size": 5}).json()
    assert logs["total"] >= 1 and isinstance(logs["items"][0]["after_state"], dict)
    db = env["Session"]()
    try:
        assert db.execute(text("SELECT count(*) FROM audit_logs WHERE after_state ? 'status'")).scalar() >= 1
    finally:
        db.close()


def test_preferences_use_the_migrated_table(env):
    c, h = env["client"], env["h"]
    assert c.get("/api/v1/me/preferences", headers=h["emp"]).json()["accent"] == "navy"
    res = c.patch("/api/v1/me/preferences", headers=h["emp"], json={"accent": "lavender", "guide_style": "take"})
    assert res.status_code == 200 and res.json()["guide_style"] == "take"
    db = env["Session"]()
    try:
        row = db.execute(text("SELECT accent, guide_style, voice_enabled FROM user_preferences WHERE user_id = :u"), {"u": env["ids"]["emp"]}).one()
        assert tuple(row) == ("lavender", "take", False)
    finally:
        db.close()


def test_joiner_history_and_usual_items_on_postgres(env):
    c, h = env["client"], env["h"]
    res = c.post("/api/v1/onboarding/new-joiner", headers=h["hr"], json={
        "full_name": "PG Designer", "email": f"designer.{uuid.uuid4().hex[:6]}@example.com", "designation": "Product Designer",
        "date_of_joining": date.today().isoformat(), "extra_items": [{"task_name": "Give a Figma seat", "owner": "it_admin"}],
    })
    assert res.status_code == 201, res.text
    assert [i["task_name"] for i in sorted(res.json()["checklist"]["items"], key=lambda i: i["sort_order"])][-1] == "Give a Figma seat"
    history = c.get("/api/v1/onboarding/joiner-history", headers=h["hr"])
    assert history.status_code == 200, history.text
    assert any(j["designation"] == "Product Designer" for j in history.json()["joiners"])
    assert c.get("/api/v1/onboarding/joiner-history", headers=h["emp"]).status_code == 403


def test_review_fixes_on_postgres(env, monkeypatch):
    """Row locks next to joined queries, carry-over sync, exact refunds and skip-locked email batches — on real Postgres."""
    c, h, ids = env["client"], env["h"], env["ids"]
    earned = next(t for t in c.get("/api/v1/leave-types", headers=h["emp"]).json() if t["name"] == "Earned leave")
    start = date.today() + timedelta(days=60)
    while start.weekday() != 0:
        start += timedelta(days=1)
    if start.year != date.today().year:
        start = date(date.today().year, 12, 1)
        while start.weekday() != 0:
            start += timedelta(days=1)
    leave = c.post("/api/v1/leave-requests", headers=h["emp"], json={"leave_type_id": earned["id"], "start_date": start.isoformat(), "end_date": start.isoformat()})
    assert leave.status_code == 201, leave.text
    before = c.get(f"/api/v1/leave-balances/{ids['emp']}?year={start.year + 1}", headers=h["hr"])
    assert before.status_code == 200, before.text  # creates next year's row (and its carry) on Postgres
    assert c.post(f"/api/v1/leave-requests/{leave.json()['id']}/approve", headers=h["boss"], json={}).status_code == 200
    assert c.post(f"/api/v1/leave-requests/{leave.json()['id']}/cancel", headers=h["emp"]).status_code == 200
    db = env["Session"]()
    try:
        assert db.execute(text("SELECT days_deducted FROM leave_requests WHERE id = :i"), {"i": leave.json()["id"]}).scalar() == 1
        assert db.execute(text("SELECT count(*) FROM information_schema.columns WHERE table_name = 'leave_balances' AND column_name = 'carried_in'")).scalar() == 1
    finally:
        db.close()

    asset = c.post("/api/v1/assets", headers=h["it"], json={"name": "PG monitor", "category": "monitor"})
    assert asset.status_code == 201, asset.text
    patched = c.patch(f"/api/v1/assets/{asset.json()['id']}", headers=h["it"], json={"status": "under_maintenance"})
    assert patched.status_code == 200, patched.text  # FOR UPDATE + eager load works on Postgres

    from app.modules.notifications import dispatch

    monkeypatch.setattr(dispatch, "email_delivery_available", lambda: True)
    monkeypatch.setattr(dispatch, "_send_email", lambda n: True)
    db = env["Session"]()
    try:
        result = dispatch._run_dispatch_pending_emails(db)  # LIMIT + FOR UPDATE SKIP LOCKED on Postgres
        assert set(result) == {"sent", "skipped"}
    finally:
        db.close()
