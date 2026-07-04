from __future__ import annotations

from Xlib import X
from Xlib.display import Display

from timetracker.platform.base import ScreenshotQuality, WindowInfo


class X11Backend:
    def __init__(self) -> None:
        self._display: Display | None = None

    def _get_display(self) -> Display:
        if self._display is None:
            self._display = Display()
        return self._display

    def get_active_window(self) -> WindowInfo | None:
        d = self._get_display()
        root = d.screen().root

        net_active = d.intern_atom("_NET_ACTIVE_WINDOW")
        response = root.get_full_property(net_active, X.AnyPropertyType)
        if not response or not response.value:
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
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass

        return WindowInfo(process=process, title=title)

    def capture_active_window(self, quality: ScreenshotQuality) -> bytes | None:
        try:
            import mss
        except ImportError:
            return None

        d = self._get_display()
        root = d.screen().root

        net_active = d.intern_atom("_NET_ACTIVE_WINDOW")
        response = root.get_full_property(net_active, X.AnyPropertyType)
        if not response or not response.value:
            return None

        win_id = response.value[0]
        win = d.create_resource_object("window", win_id)

        geo = win.get_geometry()
        translated = root.translate_coords(win, geo.x, geo.y)
        left = translated.x
        top = translated.y
        width = geo.width
        height = geo.height

        max_width = {"low": 800, "medium": 1280, "high": 1920}[quality.value]
        jpeg_q = {"low": 30, "medium": 60, "high": 85}[quality.value]

        with mss.MSS() as sct:
            monitor = {"left": left, "top": top, "width": width, "height": height}
            img = sct.grab(monitor)
            from PIL import Image

            pil_img = Image.frombytes("RGB", img.size, img.rgb)
            if pil_img.width > max_width:
                ratio = max_width / pil_img.width
                new_h = int(pil_img.height * ratio)
                pil_img = pil_img.resize((max_width, new_h), Image.Resampling.LANCZOS)

            import io

            buf = io.BytesIO()
            pil_img.save(buf, format="JPEG", quality=jpeg_q, optimize=True)
            return buf.getvalue()
