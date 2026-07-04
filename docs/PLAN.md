# Implementation Plan — Time Tracker

> **وضعیت سند:** Draft v1.0 · آخرین به‌روزرسانی: ۲۰۲۶-۰۷-۰۴
> **مرجع:** `docs/SPECIFICATION.md` برای مشخصات کامل. این سند برنامه‌ی **چگونگی** پیاده‌سازی است.
> زبان: فارسی (اصلی)؛ اصطلاحات فنی به انگلیسی.

---

## ۰. اصول راهنما (Guiding Principles)

- **سیلانی (Incremental):** هر فاز به‌صورت مستقل قابل تست است و ارزش قابل نمایشی دارد.
- **MVP اول:** قبل از UI گرافیکی، موتور پشت‌صحنه (tracking + categorization) کامل و تست‌پذیر باشد.
- **پلتفرم-آگنوستیک اول:** ابتدا اینترفیس واحد، بعد بک‌اند‌های پلتفرم-خاص.
- **تست در هر فاز:** هر فاز با unit/integration test‌های معنی‌دار تحویل شود.
- **مرجع یکپارچه:** SPECIFICATION.md «چه» و این سند «چگونه» است. در صورت تناقض، SPECIFICATION ملاک است.

---

## ۱. نقشه‌ی فازها (Phase Roadmap)

| فاز | نام | خروجی قابل‌مشاهده | وابسته به |
|---|---|---|---|
| ۰ | راه‌اندازی پروژه | ساختار پوشه + `pyproject.toml` + lint/test سبز | — |
| ۱ | Config + DB | کانفیگ بارگذاری می‌شود + schema SQLite ساخته می‌شود | ۰ |
| ۲ | لایه‌ی پلتفرم | `get_active_window()` روی ویندوز/X11 کار می‌کند | ۰ |
| ۳ | Sampler + Categorizer | فعالیت‌ها در DB ثبت می‌شوند (**MVP پشت‌صحنه**) | ۱، ۲ |
| ۴ | اسکرین‌شات + Retention | عکس‌ها روی دیسک ذخیره می‌شوند | ۲، ۳ |
| ۵ | FastAPI | API از داده‌ی واقعی نمودار می‌دهد (curl قابل بررسی) | ۳ |
| ۶ | Recompute Worker | تغییر rule → باز‌دسته‌بندی کل تاریخ | ۳ |
| ۷ | Angular داشبورد | داشبورد در مرورگر کار می‌کند | ۵ |
| ۸ | Qt UI + یکپارچه‌سازی | اپ کامل از tray تا داشبورد | ۳، ۴، ۵، ۶، ۷ |
| ۹ | بسته‌بندی | executable ویندوز + لینوکس | ۸ |

### نقاط تأیید (Milestones)
- 🎯 **M1 (پس از فاز ۳):** خط فرمان می‌تواند activities را در DB ثبت کند (بدون UI).
- 🎯 **M2 (پس از فاز ۵):** API داده‌ی واقعی را در قالب JSON نمودار برمی‌گرداند.
- 🎯 **M3 (پس از فاز ۸):** اپ کامل از tray تا داشبورد کار می‌کند.

---

## فاز ۰ — راه‌اندازی پروژه

### اهداف
ساخت اسکلت پروژه با تمام ابزارهای توسعه‌ی آماده.

### وظایف
1. ساخت ساختار پوشه‌ها طبق SPECIFICATION بخش ۹.
2. ایجاد `pyproject.toml` با:
   - متادیتای پروژه (نام، نسخه، Python ≥3.11).
   - وابستگی‌های اصلی (از SPECIFICATION بخش ۱۰).
   - وابستگی‌های dev: `pytest`, `pytest-asyncio`, `ruff`, `black`, `mypy`, `pyinstaller`.
   - اختیاری‌های پلتفرم-خاص (python-xlib, pywin32, dbus-python) با markers مناسب.
   - configهای `ruff`, `black`, `mypy` در همان فایل.
