from __future__ import annotations

import os
import platform
import subprocess
import sys
from typing import Any


def _kwin_on_session_bus() -> bool:
    try:
        result = subprocess.run(
            ["dbus-send", "--session", "--dest=org.kde.KWin", "--type=method_call", "--print-reply",
             "/KWin", "org.freedesktop.DBus.Peer.Ping"],
            capture_output=True, timeout=2,
        )
        return result.returncode == 0
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False


def get_backend() -> Any:
    if sys.platform == "win32":
        from timetracker.platform.windows import WindowsBackend
        return WindowsBackend()

    if sys.platform == "linux":
        if "WAYLAND_DISPLAY" in os.environ:
            if "KDE_FULL_SESSION" in os.environ and _kwin_on_session_bus():
                from timetracker.platform.linux_wayland import WaylandBackend
                return WaylandBackend()

        if "DISPLAY" in os.environ:
            from timetracker.platform.linux_x11 import X11Backend
            return X11Backend()

    raise RuntimeError(f"No platform backend available for {platform.platform()}")
