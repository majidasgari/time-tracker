from __future__ import annotations

from pathlib import Path

import pytest
from sqlmodel import Session, select

from timetracker.config import Config, RuleConfig
from timetracker.db.migrations import (
    run_migrations,
    seed_meta_defaults,
    seed_rules_from_config,
    seed_system_categories,
)
from timetracker.db.models import Activity, Category, Meta, Rule
from timetracker.db.session import create_engine_from_path, init_db


@pytest.fixture
def db_engine(tmp_path: Path):
    engine = create_engine_from_path(str(tmp_path / "test.db"))
    init_db(engine)
    yield engine


def test_create_and_read_activity(db_engine) -> None:
    with Session(db_engine) as session:
        act = Activity(
            start_ts="2026-07-04T10:00:00.000Z",
            end_ts="2026-07-04T11:00:00.000Z",
            duration_sec=3600,
            process="code",
            title="test.py",
            category="کدنویسی",
            rule_version=1,
        )
        session.add(act)
        session.commit()

    with Session(db_engine) as session:
        acts = session.exec(select(Activity)).all()
        assert len(acts) == 1
        assert acts[0].process == "code"
        assert acts[0].duration_sec == 3600


def test_seed_system_categories(db_engine) -> None:
    with Session(db_engine) as session:
        seed_system_categories(session)

    with Session(db_engine) as session:
        cats = session.exec(select(Category)).all()
        names = {c.name for c in cats}
        assert "Idle" in names
        assert "Uncategorized" in names


def test_seed_meta_defaults(db_engine) -> None:
    with Session(db_engine) as session:
        seed_meta_defaults(session)

    with Session(db_engine) as session:
        meta = session.get(Meta, "rule_version")
        assert meta is not None
        assert meta.value == "1"


def test_seed_rules_from_config(db_engine) -> None:
    config = Config(
        rules=[
            RuleConfig(name="کدنویسی", process_regex="code|jetbrains", color="#4CAF50"),
            RuleConfig(name="مرورگر", process_regex="chrome|firefox", color="#2196F3"),
        ]
    )
    with Session(db_engine) as session:
        seed_system_categories(session)
        seed_rules_from_config(session, config)

    with Session(db_engine) as session:
        cats = session.exec(select(Category)).all()
        assert len(cats) == 4
        rules = session.exec(select(Rule)).all()
        assert len(rules) == 2


def test_run_migrations(db_engine) -> None:
    with Session(db_engine) as session:
        run_migrations(db_engine)
        meta = session.get(Meta, "rule_version")
        assert meta is not None
        cats = session.exec(select(Category)).all()
        assert len(cats) == 2


def test_activity_index_exists(db_engine) -> None:
    with db_engine.connect() as conn:
        indices = conn.exec_driver_sql(
            "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='activity'"
        ).all()
        names = [r[0] for r in indices]
        assert "idx_activities_start_ts" in names
        assert "idx_activities_category" in names
