# Project Specification — Time Tracker

> **Document Status:** Draft v1.0 · Last Updated: 2026-07-04

---

## 1. Overview

A **cross-platform** desktop time tracker that records user activity on a computer in an **event-based** manner: records are created only when the **active window changes** (not constant polling at fixed intervals). This design drastically reduces data volume and enables lightweight recomputation of the entire history.

Activity categorization is done with **regex** and is **instantly changeable**: users can add/edit/delete categories and regex patterns at any time, and the entire history is automatically re-categorized. Usage charts over various ranges (day/week/month/custom) are provided, and screenshots of the active window are taken every 10 seconds with adjustable quality.

### Core Objectives
- Support **Windows** and **Linux** (at minimum KDE Plasma).
- Automatic, low-volume recording based on window changes (not fixed interval sampling).
- Flexible and **revisable** categorization with regex.
- Visual data display across different time ranges.
- Periodic screenshots with storage management and privacy controls.

### Audience and Usage Pattern
The application is a **single-user personal** tool running on the user's own device. All data is stored **locally** and no data is sent over the network (except to the `localhost` port for the dashboard).

---

## 2. Functional Requirements

### FR-1 — Active Window Detection (Event-based)
- The app polls the active window every **1–2 seconds** (configurable) **only to detect changes**. As long as `process` and `title` remain the same, **no records** are created.
- When the window changes from `A` to `B`:
  1. Record `A` is closed: `end_ts = now` and `duration_sec = end_ts − start_ts` are calculated and stored.
  2. New record `B` is opened: `start_ts = now` and `end_ts = NULL` (indicating "in progress").
- **Exactly one open-ended record** always exists — the most recent activity the user is performing.
- In the absence of an active window (e.g., desktop focused, lock screen, or access denied), a record with `process = NULL` and `category = "Idle"` is logged.
- **Change detection orientation:** Two windows are considered the same if and only if both `process` and `title` are identical.

### FR-2 — Regex-Based Categorization
- Categorization data is stored in three tables:
  - `categories(id, name UNIQUE, color, priority, enabled)`
  - `rules(id, category_id FK, process_regex NULL, title_regex NULL)`
- **Matching logic structure:**
  - Each category can have **multiple rules** → rules within a category use **OR** logic (any match = category matched).
  - Within a rule, `process_regex` and `title_regex` must **both** match (AND). If one is `NULL`, that condition is ignored (only the other is evaluated).
- **Category priority:** Categories are ordered by `priority`; the **first matching category wins**.
- **Default behavior:** Activities that match no category get `category = "Uncategorized"`.
- All regexes are applied **case-insensitively** (using `re.IGNORECASE` in Python).
- **Category storage:** The `category` value is stored in `activities.category` at insert time (charts read from this column → fast). Re-categorization is handled via FR-3.

### FR-3 — Automatic Recompute
- Each activity has a `rule_version` (the version of rules at the time that record was categorized).
- When a rule is **added/edited/deleted**, a category's `priority` changes, or a category is enabled/disabled, the `meta.rule_version` value in the `meta` table is **incremented**.
- A **background worker chunk-by-chunk** (each batch of 1000 rows, with yields between batches to avoid DB locking) re-categorizes only activities where `rule_version < current_rule_version`.
- **Behavior during recompute:** Charts read from the `category` column, which may temporarily contain old categories. This behavior is **accepted** since regexes rarely change and with the event-based model the row count is low (tens of thousands per year) → full history recompute takes a few seconds.
- After recompute completes, a notification is shown in the dashboard ("Data updated").

### FR-4 — Usage Charts
- The dashboard must display time spent by category over the following ranges:
  - **Today**, **Yesterday**.
  - **Current week / Last week**.
  - **Current month / Last month**.
  - **Custom range** with start and end date selection.
- **Chart types:**
  - **Pie / Donut**: overall share of each category in the selected range.
  - **Timeline / Stacked Bar**: activity distribution throughout the day (x-axis = time with zoom/brush support).
- Activity durations are read from `activities.duration_sec` (calculated when the record is closed, per FR-1).
- **Open-ended activity:** A record with `end_ts = NULL` is included in charts with `now − start_ts` as the estimated duration (marked as "live" or "In progress").
- Numbers should be displayed in human-readable format (e.g., "1h 23m" not "5040s").

