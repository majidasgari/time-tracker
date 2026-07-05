from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import APIRouter, Request
from pydantic import BaseModel

from timetracker.config import save_config

router = APIRouter()


class SamplingSettings(BaseModel):
    poll_interval_sec: int
    screenshot_interval_sec: int
    screenshot_quality: str


class StorageSettings(BaseModel):
    db_path: str
    screenshot_dir: str
    retention_days: int


class SettingsUpdate(BaseModel):
    screenshot_interval_sec: int | None = None
    screenshot_quality: str | None = None
    screenshot_dir: str | None = None
    retention_days: int | None = None


@router.get("")
def get_config(request: Request) -> dict[str, Any]:
    cfg = request.app.state.config
    return {
        "screenshot_interval_sec": cfg.sampling.screenshot_interval_sec,
        "screenshot_quality": cfg.sampling.screenshot_quality,
        "screenshot_dir": cfg.storage.screenshot_dir,
        "retention_days": cfg.storage.retention_days,
        "poll_interval_sec": cfg.sampling.poll_interval_sec,
        "db_path": cfg.storage.db_path,
    }


@router.put("")
def update_config(body: SettingsUpdate, request: Request) -> dict[str, str]:
    cfg = request.app.state.config

    if body.screenshot_interval_sec is not None:
        if not 1 <= body.screenshot_interval_sec <= 3600:
            from fastapi import HTTPException
            raise HTTPException(400, "screenshot_interval_sec must be between 1 and 3600")
        cfg.sampling.screenshot_interval_sec = body.screenshot_interval_sec

    if body.screenshot_quality is not None:
        if body.screenshot_quality not in ("low", "medium", "high"):
            from fastapi import HTTPException
            raise HTTPException(400, "screenshot_quality must be low, medium, or high")
        cfg.sampling.screenshot_quality = body.screenshot_quality

    if body.screenshot_dir is not None:
        from pathlib import Path
        p = Path(body.screenshot_dir).expanduser()
        p.mkdir(parents=True, exist_ok=True)
        cfg.storage.screenshot_dir = str(p)

    if body.retention_days is not None:
        if not 1 <= body.retention_days <= 365:
            from fastapi import HTTPException
            raise HTTPException(400, "retention_days must be between 1 and 365")
        cfg.storage.retention_days = body.retention_days

    from timetracker.config import DEFAULT_CONFIG_PATH
    save_config(DEFAULT_CONFIG_PATH, cfg)

    return {"status": "saved"}


@router.get("/pick-dir")
def pick_directory(current: str = "") -> dict[str, str]:
    """Open a native folder picker dialog and return the chosen path."""
    path = _native_folder_dialog(current)
    return {"path": path}


def _native_folder_dialog(current: str) -> str:
    import subprocess

    start_dir = current or str(Path("~").expanduser())

    # Try KDE dialog first
    try:
        result = subprocess.run(
            ["kdialog", "--getexistingdirectory", start_dir],
            capture_output=True, text=True, timeout=30,
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip()
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass

    # Try Zenity (GNOME)
    try:
        result = subprocess.run(
            ["zenity", "--file-selection", "--directory", "--filename=" + start_dir],
            capture_output=True, text=True, timeout=30,
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip()
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass

    # Try Python tkinter as last resort
    try:
        import tkinter.filedialog
        import tkinter
        root = tkinter.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        path = tkinter.filedialog.askdirectory(initialdir=start_dir)
        root.destroy()
        if path:
            return path
    except Exception:
        pass

    return current or ""
