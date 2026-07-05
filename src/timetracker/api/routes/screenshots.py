from __future__ import annotations

import logging
import os
import re
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlmodel import Session, func, select

from timetracker.config import ScreenshotExclusion
from timetracker.db.models import Screenshot

logger = logging.getLogger(__name__)

router = APIRouter()


class PurgeRequest(BaseModel):
    exclusions: list[dict[str, str | None]]


def _engine(request: Request) -> Any:
    return request.app.state.engine


def _shot_out(s: Screenshot) -> dict[str, Any]:
    return {
        "id": s.id,
        "activity_id": s.activity_id,
        "timestamp": s.timestamp,
        "file_path": s.file_path,
        "file_size": s.file_size,
    }


@router.post("/purge-by-exclusions")
def purge_by_exclusions(body: PurgeRequest, request: Request) -> dict[str, Any]:
    """Delete screenshots AND activities whose process/title match any exclusion pattern."""
    from timetracker.db.models import Activity

    engine = _engine(request)
    deleted_shots = 0
    deleted_acts = 0
    act_ids: set[int] = set()

    with Session(engine) as session:
        # Find matching activities
        acts = session.exec(select(Activity)).all()
        matched: list[Activity] = []
        for a in acts:
            for exc in body.exclusions:
                proc_pat = exc.get("process_regex")
                title_pat = exc.get("title_regex")
                if proc_pat and not re.search(proc_pat, a.process or "", re.IGNORECASE):
                    continue
                if title_pat and not re.search(title_pat, a.title or "", re.IGNORECASE):
                    continue
                matched.append(a)
                act_ids.add(a.id)
                break

        # Delete screenshots for matched activities
        if act_ids:
            shots = session.exec(
                select(Screenshot).where(Screenshot.activity_id.in_(act_ids))  # type: ignore[operator]
            ).all()
            for s in shots:
                try:
                    os.unlink(s.file_path)
                except OSError:
                    pass
                session.delete(s)
                deleted_shots += 1
            session.flush()

        # Delete matched activities
        for a in matched:
            session.delete(a)
            deleted_acts += 1

        session.commit()

    return {"deleted_screenshots": deleted_shots, "deleted_activities": deleted_acts}


@router.get("")
def list_screenshots(
    request: Request,
    limit: int = 50,
    offset: int = 0,
    activity_id: int | None = None,
    from_ts: str | None = None,
    to_ts: str | None = None,
) -> dict[str, Any]:
    engine = _engine(request)
    with Session(engine) as session:
        stmt = select(Screenshot)
        if activity_id is not None:
            stmt = stmt.where(Screenshot.activity_id == activity_id)  # type: ignore[operator]
        if from_ts:
            stmt = stmt.where(Screenshot.timestamp >= from_ts)  # type: ignore[operator]
        if to_ts:
            stmt = stmt.where(Screenshot.timestamp <= to_ts)  # type: ignore[operator]

        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = session.exec(count_stmt).one() or 0

        shots = session.exec(
            stmt.order_by(Screenshot.timestamp.desc())  # type: ignore[attr-defined]
            .offset(offset)
            .limit(limit)
        ).all()

        return {
            "items": [_shot_out(s) for s in shots],
            "total": total,
        }


@router.get("/near")
def screenshot_near(ts: str, request: Request) -> dict[str, Any] | None:
    """Return the best screenshot for the given timestamp.

    Prefers the latest shot at or before *ts*.
    Falls back to the earliest shot after *ts* if nothing before exists.
    """
    engine = _engine(request)
    with Session(engine) as session:
        shot = session.exec(
            select(Screenshot)
            .where(Screenshot.timestamp <= ts)  # type: ignore[operator]
            .order_by(Screenshot.timestamp.desc())  # type: ignore[attr-defined]
            .limit(1)
        ).first()

        if shot is None:
            shot = session.exec(
                select(Screenshot)
                .where(Screenshot.timestamp >= ts)  # type: ignore[operator]
                .order_by(Screenshot.timestamp)  # type: ignore[attr-defined]
                .limit(1)
            ).first()

        if shot is None:
            return None

        return _shot_out(shot)



@router.get("/{shot_id}/image")
def get_screenshot_image(shot_id: int, request: Request) -> Any:
    engine = _engine(request)
    with Session(engine) as session:
        shot = session.get(Screenshot, shot_id)
        if not shot:
            raise HTTPException(404, "Screenshot not found")
        path = Path(shot.file_path)
        if not path.exists():
            raise HTTPException(404, "Screenshot file not found on disk")
        return FileResponse(str(path), media_type="image/jpeg")