3. ایجاد `config.example.toml` (طبق SPECIFICATION بخش ۶).
4. ایجاد `src/timetracker/__init__.py` و بقیه‌ی `__init__.py`‌ها.
5. ایجاد `tests/__init__.py` و یک تست نمونه (smoke test).
6. ایجاد `.gitignore` (شامل `__pycache__/`, `.venv/`, `*.db`, `screenshots/`, `dashboard/dist/`, `dashboard/node_modules/`).

### خروجی‌ها (Deliverables)
- `pyproject.toml` کامل.
- `config.example.toml`.
- ساختار پوشه‌ی خالی با `__init__.py`‌ها.
- `ruff check .` و `pytest` بدون خطا (با تست دودی).

### معیار تأیید (DoD)
- `pip install -e ".[dev]"` بدون خطا.
- `pytest` سبز.
- `ruff check .` بدون خطا.

---

## فاز ۱ — Config + DB

### اهداف
لایه‌ی پایداری داده و بارگذاری کانفیگ.

### وظایف
1. **`config.py`**:
   - مدل‌های Pydantic برای کانفیگ (`SamplingConfig`, `StorageConfig`, `UIConfig`, `RuleConfig`, `ScreenshotExclusion`).
   - `load_config(path: Path) -> Config`: خواندن TOML با `tomllib`، validation با Pydantic.
   - `save_config(path: Path, config: Config)`: serialize به TOML.
   - مقادیر پیش‌فرض در صورت نبود فایل (ساخت خودکار در `~/.timetracker/config.toml`).
   - گسترش مسیرهای `~` با `Path.expanduser()`.
2. **`db/models.py`** (SQLModel):
   - `Activity`، `Screenshot`، `Category`، `Rule`، `Meta` مطابق SPECIFICATION بخش ۵.
3. **`db/session.py`**:
   - `create_engine(url)`: SQLite با `connect_args={"check_same_thread": False}` (چون چند thread استفاده می‌شود).
   - فعال‌سازی **WAL mode**: `PRAGMA journal_mode=WAL` و `PRAGMA synchronous=NORMAL` هنگام اتصال.
   - `get_session()` dependency برای FastAPI.
4. **`db/migrations.py`**:
   - `init_db()`: `SQLModel.metadata.create_all()` + ساخت ایندکس‌ها.
   - `seed_rules_from_config(config)`: همگام‌سازی اولیه‌ی rules از کانفیگ به جداول `categories`/`rules` (تنها اگر DB خالی است یا با flag `--reseed-rules`).
   - `seed_meta_defaults()`: مقداردهی اولیه `meta.rule_version = 1`.
5. **`db/seed_categories.py`** (یا تابعی در migrations):
   - seed کتگوری‌های سیستمی `Idle` و `Uncategorized` با رنگ‌های ثابت.

### خروجی‌ها
- ماژول‌های `config.py`, `db/models.py`, `db/session.py`, `db/migrations.py`.
- تست‌های واحد:
  - بارگذاری کانفیگ از فایل نمونه.
  - ساخت schema + درج/خواندن یک activity.
  - seed rules از کانفیگ.

### معیار تأیید
- اسکریپت کوتاه (یا تست) که کانفیگ را بارگذاری، DB را init، و چند activity درج/بازخوانی کند.

---

## فاز ۲ — لایه‌ی پلتفرم

### اهداف
اینترفیس واحد و بک‌اند‌های پلتفرم-خاص برای تشخیص پنجره و اسکرین‌شات.

### وظایف
1. **`platform/base.py`**:
   - `@dataclass WindowInfo(process: str | None, title: str | None)`.
   - `class ScreenshotQuality(str, Enum)`: `LOW` (max_width=800, jpeg_quality=30)، `MEDIUM` (1280, 60)، `HIGH` (1920, 85).
   - `class PlatformBackend(Protocol)`:
     - `get_active_window() -> WindowInfo | None`
     - `capture_active_window(quality: ScreenshotQuality) -> bytes | None`
