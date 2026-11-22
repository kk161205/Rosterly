"""
Onboarding recommendations — recommendation maths over the
company's own history, not a language model: instant, free, the same answer
for the same input, and still working when Groq is down.

Each past joiner is weighted by how much they resemble the new one:
  job role (title without seniority words) × 3, same department × 2,
  then × how close their seniority is (same level 1, one level apart 0.5, further 0.1),
  and recent joiners count more.
So an intern is compared with past interns first, and a senior engineer's extra
equipment never becomes an intern's default.
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

# Seniority level of a title word: 0 intern … 5 head of a function. Titles without one are 2 (mid-level).
LEVEL_WORDS = {
    "intern": 0, "trainee": 0, "apprentice": 0,
    "junior": 1, "jr": 1, "associate": 1, "graduate": 1, "i": 1,
    "ii": 2,
    "senior": 3, "sr": 3, "iii": 3,
    "lead": 4, "staff": 4, "principal": 4, "iv": 4,
    "head": 5, "chief": 5, "director": 5, "vp": 5,
}
MID = 2
LEVEL_NAME = {0: "intern", 1: "junior", 2: "", 3: "senior", 4: "lead", 5: "head-level"}
LEVEL_WEIGHT = {0: 1.0, 1: 0.5}  # by distance between levels; anything further counts 0.1


def _words(title: str) -> list[str]:
    return re.findall(r"[a-z]+", title.lower())


def seniority(title: str) -> int:
    levels = [LEVEL_WORDS[w] for w in _words(title) if w in LEVEL_WORDS]
    return max(levels) if levels else MID


def _title_words(title: str) -> set[str]:
    return {w for w in _words(title) if w not in LEVEL_WORDS}


def role_name(title: str) -> str:
    """The title without its seniority words, as written: "Senior Software Engineer" → "Software Engineer"."""
    kept = [w for w in re.findall(r"[A-Za-z][A-Za-z&/+-]*", title) if w.lower() not in LEVEL_WORDS]
    return " ".join(kept) or title.strip()


def title_similarity(a: str, b: str) -> float:
    """How alike two job roles are, ignoring seniority (that is weighed separately)."""
    wa, wb = _title_words(a), _title_words(b)
    if not wa or not wb:
        return 0.0
    if wa == wb:
        return 1.0
    return len(wa & wb) / len(wa | wb)


def level_weight(a: str, b: str) -> float:
    return LEVEL_WEIGHT.get(abs(seniority(a) - seniority(b)), 0.1)


def describe(designation: str, department: Optional[str]) -> str:
    """Who the suggestions are based on, in words: "junior Software Engineers in Engineering"."""
    role = role_name(designation)
    plural = role if role.endswith("s") else f"{role}s"
    level = seniority(designation)
    who = f"{role} interns" if level == 0 else f"{LEVEL_NAME[level]} {plural}".strip()
    return f"{who} in {department}" if department else who


@dataclass
class Item:
    key: str
    label: str
    task: str
    share: float
    count: int  # of the comparison group, how many got it
    out_of: int
    who: str
    licence_id: Optional[str] = None

    def reason(self) -> str:
        return f"{self.count} of {self.out_of} similar {self.who} got this"


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
        their_title = str(j.get("designation") or "")
        title = title_similarity(designation, their_title)
        same_dept = bool(department_id) and str(j.get("department_id") or "") == str(department_id)
        if title < 0.34 and not same_dept:
            continue  # not similar enough to say anything about
        base = (3 * title + 2 * same_dept) * level_weight(designation, their_title)
        if base <= 0:
            continue
        scored.append((base / (1 + _years_ago(j.get("joined_on"), today)), j))

    if len(scored) < MIN_SIMILAR:
        return {"basis": {"matches": len(scored), "label": None}, "usual": [], "sometimes": []}

    dept_name = next((j.get("department_name") for _, j in scored if str(j.get("department_id") or "") == str(department_id or "")), None)
    # The people a reason counts: those at the same level or one apart, when there are enough of them.
    peers = [j for _, j in scored if abs(seniority(designation) - seniority(str(j.get("designation") or ""))) <= 1]
    group = peers if len(peers) >= MIN_SIMILAR else [j for _, j in scored]
    who = describe(designation, None) if len(peers) >= MIN_SIMILAR else "joiners"
    label = f"Based on {len(group)} similar {describe(designation, dept_name) if len(peers) >= MIN_SIMILAR else 'joiners' + (f' in {dept_name}' if dept_name else '')}"

    scored.sort(key=lambda s: s[0], reverse=True)
    total = sum(w for w, _ in scored)

    items: dict[str, Item] = {}
    for w, j in scored:
        for category in j.get("asset_categories") or []:
            key = f"asset:{category}"
            name = str(category).replace("_", " ")
            items.setdefault(key, Item(key, name.capitalize(), f"Prepare a {name}", 0.0, 0, len(group), who))
            items[key].share += w / total
        for licence in j.get("licences") or []:
            key = f"licence:{licence.get('id')}"
            items.setdefault(key, Item(key, str(licence.get("name")), f"Give a {licence.get('name')} seat", 0.0, 0, len(group), who, licence_id=str(licence.get("id"))))
            items[key].share += w / total
    for item in items.values():
        kind, _, ident = item.key.partition(":")
        if kind == "asset":
            item.count = sum(1 for j in group if ident in (j.get("asset_categories") or []))
        else:
            item.count = sum(1 for j in group if any(str(lic.get("id")) == ident for lic in (j.get("licences") or [])))

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

    # An item nobody in the comparison group got is never suggested, whatever others at other levels got.
    ranked = sorted((i for i in items.values() if i.count > 0), key=lambda i: (-i.share, i.label))
    return {
        "basis": {"matches": len(scored), "label": label},
        # Capped so the ticked items always fit the 15 extra checklist tasks a new joiner can take.
        "usual": [out(i) for i in ranked if i.share >= USUAL][:MAX_USUAL],
        "sometimes": [out(i) for i in ranked if SOMETIMES <= i.share < USUAL][:MAX_SOMETIMES],
    }
