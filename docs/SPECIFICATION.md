# Project Specification — Time Tracker

> **وضعیت سند:** Draft v1.0 · آخرین به‌روزرسانی: ۲۰۲۶-۰۷-۰۴
> **زبان:** فارسی (اصلی)؛ اصطلاحات فنی به انگلیسی Где که رایج‌اند.

---

## ۱. مرور کلی (Overview)

یک تایم‌ترکر دسکتاپی **کراس‌پلتفرم** که فعالیت کاربر را روی رایانه به‌صورت **event-based** ضبط می‌کند: تنها هنگام **تعویض پنجره‌ی فعال** یک رکورد ثبت می‌شود (نه polling نقطه‌ای در فواصل ثابت). این设计 حجم داده‌ها را به‌شدت کاهش می‌دهد و امکان باز‌دسته‌بندی (recompute) سبک کل تاریخ را فراهم می‌کند.

دسته‌بندی فعالیت‌ها با **regex** انجام می‌شود و **قابل تغییر آنی** است: کاربر هر لحظه می‌تواند کتگوری‌ها و الگوهای regex را افزود/ویرایش/حذف کند و کل تاریخچه به‌طور خودکار باز‌دسته‌بندی شود. نمودار مصرف در بازه‌های مختلف (روز/هفته/ماه/بازه دلخواه) ارائه می‌شود و هر ۱۰ ثانیه از پنجره‌ی فعال اسکرین‌شات با کیفیت قابل تنظیم گرفته می‌شود.

### اهداف اصلی
- پشتیبانی از **ویندوز** و **لینوکس** (حداقل KDE Plasma).
- ضبط خودکار و کم‌حجم بر اساس تغییر پنجره (نه sampling ثابت).
- دسته‌بندی انعطاف‌پذیر و **قابل بازنگری** با regex.
- نمایش بصری داده‌ها در بازه‌های زمانی مختلف.
- اسکرین‌شات دوره‌ای با مدیریت ذخیره‌سازی و حریم خصوصی.

### مخاطب و الگوی استفاده
اپلیکیشن **تک‌کاربره‌ی شخصی** است که روی دستگاه خود کاربر اجرا می‌شود. تمام داده‌ها به‌صورت **محلی** ذخیره می‌شوند و هیچ ارسالی به شبکه صورت نمی‌گیرد (جز پورت `localhost` برای داشبورد).

---

## ۲. الزامات عملیاتی (Functional Requirements)

### FR-1 — تشخیص پنجره‌ی فعال (Event-based)
- اپ هر **۱–۲ ثانیه** (قابل پیکربندی) پنجره‌ی فعال را **فقط برای تشخیص تغییر** poll می‌کند. تا زمانی که `process` و `title` ثابت‌اند، **هیچ رکوردی** ثبت نمی‌شود.
- هنگام تغییر پنجره از `A` به `B`:
  1. رکورد `A` بسته می‌شود: `end_ts = now` و `duration_sec = end_ts − start_ts` محاسبه و ذخیره می‌شود.
  2. رکورد جدید `B` باز می‌شود: `start_ts = now` و `end_ts = NULL` (نشان‌گر «در حال انجام»).
- **همیشه دقیقاً یک رکورد باز (open-ended)** وجود دارد — آخرین فعالیتی که کاربر در حال انجام آن است.
- در غیاب پنجره‌ی فعال (مثلاً دسکتاپ فوکوس شده، صفحه‌ی قفل، یا عدم دسترسی)، یک رکورد با `process = NULL` و `category = "Idle"` ثبت می‌شود.
- **جهت‌گیری حساس به تغییر (Change detection):** دو پنجره یکسان تلقی می‌شوند اگر و فقط اگر هم `process` و هم `title` یکسان باشند.

### FR-2 — دسته‌بندی با regex
- داده‌ی دسته‌بندی در سه جدول ذخیره می‌شود:
  - `categories(id, name UNIQUE, color, priority, enabled)`
  - `rules(id, category_id FK, process_regex NULL, title_regex NULL)`
