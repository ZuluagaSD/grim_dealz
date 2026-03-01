/** Unified Reddit post or comment after parsing */
export interface RedditItem {
  fullname: string
  type: "post" | "comment"
  subreddit: string
  author: string
  title: string | null
  body: string
  permalink: string
  createdUtc: number
}

/** LLM extraction result */
export interface PurchaseIntentResult {
  hasPurchaseIntent: boolean
  confidence: number
  productQuery: string
  intentType: "looking_to_buy" | "price_check" | "recommendation_seeking"
  summary: string
}

/** Product match from DB (read-only) */
export interface ProductMatch {
  productId: string
  productName: string
  productSlug: string
  bestPrice: number | null
  bestStore: string | null
  gwRrp: number
  discountPct: number | null
}

/** Full match result for notification */
export interface MatchResult {
  redditItem: RedditItem
  intent: PurchaseIntentResult
  product: ProductMatch | null
}

/** Bot configuration loaded from env */
export interface BotConfig {
  subreddits: string[]
  checkIntervalMs: number
  confidenceThreshold: number
  reddit: {
    clientId: string
    clientSecret: string
    username: string
    password: string
    userAgent: string
  }
  anthropic: {
    apiKey: string
  }
  telegram: {
    botToken: string
    chatId: string
  }
  siteUrl: string
  stateFilePath: string
}

/** Persisted bot state (JSON file on disk) */
export interface BotState {
  subreddits: Record<string, SubredditState>
}

export interface SubredditState {
  lastPostFullname: string | null
  lastCommentFullname: string | null
  lastRunAt: string
}
