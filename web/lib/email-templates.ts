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

export function welcomeAlertEmail(
  productName: string,
  unsubscribeUrl: string
): string {
  return layout(`
    <h1 style="color:${COLORS.bone};font-size:22px;margin:0 0 12px;">Price alert activated!</h1>
    <p style="color:${COLORS.boneMuted};font-size:15px;line-height:1.6;margin:0 0 8px;">
      You&rsquo;ll be notified when the price drops for:
    </p>
    <p style="color:${COLORS.bone};font-size:17px;font-weight:bold;margin:8px 0 16px;">
      ${escapeHtml(productName)}
    </p>
    <p style="color:${COLORS.boneMuted};font-size:13px;margin:16px 0 0;">
      <a href="${unsubscribeUrl}" style="color:${COLORS.gold};text-decoration:underline;">Unsubscribe from this alert</a>
    </p>
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