- **ساختار منطق تطبیق:**
  - هر کتگوری می‌تواند **چند rule** داشته باشد → بین ruleهای یک کتگوری **OR** برقرار است (هرکدام مچ شود، کتگوری مچ شده).
  - داخل یک rule، `process_regex` و `title_regex` باید **هر دو** مچ شوند (AND). اگر یکی `NULL` باشد، آن شرط نادیده گرفته می‌شود (یعنی فقط شرط دیگر معتبر است).
- **اولویت کتگوری‌ها:** کتگوری‌ها بر اساس `priority` مرتب می‌شوند؛ **اولین کتگوری مچ‌شده برنده است**.
- **رفتار پیش‌فرض:** فعالیت‌هایی که با هیچ کتگوری مچ نشوند، `category = "Uncategorized"` می‌گیرند.
- تمام regexها **case-insensitive** اعمال می‌شوند (در Python با `re.IGNORECASE`).
- **ذخیره‌سازی دسته:** مقدار `category` هنگام درج در ستون `activities.category` ذخیره می‌شود (نمودارها از این ستون می‌خوانند → سریع). باز‌دسته‌بندی از طریق FR-3 انجام می‌شود.

### FR-3 — باز‌دسته‌بندی خودکار (Recompute)
- هر activity یک `rule_version` دارد (نسخه‌ی rules هنگام دسته‌بندی آن رکورد).
- هنگام **افزودن/ویرایش/حذف rule**، تغییر `priority` یک کتگوری، یا فعال/غیرفعال‌کردن کتگوری، مقدار `meta.rule_version` در جدول `meta` **increment** می‌شود.
- یک **background worker چانک‌چانک** (هر بسته ۱۰۰۰ ردیف، با yield بین بسته‌ها برای جلوگیری از قفل‌کردن DB) تنها activityهایی که `rule_version < current_rule_version` را باز‌دسته‌بندی می‌کند.
- **رفتار در حین recompute:** نمودارها از ستون `category` می‌خوانند که ممکن است موقتاً حاوی دسته‌ی قدیمی باشد. این رفتار **پذیرفته‌شده** است، چون regexها نادرتاً تغییر می‌کنند و با مدل event-based تعداد ردیف‌ها کم است (ده‌ها هزار در سال) → recompute کل تاریخ چند ثانیه طول می‌کشد.
- پس از پایان recompute، یک notification در داشبورد نمایش داده می‌شود («داده‌ها به‌روزرسانی شد»).

### FR-4 — نمودار مصرف
- داشبورد بتواند زمان صرف‌شده در هر دسته را در بازه‌های زیر نمایش دهد:
  - **امروز**، **دیروز**.
  - **هفته‌ی جاری / هفته‌ی گذشته**.
  - **ماه جاری / ماه گذشته**.
  - **بازه دلخواه** با انتخاب تاریخ شروع و پایان.
- **انواع نمودار:**
  - **Pie / Donut**: سهم کلی هر دسته در بازه‌ی انتخابی.
  - **Timeline / Stacked Bar**: توزیع فعالیت‌ها در طول روز (محور افقی = زمان با قابلیت zoom/brush).
- مدت زمان هر فعالیت از ستون `activities.duration_sec` خوانده می‌شود (محاسبه‌شده هنگام بسته شدن رکورد، طبق FR-1).
- **فعالیت باز (open-ended):** رکوردی که `end_ts = NULL` است، در نمودار با `now − start_ts` به‌عنوان مدت برآوردی لحاظ می‌شود (با علامت «zنده» یا برچسب «در حال انجام»).
- اعداد به‌صورت خوانا نمایش داده شوند (مثلاً «۱ ساعت ۲۳ دقیقه» نه «۵۰۴۰ ثانیه»).

### FR-5 — اسکرین‌شات دوره‌ای
- هر **۱۰ ثانیه** (قابل پیکربندی) از **پنجره‌ی فعال** اسکرین‌شات گرفته می‌شود.
- **سطوح کیفیت** (قابل پیکربندی):
  | سطح | حداکثر عرض (px) | JPEG quality |
  |---|---|---|
  | `low` (پیش‌فرض) | 800 | 30 |
  | `medium` | 1280 | 60 |
  | `high` | 1920 | 85 |
  - اگر عرض تصویر اصلی از حداکثر عرض بیشتر باشد، تصویر با حفظ نسبت ابعاد کوچک (resize) می‌شود.
