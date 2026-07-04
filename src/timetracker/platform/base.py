from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import Protocol


@dataclass
class WindowInfo:
    process: str | None
    title: str | None


class ScreenshotQuality(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class PlatformBackend(Protocol):
    def get_active_window(self) -> WindowInfo | None:
        ...

    def capture_active_window(self, quality: ScreenshotQuality) -> bytes | None:
        ...
