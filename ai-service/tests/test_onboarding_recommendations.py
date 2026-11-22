"""Onboarding recommendations: the maths and the endpoint."""
from datetime import date

from app.onboarding.recommend import describe, recommend, seniority, title_similarity
from tests.conftest import TOKEN

TODAY = date(2026, 11, 21)
PRODUCT = "d-product"


def joiner(title, dept=PRODUCT, assets=(), licences=(), joined="2026-06-01", dept_name="Product"):
    return {"designation": title, "department_id": dept, "department_name": dept_name if dept else None, "joined_on": joined,
            "asset_categories": list(assets), "licences": [{"id": f"lic-{n.lower()}", "name": n} for n in licences]}


HISTORY = {"joiners": [
    joiner("Product Designer", assets=["laptop", "monitor"], licences=["Figma"]),
    joiner("Senior Product Designer", assets=["laptop"], licences=["Figma"]),
    joiner("Product Designer", assets=["laptop"], licences=["Figma", "Miro"]),
    joiner("Product Designer", assets=["laptop"], licences=["Figma"], joined="2024-01-10"),
    joiner("Backend Engineer", dept="d-eng", assets=["laptop", "monitor", "mobile"], licences=["GitHub"], dept_name="Engineering"),
    joiner("Backend Engineer", dept="d-eng", assets=["laptop"], licences=["GitHub"], dept_name="Engineering"),
]}


def test_titles_match_without_seniority_words():
    assert title_similarity("Senior Product Designer", "Product Designer") == 1.0
    assert title_similarity("Product Designer", "Backend Engineer") == 0.0
    assert 0 < title_similarity("UX Designer", "Product Designer") < 1


def test_pre_ticks_what_most_similar_joiners_got_and_offers_the_rest():
    rec = recommend(HISTORY, PRODUCT, "Product Designer", TODAY)
    assert rec["basis"] == {"matches": 4, "label": "Based on 4 similar Product Designers in Product"}
    usual = {i["key"]: i for i in rec["usual"]}
    assert set(usual) == {"asset:laptop", "licence:lic-figma"}
    assert usual["licence:lic-figma"]["task"] == "Give a Figma seat"
    assert usual["licence:lic-figma"]["licence_id"] == "lic-figma"
    assert usual["asset:laptop"]["reason"] == "4 of 4 similar Product Designers got this"
    sometimes = {i["key"] for i in rec["sometimes"]}
    assert "asset:monitor" in sometimes and "licence:lic-miro" in sometimes
    everything = str(rec)
    assert "GitHub" not in everything and "mobile" not in everything  # engineers don't shape a designer's list


def test_recent_joiners_count_more():
    history = {"joiners": [
        joiner("Analyst", licences=["Tableau"], joined="2026-10-01"),
        joiner("Analyst", licences=["Tableau"], joined="2026-09-01"),
        joiner("Analyst", licences=["Excel"], joined="2023-12-01"),
        joiner("Analyst", licences=["Excel"], joined="2023-12-02"),
    ]}
    rec = recommend(history, PRODUCT, "Analyst", TODAY)
    assert [i["label"] for i in rec["usual"]] == ["Tableau"]  # the two recent ones outweigh the two from three years ago


def test_too_little_history_means_the_standard_checklist_only():
    rec = recommend({"joiners": HISTORY["joiners"][4:]}, PRODUCT, "Product Designer", TODAY)
    assert rec == {"basis": {"matches": 0, "label": None}, "usual": [], "sometimes": []}
    assert recommend({"joiners": []}, None, "Chef", TODAY)["usual"] == []


def test_same_department_counts_even_with_a_different_title():
    history = {"joiners": [joiner("Researcher", licences=["Dovetail"]) for _ in range(3)]}
    rec = recommend(history, PRODUCT, "Content Designer", TODAY)
    assert [i["label"] for i in rec["usual"]] == ["Dovetail"]