- فرمت ذخیره‌سازی: **JPEG** روی دیسک؛ در دیتابیس فقط مسیر فایل ثبت می‌شود.
- نام‌گذاری فایل: `screenshots/YYYY/MM/DD-HHMMSS-<short_id>.jpg`.
- **لیست استثنا (`screenshot_exclusions`):** اگر `process` یا `title` پنجره‌ی فعال با هر کدام از الگوهای استثنا مچ شود، از آن عکس گرفته **نمی‌شود** (اما activity همچنان ثبت می‌شود).
- در صورت خطا در گرفتن عکس (مثلاً پنجره بسته شد، عدم دسترسی)، خطا **لاگ** شود و روند متوقف **نشود**.
- هر اسکرین‌شات به activity جاری (`end_ts IS NULL`) با ستون `screenshots.activity_id` لینک می‌شود.

### FR-6 — مدیریت ذخیره‌سازی (Retention)
- پاکسازی خودکار اسکرین‌شات‌های قدیمی‌تر از `retention_days` (پیش‌فرض: **۷ روز**).
- پاکسازی به‌صورت پس‌زمینه‌ای، **هر ساعت** اجرا شود.
- حذف شامل **هم فایل** و **هم رکورد DB** باشد.
- **فعالیت‌ها (activities) هرگز به‌صورت خودکار حذف نمی‌شوند** — تنها اسکرین‌شات‌ها مشمول retention هستند.

### FR-7 — رابط کاربری
- **System Tray Icon (PySide6 `QSystemTrayIcon`)**:
  - نمایش وضعیت: tracking فعال / غیرفعال (با تغییر آیکون).
  - شروع/توقف tracking.
  - باز کردن داشبورد.
  - دسترسی سریع به تنظیمات.
  - خروج از اپ.
- **داشبورد (Angular در `QWebEngineView`)** با چهار صفحه:
  1. **Overview**: انتخاب بازه + نمودار Pie + نمودار Timeline.
  2. **Categories**: مدیریت کتگوری‌ها و ruleها (CRUD) + **تست زنده‌ی regex** روی یک نمونه‌ی فرضی یا چند نمونه‌ی واقعی اخیر.
  3. **Screenshots**: گالری اسکرین‌شات‌ها با فیلتر بازه و دسته.
  4. **Settings**: ویرایش کانفیگ (فاصله‌ی sampling، کیفیت عکس، retention، مسیر ذخیره‌سازی، لیست استثنا).

### FR-8 — کانفیگ (TOML)
- کانفیگ در فایل `~/.timetracker/config.toml` ذخیره می‌شود.
- مقادیر قابل تغییر از طریق داشبورد باشند (با ذخیره‌ی مجدد فایل TOML).
- یک فایل `config.example.toml` در ریپو به‌عنوان قالب ارائه شود.
- در صورت نبود فایل کانفیگ، از **مقادیر پیش‌فرض** استفاده شود و فایل با این مقادیر ایجاد شود.
- **نکته درباره‌ی rules:** ruleهای موجود در `config.toml` **تنها در اولین اجرا** به جداول `categories`/`rules` همگام‌سازی می‌شوند (seed اولیه). پس از آن، مدیریت rules از طریق داشبورد (و در نهایت DB) انجام می‌شود تا تغییرات دستی کاربر در فایل کانفیگ با داده‌های DB تداخل نکند. یک گزینه‌ی `--reseed-rules` در CLI برای بازنویسی اجباری وجود دارد.

---

## ۳. الزامات غیرعملیاتی (Non-Functional Requirements)

### NFR-1 — سازگاری پلتفرم
| پلتفرم | سطح پشتیبانی |
|---|---|
| Windows 10/11 (x64) | **کامل** |
| Linux X11 (KDE Plasma) | **کامل** |
| Linux Wayland (KDE Plasma 6) | **کامل** (با KWin DBus API، بدون grim/portal) |
| macOS | خارج از اسکوپ v1 |

