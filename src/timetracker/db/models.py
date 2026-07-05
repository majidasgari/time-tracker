from __future__ import annotations

from sqlmodel import Field, Index, SQLModel


class Activity(SQLModel, table=True):
    __table_args__ = (
        Index("idx_activities_start_ts", "start_ts"),
        Index("idx_activities_category", "category"),
        Index("idx_activities_rule_version", "rule_version"),
    )

    id: int | None = Field(default=None, primary_key=True)
    start_ts: str
    end_ts: str | None = None
    duration_sec: int | None = None
    process: str | None = None
    title: str | None = None
    category: str | None = None
    rule_version: int = 0
    job: str | None = None
    job_description: str | None = None


class Screenshot(SQLModel, table=True):
    __table_args__ = (
        Index("idx_screenshots_activity_id", "activity_id"),
        Index("idx_screenshots_timestamp", "timestamp"),
    )

    id: int | None = Field(default=None, primary_key=True)
    activity_id: int | None = Field(default=None, foreign_key="activity.id")
    timestamp: str
    file_path: str
    file_size: int = 0


class Category(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(unique=True)
    color: str
    priority: int = 0
    enabled: bool = True


class Rule(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    category_id: int = Field(foreign_key="category.id")
    process_regex: str | None = None
    title_regex: str | None = None


class Meta(SQLModel, table=True):
    key: str = Field(primary_key=True)
    value: str


class Job(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(unique=True)
    description: str | None = None
