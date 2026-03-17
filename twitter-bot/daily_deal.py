#!/usr/bin/env python3
"""
GrimDealz Daily Deal Bot
Finds the best Warhammer deal and sends it to Telegram for manual posting to X.
Runs once daily via cron or systemd timer.
"""

import os
import sys
import random
import logging
import json
from urllib.request import Request, urlopen
from urllib.parse import quote

import psycopg2
from dotenv import load_dotenv

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("grimdealz-daily")

SITE_URL = os.getenv("SITE_URL", "https://www.grimdealz.com")
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")

# Tweet templates — rotate to keep it fresh
TEMPLATES = [
    "🔥 {name} — ${price} at {store} ({pct}% off GW RRP)\n\n{url}",
    "{name} for ${price} ({pct}% off) at {store}\n\n{url}",
    "💀 ${savings} off {name} at {store} — ${price} vs ${rrp} RRP\n\n{url}",
    "{name} — ${price} at {store}. GW charges ${rrp}. That's {pct}% less.\n\n{url}",
    "Deal: {name} for ${price} at {store} (save ${savings})\n\n{url}",
]


def get_best_deals(limit=5):
    """Find top in-stock products with the biggest discount percentage."""
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    p.name,
                    p.slug,
                    p.gw_rrp_usd,
                    l.current_price,
                    s.name AS store_name,
                    ROUND((1 - l.current_price / p.gw_rrp_usd) * 100) AS discount_pct
                FROM listings l
                JOIN products p ON p.id = l.product_id
                JOIN stores s ON s.id = l.store_id
                WHERE l.in_stock = TRUE
                  AND p.is_active = TRUE
                  AND s.is_active = TRUE
                  AND p.gw_rrp_usd >= 40
                  AND l.current_price < p.gw_rrp_usd
                  AND l.last_checked_at > NOW() - INTERVAL '48 hours'
                  -- Cap at 35%% discount — anything higher is likely a product mismatch
                  AND (1 - l.current_price / p.gw_rrp_usd) <= 0.35
                ORDER BY discount_pct DESC, p.gw_rrp_usd DESC
                LIMIT %s
            """, (limit * 4,))
            rows = cur.fetchall()
    finally:
        conn.close()

    if not rows:
        return []

    return [
        {
            "name": r[0],
            "slug": r[1],
            "rrp": float(r[2]),
            "price": float(r[3]),
            "store": r[4],
            "pct": int(r[5]),
        }
        for r in rows[:limit]
    ]


def build_tweet(deal: dict) -> str:
    """Build tweet text from a deal, using a random template."""
    template = random.choice(TEMPLATES)
    savings = deal["rrp"] - deal["price"]

    return template.format(
        name=deal["name"],
        price=f"{deal['price']:.2f}",
        rrp=f"{deal['rrp']:.2f}",
        store=deal["store"],
        pct=deal["pct"],
        savings=f"{savings:.2f}",
        url=f"{SITE_URL}/product/{deal['slug']}?ref=x",
    )


def send_telegram(text: str):
    """Send a message via Telegram bot API."""
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        log.error("TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set")
        return

    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = json.dumps({
        "chat_id": TELEGRAM_CHAT_ID,
        "text": text,
        "parse_mode": "HTML",
        "disable_web_page_preview": False,
    }).encode()

    req = Request(url, data=payload, headers={"Content-Type": "application/json"})
    resp = urlopen(req, timeout=10)
    log.info(f"Telegram sent: {resp.status}")


def main():
    deals = get_best_deals(3)
    if not deals:
        log.warning("No deals found — skipping")
        sys.exit(0)

    # Pick one deal randomly from top 3
    deal = random.choice(deals)
    tweet = build_tweet(deal)

    log.info(f"Deal: {deal['name']} — ${deal['price']} ({deal['pct']}% off)")

    if "--dry-run" in sys.argv:
        print(f"\n--- Ready-to-post tweet ({len(tweet)} chars) ---")
        print(tweet)
        print("---")
        return

    # Send to Telegram with the ready-to-copy tweet
    savings = deal["rrp"] - deal["price"]
    msg = (
        f"<b>📋 Daily Deal — ready to post on X</b>\n\n"
        f"<b>{deal['name']}</b>\n"
        f"${deal['price']:.2f} at {deal['store']} ({deal['pct']}% off GW RRP)\n"
        f"Save ${savings:.2f}\n\n"
        f"<b>Copy-paste this tweet:</b>\n"
        f"<code>{tweet}</code>"
    )

    send_telegram(msg)
    log.info("Sent to Telegram")


if __name__ == "__main__":
    main()