2. **`platform/windows.py`**:
   - `get_active_window`: `GetForegroundWindow` (ctypes) + `GetWindowTextW` + `GetWindowThreadProcessId` → `psutil.Process(pid).name()`.
   - `capture_active_window`: گرفتن مستقیم HWND با `BitBlt` یا fallback به `mss` با برش منطقه‌ی پنجره (`GetWindowRect`).
   - فشرده‌سازی JPEG با Pillow طبق `quality`.
3. **`platform/linux_x11.py`**:
   - `get_active_window`: `python-xlib` با EWMH:
     - `_NET_ACTIVE_WINDOW` از root → window.
     - `_NET_WM_NAME` برای title.
     - `_NET_WM_PID` برای pid → `psutil.Process(pid).name()`.
   - `capture_active_window`: `mss` با منطقه‌ی پنجره (`_NET_WM_GEOMETRY` یا `get_geometry`) یا grab با Xlib.
4. **`platform/linux_wayland.py`** (KDE Plasma 6 — پشتیبانی کامل):
   - `get_active_window`: DBus call به `org.kde.KWin`:
     - `KWin.activeWindow` → window object.
     - از window: خواندن `title`, `pid` (→ `psutil.Process(pid).name()`), `geometry` (برای `capture_active_window`).
   - `capture_active_window`: DBus call به `org.kde.KWin`:
     - `KWin.screenshotArea(x, y, w, h)` با مختصات `geometry` پنجره‌ی فعال (بدون تأیید کاربر).
     - فشرده‌سازی JPEG با Pillow طبق `quality`.
   - **Fallback:** اگر `screenshotArea` در دسترس نبود → `KWin.screenshotFullScreen` + برش با Pillow.
   - **در صورت نبود KWin:** لاگ هشدار + raise `NotImplementedError`.
5. **`platform/factory.py`**:
   - `get_backend() -> PlatformBackend`:
     - `sys.platform == "win32"` → `WindowsBackend`.
     - لینوکس + `WAYLAND_DISPLAY` موجود + `KDE_FULL_SESSION` و KWin روی DBus → `WaylandBackend`.
     - لینوکس + `DISPLAY` → `X11Backend`.
     - در غیر این صورت → raise `RuntimeError`.

### خروجی‌ها
- چهار ماژول در `platform/`.
- تست‌ها با **mock** (با patch کردن توابع Win32/Xlib/DBus) برای تأیید یکسان بودن contract.

### معیار تأیید
- اسکریپت دستی روی هر پلتفرم: چاپ کردن `get_active_window()` هر ۲ ثانیه (بدون ذخیره‌سازی).

---

## فاز ۳ — Sampler (Event-based) + Categorizer  ← **M1**

### اهداف
قلب اپ: تشخیص تغییر پنجره و ثبت activities در DB.

