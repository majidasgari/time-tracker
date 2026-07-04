from __future__ import annotations

from timetracker import __main__


def test_import() -> None:
    assert __main__ is not None


def test_version() -> None:
    import timetracker.config as cfg
    assert cfg is not None
