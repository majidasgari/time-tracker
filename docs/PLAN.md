# Implementation Plan — Chrysalis Time Tracker

> **Document Status:** Draft v1.0 · Last Updated: 2026-07-04
> **Reference:** `docs/SPECIFICATION.md` for the complete specification. This document describes **how** to implement it.

---

## 0. Guiding Principles

- **Incremental:** Each phase is independently testable and has demonstrable value.
- **MVP First:** The backend engine (tracking + categorization) must be complete and testable before any graphical UI.
- **Platform-agnostic first:** Design a unified interface first, then implement platform-specific backends.
- **Test every phase:** Each phase must be delivered with meaningful unit/integration tests.
- **Single source of truth:** SPECIFICATION.md defines "what", this document defines "how". If they conflict, SPECIFICATION takes precedence.

---

## 1. Phase Roadmap

| Phase | Name | Observable Output | Depends On |
|---|---|---|---|
| 0 | Project Setup | Folder structure + `pyproject.toml` + green lint/test | — |
| 1 | Config + DB | Config loads + SQLite schema created | 0 |
| 2 | Platform Layer | `get_active_window()` works on Windows/X11 | 0 |
| 3 | Sampler + Categorizer | Activities are recorded in DB (**Backend MVP**) | 1, 2 |
| 4 | Screenshot + Retention | Images saved to disk | 2, 3 |
| 5 | FastAPI | API returns chart data from real data (curl-verifiable) | 3 |
| 6 | Recompute Worker | Rule change → entire history re-categorized | 3 |
| 7 | Angular Dashboard | Dashboard works in browser | 5 |
| 8 | Qt UI + Integration | Full app from tray to dashboard | 3, 4, 5, 6, 7 |
| 9 | Packaging | Windows + Linux executables | 8 |

### Milestones
- **M1 (after Phase 3):** Command line can record activities in DB (no UI).
- **M2 (after Phase 5):** API returns real data in JSON chart format.
- **M3 (after Phase 8):** Full app works from tray to dashboard.

---

## Phase 0 — Project Setup

### Objectives
Build the project skeleton with all development tools ready.

### Tasks
1. Create folder structure per SPECIFICATION section 9.
2. Create `pyproject.toml` with:
   - Project metadata (name, version, Python ≥3.11).
   - Core dependencies (from SPECIFICATION section 10).
   - Dev dependencies: `pytest`, `pytest-asyncio`, `ruff`, `black`, `mypy`, `pyinstaller`.
   - Platform-specific optional deps (python-xlib, pywin32, dbus-python) with appropriate markers.
   - `ruff`, `black`, `mypy` configs in the same file.
3. Create `config.example.toml` (per SPECIFICATION section 6).
4. Create `src/timetracker/__init__.py` and other `__init__.py` files.
5. Create `tests/__init__.py` and a sample test (smoke test).
6. Create `.gitignore` (including `__pycache__/`, `.venv/`, `*.db`, `screenshots/`, `dashboard/dist/`, `dashboard/node_modules/`).

### Deliverables
- Complete `pyproject.toml`.
- `config.example.toml`.
- Empty folder structure with `__init__.py` files.
- `ruff check .` and `pytest` pass cleanly (with smoke test).

### Definition of Done
- `pip install -e ".[dev]"` succeeds without errors.
- `pytest` is green.
- `ruff check .` passes without errors.

---

## Phase 1 — Config + DB

### Objectives
Data persistence layer and config loading.

### Tasks
1. **`config.py`**:
   - Pydantic models for config (`SamplingConfig`, `StorageConfig`, `UIConfig`, `RuleConfig`, `ScreenshotExclusion`).
   - `load_config(path: Path) -> Config`: read TOML with `tomllib`, validate with Pydantic.
   - `save_config(path: Path, config: Config)`: serialize to TOML.
   - Default values if file is missing (auto-create at `~/.timetracker/config.toml`).
   - Expand `~` paths with `Path.expanduser()`.
2. **`db/models.py`** (SQLModel):
   - `Activity`, `Screenshot`, `Category`, `Rule`, `Meta` per SPECIFICATION section 5.
3. **`db/session.py`**:
   - `create_engine(url)`: SQLite with `connect_args={"check_same_thread": False}` (since multiple threads are used).
   - Enable **WAL mode**: `PRAGMA journal_mode=WAL` and `PRAGMA synchronous=NORMAL` on connect.
   - `get_session()` dependency for FastAPI.