def test_endpoint_reads_history_with_the_persons_token(fakes, client):
    backend, groq = fakes
    backend.responses["/api/v1/onboarding/joiner-history"] = (200, HISTORY)
    res = client.get("/ai/onboarding-recommendations", params={"designation": "Product Designer", "department_id": PRODUCT}, headers={"Authorization": f"Bearer {TOKEN}"})
    assert res.status_code == 200
    assert {i["key"] for i in res.json()["usual"]} == {"asset:laptop", "licence:lic-figma"}
    assert all(auth == f"Bearer {TOKEN}" for _, _, auth in backend.calls)
    assert groq.requests == []  # no language model involved


def test_endpoint_follows_the_company_switch_not_the_personal_one(fakes, client):
    backend, _ = fakes
    backend.responses["/api/v1/onboarding/joiner-history"] = (200, HISTORY)
    headers = {"Authorization": f"Bearer {TOKEN}"}
    backend.responses["/api/v1/me/preferences"] = (200, {"assistant_enabled": False, "company_assistant_enabled": True})
    assert client.get("/ai/onboarding-recommendations", params={"designation": "Designer"}, headers=headers).status_code == 200
    backend.responses["/api/v1/me/preferences"] = (200, {"assistant_enabled": True, "company_assistant_enabled": False})
    res = client.get("/ai/onboarding-recommendations", params={"designation": "Designer"}, headers=headers)
    assert res.status_code == 403 and res.json()["error"]["code"] == "ai_disabled"


def test_endpoint_is_for_people_who_add_joiners(fakes, client):
    backend, _ = fakes
    backend.responses["/api/v1/onboarding/joiner-history"] = (403, {"error": {"message": "Forbidden"}})
    res = client.get("/ai/onboarding-recommendations", params={"designation": "Designer"}, headers={"Authorization": f"Bearer {TOKEN}"})
    assert res.status_code == 403 and res.json()["error"]["code"] == "forbidden"
    assert client.get("/ai/onboarding-recommendations", params={"designation": "Designer"}).status_code == 401


def test_lists_are_capped_to_fit_a_new_joiners_checklist():
    many = {"joiners": [joiner("Designer", licences=[f"Tool{i}" for i in range(20)]) for _ in range(4)]}
    rec = recommend(many, PRODUCT, "Designer", TODAY)
    assert len(rec["usual"]) == 10 and len(rec["usual"]) + len(rec["sometimes"]) <= 15


def test_the_reason_never_says_nobody_got_it():
    history = {"joiners": [joiner("Designer", licences=[]) for _ in range(10)] + [joiner("Researcher", licences=["X"]) for _ in range(30)]}
    for item in recommend(history, PRODUCT, "Designer", TODAY)["usual"]:
        assert not item["reason"].startswith("0 of")


def test_seniority_is_read_from_the_title():
    assert seniority("Software Engineer Intern") == 0
    assert seniority("Junior Analyst") == 1
    assert seniority("Software Engineer") == 2
    assert seniority("Senior Software Engineer") == 3
    assert seniority("Lead Engineer") == 4
    assert describe("Software Engineer Intern", "Engineering") == "Software Engineer interns in Engineering"
    assert describe("Senior Software Engineer", None) == "senior Software Engineers"


def test_an_intern_is_not_given_what_seniors_usually_get():
    eng = dict(dept="d-eng", dept_name="Engineering")
    history = {"joiners": [
        *[joiner("Senior Software Engineer", assets=["laptop", "monitor", "mobile"], licences=["GitHub", "AWS Console"], **eng) for _ in range(6)],
        *[joiner("Software Engineer Intern", assets=["laptop"], licences=["GitHub"], **eng) for _ in range(3)],
    ]}
    rec = recommend(history, "d-eng", "Software Engineer Intern", TODAY)
    usual = {i["label"]: i for i in rec["usual"]}
    assert set(usual) == {"Laptop", "GitHub"}
    assert usual["GitHub"]["reason"] == "3 of 3 similar Software Engineer interns got this"
    assert rec["basis"]["label"] == "Based on 3 similar Software Engineer interns in Engineering"
    offered = {i["label"] for i in rec["usual"] + rec["sometimes"]}
    assert "AWS Console" not in offered and "Mobile" not in offered  # only seniors got these
    senior = recommend(history, "d-eng", "Senior Software Engineer", TODAY)
    assert {"AWS Console", "Mobile"} <= {i["label"] for i in senior["usual"]}
