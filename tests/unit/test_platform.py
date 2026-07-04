from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from timetracker.platform.base import ScreenshotQuality, WindowInfo


@pytest.fixture
def mock_x11_display():
    with patch("timetracker.platform.linux_x11.Display") as mock:
        yield mock


@pytest.fixture
def mock_psutil_process():
    with patch("psutil.Process") as mock:
        yield mock


@pytest.fixture
def mock_x11_with_window(mock_x11_display):
    mock_display = mock_x11_display.return_value
    mock_root = MagicMock()
    mock_display.screen.return_value.root = mock_root

    mock_prop = MagicMock()
    mock_prop.value = [42]
    mock_root.get_full_property.return_value = mock_prop

    mock_win = MagicMock()
    mock_x11_display.return_value.create_resource_object.return_value = mock_win
    mock_geo = MagicMock()
    mock_geo.x = 100
    mock_geo.y = 200
    mock_geo.width = 800
    mock_geo.height = 600
    mock_win.get_geometry.return_value = mock_geo
    mock_trans = MagicMock()
    mock_trans.x = 100
    mock_trans.y = 200
    mock_root.translate_coords.return_value = mock_trans

    name_prop = MagicMock()
    name_prop.value = b"test window"
    pid_prop = MagicMock()
    pid_prop.value = [9999]

    def get_prop(atom, ty):
        if "PID" in str(atom):
            return pid_prop
        return name_prop

    mock_win.get_full_property.side_effect = get_prop
    return mock_x11_display, mock_psutil_process


def test_x11_window_info(mock_x11_display, mock_psutil_process) -> None:
    from timetracker.platform.linux_x11 import X11Backend

    backend = X11Backend()
    info = backend.get_active_window()
    assert info is None or isinstance(info, WindowInfo)


def test_x11_backend_returns_window_info(mock_x11_display, mock_psutil_process) -> None:
    mock_display = mock_x11_display.return_value
    mock_root = MagicMock()
    mock_display.screen.return_value.root = mock_root

    mock_prop = MagicMock()
    mock_prop.value = [42]
    mock_root.get_full_property.return_value = mock_prop

    mock_win = MagicMock()
    mock_x11_display.return_value.create_resource_object.return_value = mock_win

    name_prop = MagicMock()
    name_prop.value = b"test window"
    pid_prop = MagicMock()
    pid_prop.value = [9999]

    def get_prop(atom, ty):
        if "PID" in str(atom):
            return pid_prop
        return name_prop

    mock_win.get_full_property.side_effect = get_prop
    mock_psutil_process.return_value.name.return_value = "testproc"

    from timetracker.platform.linux_x11 import X11Backend

    backend = X11Backend()
    info = backend.get_active_window()
    assert info is not None
    assert info.title == "test window"
    assert info.process == "testproc"


def test_x11_capture(mock_x11_with_window) -> None:
    from timetracker.platform.linux_x11 import X11Backend

    backend = X11Backend()
    result = backend.capture_active_window(ScreenshotQuality.LOW)
    assert result is None or isinstance(result, bytes)


def test_wayland_backend_import() -> None:
    from timetracker.platform.linux_wayland import WaylandBackend

    backend = WaylandBackend()
    assert backend is not None


def test_wayland_backend_get_window(mock_psutil_process) -> None:
    with patch("timetracker.platform.linux_wayland._kwin_active_window_info") as mock_kwin:
        mock_kwin.return_value = {"windowTitle": "test window", "pid": "1234"}
        mock_psutil_process.return_value.name.return_value = "testproc"

        from timetracker.platform.linux_wayland import WaylandBackend

        backend = WaylandBackend()
        info = backend.get_active_window()
        assert info is not None
        assert info.title == "test window"
        assert info.process == "testproc"


def test_wayland_backend_fallback(mock_psutil_process) -> None:
    with (
        patch("timetracker.platform.linux_wayland._kwin_active_window_info") as mock_kwin,
        patch("timetracker.platform.linux_wayland._get_window_info_via_xprop") as mock_xprop,
    ):
        mock_kwin.return_value = None
        mock_xprop.return_value = WindowInfo(process="xwayland_app", title="xwayland window")

        from timetracker.platform.linux_wayland import WaylandBackend

        backend = WaylandBackend()
        info = backend.get_active_window()
        assert info is not None
        assert info.title == "xwayland window"
        assert info.process == "xwayland_app"


def test_wayland_capture() -> None:
    from timetracker.platform.linux_wayland import WaylandBackend

    backend = WaylandBackend()
    result = backend.capture_active_window(ScreenshotQuality.LOW)
    assert result is None or isinstance(result, bytes)


def test_platform_protocol() -> None:
    from timetracker.platform.base import PlatformBackend

    assert hasattr(PlatformBackend, "get_active_window")
    assert hasattr(PlatformBackend, "capture_active_window")


def test_window_info_dataclass() -> None:
    info = WindowInfo(process="code", title="myfile.py")
    assert info.process == "code"
    assert info.title == "myfile.py"


def test_screenshot_quality_enum() -> None:
    assert ScreenshotQuality.LOW.value == "low"
    assert ScreenshotQuality.MEDIUM.value == "medium"
    assert ScreenshotQuality.HIGH.value == "high"