### NFR-2 — کارایی
- مصرف CPU در حالت idle (صرفاً polling تشخیص تغییر) کمتر از **۲٪** روی سخت‌افزار معمولی.
- مصرف RAM کل اپ کمتر از **۳۰۰ مگابایت** (بدون احتساب داشبورد وب در QWebEngineView).
- گرفتن اسکرین‌شات + فشرده‌سازی کمتر از **۱ ثانیه**.
- نمونه‌برداری نباید روی تجربه‌ی کاربر سایر اپ‌ها اثر بگذارد.
- کوئری‌های aggregate نمودار روی بازه‌ی یک ماه باید در کمتر از **۲۰۰ میلی‌ثانیه** تکمیل شوند (با ایندکس مناسب).

### NFR-3 — حریم خصوصی
- تمام داده‌ها **صرفاً محلی** ذخیره می‌شوند؛ هیچ ارسالی به شبکه صورت نمی‌گیرد.
- تنها ارتباط شبکه‌ای: پورت `localhost` برای داشبورد (به FastAPI).
- **لیست استثنا** برای جلوگیری از عکس‌برداری از اپ‌های حساس (بانک، پیام‌رسان و...).
- اسکرین‌شات‌ها به‌صورت پیش‌فرض کیفیت پایین دارند.
- هیچ telemetry/analytics خارجی وجود ندارد.

### NFR-4 — قابلیت اطمینان
- در صورت بسته شدن ناگهانی اپ، داده‌های قبلی نباید آسیب ببینند (استفاده از تراکنش SQLite + WAL mode).
- **رفتار هنگام راه‌اندازی مجدد:** اگر رکوردی با `end_ts = NULL` از جلسه‌ی قبلی باقی مانده باشد، هنگام startup به‌صورت خودکار با `end_ts = last_shutdown_estimate` بسته شود (یا با زمان شروع جلسه‌ی جدید).
- خطاهای پلتفرم (مثلاً عدم دسترسی به پنجره، شکست در اسکرین‌شات) نباید باعث کرش اپ شوند؛ **لاگ** شوند و ادامه دهند.

### NFR-5 — بسته‌بندی و توزیع
- ارائه‌ی executable مستقل برای ویندوز (`.exe` یا نصب‌کننده) و لینوکس (AppImage یا tarball).
- وابستگی‌ها (از جمله Angular build و PySide6) تا حد امکان **باندل** شوند تا کاربر نیازی به نصب جداگانه نداشته باشد.
- اندازه‌ی بسته‌ی نهایی به دلیل embed کردن Chromium (QWebEngineView) انتظاراً **۸۰–۱۵۰ مگابایت** خواهد بود.

---

## ۴. معماری (Architecture)

### ۴.۱ — نمای کلی

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
│  │             (قابل سوییچ به Postgres با connection string)     │ │
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

### ۴.۲ — لایه‌ی پلتفرم (Platform Abstraction Layer)
یک **اینترفیس واحد** که هر بک‌اند پلتفرم آن را پیاده‌سازی می‌کند:

```python
@dataclass
class WindowInfo:
    process: str | None    # نام پروسس (مثلاً "code")؛ None اگر پنجره‌ای فعال نباشد
    title: str | None      # عنوان پنجره

class PlatformBackend(Protocol):
    def get_active_window(self) -> WindowInfo | None:
        """عنوان و نام پروسس پنجره‌ی فعال؛ None اگر پنجره‌ای فعال نباشد."""
        ...

    def capture_active_window(self, quality: "ScreenshotQuality") -> bytes | None:
        """اسکرین‌شات JPEG (بایت‌های خام) از پنجره‌ی فعال؛ None در صورت خطا."""
        ...
```

- **Windows**: `GetForegroundWindow` + `GetWindowText` + `GetWindowThreadProcessId` (با ctypes یا pywin32) و `psutil` برای نام پروسس؛ اسکرین‌شات با `BitBlt` یا `mss`.
- **Linux X11**: `python-xlib` با پروتکل EWMH (`_NET_ACTIVE_WINDOW`, `_NET_WM_PID`); اسکرین‌شات از پنجره‌ی خاص با Xlib یا `mss`.
- **Linux Wayland (KDE Plasma 6)**: DBus به `org.kde.KWin` برای پنجره‌ی فعال (`activeWindow` → title + `pid` → `psutil`)، هندسه‌ی پنجره (`geometry`)، و اسکرین‌شات (`screenshotArea` / `screenshotWindow` بدون نیاز به تأیید کاربر).
- **Factory** (`platform/factory.py`): انتخاب خودکار بک‌اند بر اساس `sys.platform`، `WAYLAND_DISPLAY`، `KDE_FULL_SESSION` و وجود KWin روی DBus.