### وظایف
1. **`tracking/categorizer.py`**:
   - `class Categorizer`:
     - `__init__`: بارگذاری rules و categories از DB، کامپایل regexها با `re.compile(..., re.IGNORECASE)`.
     - `categorize(process: str | None, title: str | None) -> str`: اعمال منطق OR/AND/priority.
     - `reload()`: بارگذاری مجدد rules (زمانی که rules تغییر می‌کنند).
     - **مدیریت خطا:** regex نامعتبر → لاگ + نادیده گرفتن آن rule (نه کرش).
   - کش کردن compiled regexها برای کارایی.
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
       _close_activity(current_activity)  # در هنگام stop
       ```
     - `_changed(info, activity)`: مقایسه‌ی `process` و `title`.
     - `_open_activity(info)`: categorize + درج activity با `rule_version` فعلی.
     - **Idle handling:** اگر `info is None`، activity با `process=None, category="Idle"`.
   - **نکته‌ی threading:** هر thread باید session خودش را داشته باشد (SQLModel sessions thread-safe نیستند).

### خروجی‌ها
- `categorizer.py` و `sampler.py`.
- تست‌های واحد:
  - Categorizer: دنباله‌ای از `(process, title)` → بررسی دسته‌ی خروجی با rules نمونه.
  - Sampler: شبیه‌سازی دنباله‌ای از `WindowInfo` با mock backend → بررسی activity‌های تولیدشده، `duration_sec`، و دسته‌بندی.

### معیار تأیید (M1)
- یک اسکریپت/CLI که sampler را برای ۳۰ ثانیه اجرا می‌کند، سپس محتویات جدول `activities` را چاپ می‌کند. باید بازه‌های معقول با `duration_sec` صحیح دیده شود.

---

## فاز ۴ — اسکرین‌شات + Retention

### اهداف
گرفتن عکس دوره‌ای از پنجره‌ی فعال + پاکسازی خودکار.

### وظایف
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
     - `_is_excluded(info, exclusions)`: تطبیق regex روی process/title.
     - `_save_screenshot(bytes)`: تولید نام فایل (طبق SPECIFICATION بخش FR-5)، نوشتن فایل، درج رکورد در `screenshots` با `activity_id` رکورد باز فعلی.
   - **لینک به activity جاری:** کوئری activity با `end_ts IS NULL` ORDER BY `start_ts DESC LIMIT 1`.
2. **`screenshots/retention.py`**:
   - `class RetentionWorker(threading.Thread)`:
     - `__init__(session_factory, retention_days, interval=3600, stop_event)`.
     - `run()`:
       ```python
       while not stop_event.is_set():
           _purge_old_screenshots(retention_days)
           stop_event.wait(interval)
       ```
     - `_purge_old_screenshots`: کوئری screenshots قدیمی → حذف فایل → حذف رکورد DB.

### خروجی‌ها
- `capture.py` و `retention.py`.
- تست‌ها:
  - فشرده‌سازی در سطوح کیفیت مختلف (بررسی حداکثر عرض و حجم نسبی).
  - رفتار exclusion (عدم ذخیره‌سازی برای پروسس‌های مستثنی).
  - retention (حذف فایل و رکورد پس از N روز با استفاده از clock mock).

### معیار تأیید
- اجرای موقت capture برای ۳۰ ثانیه → بررسی ایجاد فایل‌های JPEG و رکوردهای DB.

---

## فاز ۵ — FastAPI  ← **M2**

### اهداف
API برای تغذیه‌ی داشبورد.

### وظایف
1. **`api/deps.py`**:
   - `get_session()`: generator yielding SQLModel session.
   - `get_config()`: برگرداندن کانفیگ فعلی.
   - `get_categorizer()`: نمونه‌ی مشترک categorizer (با reload هنگام تغییر rules).
2. **`api/server.py`**:
   - ساخت `FastAPI`.
   - mount کردن فایل‌های static (Angular build در `dashboard/dist/`) در `/`.
   - CORS محدود به `localhost`.
   - endpoint `/api/health` برای sanity check.
3. **`api/routes/stats.py`**:
   - `GET /stats/summary?start=&end=`: aggregate کل مدت بر دسته.
   - `GET /stats/timeline?start=&end=&bucket=hour|day`: داده‌ی تایم‌لاین (GROUP BY bucket و category، SUM(duration_sec)).
   - `GET /stats/breakdown?start=&end=`: تفکیک زمان بر دسته.
   - **کوئری‌های aggregate با SQL** (نه Python-side):
     ```sql
     SELECT category, SUM(duration_sec) AS total
     FROM activities
     WHERE start_ts >= :start AND end_ts <= :end
     GROUP BY category
     ORDER BY total DESC;
     ```
   - **فعالیت باز:** در کوئری، رکورد `end_ts IS NULL` با `duration_sec = EXTRACT(epoch FROM now() - start_ts)` لحاظ شود.
4. **`api/routes/rules.py`** و **`categories.py`**:
   - CRUD کامل. هنگام تغییر: `meta.rule_version += 1` و trigger recompute (با ارسال سیگنال به recompute worker).
   - `POST /rules/test`: اعمال regex روی فعالیت‌های اخیر یا نمونه‌ی فرضی.
5. **`api/routes/screenshots.py`**:
   - `GET /screenshots?start=&end=&page=`: صفحه‌بندی.
   - `GET /screenshots/{id}/file`: `FileResponse` با JPEG.
6. **`api/routes/config.py`**:
   - `GET /config` و `PUT /config` (با اعمال تغییرات در حافظه و ذخیره‌ی فایل TOML).
7. **`api/routes/tracking.py`**:
   - `GET /status`: وضعیت tracking، uptime، تعداد activities/screenshots.
   - `POST /tracking/start` و `/tracking/stop`: تنظیم `stop_event` sampler و screenshot.

### خروجی‌ها
- ماژول‌های API.
- تست با `fastapi.testclient.TestClient`: بررسی aggregate با داده‌ی seed شده.

### معیار تأیید (M2)
- `curl http://localhost:<port>/api/stats/breakdown?start=...&end=...` خروجی JSON معتبر.