### FR-5 — Periodic Screenshots
- Screenshots of the **active window** are taken every **10 seconds** (configurable).
- **Quality levels** (configurable):
  | Level | Max Width (px) | JPEG Quality |
  |---|---|---|
  | `low` (default) | 800 | 30 |
  | `medium` | 1280 | 60 |
  | `high` | 1920 | 85 |
  - If the original image width exceeds the max, it is downscaled preserving aspect ratio.
- Storage format: **JPEG** on disk; only the file path is stored in the database.
- File naming: `screenshots/YYYY/MM/DD-HHMMSS-<short_id>.jpg`.
- **Exclusion list (`screenshot_exclusions`):** If the active window's `process` or `title` matches any exclusion pattern, the screenshot is **not** taken (but the activity is still recorded).
- If capturing fails (e.g., window closed, access denied), the error must be **logged** and processing must **not stop**.
- Each screenshot is linked to the current activity (`end_ts IS NULL`) via `screenshots.activity_id`.

### FR-6 — Storage Management (Retention)
- Automatically purge screenshots older than `retention_days` (default: **7 days**).
- Purging runs in the background **every hour**.
- Deletion includes **both the file** and the **DB record**.
- **Activities are never automatically deleted** — only screenshots are subject to retention.

### FR-7 — User Interface
- **System Tray Icon (PySide6 `QSystemTrayIcon`)**:
  - Status display: tracking active / inactive (icon changes).
  - Start/stop tracking.
  - Open dashboard.
  - Quick access to settings.
  - Quit app.
- **Dashboard (Angular in `QWebEngineView`)** with four pages:
  1. **Overview**: range selection + Pie chart + Timeline chart.
  2. **Categories**: manage categories and rules (CRUD) + **live regex testing** on sample or recent activities.
  3. **Screenshots**: screenshot gallery with range and category filters.
  4. **Settings**: edit config (sampling interval, image quality, retention, storage path, exclusion list).

### FR-8 — Configuration (TOML)
- Config is stored in `~/.timetracker/config.toml`.
- Values are editable through the dashboard (rewrites the TOML file).
- A `config.example.toml` file is provided in the repo as a template.
- If the config file is missing, **default values** are used and the file is created with those values.
- **Note on rules:** Rules in `config.toml` are synced to the `categories`/`rules` tables **only on first run** (initial seed). After that, rules are managed through the dashboard (and ultimately the DB), so manual edits to the config file don't conflict with DB data. A `--reseed-rules` CLI option exists for forced rewrite.

---

## 3. Non-Functional Requirements

### NFR-1 — Platform Compatibility
| Platform | Support Level |
|---|---|
| Windows 10/11 (x64) | **Full** |
| Linux X11 (KDE Plasma) | **Full** |
| Linux Wayland (KDE Plasma 6) | **Full** (KWin DBus API, no grim/portal) |
| macOS | Out of scope v1 |

### NFR-2 — Performance
- CPU usage in idle state (just polling for change detection) under **2%** on typical hardware.
- Total app RAM usage under **300 MB** (excluding the web dashboard in QWebEngineView).
- Screenshot capture + compression under **1 second**.
- Sampling must not impact the user experience of other applications.
- Chart aggregate queries over a one-month range must complete in under **200 ms** (with proper indexing).

### NFR-3 — Privacy
- All data is stored **entirely locally**; no data is sent over the network.
- The only network communication is the `localhost` port for the dashboard (to FastAPI).
- **Exclusion list** prevents screenshots of sensitive apps (banking, messaging, etc.).
- Screenshots are low quality by default.
- No external telemetry/analytics.

### NFR-4 — Reliability
- If the app terminates unexpectedly, previous data must not be corrupted (use SQLite transactions + WAL mode).
- **Behavior on restart:** If a record with `end_ts = NULL` remains from a previous session, it is automatically closed on startup with `end_ts = last_shutdown_estimate` (or the new session start time).
- Platform errors (e.g., window access denied, screenshot failure) must not crash the app; they must be **logged** and processing must continue.

### NFR-5 — Packaging and Distribution
- Provide standalone executables for Windows (`.exe` or installer) and Linux (AppImage or tarball).
- Dependencies (including Angular build and PySide6) should be **bundled** as much as possible so users don't need separate installations.
- The final package size is expected to be **80–150 MB** due to embedded Chromium (QWebEngineView).

