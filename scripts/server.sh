#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."

# 1. Build Angular (اگر لازم باشه)
if [ ! -d "dashboard/dist/dashboard/browser" ]; then
  echo "Building Angular..."
  cd dashboard && npx ng build && cd ..
fi

# 2. Start API server
source .venv/bin/activate
python -m timetracker.api.server "$@"
