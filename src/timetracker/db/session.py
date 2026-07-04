from __future__ import annotations

from collections.abc import Generator
from pathlib import Path
from typing import Any

from sqlmodel import Session, SQLModel, create_engine


def create_engine_from_path(db_path: str) -> Any:
    path = Path(db_path).expanduser()
    path.parent.mkdir(parents=True, exist_ok=True)
    url = f"sqlite:///{path}"
    engine = create_engine(url, connect_args={"check_same_thread": False})
    with engine.connect() as conn:
        conn.exec_driver_sql("PRAGMA journal_mode=WAL")
        conn.exec_driver_sql("PRAGMA synchronous=NORMAL")
    return engine


def init_db(engine: Any) -> None:
    SQLModel.metadata.create_all(engine)


def get_session(engine: Any) -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
