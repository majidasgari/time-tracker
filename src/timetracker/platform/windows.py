from __future__ import annotations

from timetracker.platform.base import ScreenshotQuality, WindowInfo


class WindowsBackend:
    def get_active_window(self) -> WindowInfo | None:
        return None

    def capture_active_window(self, quality: ScreenshotQuality) -> bytes | None:
        return None
