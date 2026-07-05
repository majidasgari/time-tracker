# Time Tracker

تایم‌ترکر دسکتاپی کراس‌پلتفرم (ویندوز + لینوکس KDE) که فعالیت کاربر را به‌صورت event-based ضبط و دسته‌بندی می‌کند. تمام داده‌ها **کاملاً محلی** ذخیره می‌شوند (SQLite) و هیچ داده‌ای به شبکه ارسال نمی‌شود.

## ویژگی‌ها

### ضبط هوشمند فعالیت
- **event-based:** فقط هنگام تعویض پنجره‌ی فعال رکورد ثبت می‌شود (نه polling ثابت) — سبک، دقیق، کم‌حجم
- **تشخیص خودکار Idle:** وقتی پنجره‌ای فوکوس نیست یا سیستم قفل است، فعالیت با دسته‌ی `Idle` ثبت می‌شود
- **ذخیره‌سازی پروسس + عنوان:** هر رکورد شامل نام پروسس، عنوان پنجره، و زمان شروع/پایان است

### دسته‌بندی با Regex
- **کتگوری‌ها:** ساختار درختی با نام، رنگ، اولویت و وضعیت فعال/غیرفعال
- **قواعد (Rules):** regex روی `process` و `title` — قابلیت AND بین دو فیلد، OR بین ruleهای یک کتگوری
- **الویت‌بندی:** اولین کتگوری مچ‌شده برنده است (قابل تنظیم)
- **باز‌دسته‌بندی خودکار:** با تغییر rules یا priority، نسخه‌ی rules افزایش یافته و بک‌گراند چانکی کل تاریخچه را باز‌دسته‌بندی می‌کند
- **Uncategorized:** فعالیت‌هایی که با هیچ ruleای مچ نشوند در این دسته قرار می‌گیرند

### اسکرین‌شات دوره‌ای
- **فواصل قابل تنظیم:** ۱ تا ۳۰۰ ثانیه (پیش‌فرض ۱۰ ثانیه)
- **سه سطح کیفیت:** Low (۳۰٪ JPEG) / Medium (۶۰٪) / High (۹۰٪) — هرکدام با رزولوشن متناسب
- **مدیریت ذخیره‌سازی:** حذف خودکار اسکرین‌شات‌های قدیمی (retention بین ۱ تا ۹۰ روز)
- **تشخیص خودکار Spectacle (KDE):** هنگام استفاده از ابزار اسکرین‌شات KDE، عکس‌برداری متوقف می‌شود
- **پیش‌نمایش:** گالری اسکرین‌شات‌ها در داشبورد با قابلیت بزرگنمایی

### داشبورد یکپارچه (Angular)
- **Overview:** جدول فعالیت‌ها با فیلتر (پروسس، کتگوری، عنوان، بازه‌ی زمانی) + breakdown زمانی بر اساس کتگوری + صفحه‌بندی
- **Charts:** نمودارهای Pie/Donut با تفکیک کتگوری/پروسس/عنوان — بازه‌های Today / This Week / This Month / Custom
- **Timeline:** نمایش بصری گانت‌مانند با ۴ ردیف (پروسس، عنوان، کتگوری، Job) — قابلیت zoom با اسکرول، drag، انتخاب بازه، نشانگر (marker) با جزئیات و اسکرین‌شات
- **Screenshots:** گالری اسکرین‌شات‌ها با فیلتر بازه و پیش‌نمایش full-size
- **Categories:** مدیریت کامل کتگوری‌ها و rules (افزودن/ویرایش/حذف) + recompute

### تقویم هجری شمسی
- **Date picker دوگانه:** پشتیبانی هم‌زمان از تقویم میلادی (Gregorian) و هجری شمسی (Jalali)
- **تنظیم در Settings:** کاربر نوع تقویم را انتخاب می‌کند و تمام date pickerهای برنامه از آن پیروی می‌کنند
- **معادل میلادی:** هنگام استفاده از تقویم شمسی، معادل میلادی زیر هر date picker نمایش داده می‌شود
- **بدون تغییر بک‌اند:** تمام تاریخ‌ها در API و دیتابیس میلادی باقی می‌مانند

### Job Tracking
- **Manual Job:** قابلیت اختصاص job دستی از طریق system tray یا داشبورد — همه فعالیت‌های بعدی با آن job تگ می‌شوند
- **Inline Editing:** ویرایش job هر فعالیت مستقیماً از ستون Overview
- **Range Assignment:** اختصاص job به یک بازه‌ی زمانی در Timeline (با drag-select)
- **Autocomplete:** پیشنهاد خودکار jobهای قبلی هنگام تایپ

### System Tray
- **آیکون ساعت:** نمایش وضعیت tracking (فعال/متوقف) با tooltip
- **منوی راست‌کلیک:** باز کردن داشبورد، توقف/ادامه tracking، تنظیم job دستی، خروج
- **دابل‌کلیک:** باز کردن سریع داشبورد در مرورگر

### حریم خصوصی
- **تمام داده‌ها محلی:** SQLite روی دیسک کاربر، بدون هیچ ارتباط شبکه‌ای (جز `localhost:8080` برای داشبورد)
- **لیست استثنا:** امکان حذف اپ‌های حساس از اسکرین‌شات (از طریق config)
- **بدون telemetry:** هیچ داده‌ای جمع‌آوری یا ارسال نمی‌شود

