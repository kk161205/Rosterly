#!/usr/bin/env bash
# Render start command for the API:
#   1. bring the database schema up to date;
#   2. run one Celery worker with the scheduler built in (-B), in-process pool
#      (--pool=solo: one process fewer on a 512 MB instance) — the broker is
#      Render's Key Value (Redis-compatible) service;
#   3. run the API (Render routes traffic to $PORT).
# If either process exits, the script exits too, so Render restarts the
# service instead of leaving the API up without its background jobs.
# The real client IP comes from Render's proxy header (app/core/request_context.py).
set -euo pipefail

alembic upgrade head

celery -A app.core.celery_app worker -B --pool=solo --concurrency=1 --loglevel=INFO &
CELERY_PID=$!

uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" &
WEB_PID=$!

trap 'kill -TERM "$CELERY_PID" "$WEB_PID" 2>/dev/null || true; wait' TERM INT

wait -n "$CELERY_PID" "$WEB_PID" || true
echo "A process stopped; exiting so Render restarts the service." >&2
kill -TERM "$CELERY_PID" "$WEB_PID" 2>/dev/null || true
wait || true
exit 1