---

## فاز ۶ — Recompute Worker

### اهداف
باز‌دسته‌بندی خودکار هنگام تغییر rules.

### وظایف
1. **`tracking/recompute.py`**:
   - `class RecomputeWorker(threading.Thread)`:
     - `__init__(session_factory, categorizer, stop_event, trigger_event)`.
     - `run()`:
       ```python
       while not stop_event.is_set():
           if trigger_event.wait(timeout=60):   # صبر برای سیگنال تغییر rule
               trigger_event.clear()
               _recompute_all()
       ```
     - `_recompute_all()`:
       - خواندن `current_version` از `meta`.
       - حلقه بر چانک‌ها (۱۰۰۰ ردیف):
         ```sql
         SELECT id, process, title FROM activities
         WHERE rule_version < :current_version
         LIMIT 1000 OFFSET :offset;
         ```
       - برای هر ردیف: `category = categorizer.categorize(process, title)`، آپدیت با `rule_version = current_version`.
       - **yield/sleep کوتاه** بین چانک‌ها (مثلاً ۱۰ms) برای جلوگیری از قفل‌کردن DB.
   - در پایان، emit یک notification (مثلاً روی یک `queue.Queue` که داشبورد poll می‌کند یا WebSocket در فاز ۷).

### خروجی‌ها
- `recompute.py`.
- تست: درج activities با rules قدیمی → تغییر rule → بررسی باز‌دسته‌بندی همه.

### معیار تأیید
- تغییر یک rule از طریق API → بررسی به‌روزرسانی `category` در جدول activities پس از چند ثانیه.

---

## فاز ۷ — Angular داشبورد

### اهداف
رابط کاربری وب برای داده‌ها و مدیریت rules.

### وظایف
1. **Scaffold**:
   - `ng new dashboard --standalone --style=css --routing`.
   - نصب `ngx-echarts`, `echarts`, `date-fns`, `tailwindcss`.
2. **`services/`**:
   - `StatsService`, `RulesService`, `CategoriesService`, `ScreenshotsService`, `ConfigService`, `TrackingService` — wrappers با `HttpClient` به `/api/*`.
3. **مدل‌های TypeScript** (`models/`):
   - interfaceهای منطبق با schema API (`Activity`, `Category`, `Rule`, `Screenshot`, `Config`, `StatsSummary`, ...).
4. **صفحات**:
   - **Overview**: date-range picker (امروز/دیروز/هفته/ماه/custom) + Pie/Donut + Timeline (با dataZoom).
   - **Categories**: لیست کتگوری‌ها و ruleها، فرم افزودن/ویرایش، **تست زنده‌ی regex** (نمایش فعالیت‌های اخیری که مچ می‌شوند).
   - **Screenshots**: گالری با lazy-load، فیلتر بازه و دسته، lightbox.
   - **Settings**: فرم ویرایش کانفیگ + ذخیره.
