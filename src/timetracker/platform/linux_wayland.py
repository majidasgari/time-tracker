from __future__ import annotations

import logging
import os
import subprocess
import sys
import tempfile
import time
from typing import Any

from timetracker.platform.base import ScreenshotQuality, WindowInfo

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# KWin Scripting backend — event-driven, no permission dialog, no focus steal
#
# Architecture:
#   1. A persistent KWin JS script is loaded once at startup.
#   2. The script connects to workspace.windowActivated and prints a tagged
#      line to kwin_wayland's stdout → captured by journald.
#   3. On each poll we read the latest "TIMETRACKER_ACTIVE:" line from
#      journald (fast, no D-Bus permission needed).
#   4. We call getWindowInfo(uuid) via jeepney to get full window metadata.
#      getWindowInfo does NOT require the interactive permission dialog.
# ---------------------------------------------------------------------------

_SCRIPT_MARKER = "TIMETRACKER_ACTIVE:"
_PLUGIN_NAME   = "timetracker_active_window"

# KWin JS script: emits  TIMETRACKER_ACTIVE:<uuid>  on every focus change.
_KWIN_JS = """\
(function() {
    function emit(win) {
        if (win) {
            print("TIMETRACKER_ACTIVE:" + win.internalId);
        } else {
            print("TIMETRACKER_ACTIVE:none");
        }
    }
    // Fire immediately for the current active window.
    emit(workspace.activeWindow);
    // Subscribe to future focus changes.
    workspace.windowActivated.connect(emit);
})();
"""

# Module-level state
_script_loaded: bool = False          # KWin script running?
_last_uuid: str | None = None         # Last UUID seen from journald
_last_info: dict[str, Any] | None = None  # Cached getWindowInfo result
_dbus_conn: Any = None                # Persistent jeepney connection


# ---------------------------------------------------------------------------
# KWin Script management
# ---------------------------------------------------------------------------

def _is_script_loaded_in_kwin() -> bool:
    """Check if our plugin is already registered in KWin (e.g. from a prior run)."""
    try:
        from jeepney import DBusAddress, new_method_call
        conn = _get_dbus_conn()
        addr = DBusAddress("/Scripting", bus_name="org.kde.KWin",
                           interface="org.kde.kwin.Scripting")
        msg = new_method_call(addr, "isScriptLoaded", "s", (_PLUGIN_NAME,))
        reply = conn.send_and_get_reply(msg, timeout=3.0)
        return bool(reply.body and reply.body[0])
    except Exception:
        return False


def _ensure_kwin_script() -> bool:
    """Load the persistent KWin JS script if not already running."""
    global _script_loaded
    if _script_loaded:
        return True

    try:
        from jeepney import DBusAddress, new_method_call
        conn = _get_dbus_conn()
        scripting_addr = DBusAddress(
            "/Scripting",
            bus_name="org.kde.KWin",
            interface="org.kde.kwin.Scripting",
        )

        # If already loaded from a previous process, reuse it.
        if _is_script_loaded_in_kwin():
            logger.info("KWin script '%s' already loaded — reusing", _PLUGIN_NAME)
            _script_loaded = True
            return True

        import tempfile as _tmp
        script_file = _tmp.NamedTemporaryFile(
            mode="w", suffix=".js", prefix="timetracker_kwin_",
            delete=False
        )
        script_file.write(_KWIN_JS)
        script_file.flush()
        script_file.close()
        path = script_file.name

        # loadScript(filePath, pluginName) → int scriptId
        load_msg = new_method_call(scripting_addr, "loadScript", "ss",
                                   (path, _PLUGIN_NAME))
        reply = conn.send_and_get_reply(load_msg, timeout=5.0)
        script_id = reply.body[0] if reply.body else -1
        logger.debug("KWin script loaded, id=%s", script_id)

        if script_id < 0:
            logger.warning("KWin Scripting: loadScript returned %d (already loaded?)",
                           script_id)
            # Could be a race — treat as success if journal has our marker.
            _script_loaded = True
            return True

        # run() the script
        script_obj = f"/Scripting/Script{script_id}"
        run_addr = DBusAddress(
            script_obj,
            bus_name="org.kde.KWin",
            interface="org.kde.kwin.Script",
        )
        run_msg = new_method_call(run_addr, "run")
        conn.send_and_get_reply(run_msg, timeout=5.0)

        _script_loaded = True
        logger.info("KWin active-window script started (id=%d, plugin=%s)",
                    script_id, _PLUGIN_NAME)
        return True

    except Exception as exc:
        logger.warning("KWin Scripting init failed: %s", exc)
        _script_loaded = False
        return False


# ---------------------------------------------------------------------------
# journald reader — grab latest TIMETRACKER_ACTIVE line
# ---------------------------------------------------------------------------