4. **`db/migrations.py`**:
   - `init_db()`: `SQLModel.metadata.create_all()` + create indexes.
   - `seed_rules_from_config(config)`: Initial sync of rules from config to `categories`/`rules` tables (only if DB is empty or via `--reseed-rules` flag).
   - `seed_meta_defaults()`: Initialize `meta.rule_version = 1`.
5. **`db/seed_categories.py`** (or function in migrations):
   - Seed system categories `Idle` and `Uncategorized` with fixed colors.

### Deliverables
- Modules `config.py`, `db/models.py`, `db/session.py`, `db/migrations.py`.
- Unit tests:
  - Load config from sample file.
  - Create schema + insert/read an activity.
  - Seed rules from config.

### Definition of Done
- A short script (or test) that loads config, inits DB, and inserts/reads several activities.

---

## Phase 2 — Platform Layer

### Objectives
Unified interface and platform-specific backends for window detection and screenshots.

### Tasks
1. **`platform/base.py`**:
   - `@dataclass WindowInfo(process: str | None, title: str | None)`.
   - `class ScreenshotQuality(str, Enum)`: `LOW` (max_width=800, jpeg_quality=30), `MEDIUM` (1280, 60), `HIGH` (1920, 85).
   - `class PlatformBackend(Protocol)`:
     - `get_active_window() -> WindowInfo | None`
     - `capture_active_window(quality: ScreenshotQuality) -> bytes | None`
2. **`platform/windows.py`**:
   - `get_active_window`: `GetForegroundWindow` (ctypes) + `GetWindowTextW` + `GetWindowThreadProcessId` → `psutil.Process(pid).name()`.
   - `capture_active_window`: Direct HWND capture with `BitBlt` or fallback to `mss` with window region (`GetWindowRect`).
   - JPEG compression with Pillow per `quality`.
3. **`platform/linux_x11.py`**:
   - `get_active_window`: `python-xlib` with EWMH:
     - `_NET_ACTIVE_WINDOW` from root → window.
     - `_NET_WM_NAME` for title.
     - `_NET_WM_PID` for pid → `psutil.Process(pid).name()`.
   - `capture_active_window`: `mss` with window region (`_NET_WM_GEOMETRY` or `get_geometry`) or grab with Xlib.
4. **`platform/linux_wayland.py`** (KDE Plasma 6 — full support):
   - `get_active_window`: DBus call to `org.kde.KWin`:
     - `KWin.activeWindow` → window object.
     - From window: read `title`, `pid` (→ `psutil.Process(pid).name()`), `geometry` (for `capture_active_window`).
   - `capture_active_window`: DBus call to `org.kde.KWin`:
     - `KWin.screenshotArea(x, y, w, h)` with active window geometry (without user prompt).
     - JPEG compression with Pillow per `quality`.
   - **Fallback:** If `screenshotArea` is unavailable → `KWin.screenshotFullScreen` + crop with Pillow.
   - **If KWin is unavailable:** Log warning + raise `NotImplementedError`.
5. **`platform/factory.py`**:
   - `get_backend() -> PlatformBackend`:
     - `sys.platform == "win32"` → `WindowsBackend`.
     - Linux + `WAYLAND_DISPLAY` present + `KDE_FULL_SESSION` and KWin on DBus → `WaylandBackend`.
     - Linux + `DISPLAY` → `X11Backend`.
     - Otherwise → raise `RuntimeError`.

### Deliverables
- Four modules in `platform/`.
- Tests with **mocks** (patching Win32/Xlib/DBus functions) to verify contract consistency.

### Definition of Done
- Manual script on each platform: print `get_active_window()` every 2 seconds (no storage).

---

## Phase 3 — Sampler (Event-based) + Categorizer  ← **M1**

### Objectives
The heart of the app: detect window changes and record activities in the DB.

