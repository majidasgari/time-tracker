from __future__ import annotations

import tomllib
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field

try:
    import tomli_w
except ImportError:
    tomli_w = None


DEFAULT_CONFIG_PATH = Path("~/.timetracker/config.toml").expanduser()


class SamplingConfig(BaseModel):
    poll_interval_sec: int = Field(default=1, ge=1, le=60)
    screenshot_interval_sec: int = Field(default=10, ge=1, le=3600)
    screenshot_quality: str = Field(default="low", pattern=r"^(low|medium|high)$")


class StorageConfig(BaseModel):
    db_path: str = "~/.timetracker/data.db"
    screenshot_dir: str = "~/.timetracker/screenshots"
    retention_days: int = Field(default=7, ge=1, le=365)


class UIConfig(BaseModel):
    open_dashboard_on_start: bool = False


class RuleConfig(BaseModel):
    name: str
    process_regex: str | None = None
    title_regex: str | None = None
    color: str = "#cccccc"


class ScreenshotExclusion(BaseModel):
    process_regex: str | None = None
    title_regex: str | None = None


class Config(BaseModel):
    sampling: SamplingConfig = Field(default_factory=SamplingConfig)
    storage: StorageConfig = Field(default_factory=StorageConfig)
    ui: UIConfig = Field(default_factory=UIConfig)
    rules: list[RuleConfig] = Field(default_factory=list)
    screenshot_exclusions: list[ScreenshotExclusion] = Field(default_factory=list)


def load_config(path: Path) -> Config:
    try:
        with open(path, "rb") as f:
            data = tomllib.load(f)
    except FileNotFoundError:
        data = {}
    return _parse_config_data(data)


def _parse_config_data(data: dict[str, Any]) -> Config:
    kw: dict[str, Any] = {}
    if "sampling" in data:
        kw["sampling"] = data["sampling"]
    if "storage" in data:
        kw["storage"] = data["storage"]
    if "ui" in data:
        kw["ui"] = data["ui"]
    if "rules" in data:
        kw["rules"] = data["rules"]
    if "screenshot_exclusions" in data:
        kw["screenshot_exclusions"] = data["screenshot_exclusions"]
    return Config(**kw)


def save_config(path: Path, config: Config) -> None:
    data = config.model_dump()
    if tomli_w is not None:
        with open(path, "wb") as f:
            tomli_w.dump(data, f)
    else:
        path.write_text(_toml_dumps(data))


def ensure_config(path: Path | None = None) -> Config:
    path = path or DEFAULT_CONFIG_PATH
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        cfg = Config()
        save_config(path, cfg)
    else:
        cfg = load_config(path)
    return cfg


def _toml_dumps(data: dict[str, Any], prefix: str = "") -> str:
    lines: list[str] = []
    for key, value in data.items():
        if isinstance(value, dict):
            lines.append(f"\n[{prefix}{key}]" if prefix else f"\n[{key}]")
            lines.append(_toml_dumps(value, prefix=f"{prefix}{key}."))
        elif isinstance(value, list):
            if not value:
                continue
            if isinstance(value[0], dict):
                for item in value:
                    section = f"{prefix}{key}" if prefix else key
                    lines.append(f"\n[[{section}]]")
                    for k, v in item.items():
                        if v is None:
                            continue
                        if isinstance(v, str):
                            lines.append(f"{k} = {v!r}")
                        elif isinstance(v, bool):
                            lines.append(f"{k} = {'true' if v else 'false'}")
                        else:
                            lines.append(f"{k} = {v}")
        elif value is None:
            continue
        elif isinstance(value, bool):
            lines.append(f"{key} = {'true' if value else 'false'}")
        elif isinstance(value, str):
            lines.append(f"{key} = {value!r}")
        elif isinstance(value, (int, float)):
            lines.append(f"{key} = {value}")
    return "\n".join(lines)
