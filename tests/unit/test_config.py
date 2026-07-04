from __future__ import annotations

from pathlib import Path

import pytest

from timetracker.config import (
    Config,
    SamplingConfig,
    StorageConfig,
    UIConfig,
    ensure_config,
    load_config,
    save_config,
)


def test_default_config() -> None:
    cfg = Config()
    assert cfg.sampling.poll_interval_sec == 1
    assert cfg.sampling.screenshot_interval_sec == 10
    assert cfg.sampling.screenshot_quality == "low"
    assert cfg.storage.retention_days == 7
    assert cfg.ui.open_dashboard_on_start is False
    assert cfg.rules == []
    assert cfg.screenshot_exclusions == []


def test_load_config_from_example(tmp_path: Path) -> None:
    example = Path("config.example.toml")
    cfg = load_config(example)
    assert cfg.sampling.poll_interval_sec == 1
    assert cfg.sampling.screenshot_interval_sec == 10
    assert cfg.sampling.screenshot_quality == "low"
    assert cfg.storage.db_path == "~/.timetracker/data.db"
    assert cfg.storage.retention_days == 7
    assert cfg.ui.open_dashboard_on_start is False
    assert len(cfg.rules) == 3
    assert cfg.rules[0].name == "کدنویسی"
    assert cfg.rules[0].process_regex == "code|jetbrains|cursor"
    assert len(cfg.screenshot_exclusions) == 2


def test_save_and_load_roundtrip(tmp_path: Path) -> None:
    cfg = Config(
        sampling=SamplingConfig(poll_interval_sec=2, screenshot_quality="high"),
        storage=StorageConfig(retention_days=14),
        ui=UIConfig(open_dashboard_on_start=True),
    )
    path = tmp_path / "config.toml"
    save_config(path, cfg)
    loaded = load_config(path)
    assert loaded.sampling.poll_interval_sec == 2
    assert loaded.sampling.screenshot_quality == "high"
    assert loaded.storage.retention_days == 14
    assert loaded.ui.open_dashboard_on_start is True


def test_load_missing_file_returns_defaults(tmp_path: Path) -> None:
    missing = tmp_path / "does_not_exist.toml"
    cfg = load_config(missing)
    assert cfg.sampling.poll_interval_sec == 1


def test_ensure_config_creates_file(tmp_path: Path) -> None:
    path = tmp_path / "new_config.toml"
    assert not path.exists()
    cfg = ensure_config(path)
    assert path.exists()
    assert cfg.sampling.poll_interval_sec == 1


def test_invalid_quality_raises() -> None:
    with pytest.raises(Exception):
        SamplingConfig(screenshot_quality="ultra")


def test_invalid_poll_interval() -> None:
    with pytest.raises(Exception):
        SamplingConfig(poll_interval_sec=0)
