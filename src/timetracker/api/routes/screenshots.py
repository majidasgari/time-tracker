from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse
from sqlmodel import Session, func, select

from timetracker.db.models import Screenshot

router = APIRouter()


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
