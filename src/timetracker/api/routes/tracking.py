from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request
from pydantic import BaseModel
from sqlmodel import Session

from timetracker.db.models import Meta

router = APIRouter()


class ManualJobIn(BaseModel):
    job: str
    description: str | None = None


def _engine(request: Request) -> Any:
    return request.app.state.engine


@router.get("/manual-job")
def get_manual_job(request: Request) -> dict[str, Any]:
    engine = _engine(request)
    with Session(engine) as session:
        job = session.get(Meta, "manual_job")
        desc = session.get(Meta, "manual_job_description")
        return {
            "active": job is not None and bool(job.value),
            "job": job.value if job else "",
            "description": desc.value if desc else "",
        }


@router.post("/manual-job")
def set_manual_job(body: ManualJobIn, request: Request) -> dict[str, str]:
    engine = _engine(request)
    with Session(engine) as session:
        mj = session.get(Meta, "manual_job")
        if mj:
            mj.value = body.job
        else:
            session.add(Meta(key="manual_job", value=body.job))

        md = session.get(Meta, "manual_job_description")
        if md:
            md.value = body.description or ""
        else:
            session.add(Meta(key="manual_job_description", value=body.description or ""))
        session.commit()
        return {"status": "ok"}


@router.delete("/manual-job")
def clear_manual_job(request: Request) -> dict[str, str]:
    engine = _engine(request)
    with Session(engine) as session:
        for key in ("manual_job", "manual_job_description"):
            m = session.get(Meta, key)
            if m:
                session.delete(m)
        session.commit()
        return {"status": "ok"}
