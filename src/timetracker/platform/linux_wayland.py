from __future__ import annotations

import logging
import os
import subprocess
import tempfile
from typing import Any

from timetracker.platform.base import ScreenshotQuality, WindowInfo

logger = logging.getLogger(__name__)


_kwin_permission_granted: bool | None = None
"""None = not tried yet, True = granted, False = denied/timed out once"""
_xprop_failed: bool = False
"""True if XWayland fallback returned no result (don't retry)"""


def _kwin_active_window_info() -> dict[str, Any] | None:
    """Get active window info via KWin D-Bus queryWindowInfo.

    This may show a permission dialog on first run on Wayland.
    Once accepted with 'Remember', it works silently afterwards.
    If denied or timed out, we don't retry for the rest of the session
    to avoid stealing mouse focus with repeated dialogs.
    """
    global _kwin_permission_granted
    if _kwin_permission_granted is False:
        return None

    try:
        result = subprocess.run(
            ["qdbus6", "org.kde.KWin", "/KWin", "org.kde.KWin.queryWindowInfo"],
            capture_output=True,
            timeout=3,
            text=True,
        )
        if result.returncode != 0:
            stderr = result.stderr.strip()
            if stderr and "UserCancel" not in stderr:
                logger.warning("KWin queryWindowInfo error: %s", stderr)
            _kwin_permission_granted = False
            return None
        if not result.stdout:
            _kwin_permission_granted = False
            return None
        _kwin_permission_granted = True
        return _parse_qdbus_variant_map(result.stdout)
    except FileNotFoundError:
        logger.warning("qdbus6 not found, try: sudo apt install qt6-tools-dev-tools")
        _kwin_permission_granted = False
    except subprocess.TimeoutExpired:
        logger.warning("KWin queryWindowInfo timed out")
        _kwin_permission_granted = False
    return None


def _parse_qdbus_variant_map(output: str) -> dict[str, Any]:
    """Parse qdbus6 output like 'key1: type1 value1\\nkey2: type2 value2' to dict."""
    info: dict[str, Any] = {}
    for line in output.strip().split("\n"):
        if ": " not in line:
            continue
        key, _, rest = line.partition(": ")
        dtype_value = rest.split(" ", 1) if " " in rest else [rest]
        value = dtype_value[-1] if len(dtype_value) > 1 else ""
        info[key.strip()] = value.strip()
    return info


def _get_window_info_via_xprop() -> WindowInfo | None:
    """Fallback: try XWayland _NET_ACTIVE_WINDOW via python-xlib."""
    global _xprop_failed
    if _xprop_failed:
        return None
    try:
        from Xlib import X
        from Xlib.display import Display

        d = Display()
        root = d.screen().root
        net_active = d.intern_atom("_NET_ACTIVE_WINDOW")
        response = root.get_full_property(net_active, X.AnyPropertyType)
        if not response or not response.value:
            d.close()
            _xprop_failed = True
            return None
        win_id = response.value[0]
        win = d.create_resource_object("window", win_id)

        net_name = d.intern_atom("_NET_WM_NAME")
        name_resp = win.get_full_property(net_name, 0)
        title: str | None = None
        if name_resp and name_resp.value:
            raw = name_resp.value
            if isinstance(raw, bytes):
                title = raw.decode("utf-8", errors="replace")
            else:
                title = str(raw)

        net_pid = d.intern_atom("_NET_WM_PID")
        pid_resp = win.get_full_property(net_pid, 0)
        process: str | None = None
        if pid_resp and pid_resp.value:
            try:
                import psutil

                process = psutil.Process(pid_resp.value[0]).name()
            except Exception:
                pass
        d.close()
        return WindowInfo(process=process, title=title)
    except Exception:
        return None


def _spectacle_capture(quality: ScreenshotQuality, out_path: str) -> bool:
    """Capture active window with spectacle (KDE)."""
    try:
        result = subprocess.run(
            [
                "spectacle",
                "--background",
                "--nonotify",
                "--activewindow",
                "--output", out_path,
            ],
            capture_output=True,
            timeout=10,
        )
        return result.returncode == 0
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False


class WaylandBackend:
    def __init__(self) -> None:
        self._display: Any = None

    def get_active_window(self) -> WindowInfo | None:
        info = _kwin_active_window_info()
        if info and info.get("windowTitle"):
            title = info.get("windowTitle")
            pid_str = info.get("pid") or info.get("windowPID")
            process: str | None = None
            if pid_str:
                try:
                    import psutil

                    process = psutil.Process(int(pid_str)).name()
                except Exception:
                    process = pid_str
            return WindowInfo(process=process, title=title)

        return _get_window_info_via_xprop()

    def capture_active_window(self, quality: ScreenshotQuality) -> bytes | None:
        max_width = {"low": 800, "medium": 1280, "high": 1920}[quality.value]
        jpeg_q = {"low": 30, "medium": 60, "high": 85}[quality.value]

        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
            tmp_path = tmp.name

        try:
            if not _spectacle_capture(quality, tmp_path):
                return None

            from PIL import Image

            img = Image.open(tmp_path)
            if img.width > max_width:
                ratio = max_width / img.width
                new_h = int(img.height * ratio)
                resized = img.resize((max_width, new_h), Image.Resampling.LANCZOS)
            else:
                resized = img

            import io

            buf = io.BytesIO()
            resized.save(buf, format="JPEG", quality=jpeg_q, optimize=True)
            return buf.getvalue()
        except Exception:
            return None
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