---

## 4. Architecture

### 4.1 — High-Level Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                         Main Process (Qt)                          │
│                                                                    │
│  ┌─────────────┐    ┌──────────────────┐    ┌──────────────────┐  │
│  │  Tray Icon  │    │ Dashboard Window  │    │  Config Manager  │  │
│  │ (QSystemTray│    │ (QWebEngineView → │    │   (TOML load/    │  │
│  │   Icon)     │    │    Angular SPA)   │    │    save + sync)  │  │
│  └─────────────┘    └────────┬─────────┘    └──────────────────┘  │
│                              │                                     │
│                              ▼                                     │
│                     ┌─────────────────┐                            │
│                     │  FastAPI Server  │  ← localhost:PORT          │
│                     │ (background thd) │                            │
│                     └────────┬────────┘                            │
│                              │                                     │
│  ┌───────────────────────────┼─────────────────────────────────┐ │
│  │                   Persistence Layer                           │ │
│  │             SQLModel / SQLAlchemy → SQLite (WAL)              │ │
│  │             (swappable to Postgres via connection string)     │ │
│  └───────────────────────────┬─────────────────────────────────┘ │
│                              │                                     │
│  ┌──────────────┬────────────┼─────────────┬────────────────────┐ │
│  │   Sampler    │ Screenshot │  Recompute  │     Retention      │ │
│  │   Thread     │  Thread    │   Worker    │      Worker        │ │
│  │ (poll → event│  (10s)     │ (on rule Δ) │     (hourly)       │ │
│  │  on change)  │            │             │                    │ │
│  └──────────────┴────────────┴─────────────┴────────────────────┘ │
│                              │                                     │
│                              ▼                                     │
│                     ┌─────────────────┐                            │
│                     │ Platform Layer   │                            │
│  ┌──────────┐   ┌──────────┐   ┌──────────────┐                   │
│  │ Windows  │   │ Linux X11│   │Linux Wayland │                   │
│  └──────────┘   └──────────┘   └──────────────┘                   │
└──────────────────────────────────────────────────────────────────┘
```

### 4.2 — Platform Abstraction Layer
A **unified interface** that each platform backend implements:

```python
@dataclass
class WindowInfo:
    process: str | None    # Process name (e.g. "code"); None if no active window
    title: str | None      # Window title

class PlatformBackend(Protocol):
    def get_active_window(self) -> WindowInfo | None:
        """Title and process name of the active window; None if no active window."""
        ...

    def capture_active_window(self, quality: "ScreenshotQuality") -> bytes | None:
        """JPEG screenshot (raw bytes) of the active window; None on failure."""
        ...
