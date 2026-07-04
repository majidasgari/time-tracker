from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from sqlmodel import Session, func, select
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from timetracker.api.routes.categories import router as categories_router
from timetracker.config import ensure_config
from timetracker.db.migrations import run_migrations, seed_rules_from_config
from timetracker.db.models import Activity
from timetracker.db.session import create_engine_from_path
from timetracker.platform.factory import get_backend

DIST_DIR = (
    Path(__file__).parent.parent.parent.parent
    / "dashboard" / "dist" / "dashboard" / "browser"
)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    cfg = ensure_config()
    engine = create_engine_from_path(cfg.storage.db_path)
    run_migrations(engine)
    with Session(engine) as session:
        seed_rules_from_config(session, cfg)
    _app.state.engine = engine
    yield


app = FastAPI(title="Time Tracker", lifespan=lifespan)
app.include_router(categories_router, prefix="/api/categories")


@app.get("/api/activities")
def list_activities(
    limit: int = 50,
    offset: int = 0,
    category: str | None = None,
    process: str | None = None,
    title: str | None = None,
    from_ts: str | None = None,
    to_ts: str | None = None,
) -> list[dict[str, Any]]:
    from fastapi.responses import JSONResponse
    engine = app.state.engine
    with Session(engine) as session:
        stmt = select(Activity)
        if category:
            stmt = stmt.where(Activity.category.ilike(f"%{category}%"))  # type: ignore[union-attr]
        if process:
            stmt = stmt.where(Activity.process.ilike(f"%{process}%"))  # type: ignore[union-attr]
        if title:
            stmt = stmt.where(Activity.title.ilike(f"%{title}%"))  # type: ignore[union-attr]
        if from_ts:
            stmt = stmt.where(Activity.start_ts >= from_ts)  # type: ignore[operator]
        if to_ts:
            stmt = stmt.where(Activity.start_ts <= to_ts)  # type: ignore[operator]

        # Count before pagination
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = session.exec(count_stmt).one() or 0

        # Total duration across all matching rows
        sum_stmt = select(func.sum(Activity.duration_sec)).select_from(stmt.subquery())
        total_duration = session.exec(sum_stmt).one() or 0

        acts = session.exec(
            stmt.order_by(Activity.start_ts.desc())  # type: ignore[attr-defined]
            .offset(offset).limit(limit)
        ).all()

        data = [
            {
                "id": a.id,
                "start_ts": a.start_ts,
                "end_ts": a.end_ts,
                "duration_sec": a.duration_sec,
                "process": a.process,
                "title": a.title,
                "category": a.category,
            }
            for a in acts
        ]
        from starlette.responses import Response
        import json
        response = Response(
            content=json.dumps(data),
            media_type="application/json",
        )
        response.headers["X-Total-Count"] = str(total)
        response.headers["X-Total-Duration-Sec"] = str(int(total_duration))
        response.headers["Access-Control-Expose-Headers"] = "X-Total-Count, X-Total-Duration-Sec"
        return response  # type: ignore[return-value]


@app.get("/api/activities/timeline")
def timeline_activities(
    from_ts: str | None = None,
    to_ts: str | None = None,
) -> list[dict[str, Any]]:
    engine = app.state.engine
    with Session(engine) as session:
        stmt = select(Activity).where(Activity.end_ts.is_not(None))  # type: ignore[union-attr]
        if from_ts:
            stmt = stmt.where(Activity.start_ts >= from_ts)  # type: ignore[operator]
        if to_ts:
            stmt = stmt.where(Activity.start_ts <= to_ts)  # type: ignore[operator]
        stmt = stmt.order_by(Activity.start_ts)  # type: ignore[attr-defined]
        acts = session.exec(stmt).all()
        return [
            {
                "id": a.id,
                "start_ts": a.start_ts,
                "end_ts": a.end_ts,
                "duration_sec": a.duration_sec,
                "process": a.process,
                "title": a.title,
                "category": a.category,
            }
            for a in acts
        ]