### ۴.۳ — حلقه‌ی اجرا و Threading
- **Main thread**: `QApplication` و event loop. تعامل کاربری، tray، پنجره‌ی داشبورد. (Qt **باید** در main thread باشد.)
- **Sampler thread**: حلقه‌ی `while running: info = get_active_window(); if changed: close_prev(); open_new(); sleep(poll_interval)`.
- **Screenshot thread**: حلقه‌ی `while running: capture(); sleep(screenshot_interval)`.
- **Recompute worker**: idle تا زمانی که تغییر rule شناسایی شود، سپس پردازش چانک‌چانک.
- **Retention worker**: هر ساعت اجرا می‌شود.
- **FastAPI thread**: اجرای `uvicorn` در یک thread جداگانه برای سرو API و فایل‌های static.
- هماهنگی بین threadها با `threading.Event` برای stop و یک صف/کانال برای اعمال تغییرات کانفیگ.

### ۴.۴ — دیتابیس
- **موتور**: SQLite با **WAL mode** برای همزمانی خواندن/نوشتن بدون قفل.
- **ORM**: SQLModel (روی SQLAlchemy) برای قابلیت تعویض به Postgres با تغییر connection string.
- **دلیل انتخاب SQLite:** چون دسته‌بندی در زمان نوشتن (توسط Python) انجام می‌شود، نیازی به regex بومی در سطح DB نیست؛ پس مزیت اصلی Postgres از بین می‌رود و SQLite برای اپ شخصی تک‌کاربره ساده‌تر است.

---

## ۵. مدل داده و ذخیره‌سازی

### ۵.۱ — جدول `activities` (قلب داده)
| ستون | نوع | توضیح |
|---|---|---|
| `id` | INTEGER PK | خودکار |
| `start_ts` | TEXT (ISO8601 UTC) | شروع فعالیت |
| `end_ts` | TEXT NULL | پایان؛ **NULL = در حال انجام** |
| `duration_sec` | INTEGER NULL | `end_ts − start_ts` (هنگام بستن محاسبه می‌شود) |
| `process` | TEXT | نام پروسس (NULL برای Idle) |
| `title` | TEXT | عنوان پنجره |
| `category` | TEXT | دسته‌ی ذخیره‌شده (recompute هنگام تغییر rule) |
| `rule_version` | INTEGER | نسخه‌ی rules هنگام دسته‌بندی |

**ایندکس‌ها:** `idx_activities_start_ts`, `idx_activities_category`, `idx_activities_rule_version`.

### ۵.۲ — جدول `screenshots`
| ستون | نوع | توضیح |
|---|---|---|
| `id` | INTEGER PK | خودکار |
| `activity_id` | INTEGER FK → activities | activity جاری هنگام عکس‌برداری |
| `timestamp` | TEXT (ISO8601 UTC) | زمان عکس‌برداری |
| `file_path` | TEXT | مسیر فایل JPEG روی دیسک |
| `file_size` | INTEGER | اندازه‌ی فایل به بایت |

**ایندکس‌ها:** `idx_screenshots_activity_id`, `idx_screenshots_timestamp`.

### ۵.۳ — جدول `categories`
| ستون | نوع | توضیح |
|---|---|---|
| `id` | INTEGER PK | خودکار |
| `name` | TEXT UNIQUE | نام دسته (مثلاً «کدنویسی») |
| `color` | TEXT | رنگ هگز (مثلاً `#4CAF50`) |
| `priority` | INTEGER | ترتیب تطبیق (کمتر = زودتر) |
| `enabled` | BOOLEAN | فعال/غیرفعال |

### ۵.۴ — جدول `rules`
| ستون | نوع | توضیح |
|---|---|---|
| `id` | INTEGER PK | خودکار |
| `category_id` | INTEGER FK → categories | کتگوری والد |
| `process_regex` | TEXT NULL | الگوی regex روی نام پروسس (NULL = نادیده) |
| `title_regex` | TEXT NULL | الگوی regex روی عنوان (NULL = نادیده) |

