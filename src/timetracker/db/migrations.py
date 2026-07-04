from __future__ import annotations

from typing import Any

from sqlmodel import Session, select

from timetracker.config import Config
from timetracker.db.models import Activity, Category, Meta, Rule
from timetracker.db.session import init_db


def run_migrations(engine: Any) -> None:
    init_db(engine)
    with Session(engine) as session:
        seed_meta_defaults(session)
        seed_system_categories(session)


def seed_meta_defaults(session: Session) -> None:
    existing = session.get(Meta, "rule_version")
    if existing is None:
        session.add(Meta(key="rule_version", value="1"))
        session.commit()


def seed_system_categories(session: Session) -> None:
    for name, color in [("Idle", "#9E9E9E"), ("Uncategorized", "#607D8B")]:
        existing = session.exec(select(Category).where(Category.name == name)).first()
        if existing is None:
            session.add(Category(name=name, color=color, priority=9999, enabled=True))
    session.commit()


def seed_rules_from_config(session: Session, config: Config, force: bool = False) -> None:
    for rc in config.rules:
        existing = session.exec(select(Category).where(Category.name == rc.name)).first()
        if existing is None or force:
            cat = existing or Category(name=rc.name, color=rc.color, priority=0, enabled=True)
            cat.color = rc.color
            session.add(cat)
            session.flush()
            rule = session.exec(
                select(Rule).where(Rule.category_id == cat.id)
            ).first()
            if rule is None or force:
                if rule is None:
                    rule = Rule(category_id=cat.id)
                rule.process_regex = rc.process_regex
                rule.title_regex = rc.title_regex
                session.add(rule)
    session.commit()


def close_open_activities(session: Session, now_ts: str) -> None:
    stmt = select(Activity).where(Activity.end_ts == None)  # noqa: E711
    open_activities = session.exec(stmt).all()
    for a in open_activities:
        a.end_ts = now_ts
        if a.start_ts and a.end_ts:
            from datetime import datetime

            try:
                start = datetime.fromisoformat(a.start_ts)
                end = datetime.fromisoformat(a.end_ts)
                a.duration_sec = int((end - start).total_seconds())
            except ValueError:
                a.duration_sec = 0
    session.commit()