### کراس‌پلتفرم
| پلتفرم | روش تشخیص پنجره | اسکرین‌شات |
|---|---|---|
| Windows 10/11 | Win32 API (ctypes) | mss / BitBlt |
| Linux X11 | python-xlib | mss |
| Linux Wayland (KDE) | DBus → KWin | spectacle --background |

## استک فنی

| لایه | تکنولوژی |
|---|---|
| Backend | Python 3.11+ / PySide6 / FastAPI / SQLModel (SQLite WAL) |
| Dashboard | Angular 19 / ECharts / TailwindCSS |
| Platform | ctypes (Windows) / python-xlib (X11) / DBus → KWin (Wayland) |
| Screenshots | mss / Pillow / spectacle / grim |
| Date Picker | asa-date-picker (Gregorian + Jalali) |

## ساختار پروژه

```
├── src/timetracker/
│   ├── __main__.py           # نقطه‌ی ورود
│   ├── config.py             # بارگذاری/ذخیره‌ی کانفیگ TOML
│   ├── platform/             # لایه‌ی انتزاع پلتفرم
│   │   ├── base.py           # اینترفیس WindowInfo
│   │   ├── factory.py        # انتخاب بک‌اند مناسب
│   │   ├── linux_x11.py      # X11 via python-xlib
│   │   ├── linux_wayland.py  # Wayland KDE via DBus
│   │   └── windows.py        # Win32 API via ctypes
│   ├── db/                   # مدل‌ها، session، migrations
│   ├── tracking/             # sampler + categorizer + recompute
│   ├── screenshots/          # capture + retention
│   ├── api/                  # FastAPI routes
│   └── ui/                   # system tray + dashboard window
├── dashboard/                # پروژه‌ی Angular
├── tests/                    # تست‌های Python
├── docs/                     # مستندات (SPEC, PLAN)
└── scripts/                  # اسکریپت‌های کمکی
```

## شروع کار (از سورس)

```bash
# Clone
git clone https://github.com/majidasgari/time-tracker
cd time-tracker

# Python virtual environment
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"

# Platform-specific dependency (فقط یکی)
pip install -e ".[x11]"        # لینوکس X11
pip install -e ".[wayland]"    # لینوکس KDE Wayland
pip install -e ".[win32]"      # ویندوز

# Angular dashboard
cd dashboard
npm install
npm run build
cd ..

# اجرا
python -m timetracker
```

داشبورد روی `http://127.0.0.1:8080` قابل دسترسی است و در مرورگر پیش‌فرض باز می‌شود. همچنین روی System tray دابل‌کلیک کنید.

## بیلد اجرایی (Linux)

پیش‌نیاز: `pyinstaller` در dev dependencies هست، یا دستی نصب کنید:

```bash
pip install pyinstaller
```

### مرحله‌ی ۱: بیلد داشبورد Angular

```bash
cd dashboard
npm install
npm run build
cd ..
```

### مرحله‌ی ۲: بیلد با PyInstaller

```bash
pyinstaller \
  --name=time-tracker \
  --add-data "dashboard/dist/dashboard/browser:dashboard/dist/dashboard/browser" \
  --hidden-import=timetracker \
  --hidden-import=timetracker.config \
  --hidden-import=timetracker.db \
  --hidden-import=timetracker.db.models \
  --hidden-import=timetracker.db.migrations \
  --hidden-import=timetracker.db.session \
  --hidden-import=timetracker.api \
  --hidden-import=timetracker.api.server \
  --hidden-import=timetracker.api.routes \
  --hidden-import=timetracker.api.routes.categories \
  --hidden-import=timetracker.api.routes.config \
  --hidden-import=timetracker.api.routes.jobs \
  --hidden-import=timetracker.api.routes.screenshots \
  --hidden-import=timetracker.api.routes.tracking \
  --hidden-import=timetracker.platform \
  --hidden-import=timetracker.platform.base \
  --hidden-import=timetracker.platform.factory \
  --hidden-import=timetracker.platform.linux_x11 \
  --hidden-import=timetracker.platform.linux_wayland \
  --hidden-import=timetracker.screenshots \
  --hidden-import=timetracker.screenshots.capture \
  --hidden-import=timetracker.tracking \
  --hidden-import=timetracker.tracking.categorizer \
  --hidden-import=timetracker.tracking.recompute \
  --hidden-import=timetracker.tracking.sampler \
  --hidden-import=timetracker.ui \
  --hidden-import=timetracker.ui.tray \
  --hidden-import=psutil \
  --hidden-import=PIL \
  --hidden-import=PIL.Image \
  --hidden-import=mss \
  --hidden-import=regex \
  --hidden-import=uvicorn \
  --hidden-import=sqlmodel \
  --hidden-import=pydantic \
  --hidden-import=pydantic_settings \
  --hidden-import=starlette \
  --hidden-import=fastapi \
  --hidden-import=PySide6 \
  --hidden-import=PySide6.QtCore \
  --hidden-import=PySide6.QtGui \
  --hidden-import=PySide6.QtWidgets \
  --noconsole \
  src/timetracker/__main__.py
```

خروجی در `dist/time-tracker/time-tracker` ایجاد می‌شود.

> **نکته:** فایل‌های باینری PySide6 بزرگ هستند (~۱۵۰ مگابایت). برای توزیع نهایی، می‌توان `--onedir` را با ابزاری مثل AppImage ترکیب کرد.

## لایسنس

MIT