```

- **Windows**: `GetForegroundWindow` + `GetWindowText` + `GetWindowThreadProcessId` (via ctypes or pywin32) and `psutil` for process name; screenshot with `BitBlt` or `mss`.
- **Linux X11**: `python-xlib` with EWMH protocol (`_NET_ACTIVE_WINDOW`, `_NET_WM_PID`); screenshot of specific window with Xlib or `mss`.
- **Linux Wayland (KDE Plasma 6)**: DBus to `org.kde.KWin` for active window (`activeWindow` → title + `pid` → `psutil`), window geometry (`geometry`), and screenshot (`screenshotArea` / `screenshotWindow` without user prompt).
- **Factory** (`platform/factory.py`): Auto-select backend based on `sys.platform`, `WAYLAND_DISPLAY`, `KDE_FULL_SESSION`, and KWin presence on DBus.

### 4.3 — Runtime and Threading
- **Main thread**: `QApplication` and event loop. User interaction, tray, dashboard window. (Qt **must** be in the main thread.)
- **Sampler thread**: Loop `while running: info = get_active_window(); if changed: close_prev(); open_new(); sleep(poll_interval)`.
- **Screenshot thread**: Loop `while running: capture(); sleep(screenshot_interval)`.
- **Recompute worker**: Idle until a rule change is detected, then chunked processing.
- **Retention worker**: Runs every hour.
- **FastAPI thread**: Runs `uvicorn` in a separate thread to serve API and static files.
- Coordination between threads via `threading.Event` for stop and a queue/channel for config changes.

### 4.4 — Database
- **Engine**: SQLite with **WAL mode** for concurrent read/write without locking.
- **ORM**: SQLModel (on SQLAlchemy) for ability to switch to Postgres by changing the connection string.
- **Rationale for SQLite:** Since categorization happens at write time (by Python), there's no need for native regex at the DB level; thus Postgres' main advantage is moot, and SQLite is simpler for a single-user personal app.

---

## 5. Data Model and Storage

### 5.1 — Table `activities` (core data)
| Column | Type | Description |
|---|---|---|
| `id` | INTEGER PK | Auto |
| `start_ts` | TEXT (ISO8601 UTC) | Activity start |
| `end_ts` | TEXT NULL | End; **NULL = in progress** |
| `duration_sec` | INTEGER NULL | `end_ts − start_ts` (calculated on close) |
| `process` | TEXT | Process name (NULL for Idle) |
| `title` | TEXT | Window title |
| `category` | TEXT | Stored category (recomputed on rule change) |
| `rule_version` | INTEGER | Rule version at categorization time |
| `job` | TEXT NULL | Assigned job name |
| `job_description` | TEXT NULL | Job description |

**Indexes:** `idx_activities_start_ts`, `idx_activities_category`, `idx_activities_rule_version`.

### 5.2 — Table `screenshots`
| Column | Type | Description |
|---|---|---|
| `id` | INTEGER PK | Auto |
| `activity_id` | INTEGER FK → activities | Current activity at capture time |
| `timestamp` | TEXT (ISO8601 UTC) | Capture time |
| `file_path` | TEXT | JPEG file path on disk |
| `file_size` | INTEGER | File size in bytes |

**Indexes:** `idx_screenshots_activity_id`, `idx_screenshots_timestamp`.

### 5.3 — Table `categories`
| Column | Type | Description |
|---|---|---|
| `id` | INTEGER PK | Auto |
| `name` | TEXT UNIQUE | Category name (e.g. "Coding") |
| `color` | TEXT | Hex color (e.g. `#4CAF50`) |
| `priority` | INTEGER | Match order (lower = checked first) |
| `enabled` | BOOLEAN | Enabled/Disabled |

### 5.4 — Table `rules`
| Column | Type | Description |
|---|---|---|
| `id` | INTEGER PK | Auto |
| `category_id` | INTEGER FK → categories | Parent category |
| `process_regex` | TEXT NULL | Regex pattern on process name (NULL = ignored) |
| `title_regex` | TEXT NULL | Regex pattern on title (NULL = ignored) |

### 5.5 — Table `meta`
| Column | Type | Description |
|---|---|---|
| `key` | TEXT PK | Key (e.g. `rule_version`) |
| `value` | TEXT | Value |

### 5.6 — Storage Locations
- **Database:** `~/.timetracker/data.db`
- **Screenshots:** `~/.timetracker/screenshots/YYYY/MM/` with filename `DD-HHMMSS-<short_id>.jpg`.
- All paths are configurable.

---

## 6. Example Config File (`config.example.toml`)

```toml
[sampling]
poll_interval_sec       = 1        # Poll interval for window change detection
screenshot_interval_sec = 10       # Screenshot interval
screenshot_quality      = "low"    # low | medium | high

[storage]
db_path        = "~/.timetracker/data.db"
screenshot_dir = "~/.timetracker/screenshots"
retention_days = 7

[ui]
open_dashboard_on_start = false

# These rules are synced to the DB only on first run.
# Edit them later via the dashboard.
[[rules]]
name          = "Coding"
process_regex = "code|jetbrains|cursor"
color         = "#4CAF50"

[[rules]]
name          = "Browser"
process_regex = "chrome|firefox|edge"
title_regex   = ".*"
color         = "#2196F3"

[[rules]]
name          = "Terminal"
process_regex = "kitty|alacritty|konsole|wezterm"
color         = "#FF9800"

[[screenshot_exclusions]]
process_regex = "telegram|signal|whatsapp"

[[screenshot_exclusions]]
process_regex = ".*bank.*|.*paypal.*"
title_regex   = ".*"
```

---

## 7. API (FastAPI on `/api`)

All endpoints on `http://127.0.0.1:<port>/api`. Port from config or random (0).