### Tasks
1. **`tracking/categorizer.py`**:
   - `class Categorizer`:
     - `__init__`: load rules and categories from DB, compile regexes with `re.compile(..., re.IGNORECASE)`.
     - `categorize(process: str | None, title: str | None) -> str`: apply OR/AND/priority logic.
     - `reload()`: reload rules (when rules change).
     - **Error handling:** Invalid regex → log + ignore that rule (don't crash).
   - Cache compiled regexes for performance.
2. **`tracking/sampler.py`**:
   - `class Sampler(threading.Thread)`:
     - `__init__(backend, session_factory, categorizer, poll_interval, stop_event)`.
     - `run()`:
       ```python
       current_activity = None
       while not stop_event.is_set():
           info = backend.get_active_window()
           if current_activity is None or _changed(info, current_activity):
               _close_activity(current_activity)   # set end_ts + duration_sec
               current_activity = _open_activity(info, categorizer)  # insert with rule_version
           stop_event.wait(poll_interval)
       _close_activity(current_activity)  # on stop
       ```
     - `_changed(info, activity)`: compare `process` and `title`.
     - `_open_activity(info)`: categorize + insert activity with current `rule_version`.
     - **Idle handling:** If `info is None`, activity with `process=None, category="Idle"`.
   - **Threading note:** Each thread must have its own session (SQLModel sessions are not thread-safe).

### Deliverables
- `categorizer.py` and `sampler.py`.
- Unit tests:
  - Categorizer: sequence of `(process, title)` → verify output category with sample rules.
  - Sampler: simulate a sequence of `WindowInfo` with mock backend → verify generated activities, `duration_sec`, and categorization.

### Definition of Done (M1)
- A script/CLI that runs the sampler for 30 seconds, then prints the `activities` table contents. Reasonable time ranges with correct `duration_sec` must be seen.

---

## Phase 4 — Screenshot + Retention

### Objectives
Periodically capture active window screenshots + auto cleanup.

### Tasks
1. **`screenshots/capture.py`**:
   - `class ScreenshotCapture(threading.Thread)`:
     - `__init__(backend, session_factory, interval, quality, screenshot_dir, exclusions, stop_event)`.
     - `run()`:
       ```python
       while not stop_event.is_set():
           info = backend.get_active_window()
           if info and not _is_excluded(info, exclusions):
               image_bytes = backend.capture_active_window(quality)
               if image_bytes:
                   _save_screenshot(image_bytes, current_activity_id)
           stop_event.wait(interval)
       ```
     - `_is_excluded(info, exclusions)`: regex match on process/title.
     - `_save_screenshot(bytes)`: generate filename (per SPECIFICATION FR-5), write file, insert record in `screenshots` with the current open activity's `activity_id`.
   - **Link to current activity:** Query activity with `end_ts IS NULL` ORDER BY `start_ts DESC LIMIT 1`.
2. **`screenshots/retention.py`**:
   - `class RetentionWorker(threading.Thread)`:
     - `__init__(session_factory, retention_days, interval=3600, stop_event)`.
     - `run()`:
       ```python
       while not stop_event.is_set():
           _purge_old_screenshots(retention_days)
           stop_event.wait(interval)
       ```
     - `_purge_old_screenshots`: query old screenshots → delete file → delete DB record.

### Deliverables
- `capture.py` and `retention.py`.
- Tests:
  - Compression at different quality levels (verify max width and relative file size).
  - Exclusion behavior (no storage for excluded processes).
  - Retention (file and record deletion after N days using clock mock).

### Definition of Done
- Run capture temporarily for 30 seconds → verify JPEG files and DB records are created.

---

## Phase 5 — FastAPI  ← **M2**

### Objectives
API to feed the dashboard.

### Tasks
1. **`api/deps.py`**:
   - `get_session()`: generator yielding SQLModel session.
   - `get_config()`: return current config.
   - `get_categorizer()`: shared categorizer instance (reloaded on rule changes).
2. **`api/server.py`**:
   - Create `FastAPI`.
   - Mount static files (Angular build in `dashboard/dist/`) at `/`.
   - CORS restricted to `localhost`.
   - `/api/health` endpoint for sanity check.
3. **`api/routes/stats.py`**:
   - `GET /stats/summary?start=&end=`: aggregate total duration by category.
   - `GET /stats/timeline?start=&end=&bucket=hour|day`: timeline data (GROUP BY bucket and category, SUM(duration_sec)).
   - `GET /stats/breakdown?start=&end=`: time breakdown by category.
   - **Aggregate queries in SQL** (not Python-side):
     ```sql
     SELECT category, SUM(duration_sec) AS total
     FROM activities
     WHERE start_ts >= :start AND end_ts <= :end
     GROUP BY category
     ORDER BY total DESC;
     ```
   - **Open activity:** In queries, the `end_ts IS NULL` record is included with `duration_sec = EXTRACT(epoch FROM now() - start_ts)`.
4. **`api/routes/rules.py`** and **`categories.py`**:
   - Full CRUD. On change: `meta.rule_version += 1` and trigger recompute (signal the recompute worker).
   - `POST /rules/test`: apply regex to recent activities or hypothetical samples.
5. **`api/routes/screenshots.py`**:
   - `GET /screenshots?start=&end=&page=`: paginated.
   - `GET /screenshots/{id}/file`: `FileResponse` with JPEG.
6. **`api/routes/config.py`**:
   - `GET /config` and `PUT /config` (apply changes in memory and save TOML file).
7. **`api/routes/tracking.py`**:
   - `GET /status`: tracking status, uptime, activity/screenshot counts.
   - `POST /tracking/start` and `/tracking/stop`: set sampler and screenshot `stop_event`.

### Deliverables
- API modules.
- Tests with `fastapi.testclient.TestClient`: verify aggregates with seeded data.

### Definition of Done (M2)
- `curl http://localhost:<port>/api/stats/breakdown?start=...&end=...` returns valid JSON.

---

## Phase 6 — Recompute Worker

### Objectives
Auto re-categorization on rule changes.

### Tasks
1. **`tracking/recompute.py`**:
   - `class RecomputeWorker(threading.Thread)`:
     - `__init__(session_factory, categorizer, stop_event, trigger_event)`.
     - `run()`:
       ```python
       while not stop_event.is_set():
           if trigger_event.wait(timeout=60):   # wait for rule change signal
               trigger_event.clear()
               _recompute_all()
       ```
     - `_recompute_all()`:
       - Read `current_version` from `meta`.
       - Loop over chunks (1000 rows):
         ```sql
         SELECT id, process, title FROM activities
         WHERE rule_version < :current_version
         LIMIT 1000 OFFSET :offset;
         ```
       - For each row: `category = categorizer.categorize(process, title)`, update with `rule_version = current_version`.
       - **Short yield/sleep** between chunks (e.g., 10ms) to prevent DB locking.
   - On completion, emit a notification (e.g., on a `queue.Queue` that the dashboard polls, or WebSocket in Phase 7).

### Deliverables
- `recompute.py`.
- Test: insert activities with old rules → change rule → verify all re-categorized.

### Definition of Done
- Change a rule via API → verify `category` updates in the activities table after a few seconds.

---

## Phase 7 — Angular Dashboard

### Objectives
Web UI for data visualization and rule management.

### Tasks
1. **Scaffold**:
   - `ng new dashboard --standalone --style=css --routing`.
   - Install `ngx-echarts`, `echarts`, `date-fns`, `tailwindcss`.
2. **`services/`**:
   - `StatsService`, `RulesService`, `CategoriesService`, `ScreenshotsService`, `ConfigService`, `TrackingService` — wrappers with `HttpClient` to `/api/*`.
3. **TypeScript Models** (`models/`):
   - Interfaces matching API schema (`Activity`, `Category`, `Rule`, `Screenshot`, `Config`, `StatsSummary`, ...).
4. **Pages**:
   - **Overview**: date-range picker (today/yesterday/week/month/custom) + Pie/Donut + Timeline (with dataZoom).
   - **Categories**: list categories and rules, add/edit forms, **live regex testing** (show recent matching activities).
   - **Screenshots**: gallery with lazy-load, range and category filter, lightbox.
   - **Settings**: config edit form + save.
5. **Build**:
   - `ng build --output-path ../src/timetracker/api/static` (or shared path) → static files served by FastAPI.

### Deliverables
- Complete Angular project in `dashboard/`.
- Manual verification in browser (after `ng build` and running FastAPI).

### Definition of Done
- Open `http://localhost:<port>/` in browser and see charts + edit rules.

---

## Phase 8 — Qt UI + Integration  ← **M3**

### Objectives
Glue everything together under a desktop app with tray and embedded dashboard.

### Tasks
1. **`ui/tray.py`**:
   - `class TrayController`:
     - `QSystemTrayIcon` with status icon (tracking active/inactive).
     - Context menu: Toggle Tracking, Open Dashboard, Settings, Quit.
     - `showMessage` for notifications (e.g., recompute complete).
2. **`ui/dashboard_window.py`**:
   - `class DashboardWindow(QMainWindow)`:
     - `QWebEngineView` in the center, loading `http://localhost:<port>/`.
     - Minimum size and appropriate title.
3. **`__main__.py`**:
   - Create `QApplication`.
   - Load config + init DB (migration + seed).
   - Detect platform backend with `factory.get_backend()`.
   - **Close open records from previous session** (NFR-4): `UPDATE activities SET end_ts = <startup_time>, duration_sec = ... WHERE end_ts IS NULL`.
   - Start threads: Sampler, ScreenshotCapture, RetentionWorker, RecomputeWorker.
   - Start FastAPI in a thread (with `uvicorn.Server` and `uvicorn.Config`).
   - Create TrayController and (if config says so) DashboardWindow.
   - Connect rule change signal to recompute worker's `trigger_event`.
   - **Clean shutdown**: set `stop_event`s, join threads with timeout, `app.exec()` ends.

### Deliverables
- `tray.py`, `dashboard_window.py`, `__main__.py`.
- Integration test: full startup, generate data, verify charts via API.

### Definition of Done (M3)
- Run `python -m timetracker` → tray icon appears → open dashboard → see live data.

---

## Phase 9 — Packaging

### Objectives
Distribute as standalone executables.

### Tasks
1. **PyInstaller spec**:
   - Input: `src/timetracker/__main__.py`.
   - `--onedir` (faster startup than `--onefile`).
   - Bundle: PySide6 (including QWebEngine), Angular build (in static path).
   - `--collect-all PySide6` and `--collect-all shiboken6`.
   - Hidden imports for platform backends.
2. **Build scripts**:
   - `scripts/build.sh` (Linux) and `scripts/build.ps1` (Windows).
   - First `ng build`, then `pyinstaller`.
3. **README**:
   - Install guide from source and from executable.
   - Explain Wayland prerequisites (KDE Plasma 6 + `kde-cli-tools`).
   - Initial configuration guide.

### Deliverables
- `timetracker.spec`, build scripts, expanded README.
- Tested executable on Windows and Linux.

### Definition of Done
- Executable runs on a clean system (no Python) and works.

---

## 3. Execution Order and Dependencies

```
Phase 0
  │
  ├──► Phase 1 (Config+DB) ──────────────────────┐
  │                                                │
  └──► Phase 2 (Platform) ──┐                      │
                             ▼                      │
                           Phase 3 (Sampler) ◄──────┘
                            │
                            ├──► Phase 4 (Screenshot)
                            │
                            ├──► Phase 5 (API)
                            │        │
                            │        ▼
                            │    Phase 7 (Angular)
                            │
                            └──► Phase 6 (Recompute)
                                     │
                                     ▼
                           Phase 8 (Qt UI) ◄── Phases 4, 5, 6, 7
                                     │
                                     ▼
                               Phase 9 (Packaging)
```

**Critical path:** 0 → 1 → 3 → 5 → 7 → 8 → 9.

**Possible parallelization:**
- Phase 1 and 2 in parallel (both only depend on Phase 0).
- Phase 4 and 6 in parallel after Phase 3.
- Phase 7 can start in parallel with Phase 6 (with mock API).

---

## 4. Implementation Risks and Mitigations

| Risk | Affected Phase(s) | Mitigation |
|---|---|---|
| Wayland API limited to KDE/KWin | 2 | Factory checks if `KDE_FULL_SESSION` and `org.kde.KWin` are on DBus; otherwise fall back to X11 or raise `RuntimeError`. |
| SQLAlchemy/SQLModel thread safety | 3, 4, 6 | Each thread has its own session; use `sessionmaker`. |
| QWebEngineView is heavy in PyInstaller | 9 | Use `--collect-all` and test the bundle. |
| User regex causes ReDoS | 3, 6 | Timeout on `re` (or use `regex` module with `timeout`). |
| Config change synchronization across threads | 8 | A config change queue + safe reload in each worker. |
| Real platform test data volume | 2, 3 | Strong mock-backend + integration tests only on CI. |

---

## 5. Key Design Decisions (Log)

| Decision | Date | Rationale |
|---|---|---|
| Event-based sampling (not constant polling) | 2026-07-04 | User request: auto-detect window changes, only record changes. |
| Store category in activities + recompute | 2026-07-04 | User request: instant regex changes must re-categorize entire history; recompute is lightweight due to low data volume. |
| SQLite (not Postgres) as default | 2026-07-04 | With the recompute model, regex runs at write time (Python); Postgres' advantage is moot. Abstraction layer for future switch. |
| PySide6 instead of PyQt6 | 2026-07-04 | LGPL license (official Qt), more suitable for the project. |
| Angular in QWebEngineView | 2026-07-04 | User request: integrated dashboard within the app itself. |

---

## 6. Next Step

Start from **Phase 0 (Project Setup)**. After completion, proceed to **Phases 1 and 2 in parallel**.
