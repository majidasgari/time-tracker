from __future__ import annotations

import logging
import sys

from sqlmodel import Session

from timetracker.config import ensure_config
from timetracker.db.migrations import run_migrations, seed_rules_from_config
from timetracker.db.session import create_engine_from_path

_stream = sys.stderr if sys.stderr is not None else sys.stdout
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
    datefmt="%H:%M:%S",
    stream=_stream,
)


def main() -> None:
    logger = logging.getLogger("timetracker")
    logger.info("time-tracker starting")

    cfg = ensure_config()
    logger.info("config loaded — poll_interval=%ds db=%s",
                cfg.sampling.poll_interval_sec, cfg.storage.db_path)

    engine = create_engine_from_path(cfg.storage.db_path)
    run_migrations(engine)
    logger.info("database ready")

    with Session(engine) as session:
        seed_rules_from_config(session, cfg)
    logger.info("rules seeded")

    from timetracker.platform.factory import get_backend
    from timetracker.ui.tray import TrayApp

    backend = get_backend()
    logger.info("backend: %s", type(backend).__name__)

    app = TrayApp(cfg, engine)
    app.run()


if __name__ == "__main__":
    main()
