from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from sqlmodel import Session, select

from timetracker.db.models import Category, Meta, Rule
from timetracker.tracking.recompute import recompute_activities

router = APIRouter()


class RecomputeBody(BaseModel):
    from_ts: str | None = None


class RuleIn(BaseModel):
    process_regex: str | None = None
    title_regex: str | None = None
    recompute_from: str | None = None


class RuleOut(BaseModel):
    id: int
    category_id: int
    process_regex: str | None = None
    title_regex: str | None = None


class CategoryIn(BaseModel):
    name: str
    color: str = "#cccccc"
    priority: int = 0
    enabled: bool = True


class CategoryOut(BaseModel):
    id: int
    name: str
    color: str
    priority: int
    enabled: bool
    rules: list[RuleOut] = []


def _bump_rule_version(session: Session) -> None:
    rv = session.get(Meta, "rule_version")
    if rv:
        rv.value = str(int(rv.value) + 1)
    else:
        session.add(Meta(key="rule_version", value="1"))
    session.commit()


def _engine(request: Request) -> Any:
    return request.app.state.engine


@router.get("", response_model=list[CategoryOut])
def list_categories(request: Request) -> Any:
    engine = _engine(request)
    with Session(engine) as session:
        cats = session.exec(select(Category).order_by(Category.priority)).all()
        result = []
        for c in cats:
            rules = session.exec(select(Rule).where(Rule.category_id == c.id)).all()
            result.append(CategoryOut(
                id=c.id,
                name=c.name,
                color=c.color,
                priority=c.priority,
                enabled=c.enabled,
                rules=[RuleOut(id=r.id, category_id=r.category_id,
                              process_regex=r.process_regex, title_regex=r.title_regex)
                       for r in rules],
            ))
        return result


@router.get("/{category_id}", response_model=CategoryOut)
def get_category(category_id: int, request: Request) -> Any:
    engine = _engine(request)
    with Session(engine) as session:
        c = session.get(Category, category_id)
        if not c:
            raise HTTPException(404, "Category not found")
        rules = session.exec(select(Rule).where(Rule.category_id == c.id)).all()
        return CategoryOut(
            id=c.id, name=c.name, color=c.color, priority=c.priority, enabled=c.enabled,
            rules=[RuleOut(id=r.id, category_id=r.category_id,
                          process_regex=r.process_regex, title_regex=r.title_regex)
                   for r in rules],
        )


@router.post("", response_model=CategoryOut)
def create_category(body: CategoryIn, request: Request) -> Any:
    engine = _engine(request)
    with Session(engine) as session:
        existing = session.exec(select(Category).where(Category.name == body.name)).first()
        if existing:
            raise HTTPException(409, "Category with this name already exists")
        c = Category(name=body.name, color=body.color, priority=body.priority, enabled=body.enabled)
        session.add(c)
        session.flush()
        _bump_rule_version(session)
        return CategoryOut(
            id=c.id, name=c.name, color=c.color, priority=c.priority, enabled=c.enabled, rules=[],
        )


@router.put("/{category_id}", response_model=CategoryOut)
def update_category(category_id: int, body: CategoryIn, request: Request) -> Any:
    engine = _engine(request)
    with Session(engine) as session:
        c = session.get(Category, category_id)
        if not c:
            raise HTTPException(404, "Category not found")
        dup = session.exec(
            select(Category).where(Category.name == body.name, Category.id != category_id)
        ).first()
        if dup:
            raise HTTPException(409, "Category with this name already exists")
        c.name = body.name
        c.color = body.color
        c.priority = body.priority
        c.enabled = body.enabled
        session.add(c)
        session.flush()
        _bump_rule_version(session)
        rules = session.exec(select(Rule).where(Rule.category_id == c.id)).all()
        return CategoryOut(
            id=c.id, name=c.name, color=c.color, priority=c.priority, enabled=c.enabled,
            rules=[RuleOut(id=r.id, category_id=r.category_id,
                          process_regex=r.process_regex, title_regex=r.title_regex)
                   for r in rules],
        )


@router.delete("/{category_id}")
def delete_category(category_id: int, request: Request) -> dict[str, str]:
    engine = _engine(request)
    with Session(engine) as session:
        c = session.get(Category, category_id)
        if not c:
            raise HTTPException(404, "Category not found")
        for r in session.exec(select(Rule).where(Rule.category_id == category_id)).all():
            session.delete(r)
        session.delete(c)
        _bump_rule_version(session)
        return {"status": "deleted"}


# ── Rules sub-resource ─────────────────────────────────────────


@router.post("/recompute")
def recompute(request: Request, body: RecomputeBody) -> dict[str, Any]:
    engine = _engine(request)
    with Session(engine) as session:
        changed = recompute_activities(session, engine, body.from_ts)
        return {"changed": changed}


@router.post("/{category_id}/rules", response_model=RuleOut)
def create_rule(category_id: int, body: RuleIn, request: Request) -> Any:
    engine = _engine(request)
    with Session(engine) as session:
        c = session.get(Category, category_id)
        if not c:
            raise HTTPException(404, "Category not found")
        r = Rule(category_id=category_id, process_regex=body.process_regex, title_regex=body.title_regex)
        session.add(r)
        session.flush()
        _bump_rule_version(session)
        if body.recompute_from:
            recompute_activities(session, engine, body.recompute_from)
        return RuleOut(id=r.id, category_id=r.category_id,
                       process_regex=r.process_regex, title_regex=r.title_regex)


@router.put("/rules/{rule_id}", response_model=RuleOut)
def update_rule(rule_id: int, body: RuleIn, request: Request) -> Any:
    engine = _engine(request)
    with Session(engine) as session:
        r = session.get(Rule, rule_id)
        if not r:
            raise HTTPException(404, "Rule not found")
        r.process_regex = body.process_regex
        r.title_regex = body.title_regex
        session.add(r)
        session.flush()
        _bump_rule_version(session)
        if body.recompute_from:
            recompute_activities(session, engine, body.recompute_from)
        return RuleOut(id=r.id, category_id=r.category_id,
                       process_regex=r.process_regex, title_regex=r.title_regex)


@router.delete("/rules/{rule_id}")
def delete_rule(rule_id: int, request: Request) -> dict[str, str]:
    engine = _engine(request)
    with Session(engine) as session:
        r = session.get(Rule, rule_id)
        if not r:
            raise HTTPException(404, "Rule not found")
        session.delete(r)
        _bump_rule_version(session)
        return {"status": "deleted"}
