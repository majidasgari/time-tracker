from __future__ import annotations

import logging

import win32gui
import win32process

from timetracker.platform.base import ScreenshotQuality, WindowInfo

logger = logging.getLogger(__name__)


class WindowsBackend:
    def get_active_window(self) -> WindowInfo | None:
        try:
            hwnd = win32gui.GetForegroundWindow()
            if not hwnd:
                return None
            title = win32gui.GetWindowText(hwnd) or None
            _, pid = win32process.GetWindowThreadProcessId(hwnd)
            process = self._get_process_name(pid)
            return WindowInfo(process=process, title=title)
        except Exception:
            logger.exception("get_active_window failed")
            return None

    @staticmethod
    def _get_process_name(pid: int) -> str | None:
        try:
            import psutil
            return psutil.Process(pid).name()
        except Exception:
            return None

    def capture_active_window(self, quality: ScreenshotQuality) -> bytes | None:
        return None