### ۵.۵ — جدول `meta`
| ستون | نوع | توضیح |
|---|---|---|
| `key` | TEXT PK | کلید (مثلاً `rule_version`) |
| `value` | TEXT | مقدار |

### ۵.۶ — مکان ذخیره‌سازی
- **دیتابیس:** `~/.timetracker/data.db`
- **اسکرین‌شات‌ها:** `~/.timetracker/screenshots/YYYY/MM/` با نام فایل `DD-HHMMSS-<short_id>.jpg`.
- تمام مسیرها در کانفیگ قابل تغییر باشند.

---

## ۶. فایل کانفیگ نمونه (`config.example.toml`)

```toml
[sampling]
poll_interval_sec       = 1        # فاصله‌ی poll برای تشخیص تغییر پنجره
screenshot_interval_sec = 10       # فاصله‌ی اسکرین‌شات
screenshot_quality      = "low"    # low | medium | high

[storage]
db_path        = "~/.timetracker/data.db"
screenshot_dir = "~/.timetracker/screenshots"
retention_days = 7

[ui]
open_dashboard_on_start = false

# این ruleها تنها در اولین اجرا به DB همگام‌سازی می‌شوند.
# ویرایش پس از آن از داشبورد انجام شود.
[[rules]]
name          = "کدنویسی"
process_regex = "code|jetbrains|cursor"
color         = "#4CAF50"

[[rules]]
name          = "مرورگر"
process_regex = "chrome|firefox|edge"
title_regex   = ".*"
color         = "#2196F3"

[[rules]]
name          = "ترمینال"
process_regex = "kitty|alacritty|konsole|wezterm"
color         = "#FF9800"

[[screenshot_exclusions]]
process_regex = "telegram|signal|whatsapp"

[[screenshot_exclusions]]
process_regex = ".*bank.*|.*paypal.*"
title_regex   = ".*"
```

---

## ۷. API (FastAPI روی `/api`)

همه‌ی endpointها روی `http://127.0.0.1:<port>/api`. پورت از کانفیگ یا تصادفی (0).

| روش | مسیر | توضیح |
|---|---|---|
| GET | `/api/stats/summary` | خلاصه‌ی بازه (قابل فیلتر با `?start=&end=`) |
| GET | `/api/stats/timeline` | داده‌ی تایم‌لاین دسته‌بندی‌شده (برای نمودار زمانی) |
| GET | `/api/stats/breakdown` | تفکیک زمان بر اساس دسته (برای نمودار Pie/Donut) |
| GET | `/api/categories` | لیست کتگوری‌ها |
| POST | `/api/categories` | افزودن کتگوری |
| PUT | `/api/categories/{id}` | ویرایش کتگوری |
| DELETE | `/api/categories/{id}` | حذف کتگوری |
| GET | `/api/rules` | لیست تمام ruleها |
| POST | `/api/rules` | افزودن rule |
| PUT | `/api/rules/{id}` | ویرایش rule |
| DELETE | `/api/rules/{id}` | حذف rule |
| POST | `/api/rules/test` | تست regex روی نمونه‌ی فرضی یا فعالیت‌های اخیر |
| GET | `/api/screenshots` | لیست اسکرین‌شات‌ها (فیلتر بازه، صفحه‌بندی) |
| GET | `/api/screenshots/{id}` | یک رکورد اسکرین‌شات |
| GET | `/api/screenshots/{id}/file` | خود فایل JPEG |
| GET | `/api/config` | کانفیگ فعلی |
| PUT | `/api/config` | به‌روزرسانی کانفیگ |
| GET | `/api/status` | وضعیت tracking (فعال/غیرفعال، uptime، آمار) |
| POST | `/api/tracking/start` | شروع tracking |
| POST | `/api/tracking/stop` | توقف tracking |
| GET | `/api/activities` | لیست فعالیت‌ها (فیلتر بازه + صفحه‌بندی؛ برای مرور/debug) |

---

## ۸. داشبورد (Angular)

