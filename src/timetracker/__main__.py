from __future__ import annotations

import logging
import sys
import threading
import time

from sqlmodel import Session, select

from timetracker.config import ensure_config
from timetracker.db.migrations import run_migrations, seed_rules_from_config
from timetracker.db.models import Activity
from timetracker.db.session import create_engine_from_path
from timetracker.platform.factory import get_backend
from timetracker.tracking.categorizer import Categorizer
from timetracker.tracking.sampler import Sampler

logging.basicConfig(level=logging.WARNING, format="%(levelname)s:%(name)s:%(message)s")


def main() -> None:
    print("Time Tracker v0.1.0 — M1", file=sys.stderr)

    cfg = ensure_config()
    engine = create_engine_from_path(cfg.storage.db_path)
    run_migrations(engine)

    with Session(engine) as session:
        seed_rules_from_config(session, cfg)

    backend = get_backend()
    print(f"  Backend: {type(backend).__name__}", file=sys.stderr)

    categorizer = Categorizer(engine)
    stop_event = threading.Event()
    sampler = Sampler(backend, engine, categorizer,
                      poll_interval=cfg.sampling.poll_interval_sec,
                      stop_event=stop_event)

    sampler.start()
    print("  Tracking for 10 seconds...", file=sys.stderr)
    time.sleep(10)
    stop_event.set()
    sampler.join(timeout=5)

    with Session(engine) as session:
        activities = session.exec(select(Activity).order_by(Activity.start_ts)).all()
        print(f"\n  Activities recorded: {len(activities)}", file=sys.stderr)
        for a in activities:
            dur = f"{a.duration_sec}s" if a.duration_sec else "ongoing"
            print(
                f"    {a.start_ts[-8:]} | {a.process or 'Idle':12} | {a.category:15} | {dur}",
                file=sys.stderr,
            )

    print("\nDone.", file=sys.stderr)


if __name__ == "__main__":
    main()
