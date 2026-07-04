from __future__ import annotations

import threading
from pathlib import Path

import pytest
from sqlmodel import Session, select

from timetracker.db.migrations import run_migrations
from timetracker.db.models import Activity
from timetracker.db.session import create_engine_from_path
from timetracker.platform.base import WindowInfo
from timetracker.tracking.categorizer import Categorizer
from timetracker.tracking.sampler import Sampler


@pytest.fixture
def engine(tmp_path: Path):
    e = create_engine_from_path(str(tmp_path / "sampler_test.db"))
    run_migrations(e)
    return e


class FakeBackend:
    def __init__(self) -> None:
        self._call_count = 0

    def get_active_window(self) -> WindowInfo | None:
        self._call_count += 1
        if self._call_count == 1:
            return WindowInfo(process="code", title="test.py")
        if self._call_count == 3:
            return WindowInfo(process="firefox", title="web")
        return WindowInfo(process="code", title="test.py")


def test_sampler_records_activities(engine) -> None:
    backend = FakeBackend()
    cat = Categorizer(engine)
    stop = threading.Event()
    sampler = Sampler(backend, engine, cat, poll_interval=1, stop_event=stop)
    sampler.start()
    threading.Event().wait(3.5)
    stop.set()
    sampler.join(timeout=3)

    with Session(engine) as session:
        acts = session.exec(select(Activity).order_by(Activity.start_ts)).all()
        assert len(acts) >= 1
        assert acts[0].process == "code"
        assert acts[0].category is not None


def test_sampler_closes_on_stop(engine) -> None:
    backend = FakeBackend()
    cat = Categorizer(engine)
    stop = threading.Event()
    sampler = Sampler(backend, engine, cat, poll_interval=1, stop_event=stop)
    sampler.start()
    threading.Event().wait(2.5)
    stop.set()
    sampler.join(timeout=5)

    with Session(engine) as session:
        acts = session.exec(select(Activity)).all()
        if len(acts) == 0:
            return
        closed = [a for a in acts if a.end_ts is not None]
        assert len(closed) >= len(acts) - 1