| Method | Path | Description |
|---|---|---|
| GET | `/api/stats/summary` | Range summary (filterable with `?start=&end=`) |
| GET | `/api/stats/timeline` | Categorized timeline data (for time chart) |
| GET | `/api/stats/breakdown` | Time breakdown by category (for Pie/Donut chart) |
| GET | `/api/categories` | List categories |
| POST | `/api/categories` | Add category |
| PUT | `/api/categories/{id}` | Edit category |
| DELETE | `/api/categories/{id}` | Delete category |
| GET | `/api/rules` | List all rules |
| POST | `/api/rules` | Add rule |
| PUT | `/api/rules/{id}` | Edit rule |
| DELETE | `/api/rules/{id}` | Delete rule |
| POST | `/api/rules/test` | Test regex on sample or recent activities |
| GET | `/api/screenshots` | List screenshots (range filter, pagination) |
| GET | `/api/screenshots/{id}` | A screenshot record |
| GET | `/api/screenshots/{id}/image` | The JPEG file itself |
| GET | `/api/config` | Current config |
| PUT | `/api/config` | Update config |
| GET | `/api/status` | Tracking status (active/inactive, uptime, stats) |
| POST | `/api/tracking/start` | Start tracking |
| POST | `/api/tracking/stop` | Stop tracking |
| GET | `/api/activities` | List activities (range filter + pagination; for browsing/debug) |

---

## 8. Dashboard (Angular)

- **Framework:** Angular (latest stable), **standalone components**.
- **Charts:** **ECharts** with `ngx-echarts` (for strong zoom/brush capabilities on the time axis).
- **Styling:** Tailwind CSS.
- **Build:** `ng build` → static files in `dashboard/dist/`, served by FastAPI.
- **Backend communication:** `HttpClient` to `/api/*`.
- **Main pages:**
  1. **Overview**: range selection (today/yesterday/week/month/custom) + Pie chart + Timeline chart.
  2. **Categories**: manage categories and rules (CRUD) + live regex testing.
  3. **Screenshots**: gallery with range and category filters.
  4. **Settings**: edit config + change paths and quality settings.

---

## 9. Project Structure

```
time-tracker/
├── pyproject.toml
├── README.md
├── config.example.toml
├── docs/
│   ├── SPECIFICATION.md        ← This file
│   └── PLAN.md                 ← Implementation plan
├── src/timetracker/
│   ├── __init__.py
│   ├── __main__.py             # Entry point: QApplication + threads
│   ├── config.py               # Config load/save + initial rules sync
│   ├── platform/
│   │   ├── __init__.py
│   │   ├── base.py             # PlatformBackend Protocol + WindowInfo
│   │   ├── windows.py          # Windows backend
│   │   ├── linux_x11.py        # X11 backend
│   │   ├── linux_wayland.py    # Wayland backend (KDE KWin DBus)
│   │   └── factory.py          # Auto-select backend
│   ├── db/
│   │   ├── __init__.py
│   │   ├── models.py           # SQLModel: Activity, Screenshot, Category, Rule, Meta
│   │   ├── session.py          # Engine + session factory (swappable)
│   │   └── migrations.py       # Schema creation/update + indexes
│   ├── tracking/
│   │   ├── __init__.py
│   │   ├── sampler.py          # Event-based sampling loop
│   │   ├── categorizer.py      # Rule loading + regex matching
│   │   └── recompute.py        # Chunked re-categorization
│   ├── screenshots/
│   │   ├── __init__.py
│   │   ├── capture.py          # Capture + compress + save
│   │   └── retention.py        # Auto purge
│   ├── api/
│   │   ├── __init__.py
│   │   ├── server.py           # FastAPI app + static serving
│   │   ├── deps.py             # Dependency injection
│   │   └── routes/
│   │       ├── __init__.py
│   │       ├── stats.py
│   │       ├── rules.py
│   │       ├── categories.py
│   │       ├── screenshots.py
│   │       ├── config.py
│   │       └── tracking.py
│   └── ui/
│       ├── __init__.py
│       ├── tray.py             # QSystemTrayIcon
│       └── dashboard_window.py # QMainWindow + QWebEngineView
├── dashboard/                  # Angular project
│   ├── angular.json
│   ├── package.json
│   └── src/
│       ├── app/
│       │   ├── overview/
│       │   ├── categories/
│       │   ├── screenshots/
│       │   ├── settings/
│       │   ├── services/       # HttpClient wrappers
│       │   └── models/         # TypeScript interfaces
│       └── styles.css
└── tests/
    ├── unit/                   # Unit tests
    └── integration/            # Integration tests
```

