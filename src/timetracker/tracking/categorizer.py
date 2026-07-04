from __future__ import annotations

import logging
import re
from threading import Lock
from typing import Any

from sqlmodel import Session, select

from timetracker.db.models import Category, Meta, Rule

logger = logging.getLogger(__name__)


class CompiledRule:
    def __init__(
        self, category_name: str, process_regex: str | None, title_regex: str | None
    ) -> None:
        self.category = category_name
        self._process_re = re.compile(process_regex, re.IGNORECASE) if process_regex else None
        self._title_re = re.compile(title_regex, re.IGNORECASE) if title_regex else None

    def match(self, process: str | None, title: str | None) -> bool:
        if self._process_re is not None and (
            process is None or not self._process_re.search(process)
        ):
            return False
        if self._title_re is not None and (
            title is None or not self._title_re.search(title)
        ):
            return False
        return True


class Categorizer:
    def __init__(self, engine: Any) -> None:
        self._engine = engine
        self._lock = Lock()
        self._rules: list[CompiledRule] = []
        self._version: int = 0
        self.reload()

    def reload(self) -> None:
        with self._lock:
            with Session(self._engine) as session:
                current_version = session.get(Meta, "rule_version")
                new_version = int(current_version.value) if current_version else 1
                if new_version == self._version:
                    return
                new_rules: list[CompiledRule] = []
                categories = session.exec(
                    select(Category).where(Category.enabled).order_by(Category.priority)  # type: ignore[arg-type]
                ).all()
                for cat in categories:
                    rules = session.exec(select(Rule).where(Rule.category_id == cat.id)).all()
                    for rule in rules:
                        try:
                            cr = CompiledRule(cat.name, rule.process_regex, rule.title_regex)
                            new_rules.append(cr)
                        except re.error as e:
                            logger.warning("Invalid regex in rule for %s: %s", cat.name, e)
                self._rules = new_rules
                self._version = new_version
                logger.debug("Categorizer reloaded: %d rules (v%d)", len(new_rules), new_version)

    def categorize(self, process: str | None, title: str | None) -> str:
        with self._lock:
            for cr in self._rules:
                if cr.match(process, title):
                    return cr.category
        return "Uncategorized"