def _read_latest_uuid_from_journal() -> str | None:
    """
    Read the most recent TIMETRACKER_ACTIVE:<uuid> emitted by the KWin
    script from the systemd user journal.  We filter to the last 5 minutes
    so stale UUIDs from previous KWin sessions are ignored.
    """
    try:
        result = subprocess.run(
            [
                "journalctl", "--user",
                "-n", "100",
                "--no-pager",
                "-o", "cat",
                "-t", "kwin_wayland_wrapper",
                "--since", "5 minutes ago",
            ],
            capture_output=True,
            text=True,
            timeout=1.0,
        )
        for line in reversed(result.stdout.splitlines()):
            line = line.strip()
            # KWin prepends "js: " to every print() call before journald.
            if line.startswith("js: "):
                line = line[4:]
            if line.startswith(_SCRIPT_MARKER):
                return line[len(_SCRIPT_MARKER):]
    except Exception as exc:
        logger.debug("journal read failed: %s", exc)
    return None


# ---------------------------------------------------------------------------
# jeepney D-Bus helpers
# ---------------------------------------------------------------------------

def _get_dbus_conn() -> Any:
    global _dbus_conn
    if _dbus_conn is None:
        from jeepney.io.blocking import open_dbus_connection
        _dbus_conn = open_dbus_connection(bus="SESSION")
        logger.debug("D-Bus session connection opened")
    return _dbus_conn


def _reset_dbus() -> None:
    global _dbus_conn, _script_loaded
    _dbus_conn = None
    _script_loaded = False  # script lives in the old connection's KWin process


def _kwin_get_window_info(uuid: str) -> dict[str, Any] | None:
    """
    Call org.kde.KWin.getWindowInfo(uuid) — does NOT require a permission
    dialog and does NOT steal focus.
    Returns None and resets script state on failure (handles KWin restart).
    """
    global _script_loaded
    if not uuid or uuid == "none":
        return None
    try:
        from jeepney import DBusAddress, new_method_call
        conn = _get_dbus_conn()
        addr = DBusAddress("/KWin", bus_name="org.kde.KWin",
                           interface="org.kde.KWin")
        msg = new_method_call(addr, "getWindowInfo", "s", (uuid,))
        reply = conn.send_and_get_reply(msg, timeout=3.0)
        body = reply.body
        if not body or not isinstance(body[0], dict):
            return None
        return _unwrap_variant_map(body[0])
    except Exception as exc:
        logger.debug("getWindowInfo(%s) failed: %s — will reload script", uuid, exc)
        _reset_dbus()
        return None


def _unwrap_variant_map(data: dict[str, Any]) -> dict[str, Any]:
    """Unwrap D-Bus variant-encoded values like ('s', 'code') → 'code'."""
    result: dict[str, Any] = {}
    for k, v in data.items():
        if isinstance(v, tuple) and len(v) == 2 and isinstance(v[0], str):
            result[k] = v[1]
        else:
            result[k] = v
    return result


# ---------------------------------------------------------------------------
# Main public entry point used by WaylandBackend
# ---------------------------------------------------------------------------

def _kwin_active_window_info() -> dict[str, Any] | None:
    """
    Return active window info dict without stealing focus or showing any
    permission dialog.

    Flow:
      1. Ensure the KWin JS script is loaded (once).
      2. Read the latest UUID from journald (fast subprocess).
      3. Call getWindowInfo(uuid) via D-Bus to get caption/resourceClass/etc.
      4. Cache the result so repeated polls with the same UUID are free.
    """
    global _last_uuid, _last_info

    if not _ensure_kwin_script():
        return None

    uuid = _read_latest_uuid_from_journal()
    if uuid is None:
        # Journal not ready yet (e.g. very first second after startup).
        return _last_info

    if uuid == _last_uuid and _last_info is not None:
        # Same window as last poll — return cached result immediately.
        return _last_info

    info = _kwin_get_window_info(uuid)
    _last_uuid = uuid
    _last_info = info
    return info


# ---------------------------------------------------------------------------
# X11 fallback (when KWin scripting is unavailable)
# ---------------------------------------------------------------------------

def _get_window_info_via_xprop() -> WindowInfo | None:
    try:
        from Xlib import X
        from Xlib.display import Display

        d = Display()
        root = d.screen().root
        net_active = d.intern_atom("_NET_ACTIVE_WINDOW")
        response = root.get_full_property(net_active, X.AnyPropertyType)
        if not response or not response.value:
            d.close()
            logger.debug("xprop: no _NET_ACTIVE_WINDOW")
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
        logger.debug("xprop: process=%s title=%s", process, title)
        return WindowInfo(process=process, title=title)
    except Exception as exc:
        logger.debug("xprop fallback failed: %s", exc)
        return None


# ---------------------------------------------------------------------------
# Screenshot helper
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# WaylandBackend
# ---------------------------------------------------------------------------

class WaylandBackend:
    def __init__(self) -> None:
        self._display: Any = None

    def get_active_window(self) -> WindowInfo | None:
        info = _kwin_active_window_info()
        if info is None:
            return _get_window_info_via_xprop()

        title = info.get("caption") or None
        process = info.get("resourceClass") or info.get("resourceName") or None
        if process or title:
            logger.debug("KWin → process=%s title=%s", process, title)
            return WindowInfo(process=process, title=title)

        return _get_window_info_via_xprop()

    def capture_active_window(self, quality: ScreenshotQuality) -> bytes | None:
        max_width = {"low": 800, "medium": 1280, "high": 1920}[quality.value]
        jpeg_q   = {"low": 30,  "medium": 60,   "high": 85}[quality.value]

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
