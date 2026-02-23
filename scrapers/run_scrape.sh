#!/usr/bin/env bash
# GrimDealz scraper runner — called by cron on the Pi.
#
# IMPORTANT: must be run from the grim_dealz/ repo root, or with REPO set.
# The Python module must be invoked as "python -m scrapers.run_all" from the
# repo root — running from inside scrapers/ breaks relative imports.
#
# Cron entry (edit with: crontab -e):
#   0 */4 * * * /bin/bash /home/pi/grim_dealz/scrapers/run_scrape.sh

set -euo pipefail

REPO="${REPO:-$(cd "$(dirname "$0")/.." && pwd)}"
LOGDIR="$REPO/logs"
LOGFILE="$LOGDIR/scrape_$(date +%Y%m%d_%H%M%S).log"
LATEST="$LOGDIR/scrape_latest.log"

mkdir -p "$LOGDIR"

echo "=== GrimDealz scrape run starting at $(date) ===" | tee "$LOGFILE"

# Pull latest code
cd "$REPO"
git pull --ff-only origin main >> "$LOGFILE" 2>&1 || echo "git pull failed (continuing)" >> "$LOGFILE"

# Sync Python deps
cd "$REPO/scrapers"
"$HOME/.local/bin/uv" sync --frozen >> "$LOGFILE" 2>&1

# Run scrapers from repo root so "scrapers" package is importable
cd "$REPO"
"$HOME/.local/bin/uv" run --project scrapers python -m scrapers.run_all >> "$LOGFILE" 2>&1

echo "=== Done at $(date) ===" | tee -a "$LOGFILE"

# Keep a symlink to the latest log for easy inspection
ln -sf "$LOGFILE" "$LATEST"

# Trim old logs: keep last 30
find "$LOGDIR" -name "scrape_*.log" -not -name "scrape_latest.log" \
    | sort | head -n -30 | xargs --no-run-if-empty rm -f
