from __future__ import annotations

import logging
import os
import threading
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlmodel import Session

from timetracker.db.models import Activity, Meta, Screenshot
from timetracker.platform.base import WindowInfo
from timetracker.screenshots.capture import capture_screenshot

logger = logging.getLogger(__name__)


def _now_ts() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def _changed(info: WindowInfo | None, activity: Activity | None) -> bool:
    if activity is None:
        return True
    if info is None:
        return True
    return info.process != activity.process or info.title != activity.title


class Sampler(threading.Thread):
    def __init__(
        self,
        backend: Any,
        engine: Any,
        categorizer: Any,
        poll_interval: int = 1,
        stop_event: threading.Event | None = None,
        screenshot_interval_sec: int = 10,
        screenshot_quality: str = "low",
        screenshot_dir: str = "~/.timetracker/screenshots",
        screenshot_exclusions: list[dict[str, str | None]] | None = None,
    ) -> None:
        super().__init__(name="Sampler", daemon=True)
        self._backend = backend
        self._engine = engine
        self._categorizer = categorizer
        self._poll_interval = poll_interval
        self._stop = stop_event or threading.Event()
        self._current: Activity | None = None
        self._rule_version: int = 0
        self._screenshot_interval = screenshot_interval_sec
        self._screenshot_quality = screenshot_quality
        self._screenshot_dir = Path(screenshot_dir).expanduser().resolve()
        self._screenshot_dir.mkdir(parents=True, exist_ok=True)
        self._last_shot = 0.0
        self._exclusions = screenshot_exclusions or []

    def _get_rule_version(self, session: Session) -> int:
        meta = session.get(Meta, "rule_version")
        return int(meta.value) if meta else 1

    def _open_activity(self, session: Session, info: WindowInfo | None) -> Activity:
        process = info.process if info else None
        title = info.title if info else None
        category = self._categorizer.categorize(process, title)

        job = None
        job_desc = None
        mj = session.get(Meta, "manual_job")
        if mj and mj.value:
            job = mj.value
            md = session.get(Meta, "manual_job_description")
            job_desc = md.value if md and md.value else None

        act = Activity(
            start_ts=_now_ts(),
            process=process,
            title=title,
            category=category,
            rule_version=self._rule_version,
            job=job,
            job_description=job_desc,
        )
        session.add(act)
        session.commit()
        session.refresh(act)
        logger.info("activity opened #%d  process=%s  title=%s  category=%s",
                     act.id, process, title, category)
        return act

    def _close_activity(self, session: Session, activity: Activity | None) -> None:
        if activity is None or activity.end_ts is not None:
            return
        if activity not in session:
            activity = session.get(Activity, activity.id)
            if activity is None or activity.end_ts is not None:
                return
        now = _now_ts()
        activity.end_ts = now
        if activity.start_ts:
            try:
                start = datetime.fromisoformat(activity.start_ts)
                end = datetime.fromisoformat(now)
                activity.duration_sec = max(0, int((end - start).total_seconds()))
            except ValueError:
                activity.duration_sec = 0
        session.commit()
        logger.info("activity closed #%d  process=%s  duration=%ds",
                     activity.id, activity.process, activity.duration_sec or 0)

    def _is_spectacle_running(self) -> bool:
        try:
            import psutil
            for proc in psutil.process_iter(['name']):
                if proc.info['name'] == 'spectacle':
                    return True
        except Exception:
            pass
        return False

    def _is_excluded(self, info: Any) -> bool:
        if not self._exclusions or info is None:
            return False
        import re
        for exc in self._exclusions:
            proc_pat = exc.get("process_regex")
            title_pat = exc.get("title_regex")
            if proc_pat:
                if not re.search(proc_pat, info.process or "", re.IGNORECASE):
                    continue
            if title_pat:
                if not re.search(title_pat, info.title or "", re.IGNORECASE):
                    continue
            logger.debug("screenshot excluded by pattern: proc=%s title=%s", proc_pat, title_pat)
            return True
        return False

    def _maybe_capture_screenshot(self, session: Session) -> None:
        now = datetime.now().timestamp()
        if now - self._last_shot < self._screenshot_interval:
            return

        if self._is_spectacle_running():
            logger.debug("spectacle is active, skipping screenshot")
            return

        info = self._backend.get_active_window()
        if self._is_excluded(info):
            logger.debug("active window excluded from screenshot: %s %s",
                         info.process if info else None, info.title if info else None)
            return

        self._last_shot = now

        file_path = capture_screenshot(self._screenshot_dir, self._screenshot_quality)
        if file_path is None:
            return

        try:
            file_size = os.path.getsize(file_path)
        except OSError:
            file_size = 0

        shot = Screenshot(
            activity_id=self._current.id if self._current else None,
            timestamp=_now_ts(),
            file_path=file_path,
            file_size=file_size,
        )
        session.add(shot)
        session.commit()

    def run(self) -> None:
        logger.info("sampler started (poll_interval=%ds, screenshot_interval=%ds)",
                     self._poll_interval, self._screenshot_interval)
        while not self._stop.is_set():
            try:
                with Session(self._engine) as session:
                    if self._current is not None:
                        self._current = session.merge(self._current)
                    self._rule_version = self._get_rule_version(session)
                    info = self._backend.get_active_window()
                    if _changed(info, self._current):
                        logger.debug("window changed: %s → %s",
                                     self._current.process if self._current else None,
                                     info.process if info else None)
                        self._close_activity(session, self._current)
                        if info and info.process:
                            self._current = self._open_activity(session, info)
                        else:
                            self._current = self._open_activity(session, None)
                    self._maybe_capture_screenshot(session)
            except Exception:
                logger.exception("sampler error")
            self._stop.wait(self._poll_interval)

        logger.info("sampler stopping")
        with Session(self._engine) as session:
            self._close_activity(session, self._current)
        logger.info("sampler stopped")