---

## 10. Dependencies

### Python (`pyproject.toml`)
| Package | Version | Purpose |
|---|---|---|
| `PySide6` | ≥6.6 | Qt UI, tray, QWebEngineView |
| `fastapi` | ≥0.110 | Backend API |
| `uvicorn` | ≥0.27 | ASGI server for FastAPI |
| `sqlmodel` | ≥0.0.16 | ORM (on SQLAlchemy) |
| `pydantic` | ≥2.6 | Config and API validation |
| `psutil` | ≥5.9 | Process name (cross-platform) |
| `Pillow` | ≥10 | Screenshot compression |
| `mss` | ≥9 | Cross-platform screenshots |
| `python-xlib` | ≥0.33 | **Linux/X11 only**: window detection |
| `pywin32` | ≥306 | **Windows only**: Win32 API |
| `dbus-python` | ≥1.3 | **Linux only**: DBus to KWin (Wayland + X11) |
| `regex` | ≥2024.x | Advanced regex (optional) |

### Node.js / Angular
- Node.js ≥ 20 LTS, Angular CLI ≥ 18.
- `ngx-echarts`, `echarts`, `asa-date-picker`, `tailwindcss`.

### Dev Tools
- `pytest`, `pytest-asyncio` for testing.
- `ruff` for linting, `black` for formatting, `mypy` for type-checking.
- `pyinstaller` or `nuitka` for executable packaging.

---

## 11. Scoping

### In Scope v1
- All requirements FR-1 through FR-8 on Windows + Linux X11.
- **Full** Wayland support on KDE Plasma 6 (with KWin DBus).
- Angular dashboard with four pages: overview/categories/screenshots/settings.
- Executable packaging for Windows and Linux.

### Out of Scope v1 (Future Versions)
- Multi-device sync (requires central backend/Postgres).
- Smart blur of sensitive areas in screenshots.
- macOS support.
- Advanced idle detection based on keyboard/mouse input.
- ML-based automatic categorization.
- Weekly reports and notifications.

---

## 12. Risks and Mitigations

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Wayland doesn't allow per-window capture | Low (KDE) | Medium | KWin `screenshotArea` with `activeWindow.geometry` without user prompt; fallback to `screenshotFullScreen` + crop |
| QWebEngineView inflates package size | Certain | Low | Accepted (embed Chromium); documented in README |
| Screenshot volume grows quickly | Medium | Medium | Auto retention + low quality default + size estimate display in dashboard |
| Open-ended record persists after crash | Medium | Medium | On startup, auto-close records with `end_ts IS NULL` using estimated time |
| User regex is invalid | Medium | Medium | Validation on rule save + fallback to Uncategorized + error display |
| Manual `config.toml` edits conflict with DB | Low | Medium | Rules are only seeded on first run; `--reseed-rules` flag for forced rewrite |

---

## 13. Glossary

- **Activity:** A record in the `activities` table; the time window a user worked in a specific window.
- **Sample vs Activity:** In this design there are **no point samples**; data is stored as activities (time ranges).
- **Category:** The final classification label of an activity (e.g. "Coding").
- **Rule:** A regex pattern for matching `process` and/or `title`.
- **Rule version:** The version of rules at the time an activity was categorized; used to identify activities needing recompute.
- **Recompute:** Automatic re-categorization of activities after rule changes.
- **Retention:** How long screenshots are kept before automatic deletion.
- **Idle:** An activity with `process = NULL` when no active window exists.
- **Tray:** The app icon in the system tray / notification area.
- **EWMH:** Extended Window Manager Hints, standard for accessing window info on X11.
- **WAL:** Write-Ahead Logging, SQLite concurrency mode.
- **QWebEngineView:** Qt widget for embedding Chromium and displaying web content.
- **ECharts:** JavaScript charting library (Apache).
- **Pie / Donut / Stacked Bar:** Chart types for showing share and distribution of categories.
