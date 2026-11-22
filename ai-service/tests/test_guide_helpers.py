"""The Guide's helpers: "why is this stuck", the record on screen, links, and saving Groq's allowance."""
import time

import app.core.groq as groq_module
import app.main as main
from app.core.rate_limit import RateLimiter

ASSET_ID = "11111111-2222-3333-4444-555555555555"


def test_why_is_my_request_stuck_needs_no_model_at_all(fakes, ask):
    backend, groq = fakes
    backend.responses["/api/v1/requests/mine"] = (200, {"items": [
        {"id": "r1", "title": "Dell monitor", "status": "pending", "total_steps": 2, "created_at": "2026-11-18T09:00:00"},
        {"id": "r2", "title": "Old chair", "status": "completed", "created_at": "2026-10-01T09:00:00"},
    ]})
    backend.responses["/api/v1/requests/r1"] = (200, {"approvals": [
        {"step_order": 1, "status": "approved", "approver_name": "Sarah Lee"},
        {"step_order": 2, "status": "pending", "approver_name": None, "approver_role_name": "it_admin"},
    ]})
    body = ask("why is my request stuck?").json()
    assert body["kind"] == "answer"
    assert "“Dell monitor” is waiting on an IT admin (step 2 of 2)" in body["text"]
    assert "Old chair" not in body["text"]
    assert body["links"] == [{"label": "Open Requests", "path": "/requests"}]
    assert groq.requests == []  # answered without Groq


def test_what_is_left_on_an_offboarding(fakes, ask):
    backend, groq = fakes
    backend.responses["/api/v1/offboarding"] = (200, {"checklists": [
        {"employee_name": "Alex Murphy", "completed_items": 1, "total_items": 3, "items": [
            {"task_name": "Collect laptop", "owner_role_name": "it_admin", "status": "pending"},
            {"task_name": "Exit interview", "owner_role_name": "hr_admin", "status": "done"},
            {"task_name": "Free GitHub seat", "owner_role_name": "it_admin", "status": "in_progress"},
        ]},
        {"employee_name": "Someone Else", "completed_items": 0, "total_items": 1, "items": []},
    ]})
    backend.responses["/api/v1/onboarding"] = (200, {"checklists": []})
    groq.replies = [{"kind": "lookup", "tool": "checklist_blockers", "args": {"person": "alex"}}]
    body = ask("what's stopping alex's offboarding?").json()
    assert body["text"].startswith("Alex Murphy’s offboarding is 1 of 3 done. Still to do: Collect laptop (IT), Free GitHub seat (IT).")
    assert body["table"]["rows"] == [["Collect laptop", "IT", "pending"], ["Free GitHub seat", "IT", "in progress"]]
    assert body["links"] == [{"label": "Open Offboarding", "path": "/offboarding"}]
    assert len(groq.requests) == 1  # only the deciding call; the answer is written from the data


def test_the_record_on_screen_is_read_only_when_one_is_open(fakes, ask):
    backend, groq = fakes
    backend.responses[f"/api/v1/assets/{ASSET_ID}"] = (200, {"asset": {"asset_tag": "AST-0011", "name": "Pixel 8", "status": "assigned",
                                                                       "current_holder": {"full_name": "Alex Murphy"}}})
    backend.responses[f"/api/v1/assets/{ASSET_ID}/maintenance"] = (200, [])
    groq.replies = [{"text": "AST-0011 is with Alex Murphy and has no open tickets."}]
    body = ask("what's happening with this one?", record={"type": "asset", "id": ASSET_ID}, current_page="asset").json()
    assert body["text"] == "AST-0011 is with Alex Murphy and has no open tickets."
    assert len(groq.requests) == 1 and "Alex Murphy" in groq.requests[0]["messages"][1]["content"]  # read first, then answered from the data
    groq.requests.clear()
    groq.replies = [{"kind": "show", "title": "x", "steps": [{"action": "go", "page": "assets"}]}]
    ask("how do I return this?", record={"type": "asset", "id": ASSET_ID}).json()
    assert "Question:" in groq.requests[0]["messages"][1]["content"]  # "how do I…" still goes to the deciding model
    groq.replies = [{"kind": "lookup", "tool": "this_record", "args": {}}]
    assert ask("what about this?").json()["kind"] == "none"  # nothing open: the tool isn't offered or run


def test_a_record_id_must_look_like_an_id(fakes, ask):
    assert ask("this", record={"type": "asset", "id": "../users"}).status_code == 400


def test_links_come_from_the_data_not_the_model(fakes, ask):
    backend, groq = fakes
    backend.responses["/api/v1/assets"] = (200, {"total": 1, "items": [{"id": "a-1", "asset_tag": "AST-1", "name": "MacBook Air", "status": "in_stock"}]})
    groq.replies = [{"kind": "lookup", "tool": "find_assets", "args": {}}, {"text": "One.", "links": [{"label": "x", "path": "/users"}]}]
    body = ask("find the macbook").json()
    assert body["links"] == [{"label": "AST-1 · MacBook Air", "path": "/assets/a-1"}]


def test_the_same_question_again_is_answered_from_the_cache(fakes, ask, monkeypatch):
    _, groq = fakes
    monkeypatch.setattr(main, "limiter", RateLimiter(per_minute=1, per_day=10))
    groq.replies = [{"kind": "show", "title": "Leave", "steps": [{"action": "go", "page": "leave"}]}]
    first = ask("where is leave").json()
    again = ask("Where is leave ").json()
    assert first == again and len(groq.requests) == 1  # no second model call, and the limit of 1 wasn't hit


def test_a_model_with_no_allowance_left_is_skipped(fakes, ask):
    _, groq = fakes
    groq_module._budget["openai/gpt-oss-20b"] = (10, time.time() + 30)
    groq.replies = [{"kind": "show", "title": "Leave", "steps": [{"action": "go", "page": "leave"}]}]
    body = ask("leave please").json()
    assert body["kind"] == "show"
    assert groq.requests[0]["model"] != "openai/gpt-oss-20b"


def test_groq_reset_times_are_read():
    assert groq_module._seconds("7.66s") == 7.66
    assert groq_module._seconds("1m2.5s") == 62.5
    assert groq_module._seconds("250ms") == 0.25


def test_asset_categories_are_matched_as_stored():
    from app.guide.tools import TOOLS, clean_args
    tool = TOOLS["find_assets"]
    assert clean_args(tool, {"category": "Monitors"})["category"] == "monitor"
    assert clean_args(tool, {"category": "laptop"})["category"] == "laptop"
    assert clean_args(tool, {"category": "Furniture"})["category"] == "furniture"