- **فریم‌ورک:** Angular (latest stable)، **standalone components**.
- **نمودار:** **ECharts** با `ngx-echarts` (به‌خاطر قابلیت zoom/brush قوی روی محور زمان).
- **استایل:** Tailwind CSS (اختیاری ولی پیشنهادی).
- **بیلد:** `ng build` → فایل‌های static در `dashboard/dist/`، توسط FastAPI سرو می‌شوند.
- **ارتباط با بک‌اند:** `HttpClient` به `/api/*`.
- **صفحات اصلی:**
  1. **Overview**: انتخاب بازه (today/yesterday/week/month/custom) + نمودار Pie + نمودار Timeline.
  2. **Categories**: مدیریت کتگوری‌ها و ruleها (CRUD) + تست زنده‌ی regex.
  3. **Screenshots**: گالری با فیلتر بازه و دسته.
  4. **Settings**: ویرایش کانفیگ + تغییر مسیرها و کیفیت‌ها.

---

## ۹. ساختار پروژه

```
time-tracker/
├── pyproject.toml
├── README.md
├── config.example.toml
├── docs/
│   ├── SPECIFICATION.md        ← این فایل
│   └── PLAN.md                 ← برنامه‌ی پیاده‌سازی
├── src/timetracker/
│   ├── __init__.py
│   ├── __main__.py             # نقطه‌ی ورود: QApplication + threadها
│   ├── config.py               # بارگذاری/ذخیره‌ی کانفیگ + همگام‌سازی اولیه‌ی rules
│   ├── platform/
│   │   ├── __init__.py
│   │   ├── base.py             # PlatformBackend Protocol + WindowInfo
│   │   ├── windows.py          # بک‌اند ویندوز
│   │   ├── linux_x11.py        # بک‌اند X11
│   │   ├── linux_wayland.py    # بک‌اند Wayland (KDE KWin DBus)
│   │   └── factory.py          # انتخاب خودکار بک‌اند
│   ├── db/
│   │   ├── __init__.py
│   │   ├── models.py           # SQLModel: Activity, Screenshot, Category, Rule, Meta
│   │   ├── session.py          # engine + session factory (قابل تعویض)
│   │   └── migrations.py       # ساخت/به‌روزرسانی schema + ایندکس‌ها
│   ├── tracking/
│   │   ├── __init__.py
│   │   ├── sampler.py          # حلقه‌ی event-based sampling
│   │   ├── categorizer.py      # بارگذاری rules + تطبیق regex
│   │   └── recompute.py        # باز‌دسته‌بندی چانک‌چانک
│   ├── screenshots/
│   │   ├── __init__.py
│   │   ├── capture.py          # گرفتن + فشرده‌سازی + ذخیره
│   │   └── retention.py        # پاکسازی خودکار
│   ├── api/
│   │   ├── __init__.py
│   │   ├── server.py           # FastAPI app + static serving
│   │   ├── deps.py             # dependency injection
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
├── dashboard/                  # پروژه‌ی Angular
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
    ├── unit/                   # تست‌های واحد
    └── integration/            # تست‌های integration
```

---

## ۱۰. وابستگی‌ها (Dependencies)

### Python (`pyproject.toml`)
| پکیج | نسخه | کاربرد |
|---|---|---|
| `PySide6` | ≥6.6 | Qt UI، tray، QWebEngineView |
| `fastapi` | ≥0.110 | API بک‌اند |
| `uvicorn` | ≥0.27 | ASGI server برای FastAPI |
| `sqlmodel` | ≥0.0.16 | ORM (روی SQLAlchemy) |
| `pydantic` | ≥2.6 | validation کانفیگ و API |
| `psutil` | ≥5.9 | نام پروسس (کراس‌پلتفرم) |
| `Pillow` | ≥10 | فشرده‌سازی اسکرین‌شات |
| `mss` | ≥9 | اسکرین‌شات کراس‌پلتفرم |
| `python-xlib` | ≥0.33 | **فقط لینوکس/X11**: تشخیص پنجره |
| `pywin32` | ≥306 | **فقط ویندوز**: Win32 API |
| `dbus-python` | ≥1.3 | **فقط لینوکس**: DBus به KWin (Wayland + X11) |
| `regex` | ≥2024.x | regex پیشرفته (اختیاری) |

### Node.js / Angular
- Node.js ≥ 20 LTS، Angular CLI ≥ 18.
- `ngx-echarts`، `echarts`، `date-fns`، `tailwindcss` (اختیاری).

