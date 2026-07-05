"""PySide6 system tray application.

Runs the Sampler and API server as daemon threads, exposes an icon in
the system tray with a context menu to open the dashboard, toggle
tracking, and quit.
"""

from __future__ import annotations

import logging
import sys
import threading
import webbrowser
from typing import Any

logger = logging.getLogger(__name__)

def _create_tray_icon() -> Any:
    """Draw a simple clock icon with QPainter (no SVG dependency)."""
    from PySide6.QtCore import QPointF, Qt
    from PySide6.QtGui import QBrush, QColor, QPainter, QPen, QPixmap

    size = 64
    pixmap = QPixmap(size, size)
    pixmap.fill(Qt.GlobalColor.transparent)

    p = QPainter(pixmap)
    p.setRenderHint(QPainter.RenderHint.Antialiasing)

    # outer circle (dark border)
    p.setPen(QPen(QColor("#263238"), 3))
    p.setBrush(QBrush(QColor("#37474F")))
    p.drawEllipse(3, 3, size - 6, size - 6)

    # inner circle (lighter)
    p.setPen(Qt.PenStyle.NoPen)
    p.setBrush(QBrush(QColor("#455A64")))
    p.drawEllipse(8, 8, size - 16, size - 16)

    # hour hand
    p.setPen(QPen(QColor("white"), 3, Qt.PenStyle.SolidLine, Qt.PenCapStyle.RoundCap))
    p.drawLine(QPointF(32, 32), QPointF(32, 16))

    # minute hand
    p.setPen(QPen(QColor("white"), 2.5, Qt.PenStyle.SolidLine, Qt.PenCapStyle.RoundCap))
    p.drawLine(QPointF(32, 32), QPointF(44, 38))

    # center dot
    p.setPen(Qt.PenStyle.NoPen)
    p.setBrush(QBrush(QColor("white")))
    p.drawEllipse(QPointF(32, 32), 3, 3)

    p.end()
    return pixmap


def _open_dashboard(port: int) -> None:
    webbrowser.open(f"http://127.0.0.1:{port}")


