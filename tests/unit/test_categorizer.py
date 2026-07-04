from __future__ import annotations

from pathlib import Path

import pytest
from sqlmodel import Session

from timetracker.config import Config, RuleConfig
from timetracker.db.migrations import run_migrations, seed_rules_from_config, seed_system_categories
from timetracker.db.session import create_engine_from_path
from timetracker.tracking.categorizer import Categorizer, CompiledRule


@pytest.fixture
def engine(tmp_path: Path):
    e = create_engine_from_path(str(tmp_path / "categorizer_test.db"))
    run_migrations(e)
    with Session(e) as session:
        seed_system_categories(session)
        config = Config(rules=[
            RuleConfig(name="کدنویسی", process_regex="code|jetbrains", color="#4CAF50"),
            RuleConfig(name="مرورگر", process_regex="chrome|firefox", color="#2196F3"),
            RuleConfig(name="ترمینال", process_regex="kitty|konsole", color="#FF9800"),
        ])
        seed_rules_from_config(session, config)
    return e


def test_compiled_rule_match_process() -> None:
    cr = CompiledRule("test", process_regex="code", title_regex=None)
    assert cr.match("code", None)
    assert cr.match("Code.exe", "any title")
    assert not cr.match("chrome", "anything")


def test_compiled_rule_match_both() -> None:
    cr = CompiledRule("test", process_regex="code", title_regex="hello")
    assert cr.match("code", "hello world")
    assert not cr.match("code", "goodbye")
    assert not cr.match("chrome", "hello")


def test_compiled_rule_match_title_only() -> None:
    cr = CompiledRule("test", process_regex=None, title_regex="python")
    assert cr.match("anything", "python script")
    assert not cr.match("anything", "javascript")


def test_categorizer_loads_rules(engine) -> None:
    cat = Categorizer(engine)
    assert len(cat._rules) == 3
    assert cat._rules[0].category == "کدنویسی"
    assert cat._rules[1].category == "مرورگر"
    assert cat._rules[2].category == "ترمینال"


def test_categorize(engine) -> None:
    cat = Categorizer(engine)
    assert cat.categorize("code", "main.py") == "کدنویسی"
    assert cat.categorize("Code.exe", "myapp") == "کدنویسی"
    assert cat.categorize("chrome", "github.com") == "مرورگر"
    assert cat.categorize("firefox", "anything") == "مرورگر"
    assert cat.categorize("konsole", None) == "ترمینال"
    assert cat.categorize("unknown_app", "something") == "Uncategorized"


def test_categorize_no_process_idle(engine) -> None:
    cat = Categorizer(engine)
    assert cat.categorize(None, None) == "Uncategorized"
