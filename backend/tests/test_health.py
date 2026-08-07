"""
Placeholder test so `pytest` has something to run before any real
endpoints exist. Per rules.md §6: no new business logic ships without
a corresponding test — this file should grow alongside app/api/.
"""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
