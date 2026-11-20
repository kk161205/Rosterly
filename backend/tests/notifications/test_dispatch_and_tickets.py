"""Email dispatch while email is off, and clearing a ticket's technician."""
import uuid
from types import SimpleNamespace
from unittest.mock import MagicMock

from app.modules.assets.schemas import MaintenanceTicketUpdateRequest
from app.modules.notifications import dispatch


def test_dispatch_does_nothing_while_email_is_off(monkeypatch):
    monkeypatch.setattr(dispatch, "email_delivery_available", lambda: False)
    db = MagicMock()
    assert dispatch._run_dispatch_pending_emails(db) == {"sent": 0, "skipped": 0}
    db.query.assert_not_called()  # no growing scan every two minutes


def test_dispatch_only_picks_recent_unsent_alerts_and_skips_locked_rows(monkeypatch):
    monkeypatch.setattr(dispatch, "email_delivery_available", lambda: True)
    monkeypatch.setattr(dispatch, "_send_email", lambda n: True)
    note = SimpleNamespace(email_sent_at=None)
    db = MagicMock()
    chain = db.query.return_value.filter.return_value.order_by.return_value.limit.return_value.with_for_update
    chain.return_value.all.return_value = [note]
    assert dispatch._run_dispatch_pending_emails(db) == {"sent": 1, "skipped": 0}
    chain.assert_called_once_with(skip_locked=True)
    assert note.email_sent_at is not None


def test_an_explicit_null_assignee_is_a_request_to_clear_it():
    cleared = MaintenanceTicketUpdateRequest(assigned_to=None)
    untouched = MaintenanceTicketUpdateRequest(status=None)
    assert "assigned_to" in cleared.model_fields_set
    assert "assigned_to" not in untouched.model_fields_set
    assert MaintenanceTicketUpdateRequest(assigned_to=str(uuid.uuid4())).assigned_to is not None
