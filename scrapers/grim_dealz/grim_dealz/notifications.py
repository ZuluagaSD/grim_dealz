"""
Price alert notifications — check active alerts against current prices and send emails.

Runs after all store scrapers complete. For each active alert where any in-stock
listing price <= target_price, sends a one-time email via Resend API and deactivates
the alert (status → 'notified').

Required env vars:
  DIRECT_URL      — Supabase direct connection string
  RESEND_API_KEY  — Resend API key for sending emails
  NEXT_PUBLIC_SITE_URL — site URL for links in emails (default: https://www.grimdealz.com)
"""

from __future__ import annotations

import html
import logging
import os
from dataclasses import dataclass
from decimal import Decimal

import httpx
import psycopg
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

_SITE_URL = os.environ.get("NEXT_PUBLIC_SITE_URL", "https://www.grimdealz.com")
_RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
_FROM_EMAIL = os.environ.get("EMAIL_FROM", "GrimDealz <alerts@grimdealz.com>")

# ─── Email template (matches web/lib/email-templates.ts dark theme) ───

_COLORS = {
    "ink": "#0c0c0c",
    "inkCard": "#141414",
    "gold": "#c9a84c",
    "bone": "#e8e0d0",
    "boneMuted": "#a09880",
}


def _layout(content: str) -> str:
    return f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:{_COLORS['ink']};font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:{_COLORS['ink']};padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:{_COLORS['inkCard']};border-radius:8px;border:1px solid #2a2a2a;">
        <tr><td style="padding:32px 24px 16px;text-align:center;">
          <span style="font-size:20px;font-weight:bold;color:{_COLORS['gold']};letter-spacing:2px;">&#9876; GrimDealz</span>
        </td></tr>
        <tr><td style="padding:0 24px 32px;">
          {content}
        </td></tr>
        <tr><td style="padding:16px 24px;border-top:1px solid #2a2a2a;text-align:center;">
          <span style="font-size:12px;color:{_COLORS['boneMuted']};">GrimDealz &mdash; Best Warhammer Prices Compared</span>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""


def _price_drop_email(
    product_name: str,
    target_price: Decimal,
    current_price: Decimal,
    store_name: str,
    product_slug: str,
    store_slug: str,
    listing_id: str,
    unsubscribe_url: str,
) -> str:
    safe_name = html.escape(product_name)
    safe_store = html.escape(store_name)
    product_url = f"{_SITE_URL}/product/{product_slug}"
    buy_url = f"{_SITE_URL}/go/{store_slug}/{listing_id}"
    return _layout(f"""
    <h1 style="color:{_COLORS['bone']};font-size:22px;margin:0 0 12px;">Price drop alert!</h1>
    <p style="color:{_COLORS['boneMuted']};font-size:15px;line-height:1.6;margin:0 0 8px;">
      Great news &mdash; a product on your watchlist just hit your target price:
    </p>
    <p style="color:{_COLORS['bone']};font-size:17px;font-weight:bold;margin:8px 0 4px;">
      {safe_name}
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;">
      <tr>
        <td style="color:{_COLORS['boneMuted']};font-size:14px;padding:4px 0;">Your target:</td>
        <td style="color:{_COLORS['bone']};font-size:14px;font-weight:bold;padding:4px 0;text-align:right;">${target_price:.2f}</td>
      </tr>
      <tr>
        <td style="color:{_COLORS['boneMuted']};font-size:14px;padding:4px 0;">Current price:</td>
        <td style="color:#4ade80;font-size:14px;font-weight:bold;padding:4px 0;text-align:right;">${current_price:.2f}</td>
      </tr>
      <tr>
        <td style="color:{_COLORS['boneMuted']};font-size:14px;padding:4px 0;">Store:</td>
        <td style="color:{_COLORS['bone']};font-size:14px;padding:4px 0;text-align:right;">{safe_store}</td>
      </tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
      <tr><td align="center">
        <a href="{buy_url}" style="display:inline-block;background-color:{_COLORS['gold']};color:{_COLORS['ink']};font-size:16px;font-weight:bold;padding:14px 32px;border-radius:6px;text-decoration:none;">Buy Now at {safe_store}</a>
      </td></tr>
    </table>
    <p style="color:{_COLORS['boneMuted']};font-size:13px;margin:8px 0 0;text-align:center;">
      <a href="{product_url}" style="color:{_COLORS['gold']};text-decoration:underline;">Compare all prices</a>
    </p>
    <p style="color:{_COLORS['boneMuted']};font-size:11px;margin:16px 0 0;text-align:center;">
      This was a one-time alert and has been automatically deactivated.
      <br><a href="{unsubscribe_url}" style="color:{_COLORS['boneMuted']};text-decoration:underline;">Unsubscribe from all alerts</a>
    </p>
    """)


