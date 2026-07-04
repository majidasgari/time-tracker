# Time Tracker

تایم‌ترکر دسکتاپی کراس‌پلتفرم (ویندوز + لینوکس KDE) که فعالیت کاربر را ضبط و دسته‌بندی می‌کند.

## ویژگی‌ها

- **ضبط event-based:** فقط هنگام تعویض پنجره ثبت می‌شود (نه polling ثابت) — سبک و دقیق.
- **دسته‌بندی با regex:** قواعد انعطاف‌پذیر برای طبقه‌بندی پروسس‌ها و عناوین پنجره‌ها. تغییر آنی rules → باز‌دسته‌بندی کل تاریخچه.
- **نمودار مصرف:** Pie/Donut و Timeline با قابلیت zoom روی بازه‌های روز/هفته/ماه/بازه دلخواه.
- **اسکرین‌شات دوره‌ای:** هر ۱۰ ثانیه از پنجره‌ی فعال با کیفیت قابل تنظیم (low/medium/high).
- **حریم خصوصی:** تمام داده‌ها محلی؛ لیست استثنا برای اپ‌های حساس.
- **داشبورد یکپارچه:** Angular داخل QWebEngineView (بدون نیاز به مرورگر خارجی).
- **System Tray:** شروع/توقف، وضعیت، دسترسی سریع.

## پلتفرم‌ها

| پلتفرم | وضعیت |
|---|---|
| Windows 10/11 | ✅ کامل |
| Linux X11 (KDE) | ✅ کامل |
| Linux Wayland (KDE) | ✅ کامل |

## مستندات

| سند | توضیح |
|---|---|
| [SPECIFICATION.md](docs/SPECIFICATION.md) | مشخصات کامل پروژه: الزامات، مدل داده، API، معماری |
| [PLAN.md](docs/PLAN.md) | برنامه‌ی پیاده‌سازی: فازها، وظایف، معیارهای تأیید |

## استک فنی

- **Backend:** Python 3.11+ / PySide6 / FastAPI / SQLModel (SQLite WAL)
- **Dashboard:** Angular / ECharts
- **Platform:** ctypes (Windows) / python-xlib (X11) / DBus → KWin (Wayland)

## ساختار پروژه

```
src/timetracker/
├── __main__.py          # نقطه‌ی ورود
├── config.py            # بارگذاری/ذخیره‌ی کانفیگ TOML
├── platform/            # لایه‌ی انتزاع پلتفرم (ویندوز/X11/Wayland)
├── db/                  # مدل‌ها و session (SQLModel)
├── tracking/            # sampler + categorizer + recompute
├── screenshots/         # capture + retention
├── api/                 # FastAPI routes
└── ui/                  # tray + dashboard window
dashboard/               # پروژه‌ی Angular
```

## شروع کار (از سورس)

```bash
# Clone
git clone <repo-url>
cd time-tracker

# Python
python -m venv .venv
source .venv/bin/activate   # لینوکس
pip install -e ".[dev]"

# Angular (برای داشبورد)
cd dashboard
npm install
ng build
cd ..

# اجرا
python -m timetracker
```

## لایسنس

—