class TrayApp:
    """System tray application that owns the Sampler + API lifecycle."""

    def __init__(self, cfg: Any, engine: Any) -> None:
        from PySide6.QtGui import QAction, QIcon
        from PySide6.QtWidgets import (
            QApplication,
            QMenu,
            QSystemTrayIcon,
        )

        from timetracker.platform.factory import get_backend
        from timetracker.tracking.categorizer import Categorizer
        from timetracker.tracking.sampler import Sampler

        self._cfg = cfg
        self._engine = engine
        self._port = 8080
        self._tracking = True

        # --- Qt widgets ------------------------------------------------
        existing = QApplication.instance()
        self._app: QApplication = (
            existing if existing is not None else QApplication(sys.argv)  # type: ignore[assignment]
        )
        self._app.setQuitOnLastWindowClosed(False)

        icon = QIcon(_create_tray_icon())

        self._tray = QSystemTrayIcon(icon)
        self._tray.setToolTip("Time Tracker — active")

        menu = QMenu()
        self._act_open = QAction("Open Dashboard", menu)
        self._act_open.triggered.connect(lambda: _open_dashboard(self._port))
        menu.addAction(self._act_open)

        menu.addSeparator()

        self._act_toggle = QAction("Pause Tracking", menu)
        self._act_toggle.triggered.connect(self._toggle_tracking)
        menu.addAction(self._act_toggle)

        menu.addSeparator()

        self._act_manual_job = QAction("Set Manual Job…", menu)
        self._act_manual_job.triggered.connect(self._set_manual_job)
        menu.addAction(self._act_manual_job)

        self._act_clear_job = QAction("Clear Manual Job", menu)
        self._act_clear_job.triggered.connect(self._clear_manual_job)
        self._act_clear_job.setVisible(False)
        menu.addAction(self._act_clear_job)

        menu.addSeparator()

        self._act_quit = QAction("Quit", menu)
        self._act_quit.triggered.connect(self._quit)
        menu.addAction(self._act_quit)

        self._tray.setContextMenu(menu)
        self._tray.activated.connect(self._on_activated)

        # --- Sampler thread --------------------------------------------
        backend = get_backend()
        categorizer = Categorizer(engine)
        self._stop_event = threading.Event()
        self._sampler = Sampler(
            backend,
            engine,
            categorizer,
            poll_interval=cfg.sampling.poll_interval_sec,
            stop_event=self._stop_event,
            screenshot_interval_sec=cfg.sampling.screenshot_interval_sec,
            screenshot_quality=cfg.sampling.screenshot_quality,
            screenshot_dir=cfg.storage.screenshot_dir,
            screenshot_exclusions=[e.model_dump() for e in cfg.screenshot_exclusions],
        )

        # --- API server thread -----------------------------------------
        self._server_thread: threading.Thread | None = None
        self._uvicorn_server: Any = None

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def run(self) -> None:
        logger.info("tray app starting — sampler + API server on port %d", self._port)
        self._sampler.start()
        self._start_server()

        self._tray.show()
        logger.info("tray icon visible, entering Qt event loop")
        self._app.exec()

        logger.info("Qt event loop exited — shutting down")
        self._shutdown()

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _start_server(self) -> None:
        import uvicorn

        from timetracker.api.server import app

        config = uvicorn.Config(
            app,
            host="127.0.0.1",
            port=self._port,
            log_level="warning",
            access_log=False,
        )
        self._uvicorn_server = uvicorn.Server(config)
        self._server_thread = threading.Thread(
            target=self._uvicorn_server.run, daemon=True, name="APIServer"
        )
        self._server_thread.start()
        logger.info("API server thread started on 127.0.0.1:%d", self._port)

    def _toggle_tracking(self) -> None:
        if self._tracking:
            logger.info("pausing tracking")
            self._stop_event.set()
            self._sampler.join(timeout=5)
            self._act_toggle.setText("Resume Tracking")
            self._tray.setToolTip("Time Tracker — paused")
        else:
            from timetracker.platform.factory import get_backend
            from timetracker.tracking.categorizer import Categorizer
            from timetracker.tracking.sampler import Sampler

            logger.info("resuming tracking")
            self._stop_event.clear()
            backend = get_backend()
            categorizer = Categorizer(self._engine)
            self._sampler = Sampler(
                backend,
                self._engine,
                categorizer,
                poll_interval=self._cfg.sampling.poll_interval_sec,
                stop_event=self._stop_event,
                screenshot_interval_sec=self._cfg.sampling.screenshot_interval_sec,
                screenshot_quality=self._cfg.sampling.screenshot_quality,
                screenshot_dir=self._cfg.storage.screenshot_dir,
            )
            self._sampler.start()
            self._act_toggle.setText("Pause Tracking")
            self._tray.setToolTip("Time Tracker — active")
        self._tracking = not self._tracking

    def _set_manual_job(self) -> None:
        from PySide6.QtWidgets import (
            QDialog, QFormLayout, QLineEdit, QDialogButtonBox, QVBoxLayout,
        )
        from sqlmodel import Session

        from timetracker.db.models import Meta

        dlg = QDialog()
        dlg.setWindowTitle("Manual Job")
        dlg.setMinimumWidth(320)

        layout = QVBoxLayout(dlg)
        form = QFormLayout()
        name_edit = QLineEdit()
        desc_edit = QLineEdit()
        desc_edit.setPlaceholderText("optional")
        form.addRow("Job name:", name_edit)
        form.addRow("Description:", desc_edit)
        layout.addLayout(form)

        btns = QDialogButtonBox(
            QDialogButtonBox.StandardButton.Ok | QDialogButtonBox.StandardButton.Cancel
        )
        btns.accepted.connect(dlg.accept)
        btns.rejected.connect(dlg.reject)
        layout.addWidget(btns)

        if dlg.exec() != QDialog.DialogCode.Accepted:
            return

        name = name_edit.text().strip()
        if not name:
            return
        desc = desc_edit.text().strip()

        with Session(self._engine) as session:
            mj = session.get(Meta, "manual_job")
            if mj:
                mj.value = name
            else:
                session.add(Meta(key="manual_job", value=name))

            md = session.get(Meta, "manual_job_description")
            if md:
                md.value = desc if desc else ""
            else:
                session.add(Meta(key="manual_job_description", value=desc if desc else ""))
            session.commit()

        self._act_clear_job.setVisible(True)
        self._tray.setToolTip(f"Time Tracker — job: {name}")
        logger.info("manual job set: %s", name)

    def _clear_manual_job(self) -> None:
        from sqlmodel import Session

        from timetracker.db.models import Meta

        with Session(self._engine) as session:
            for key in ("manual_job", "manual_job_description"):
                m = session.get(Meta, key)
                if m:
                    session.delete(m)
            session.commit()

        self._act_clear_job.setVisible(False)
        self._tray.setToolTip("Time Tracker — active")
        logger.info("manual job cleared")

    def _on_activated(self, reason: int) -> None:
        from PySide6.QtWidgets import QSystemTrayIcon

        if reason == QSystemTrayIcon.ActivationReason.DoubleClick.value:
            _open_dashboard(self._port)

    def _quit(self) -> None:
        self._app.quit()

    def _shutdown(self) -> None:
        logger.info("shutting down")
        if self._tracking:
            self._stop_event.set()
            if self._sampler.is_alive():
                self._sampler.join(timeout=5)
        if self._uvicorn_server is not None:
            self._uvicorn_server.should_exit = True
        if self._server_thread is not None:
            self._server_thread.join(timeout=5)
        logger.info("shutdown complete")