# ─── Stats ───

@dataclass
class NotificationStats:
    alerts_checked: int = 0
    emails_sent: int = 0
    errors: int = 0


# ─── Core logic ───

_TRIGGERED_ALERTS_QUERY = """
SELECT
    pa.id AS alert_id,
    pa.target_price,
    pa.subscriber_id,
    es.email,
    es.unsubscribe_token,
    p.id AS product_id,
    p.name AS product_name,
    p.slug AS product_slug,
    l.id AS listing_id,
    l.current_price,
    s.name AS store_name,
    s.slug AS store_slug
FROM price_alerts pa
JOIN email_subscribers es ON es.id = pa.subscriber_id
JOIN products p ON p.id = pa.product_id
JOIN LATERAL (
    SELECT l2.id, l2.current_price, l2.store_id
    FROM listings l2
    WHERE l2.product_id = pa.product_id
      AND l2.in_stock = TRUE
      AND l2.current_price <= pa.target_price
    ORDER BY l2.current_price ASC
    LIMIT 1
) l ON TRUE
JOIN stores s ON s.id = l.store_id
WHERE pa.status = 'active'::\"SubscriptionStatus\"
  AND es.email_verified = TRUE
  AND pa.target_price IS NOT NULL
"""


async def send_price_alerts(log=None) -> NotificationStats:
    """Check all active alerts and send emails for triggered ones."""
    _log = log or logger
    stats = NotificationStats()

    if not _RESEND_API_KEY:
        _log.warning("RESEND_API_KEY not set — skipping price alert notifications")
        return stats

    dsn = os.environ.get("DIRECT_URL")
    if not dsn:
        _log.error("DIRECT_URL not set — cannot check price alerts")
        return stats

    conn = await psycopg.AsyncConnection.connect(dsn)
    try:
        rows = await (await conn.execute(_TRIGGERED_ALERTS_QUERY)).fetchall()
        stats.alerts_checked = len(rows)
        _log.info("Found %d triggered price alerts", len(rows))

        async with httpx.AsyncClient(timeout=10.0) as client:
            for row in rows:
                alert_id = row[0]
                target_price = Decimal(str(row[1]))
                email = row[3]
                unsubscribe_token = row[4]
                product_name = row[6]
                product_slug = row[7]
                listing_id = row[8]
                current_price = Decimal(str(row[9]))
                store_name = row[10]
                store_slug = row[11]

                unsubscribe_url = f"{_SITE_URL}/api/unsubscribe?token={unsubscribe_token}&type=all"

                email_html = _price_drop_email(
                    product_name=product_name,
                    target_price=target_price,
                    current_price=current_price,
                    store_name=store_name,
                    product_slug=product_slug,
                    store_slug=store_slug,
                    listing_id=listing_id,
                    unsubscribe_url=unsubscribe_url,
                )

                try:
                    resp = await client.post(
                        "https://api.resend.com/emails",
                        headers={"Authorization": f"Bearer {_RESEND_API_KEY}"},
                        json={
                            "from": _FROM_EMAIL,
                            "to": [email],
                            "subject": f"Price drop! {product_name} is now ${current_price:.2f}",
                            "html": email_html,
                        },
                    )
                    resp.raise_for_status()

                    # Deactivate alert — one-time notification
                    await conn.execute(
                        """
                        UPDATE price_alerts
                        SET status = 'unsubscribed'::"SubscriptionStatus",
                            last_notified_at = NOW()
                        WHERE id = %s
                        """,
                        (alert_id,),
                    )
                    await conn.commit()

                    stats.emails_sent += 1
                    _log.info(
                        "Sent price alert email: %s -> %s ($%.2f <= $%.2f target)",
                        product_name, email, current_price, target_price,
                    )
                except Exception:
                    stats.errors += 1
                    _log.exception("Failed to send alert email for alert %s", alert_id)

    finally:
        await conn.close()

    return stats
