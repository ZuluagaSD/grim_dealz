import type { MatchResult } from "./types.js"

export class TelegramNotifier {
  private readonly botToken: string
  private readonly chatId: string
  private readonly siteUrl: string

  constructor(botToken: string, chatId: string, siteUrl: string) {
    this.botToken = botToken
    this.chatId = chatId
    this.siteUrl = siteUrl
  }

  async sendMatch(match: MatchResult): Promise<void> {
    const intentLabel = match.intent.intentType.replace(/_/g, " ")

    const lines: string[] = [
      "\u{1F514} <b>Purchase Intent Detected</b>",
      "",
      `\u{1F4CD} r/${match.redditItem.subreddit} \u2022 ${intentLabel}`,
      `\u{1F464} u/${match.redditItem.author}`,
    ]

    if (match.redditItem.title) {
      lines.push(`\u{1F4DD} ${escapeHtml(match.redditItem.title)}`)
    }

    lines.push(`\u{1F4AC} ${escapeHtml(match.intent.summary)}`)
    lines.push(`\u{1F517} ${match.redditItem.permalink}`)
    lines.push("")

    if (match.product) {
      lines.push(
        `\u{1F3AF} <b>Matched:</b> ${escapeHtml(match.product.productName)}`
      )
      lines.push(`\u{1F4B5} GW RRP: $${match.product.gwRrp.toFixed(2)}`)

      if (
        match.product.bestPrice !== null &&
        match.product.bestStore !== null
      ) {
        lines.push(
          `\u{1F4B0} Best: $${match.product.bestPrice.toFixed(2)} at ${escapeHtml(match.product.bestStore)}`
        )
        if (match.product.discountPct !== null && match.product.discountPct > 0) {
          lines.push(
            `\u{1F4C9} ${match.product.discountPct.toFixed(0)}% off RRP`
          )
        }
      }

      lines.push(
        `\u{1F310} ${this.siteUrl}/product/${match.product.productSlug}`
      )
    } else {
      lines.push(
        `\u{1F50D} <b>Search:</b> "${escapeHtml(match.intent.productQuery)}"`
      )
      lines.push(`\u26A0\uFE0F No matching product in database`)
    }

    lines.push("")
    lines.push(
      `\u{1F4CA} Confidence: ${(match.intent.confidence * 100).toFixed(0)}%`
    )

    await this.sendMessage(lines.join("\n"))
  }

  async sendError(message: string): Promise<void> {
    await this.sendMessage(`\u274C <b>Reddit Bot Error</b>\n\n${escapeHtml(message)}`)
  }

  async sendSummary(stats: {
    subreddits: string[]
    totalPosts: number
    totalComments: number
    filtered: number
    matches: number
  }): Promise<void> {
    const emoji = stats.matches > 0 ? "\u{1F514}" : "\u{1F4CA}"
    const lines: string[] = [
      `${emoji} <b>Reddit Bot Check Complete</b>`,
      "",
      `\u{1F4C1} Subreddits: ${stats.subreddits.join(", ")}`,
      `\u{1F4DD} New posts: ${stats.totalPosts}`,
      `\u{1F4AC} New comments: ${stats.totalComments}`,
      `\u{1F50D} Passed keyword filter: ${stats.filtered}`,
      `\u{1F3AF} Purchase intent matches: ${stats.matches}`,
      "",
      `\u{1F551} ${new Date().toLocaleString("en-US", { timeZone: "America/Bogota" })}`,
    ]
    await this.sendMessage(lines.join("\n"))
  }

  private async sendMessage(text: string): Promise<void> {
    const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: this.chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`Telegram API error: ${response.status} ${body}`)
    }
  }
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}
