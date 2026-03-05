// HTML email templates — GrimDealz dark theme (inline styles for email clients)

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const COLORS = {
  ink: '#0c0c0c',
  inkCard: '#141414',
  gold: '#c9a84c',
  bone: '#e8e0d0',
  boneMuted: '#a09880',
} as const

function layout(content: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:${COLORS.ink};font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:${COLORS.ink};padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:${COLORS.inkCard};border-radius:8px;border:1px solid #2a2a2a;">
        <tr><td style="padding:32px 24px 16px;text-align:center;">
          <span style="font-size:20px;font-weight:bold;color:${COLORS.gold};letter-spacing:2px;">&#9876; GrimDealz</span>
        </td></tr>
        <tr><td style="padding:0 24px 32px;">
          ${content}
        </td></tr>
        <tr><td style="padding:16px 24px;border-top:1px solid #2a2a2a;text-align:center;">
          <span style="font-size:12px;color:${COLORS.boneMuted};">GrimDealz — Best Warhammer Prices Compared</span>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

function ctaButton(url: string, text: string): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
    <tr><td align="center">
      <a href="${url}" style="display:inline-block;background-color:${COLORS.gold};color:${COLORS.ink};font-size:16px;font-weight:bold;padding:14px 32px;border-radius:6px;text-decoration:none;">${text}</a>
    </td></tr>
  </table>`
}

export function verificationEmail(verifyUrl: string): string {
  return layout(`
    <h1 style="color:${COLORS.bone};font-size:22px;margin:0 0 12px;">Verify your email</h1>
    <p style="color:${COLORS.boneMuted};font-size:15px;line-height:1.6;margin:0 0 8px;">
      Click the button below to confirm your email and activate your subscription.
    </p>
    ${ctaButton(verifyUrl, 'Verify Email')}
    <p style="color:${COLORS.boneMuted};font-size:13px;margin:0;">
      If you didn&rsquo;t sign up for GrimDealz, you can safely ignore this email.
    </p>
  `)
}

export interface AlertEmailProduct {
  name: string
  slug: string
  imageUrl: string | null
  faction: string | null
  gameSystem: string | null
  gwRrpUsd: number
  currentPrice: number | null
  storeName: string | null
  priceHistory: { date: string; price: number }[]
}

function buildChartUrl(history: { date: string; price: number }[], gwRrp: number): string | null {
  if (history.length < 2) return null
  const labels = history.map((p) => p.date.slice(5, 10)) // "MM-DD"
  const prices = history.map((p) => p.price)
  const config = {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Price',
          data: prices,
          borderColor: '#c9a84c',
          backgroundColor: 'rgba(201,168,76,0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: 0,
        },
        {
          label: 'GW RRP',
          data: Array(labels.length).fill(gwRrp),
          borderColor: '#a09880',
          borderDash: [5, 5],
          pointRadius: 0,
          fill: false,
        },
      ],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#a09880', font: { size: 10 } }, grid: { color: '#2a2a2a' } },
        y: { ticks: { color: '#a09880', font: { size: 10 }, callback: (v: number) => `$${v}` }, grid: { color: '#2a2a2a' } },
      },
    },
  }
  const encoded = encodeURIComponent(JSON.stringify(config))
  return `https://quickchart.io/chart?c=${encoded}&w=540&h=200&bkg=${encodeURIComponent(COLORS.inkCard)}`
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://grimdealz.com'

export function welcomeAlertEmail(
  product: AlertEmailProduct,
  targetPrice: string,
  unsubscribeUrl: string
): string {
  const safeName = escapeHtml(product.name)
  const productUrl = `${SITE_URL}/product/${product.slug}`
  const subtitle = [product.faction, product.gameSystem].filter(Boolean).join(' · ')
  const chartUrl = buildChartUrl(product.priceHistory, product.gwRrpUsd)

  const imageBlock = product.imageUrl
    ? `<tr><td style="padding:0 0 16px;text-align:center;">
        <a href="${productUrl}">
          <img src="${product.imageUrl}" alt="${safeName}" width="200" style="max-width:200px;height:auto;border-radius:8px;" />
        </a>
      </td></tr>`
    : ''

  const subtitleBlock = subtitle
    ? `<p style="color:${COLORS.gold};font-size:13px;text-transform:uppercase;letter-spacing:1px;margin:0 0 4px;">${escapeHtml(subtitle)}</p>`
    : ''

  const priceRows = []
  if (product.currentPrice !== null && product.storeName) {
    priceRows.push(`
      <tr>
        <td style="color:${COLORS.boneMuted};font-size:14px;padding:4px 0;">Current lowest (${escapeHtml(product.storeName)}):</td>
        <td style="color:${COLORS.bone};font-size:14px;font-weight:bold;padding:4px 0;text-align:right;">$${product.currentPrice.toFixed(2)}</td>
      </tr>`)
  }
  priceRows.push(`
    <tr>
      <td style="color:${COLORS.boneMuted};font-size:14px;padding:4px 0;">Your target price:</td>
      <td style="color:#4ade80;font-size:14px;font-weight:bold;padding:4px 0;text-align:right;">$${escapeHtml(targetPrice)}</td>
    </tr>
    <tr>
      <td style="color:${COLORS.boneMuted};font-size:14px;padding:4px 0;">GW RRP:</td>
      <td style="color:${COLORS.boneMuted};font-size:14px;padding:4px 0;text-align:right;text-decoration:line-through;">$${product.gwRrpUsd.toFixed(2)}</td>
    </tr>`)

  const chartBlock = chartUrl
    ? `<tr><td style="padding:16px 0 0;">
        <p style="color:${COLORS.boneMuted};font-size:12px;margin:0 0 8px;">Price history (90 days):</p>
        <a href="${productUrl}">
          <img src="${chartUrl}" alt="Price history chart" width="540" style="max-width:100%;height:auto;border-radius:6px;border:1px solid #2a2a2a;" />
        </a>
      </td></tr>`
    : ''

  return layout(`
    <table width="100%" cellpadding="0" cellspacing="0">
      ${imageBlock}
      <tr><td>
        ${subtitleBlock}
        <h1 style="color:${COLORS.bone};font-size:22px;margin:0 0 12px;">Price alert activated!</h1>
        <p style="color:${COLORS.boneMuted};font-size:15px;line-height:1.6;margin:0 0 4px;">
          You&rsquo;ll get a one-time email when the price drops to your target for:
        </p>
        <p style="color:${COLORS.bone};font-size:18px;font-weight:bold;margin:4px 0 16px;">
          <a href="${productUrl}" style="color:${COLORS.bone};text-decoration:none;">${safeName}</a>
        </p>
      </td></tr>
      <tr><td>
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color:${COLORS.ink};border-radius:6px;padding:12px;border:1px solid #2a2a2a;">
          ${priceRows.join('')}
        </table>
      </td></tr>
      ${chartBlock}
      <tr><td style="padding:16px 0 0;text-align:center;">
        ${ctaButton(productUrl, 'View Product &amp; Compare Prices')}
      </td></tr>
      <tr><td style="text-align:center;">
        <p style="color:${COLORS.boneMuted};font-size:12px;margin:0;">
          <a href="${unsubscribeUrl}" style="color:${COLORS.boneMuted};text-decoration:underline;">Cancel this alert</a>
        </p>
      </td></tr>
    </table>
  `)
}

export function welcomeNewsletterEmail(unsubscribeUrl: string): string {
  return layout(`
    <h1 style="color:${COLORS.bone};font-size:22px;margin:0 0 12px;">Welcome to the Weekly Price Digest!</h1>
    <p style="color:${COLORS.boneMuted};font-size:15px;line-height:1.6;margin:0 0 8px;">
      Every week, you&rsquo;ll receive:
    </p>
    <ul style="color:${COLORS.boneMuted};font-size:15px;line-height:1.8;padding-left:20px;margin:8px 0 16px;">
      <li>Top price drops across all retailers</li>
      <li>New product additions</li>
      <li>Pricing trends and analytics</li>
    </ul>
    <p style="color:${COLORS.boneMuted};font-size:13px;margin:16px 0 0;">
      <a href="${unsubscribeUrl}" style="color:${COLORS.gold};text-decoration:underline;">Unsubscribe</a>
    </p>
  `)
}