### ابزارهای توسعه
- `pytest`، `pytest-asyncio` برای تست.
- `ruff` برای lint، `black` برای format، `mypy` برای type-check.
- `pyinstaller` یا `nuitka` برای بسته‌بندی executable.

---

## ۱۱. خط‌کشی (Scoping)

### در اسکوپ v1
- تمام الزامات FR-1 تا FR-8 روی ویندوز + لینوکس X11.
- پشتیبانی **کامل** از Wayland روی KDE Plasma 6 (با KWin DBus).
- داشبورد Angular با چهار صفحه‌ی overview/categories/screenshots/settings.
- بسته‌بندی executable برای ویندوز و لینوکس.

### خارج از اسکوپ v1 (نسخه‌های بعدی)
- همگام‌سازی بین چند دستگاه (نیازمند بک‌اند مرکزی/Postgres).
- تاری (blur) هوشمند مناطق حساس در اسکرین‌شات.
- پشتیبانی از macOS.
- تشخیص idle پیشرفته بر اساس ورودی کیبورد/ماوس.
- یادگیری دسته‌بندی خودکار با ML.
- اعلان‌ها و گزارش‌های هفتگی.

---

## ۱۲. ریسک‌ها و کاهش آن‌ها

| ریسک | احتمال | اثر | راه کاهش |
|---|---|---|---|
| Wayland اجازه‌ی capture per-window نمی‌دهد | پایین (KDE) | متوسط | KWin `screenshotArea` با هندسه‌ی `activeWindow.geometry` بدون تأیید کاربر؛ fallback به `screenshotFullScreen` + برش |
| QWebEngineView باعث افزایش حجم بسته می‌شود | قطعی | کم | پذیرفته‌شده (embed Chromium)؛ در README ذکر شود |
| حجم اسکرین‌شات‌ها سریع رشد می‌کند | متوسط | متوسط | retention خودکار + کیفیت پایین پیش‌فرض + نمایش تخمین حجم در داشبورد |
| رکورد باز (open-ended) هنگام crash باقی می‌ماند | متوسط | متوسط | هنگام startup، بستن خودکار رکوردهای `end_ts IS NULL` با زمان تخمینی |
| regex کاربر نامعتبر است | متوسط | متوسط | validation هنگام ذخیره‌ی rule + fallback به Uncategorized + نمایش خطا |
| تداخل ویرایش دستی `config.toml` با DB | کم | متوسط | rules تنها در اولین اجرا seed می‌شوند؛ flag `--reseed-rules` برای بازنویسی |

---

## ۱۳. واژه‌نامه (Glossary)

- **Activity (فعالیت):** یک رکورد در جدول `activities`؛ بازه‌ی زمانی که کاربر روی یک پنجره‌ی خاص کار کرده است.
- **Sample vs Activity:** در این طراحی **sample نقطه‌ای نداریم**؛ داده‌ها به‌صورت activity (بازه) ذخیره می‌شوند.
- **Category (دسته):** برچسب دسته‌بندی نهایی یک activity (مثلاً «کدنویسی»).
- **Rule (قاعده):** یک الگوی regex برای تطبیق `process` و/یا `title`.
- **Rule version:** نسخه‌ی rules هنگام دسته‌بندی یک activity؛ برای شناسایی activityهایی که نیاز به باز‌دسته‌بندی دارند.
- **Recompute:** باز‌دسته‌بندی خودکار activityها پس از تغییر rules.
- **Retention:** مدت نگهداری اسکرین‌شات‌ها پیش از حذف خودکار.
- **Idle:** فعالیت با `process = NULL` زمانی که پنجره‌ی فعالی وجود ندارد.
- **Tray:** آیکون اپ در نوار سیستم (system tray / notification area).
- **EWMH:** Extended Window Manager Hints، استاندارد دسترسی به اطلاعات پنجره در X11.
- **WAL:** Write-Ahead Logging، مُد همزمانی SQLite.
- **QWebEngineView:** ویجت Qt برای embed کردن Chromium و نمایش وب.
- **ECharts:** کتابخانه‌ی نمودار JavaScript (Apache).
- **Pie / Donut / Stacked Bar:** انواع نمودار برای نمایش سهم و توزیع دسته‌ها.
