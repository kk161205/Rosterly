"""The safety checks and the prompt size, without any HTTP."""
from app.guide.prompts import decide_prompt, focus_pages, page_map_text
from app.guide.tools import TOOLS, clean_args
from app.guide.validate import validate_answer, validate_show


def test_open_or_fill_on_something_that_changes_data_becomes_a_point(page_models):
    reply = validate_show(
        {"steps": [
            {"action": "go", "page": "leave"},
            {"action": "open", "target": "leave.apply", "caption": "Open"},
            {"action": "open", "target": "leave.send", "caption": "Send"},
        ]},
        page_models,
    )
    assert [(s.action, s.target) for s in reply.steps] == [("go", None), ("open", "leave.apply"), ("point", "leave.send")]


def test_the_last_step_is_always_the_persons(page_models):
    reply = validate_show({"steps": [{"action": "go", "page": "assets"}, {"action": "open", "target": "assets.add"}]}, page_models)
    assert reply.steps[-1].action == "point"


def test_record_page_targets_go_through_their_list(page_models):
    reply = validate_show({"steps": [{"action": "point", "target": "asset.assign", "caption": "Assign"}]}, page_models, current_page="home")
    assert [s.action for s in reply.steps] == ["go", "say"]
    assert reply.steps[0].page == "assets"
    assert "Then press Assign" in reply.steps[1].caption


def test_unknown_pages_targets_and_actions_are_dropped(page_models):
    reply = validate_show(
        {"steps": [{"action": "go", "page": "nope"}, {"action": "click", "target": "leave.send"}, {"action": "point", "target": "made.up"}, {"action": "go", "page": "asset"}]},
        page_models,
    )
    assert reply.kind == "none"


def test_fill_only_types_text_into_fields(page_models):
    reply = validate_show(
        {"steps": [
            {"action": "go", "page": "assets"},
            {"action": "fill", "target": "assets.search", "value": "MacBook"},
            {"action": "fill", "target": "assets.add", "value": "x"},
            {"action": "fill", "target": "assets.search", "value": {"evil": 1}},
        ]},
        page_models,
    )
    assert [(s.action, s.target, s.value) for s in reply.steps[1:]] == [
        ("fill", "assets.search", "MacBook"), ("point", "assets.add", None), ("point", "assets.search", None),
    ]


def test_answers_are_trimmed_and_tables_capped(page_models):
    reply = validate_answer({"text": "x" * 2000, "table": {"columns": list("abcdef"), "rows": [[str(i)] * 6 for i in range(20)]}}, page_models, "users")
    assert len(reply.text) == 600  # fits Turn.answer, so it can always go back as history
    assert len(reply.table.columns) == 4 and len(reply.table.rows) == 8 and len(reply.table.rows[0]) == 4
    assert reply.page == "users"
    assert validate_answer({"text": "ok"}, page_models, "not-a-page").page is None


def test_tool_arguments_are_whitelisted_and_normalised():
    assert clean_args(TOOLS["find_assets"], {"status": "In Repair", "search": "mac", "page_size": 500, "sql": "x"}) == {
        "page_size": 10, "status": "under_maintenance", "search": "mac",
    }
    assert clean_args(TOOLS["my_requests"], {"status": "waiting"}) == {"page_size": 10, "status": "pending"}
    assert clean_args(TOOLS["asset_counts"], "garbage") == {}


def test_only_the_pages_that_fit_list_their_buttons(page_models):
    focus = focus_pages("how do I ask for leave", page_models, "home")
    assert "leave" in focus and "home" in focus and len(focus) <= 7
    text = page_map_text(page_models, focus)
    assert "leave.apply" in text
    assert "audit.download" not in text  # an unrelated page shows only its one-line summary
    assert "audit-logs: Audit log" in text


def test_the_decide_prompt_stays_small(page_models):
    # Groq's free tier allows 8,000 tokens a minute per model; a question must stay well under 2,000.
    assert len(decide_prompt(page_models, "I need to give Priya a laptop", "home")) / 4 < 2000


def test_repeated_steps_on_one_target_collapse_to_the_last(page_models):
    reply = validate_show(
        {"steps": [
            {"action": "go", "page": "assets"},
            {"action": "open", "target": "assets.add", "caption": "Add asset"},
            {"action": "point", "target": "assets.add-save", "caption": "Enter name"},
            {"action": "point", "target": "assets.add-save", "caption": "Enter tag"},
            {"action": "point", "target": "assets.add-save", "caption": "Save asset"},
        ]},
        page_models,
    )
    assert [(s.target, s.caption) for s in reply.steps[1:]] == [("assets.add", "Add asset"), ("assets.add-save", "Save asset")]


def test_the_page_map_in_the_prompt_is_capped(page_models):
    from app.guide.prompts import MAX_MAP_CHARS
    from app.guide.schemas import Page

    huge = [Page(**{**page_models[0].model_dump(), "id": f"p{i}", "purpose": "x" * 200}) for i in range(40)]
    assert len(page_map_text(huge, {p.id for p in huge})) <= MAX_MAP_CHARS


def test_leave_numbers_read_as_plain_days():
    """The model repeats what it's given, so "8.00" would become "8.00 days"."""
    out = TOOLS["my_leave"].project({"balances": [{"leave_type": {"name": "Casual leave"}, "balance_days": "8.00", "pending_days": "0.50", "annual_days": None}], "items": []})
    assert out["balances"][0] == {"type": "Casual leave", "left": 8, "pending": 0.5, "per_year": None}
