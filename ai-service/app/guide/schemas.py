"""POST /ai/guide request and response."""
from typing import Annotated, Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

Word = Annotated[str, StringConstraints(max_length=40)]


class PageTarget(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(max_length=60)
    label: str = Field(max_length=120)
    kind: Literal["button", "link", "field", "tab", "filter", "section"]
    changes: bool
    after: Optional[str] = Field(default=None, max_length=60)
    note: Optional[str] = Field(default=None, max_length=200)


class Page(BaseModel):
    """One page-map entry, already trimmed by the frontend to what this person can open."""

    model_config = ConfigDict(extra="ignore")

    id: str = Field(max_length=40)
    title: str = Field(max_length=80)
    purpose: str = Field(max_length=200)
    words: list[Word] = Field(default_factory=list, max_length=20)
    how_to_reach: str = Field(max_length=200)
    navigable: bool
    targets: list[PageTarget] = Field(default_factory=list, max_length=12)


class Turn(BaseModel):
    question: str = Field(max_length=300)
    answer: str = Field(max_length=600)


class GuideRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    message: str = Field(min_length=1, max_length=400)
    current_page: Optional[str] = Field(default=None, max_length=40)
    pages: list[Page] = Field(min_length=1, max_length=40)
    history: list[Turn] = Field(default_factory=list, max_length=2)


class Step(BaseModel):
    action: Literal["go", "point", "open", "fill", "say"]
    page: Optional[str] = None
    target: Optional[str] = None
    value: Optional[str] = None
    caption: Optional[str] = None


class Choice(BaseModel):
    label: str
    page: str


class Table(BaseModel):
    columns: list[str]
    rows: list[list[str]]


class GuideResponse(BaseModel):
    kind: Literal["show", "answer", "ask", "none"]
    title: Optional[str] = None
    steps: list[Step] = Field(default_factory=list)
    text: Optional[str] = None
    table: Optional[Table] = None
    page: Optional[str] = None  # a page to offer after an answer ("Open Assets")
    question: Optional[str] = None
    choices: list[Choice] = Field(default_factory=list)
    message: Optional[str] = None
    sources: list[str] = Field(default_factory=list) # backend endpoints read, for transparency
    model: Optional[str] = None

    def dump(self) -> dict[str, Any]:
        return self.model_dump(exclude_none=True)
