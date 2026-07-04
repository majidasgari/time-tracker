from __future__ import annotations

import logging
from typing import Any

from sqlmodel import Session, select

from timetracker.db.models import Activity
from timetracker.tracking.categorizer import Categorizer

logger = logging.getLogger(__name__)


def recompute_activities(session: Session, engine: Any, from_ts: str | None = None) -> int:
    """Retroactively recategorize activities using current rules.

    If *from_ts* is provided only activities with ``start_ts >= from_ts``
    are touched.  Otherwise all activities are processed.
    Returns the number of activities whose category was changed.
    """
    categorizer = Categorizer(engine)
    categorizer.reload()

    stmt = select(Activity)
    if from_ts:
        stmt = stmt.where(Activity.start_ts >= from_ts)  # type: ignore[operator]

    activities = session.exec(stmt).all()
    changed = 0
    for act in activities:
        new_cat = categorizer.categorize(act.process, act.title)
        if act.category != new_cat:
            act.category = new_cat
            changed += 1

    session.commit()
    logger.info("Recomputed %d activities, %d changed", len(activities), changed)
    return changed
