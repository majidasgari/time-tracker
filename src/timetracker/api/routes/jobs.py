from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request
from pydantic import BaseModel
from sqlmodel import Session, select

from timetracker.db.models import Job

router = APIRouter()


class JobIn(BaseModel):
    name: str
    description: str | None = None


class JobOut(BaseModel):
    id: int
    name: str
    description: str | None = None


def _engine(request: Request) -> Any:
    return request.app.state.engine


@router.get("", response_model=list[JobOut])
def list_jobs(request: Request) -> Any:
    engine = _engine(request)
    with Session(engine) as session:
        jobs = session.exec(select(Job).order_by(Job.name)).all()
        return [JobOut(id=j.id, name=j.name, description=j.description) for j in jobs]


@router.post("", response_model=JobOut)
def save_job(body: JobIn, request: Request) -> Any:
    engine = _engine(request)
    with Session(engine) as session:
        existing = session.exec(select(Job).where(Job.name == body.name)).first()
        if existing:
            existing.description = body.description
            session.add(existing)
            session.commit()
            return JobOut(id=existing.id, name=existing.name, description=existing.description)
        j = Job(name=body.name, description=body.description)
        session.add(j)
        session.commit()
        session.refresh(j)
        return JobOut(id=j.id, name=j.name, description=j.description)


@router.get("/autocomplete")
def job_autocomplete(q: str = "", request: Request = None) -> list[dict[str, Any]]:  # type: ignore
    """Return job names matching prefix *q* (for autocomplete)."""
    engine = _engine(request)  # type: ignore[arg-type]
    with Session(engine) as session:
        stmt = select(Job)
        if q:
            stmt = stmt.where(Job.name.ilike(f"%{q}%"))  # type: ignore[union-attr]
        jobs = session.exec(stmt.order_by(Job.name).limit(20)).all()
        return [{"name": j.name, "description": j.description} for j in jobs]