5. **Build**:
   - `ng build --output-path ../src/timetracker/api/static` (یا مسیر مشترک) → فایل‌های static که FastAPI سرو می‌کند.

### خروجی‌ها
- پروژه‌ی Angular کامل در `dashboard/`.
- بررسی دستی در مرورگر (پس از `ng build` و اجرای FastAPI).

### معیار تأیید
- باز کردن `http://localhost:<port>/` در مرورگر و مشاهده‌ی نمودارها و ویرایش rules.

---

## فاز ۸ — Qt UI + یکپارچه‌سازی  ← **M3**

### اهداف
چسباندن همه‌چیز زیر یک اپ دسکتاپ با tray و داشبورد embed شده.

### وظایف
1. **`ui/tray.py`**:
   - `class TrayController`:
     - `QSystemTrayIcon` با آیکون وضعیت (tracking فعال/غیرفعال).
     - context menu: Toggle Tracking، Open Dashboard، Settings، Quit.
     - `showMessage` برای notification‌ها (مثلاً پایان recompute).
2. **`ui/dashboard_window.py`**:
   - `class DashboardWindow(QMainWindow)`:
     - `QWebEngineView` در مرکز، بارگذاری `http://localhost:<port>/`.
     - حداقل اندازه و عنوان مناسب.
3. **`__main__.py`**:
   - ساخت `QApplication`.
   - بارگذاری کانفیگ + init DB (مهاجرت + seed).
   - تشخیص بک‌اند پلتفرم با `factory.get_backend()`.
   - **بستن رکوردهای باز از جلسه‌ی قبلی** (NFR-4): `UPDATE activities SET end_ts = <startup_time>, duration_sec = ... WHERE end_ts IS NULL`.
   - راه‌اندازی threadها: Sampler، ScreenshotCapture، RetentionWorker، RecomputeWorker.
   - راه‌اندازی FastAPI در یک thread (با `uvicorn.Server` و `uvicorn.Config`).
   - ساخت TrayController و (اگر کانفیگ بگوید) DashboardWindow.
   - اتصال سیگنال تغییر rule به `trigger_event` recompute worker.
   - **Shutdown تمیز**: set `stop_event`ها، join threadها با timeout، `app.exec()` پایان.

### خروجی‌ها
- `tray.py`, `dashboard_window.py`, `__main__.py`.
- تست integration: راه‌اندازی کامل، تولید داده، بررسی نمودار از طریق API.

### معیار تأیید (M3)
- اجرای `python -m timetracker` → آیکون tray ظاهر می‌شود → باز کردن داشبورد → مشاهده‌ی داده‌های لحظه‌ای.

---

## فاز ۹ — بسته‌بندی

### اهداف
توزیع به‌صورت executable مستقل.

### وظایف
1. **PyInstaller spec**:
   - ورودی: `src/timetracker/__main__.py`.
   - `--onedir` (سریع‌تر startup از `--onefile`).
   - باندل: PySide6 (شامل QWebEngine)، Angular build (در مسیر static).
   - `--collect-all PySide6` و `--collect-all shiboken6`.
   - hidden imports برای backend‌های پلتفرم.
2. **اسکریپت build**:
   - `scripts/build.sh` (لینوکس) و `scripts/build.ps1` (ویندوز).
   - ابتدا `ng build`، سپس `pyinstaller`.
3. **README**:
   - راهنمای نصب از سورس و از executable.
   - توضیح پیش‌نیازهای Wayland (KDE Plasma 6 + `kde-cli-tools`).
   - راهنمای پیکربندی اولیه.

### خروجی‌ها
- `timetracker.spec`، اسکریپت‌های build، README گسترش‌یافته.
- executable تست‌شده روی ویندوز و لینوکس.

