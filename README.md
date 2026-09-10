# Rosterly

> Unified Asset & Employee Management Portal

Rosterly is an enterprise-grade platform designed for managing employee lifecycles, physical and digital assets, automated multi-step approval workflows, and intelligent natural-language operations.

---

## 📋 Project Status

Phase 1 core platform — authentication, employee management, and asset inventory are built, backed by a real Postgres schema with RBAC/ABAC enforcement, zero-trust sessions, and audit logging.

**Implemented pages:**
- ✅ Login (multi-step auth: password, MFA, forgot/reset password, lockout)
- ✅ Dashboard (role-aware home for employee / manager / hr_admin / it_admin / super_admin / auditor)
- ✅ Employee Directory (list + org-chart views, department/role/status filtering)
- ✅ Employee Profile Detail (overview, document vault, assigned assets, lifecycle tabs)
- ✅ Onboarding Workflow (task board, progress tracking, AI-assisted checklist suggestions)
- ✅ Offboarding Workflow (asset reclamation, access revocation, termination flow)
- ✅ Asset Inventory (catalog, bulk actions, admin-extensible categories, depreciation tracking)

**Not yet built:** Asset Detail, QR Check-In/Check-Out, Maintenance Tickets, Unified Request Portal, Approvals Queue, Approval Chain Configuration, Software License Tracking, Leave & Attendance, Analytics, and the AI Assistant panel.

**Current test coverage:** 165 backend tests (pytest) and 34 frontend tests (Vitest) passing, plus a clean TypeScript build (`tsc -b`).

---

## 🏛 Architecture Overview

The repository is organized as a modular monorepo:

```text
rosterly/
├── backend/       # FastAPI — Core platform API (Auth, RBAC/ABAC, Business Logic)
├── frontend/      # React 19 + TypeScript + Vite — Modern UI dashboard
├── ai-service/    # FastAPI + LangGraph — AI query assistant & orchestration
├── docker-compose.yml # Multi-container local development orchestration
└── README.md
```

### Services Breakdown

* **Backend (`/backend`)**:
  * FastAPI core API with Pydantic v2 validation and standardized error envelopes.
  * SQLAlchemy ORM with PostgreSQL database persistence and Alembic migrations.
  * Celery beat & worker orchestration for background processing (depreciation recalculations, warranty expiry tracking, email dispatch).
  * Zero-trust session tracking and live role verification.

* **Frontend (`/frontend`)**:
  * React 19, TypeScript, and Vite with path aliasing (`@/*`).
  * Modern design system powered by Tailwind CSS tokens, Hanken Grotesk, Inter, and JetBrains Mono typography.
  * TanStack Query for server-state caching and Axios HTTP client.

* **AI Service (`/ai-service`)**:
  * Independent LangGraph/FastAPI service for natural-language analytics and onboarding workflow suggestions.
  * Strict least-privilege architecture: zero direct database access, forwarding authenticated user tokens to the core backend.

---

## 🚀 Quick Start (Local Development)

### 1. Prerequisites
* [Docker](https://www.docker.com/) and Docker Compose
* (Optional for bare-metal run) Python 3.12+ and Node.js 20+

### 2. Environment Configuration

Copy the example environment files for each service:

```bash
# Backend configuration
cp backend/.env.example backend/.env

# Frontend configuration
cp frontend/.env.example frontend/.env

# AI Service configuration
cp ai-service/.env.example ai-service/.env
```

### 3. Launch via Docker Compose

```bash
docker compose up --build
```

### 4. Service Endpoints

| Service | URL | Notes |
| :--- | :--- | :--- |
| **Frontend** | [http://localhost:5173](http://localhost:5173) | Main user interface |
| **Backend API** | [http://localhost:8000](http://localhost:8000) | Core API (Docs at `/docs`) |
| **AI Service** | [http://localhost:8100](http://localhost:8100) | AI module API |
| **PostgreSQL** | `localhost:5432` | Primary database (`rosterly`) |
| **Redis** | `localhost:6379` | Cache & Celery message broker |

---

## 🧪 Testing

### Backend Tests (pytest — 165 passing)
```bash
cd backend
python -m pytest
```

### Frontend Tests (Vitest — 34 passing)
```bash
cd frontend
npx vitest run
```

### Frontend Typecheck & Build
```bash
cd frontend
npm run build
```
