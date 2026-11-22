"""
Onboarding recommendations — recommendation maths over the
company's own history, not a language model: instant, free, the same answer
for the same input, and still working when Groq is down.

Each past joiner is weighted by how much they resemble the new one:
  job title (seniority words ignored) × 3, same department × 2, recent joiners count more.
Items that at least half of the (weighted) similar joiners got are pre-ticked;
those that 20–50% got are offered unticked under "Sometimes added".
Fewer than MIN_SIMILAR similar joiners → nothing extra: the standard checklist stands.
"""
import re
from dataclasses import dataclass
from datetime import date
from typing import Any, Optional

MIN_SIMILAR = 3
USUAL = 0.5
SOMETIMES = 0.2
MAX_USUAL = 10
MAX_SOMETIMES = 5
SENIORITY = {"senior", "sr", "junior", "jr", "lead", "principal", "staff", "associate", "intern", "trainee", "head", "chief", "i", "ii", "iii", "iv"}


def _title_words(title: str) -> set[str]:
    return {w for w in re.findall(r"[a-z]+", title.lower()) if w not in SENIORITY}


def title_similarity(a: str, b: str) -> float:
    wa, wb = _title_words(a), _title_words(b)
    if not wa or not wb:
        return 0.0
    if wa == wb:
        return 1.0
    return len(wa & wb) / len(wa | wb)


@dataclass
class Item:
    key: str
    label: str
    task: str
    share: float
    count: int  # of the closest joiners, how many got it
    out_of: int
    licence_id: Optional[str] = None

    def reason(self) -> str:
        return f"{self.count} of {self.out_of} similar joiners got this"


def _years_ago(joined: Any, today: date) -> float:
    try:
        d = joined if isinstance(joined, date) else date.fromisoformat(str(joined)[:10])
    except ValueError:
        return 3.0
    return max(0.0, (today - d).days / 365)


def recommend(history: dict[str, Any], department_id: Optional[str], designation: str, today: Optional[date] = None) -> dict[str, Any]:
    today = today or date.today()
    scored: list[tuple[float, dict[str, Any]]] = []
    for j in history.get("joiners", []):
        title = title_similarity(designation, str(j.get("designation") or ""))
        same_dept = bool(department_id) and str(j.get("department_id") or "") == str(department_id)
        base = 3 * title + 2 * same_dept
        if title < 0.34 and not same_dept:
            continue  # not similar enough to say anything about
        if base <= 0:
            continue
        scored.append((base / (1 + _years_ago(j.get("joined_on"), today)), j))

    dept_name = next((j.get("department_name") for _, j in scored if str(j.get("department_id") or "") == str(department_id or "")), None)
    label = f"Usual for {designation.strip()} joiners" + (f" in {dept_name}" if dept_name else "")
    if len(scored) < MIN_SIMILAR:
        return {"basis": {"matches": len(scored), "label": None}, "usual": [], "sometimes": []}

    scored.sort(key=lambda s: s[0], reverse=True)
    total = sum(w for w, _ in scored)
    closest = [j for _, j in scored]  # the same people the shares are weighted over

    items: dict[str, Item] = {}
    for w, j in scored:
        for category in j.get("asset_categories") or []:
            key = f"asset:{category}"
            name = str(category).replace("_", " ")
            items.setdefault(key, Item(key, name.capitalize(), f"Prepare a {name}", 0.0, 0, len(closest)))
            items[key].share += w / total
        for licence in j.get("licences") or []:
            key = f"licence:{licence.get('id')}"
            items.setdefault(key, Item(key, str(licence.get("name")), f"Give a {licence.get('name')} seat", 0.0, 0, len(closest), licence_id=str(licence.get("id"))))
            items[key].share += w / total
    for item in items.values():
        kind, _, ident = item.key.partition(":")
        if kind == "asset":
            item.count = sum(1 for j in closest if ident in (j.get("asset_categories") or []))
        else:
            item.count = sum(1 for j in closest if any(str(lic.get("id")) == ident for lic in (j.get("licences") or [])))

    def out(item: Item) -> dict[str, Any]:
        return {
            "key": item.key,
            "label": item.label,
            "task": item.task,
            "owner": "it_admin",
            "share": round(item.share, 2),
            "reason": item.reason(),
            **({"licence_id": item.licence_id} if item.licence_id else {}),
        }

    ranked = sorted(items.values(), key=lambda i: (-i.share, i.label))
    return {
        "basis": {"matches": len(scored), "label": label},
        # Capped so the ticked items always fit the 15 extra checklist tasks a new joiner can take.
        "usual": [out(i) for i in ranked if i.share >= USUAL][:MAX_USUAL],
        "sometimes": [out(i) for i in ranked if SOMETIMES <= i.share < USUAL][:MAX_SOMETIMES],
    }