### معیار تأیید
- executable روی یک سیستم تمیز (بدون Python) اجرا می‌شود و کار می‌کند.

---

## ۳. ترتیب اجرا و وابستگی‌ها

```
فاز ۰
  │
  ├──► فاز ۱ (Config+DB) ──────────────────────┐
  │                                              │
  └──► فاز ۲ (Platform) ──┐                      │
                           ▼                      │
                          فاز ۳ (Sampler) ◄───────┘
                           │
                           ├──► فاز ۴ (Screenshot)
                           │
                           ├──► فاز ۵ (API)
                           │        │
                           │        ▼
                           │    فاز ۷ (Angular)
                           │
                           └──► فاز ۶ (Recompute)
                                    │
                                    ▼
                          فاز ۸ (Qt UI) ◄── فاز ۴، ۵، ۶، ۷
                                    │
                                    ▼
                              فاز ۹ (Packaging)
```

**مسیر بحرانی:** ۰ → ۱ → ۳ → ۵ → ۷ → ۸ → ۹.

**موازی‌سازی ممکن:**
- فاز ۱ و ۲ موازی (هر دو فقط به فاز ۰ وابسته‌اند).
- فاز ۴ و ۶ موازی پس از فاز ۳.
- فاز ۷ می‌تواند با فاز ۶ موازی شروع شود (با mock API).

---

## ۴. ریسک‌های پیاده‌سازی و کاهش

| ریسک | فاز(های) تحت تأثیر | کاهش |
|---|---|---|
| Wayland API محدود به KDE/KWin است | ۲ | Factory بررسی کند آیا `KDE_FULL_SESSION` و `org.kde.KWin` روی DBus موجود است؛ در غیر این صورت fallback به X11 یا raise `RuntimeError`. |
| SQLAlchemy/SQLModel thread safety | ۳، ۴، ۶ | هر thread session مستقل؛ استفاده از `sessionmaker`. |
| QWebEngineView سنگین است در PyInstaller | ۹ | استفاده از `--collect-all` و تست باندل. |
| regex کاربر باعث ReDoS می‌شود | ۳، ۶ | timeout روی `re` (یا استفاده از `regex` module با `timeout`). |
| همگام‌سازی تغییر کانفیگ بین threadها | ۸ | یک صف تغییر کانفیگ + reload امن در هر worker. |
| حجم تست داده‌ی واقعی پلتفرم | ۲، ۳ | mock-backend قوی + تست integration فقط روی CI. |

---

## ۵. تصمیمات طراحی کلیدی (Log)

| تصمیم | تاریخ | دلیل |
|---|---|---|
| Event-based sampling (نه polling ثابت) | ۲۰۲۶-۰۷-۰۴ | درخواست کاربر: تشخیص خودکار تغییر پنجره، فقط ثبت تغییرات. |
| ذخیره‌ی category در activities + recompute | ۲۰۲۶-۰۷-۰۴ | درخواست کاربر: تغییر آنی regex باید کل تاریخ را باز‌دسته‌بندی کند؛ recompute سبک به‌خاطر حجم کم داده. |
| SQLite (نه Postgres) به‌عنوان دیفالت | ۲۰۲۶-۰۷-۰۴ | با مدل recompute، regex در زمان نوشتن (Python) اجرا می‌شود؛ مزیت Postgres از بین رفت. لایه‌ی abstraction برای سوییچ آینده. |
| PySide6 به‌جای PyQt6 | ۲۰۲۶-۰۷-۰۴ | لایسنس LGPL (رسمی Qt)، مناسب‌تر برای پروژه. |
| Angular در QWebEngineView | ۲۰۲۶-۰۷-۰۴ | درخواست کاربر: داشبورد یکپارچه داخل خود اپ. |

---

## ۶. گام بعدی

شروع از **فاز ۰ (راه‌اندازی پروژه)**. پس از تکمیل آن، ادامه به **فاز ۱ و ۲ به‌صورت موازی**.
