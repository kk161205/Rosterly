# Rosterly

> Unified Asset & Employee Management Portal

[![CI](https://github.com/kk161205/Rosterly/actions/workflows/ci.yml/badge.svg)](https://github.com/kk161205/Rosterly/actions/workflows/ci.yml)

Rosterly manages employees, IT assets and access as one connected lifecycle: onboarding and offboarding across HR, IT and Facilities, asset tracking from purchase to retirement, requests routed through configurable approval chains, and zero-trust access control — in one self-hosted web app.

---

## Project status

Phase 1 (spec §5.1–§5.15) is complete: a FastAPI backend on PostgreSQL with RBAC/ABAC enforcement, zero-trust sessions and audit logging, and a React frontend in the "Quiet Workbench" design.

| Area | What's built |
| :--- | :--- |
| **Sign-in** | Password, MFA, forgot/reset password, lockout, invite links |
| **Home** | Each role's key numbers plus "Waiting on you" — pre-checked approvals, checklist tasks and tickets, actioned in place |
| **People** | Directory and org chart, profiles (documents, assets, lifecycle), onboarding and offboarding checklists |
| **Assets** | Inventory with a side panel, full record with depreciation and a printable QR label, camera QR scanner, maintenance tickets (table and board) |
| **Requests** | Unified request portal with cost-tiered approval chains; one person decides at most one step of a request |
| **Analytics** | Money we can save, where the money went, what to budget for, what needs chasing, where we're slow — totals first, records in a side panel with CSV export |
| **Access** | Users and invites, roles and the permission matrix, **multi-role** access (a primary role plus additional roles, merged permissions, configurable role conflicts) |

**Later phases:** notifications centre, audit log viewer, approval-chain and licence admin pages, leave and attendance, the AI assistant (`ai-service/` is a scaffold), landing page.

---

## Tech stack

| Layer | Technology |
| :--- | :--- |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, TanStack Query, Radix UI; Vitest + Testing Library |
| Backend | Python 3.13, FastAPI, SQLAlchemy 2, Alembic, Pydantic v2; pytest, ruff |
| Database | PostgreSQL 18 (the shared development/test database runs on Neon and holds demo data only) |
| Background jobs | Celery with Redis — nightly depreciation, warranty/AMC expiry, email dispatch |

**Pinned versions:** Python **3.13.5**, Node **22.14.0**, PostgreSQL **18**. Backend packages are pinned in `backend/requirements.txt`; frontend packages are locked by `frontend/package-lock.json`. CI uses exactly these versions.

---

## Repository layout

```text
Rosterly/
├── .github/workflows/ci.yml   # CI: backend, migrations on PostgreSQL, frontend
├── backend/
│   ├── app/
│   │   ├── core/              # config, security (zero-trust auth, RBAC), role policy, Celery
│   │   ├── models/            # SQLAlchemy models
│   │   └── modules/<feature>/ # router.py + service.py + schemas.py per feature
│   ├── alembic/               # migrations
│   └── tests/                 # pytest suites per feature
├── frontend/
│   └── src/
│       ├── app/               # routes
│       ├── shell/             # sidebar, Ctrl K palette, section tabs, user menu
│       ├── ui/                # design-system primitives (buttons, fields, tables, dialogs…)
│       ├── features/<feature>/# pages, components, services, types, tests
│       └── lib/               # API client, formatting, URL filters
├── ai-service/                # scaffold for the AI module (later phase)
└── README.md
```

---

## Running locally

### 1. Prerequisites
- Python 3.13.5
- Node.js 22.14.0 (npm 10)
- PostgreSQL 18, or a Neon connection string
- Redis — only if you run the Celery worker for background jobs

### 2. Backend
```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate   ·   macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # set DATABASE_URL and JWT_SECRET_KEY
alembic upgrade head          # create / update the schema and seed roles and permissions
uvicorn app.main:app --reload --port 8000
```
API docs: <http://localhost:8000/docs>. Background jobs (optional): `celery -A app.core.celery_app worker --beat`.

### 3. Frontend
```bash
cd frontend
npm ci
cp .env.example .env          # VITE_API_BASE_URL defaults to http://localhost:8000/api/v1
npm run dev
```
App: <http://localhost:5173>.

Email delivery is off until real SMTP credentials are set and `EMAIL_DELIVERY_ENABLED=true` in `backend/.env`.

---

## Tests and checks

These are the same commands CI runs.

```bash
# Backend
cd backend
ruff check app tests
pytest                        # 302 tests, self-contained (SQLite)

# Frontend
cd frontend
npm run lint
npm test                      # 67 tests
npm run build                 # type-check + production build
```

---

## Continuous integration

`.github/workflows/ci.yml` runs on every push to `main` and on every pull request:

| Job | Steps |
| :--- | :--- |
| Backend · lint and tests | Python 3.13.5 → `pip install -r requirements.txt` → `ruff check` → `pytest` |
| Backend · migrations on PostgreSQL 18 | PostgreSQL 18 service → `alembic upgrade head`, `downgrade base`, `upgrade head` |
| Frontend · lint, tests and build | Node 22.14.0 → `npm ci` → `npm run lint` → `npm test` → `npm run build` → production build kept as an artifact |

There is no deployment target yet, so delivery currently stops at the build artifact.

---

## Team

Team 145, Dept. of CEA, GLA University, Mathura — Kushagra Kulshrestha, Venu Gopal, Bharti Singh.