@app.get("/api/stats/breakdown")
def stats_breakdown(
    from_ts: str | None = None,
    to_ts: str | None = None,
    category: str | None = None,
    process: str | None = None,
    title: str | None = None,
) -> list[dict[str, Any]]:
    engine = app.state.engine
    with Session(engine) as session:
        stmt = (
            select(Activity.category, func.sum(Activity.duration_sec))
            .where(Activity.end_ts.is_not(None))  # type: ignore[union-attr]
        )
        if from_ts:
            stmt = stmt.where(Activity.start_ts >= from_ts)  # type: ignore[operator]
        if to_ts:
            stmt = stmt.where(Activity.start_ts <= to_ts)  # type: ignore[operator]
        if category:
            stmt = stmt.where(Activity.category.ilike(f"%{category}%"))  # type: ignore[union-attr]
        if process:
            stmt = stmt.where(Activity.process.ilike(f"%{process}%"))  # type: ignore[union-attr]
        if title:
            stmt = stmt.where(Activity.title.ilike(f"%{title}%"))  # type: ignore[union-attr]
        stmt = stmt.group_by(Activity.category)
        rows = session.exec(stmt).all()
        return [{"category": r[0], "total_sec": r[1] or 0} for r in rows]


@app.get("/api/stats/accumulated")
def stats_accumulated(
    group_by: str = "category",   # "category" | "process" | "title"
    from_ts: str | None = None,
    to_ts: str | None = None,
    top_n: int = 20,
    filter_category: str | None = None,
    filter_process:  str | None = None,
    filter_title:    str | None = None,
) -> list[dict[str, Any]]:
    """Return accumulated duration grouped by the requested field within the time window."""
    allowed = {"category", "process", "title"}
    if group_by not in allowed:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=f"group_by must be one of {allowed}")

    col_map = {
        "category": Activity.category,
        "process":  Activity.process,
        "title":    Activity.title,
    }
    col = col_map[group_by]

    engine = app.state.engine
    with Session(engine) as session:
        stmt = (
            select(col, func.sum(Activity.duration_sec).label("total_sec"))
            .where(Activity.end_ts.is_not(None))  # type: ignore[union-attr]
            .where(col.is_not(None))              # type: ignore[union-attr]
        )
        if from_ts:
            stmt = stmt.where(Activity.start_ts >= from_ts)         # type: ignore[operator]
        if to_ts:
            stmt = stmt.where(Activity.start_ts <= to_ts)           # type: ignore[operator]
        if filter_category:
            stmt = stmt.where(Activity.category.ilike(f"%{filter_category}%"))  # type: ignore[union-attr]
        if filter_process:
            stmt = stmt.where(Activity.process.ilike(f"%{filter_process}%"))    # type: ignore[union-attr]
        if filter_title:
            stmt = stmt.where(Activity.title.ilike(f"%{filter_title}%"))        # type: ignore[union-attr]
        stmt = stmt.group_by(col).order_by(func.sum(Activity.duration_sec).desc()).limit(top_n)

        rows = session.exec(stmt).all()
        return [{"label": r[0] or "—", "total_sec": int(r[1] or 0)} for r in rows]


@app.get("/api/status")
def status() -> dict[str, Any]:
    engine = app.state.engine
    with Session(engine) as session:
        total_acts = session.exec(select(func.count(Activity.id))).one()  # type: ignore[arg-type]
        total_sec = session.exec(
            select(func.sum(Activity.duration_sec)).where(Activity.end_ts.is_not(None))  # type: ignore[union-attr]
        ).one()
        return {
            "total_activities": total_acts or 0,
            "total_tracked_sec": total_sec or 0,
            "backend": type(get_backend()).__name__,
        }


INDEX_HTML: str | None = None
if DIST_DIR.exists():
    INDEX_HTML = (DIST_DIR / "index.html").read_text(encoding="utf-8")

    class _SPAFallback(BaseHTTPMiddleware):
        async def dispatch(self, request: Request, call_next: Any) -> Response:
            response: Response = await call_next(request)
            if response.status_code == 404 and INDEX_HTML:
                return HTMLResponse(INDEX_HTML)
            return response

    app.add_middleware(_SPAFallback)
    app.mount("/", StaticFiles(directory=str(DIST_DIR), html=True), name="dashboard")


def run_server(host: str = "127.0.0.1", port: int = 8080) -> None:
    import uvicorn

    print(f"  Time Tracker API → http://{host}:{port}", flush=True)
    uvicorn.run(app, host=host, port=port, log_level="warning")


if __name__ == "__main__":
    run_server()
