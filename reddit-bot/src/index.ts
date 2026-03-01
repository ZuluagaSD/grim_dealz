import { PrismaClient } from "@prisma/client"
import { loadConfig } from "./config.js"
import { RedditClient, filterNewItems } from "./reddit.js"
import { passesKeywordFilter } from "./filter.js"
import { IntentExtractor } from "./llm.js"
import { ProductMatcher } from "./matcher.js"
import { TelegramNotifier } from "./telegram.js"
import { loadState, saveState, getSubredditState, updateSubredditState } from "./state.js"
import type { BotConfig, BotState, MatchResult, RedditItem } from "./types.js"

// ── Logging ─────────────────────────────────────────────────

function ts(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19)
}

function log(msg: string): void {
  process.stdout.write(`[${ts()}] ${msg}\n`)
}

function logError(msg: string): void {
  process.stderr.write(`[${ts()}] ERROR: ${msg}\n`)
}

// ── Pipeline ────────────────────────────────────────────────

interface SubredditStats {
  posts: number
  comments: number
  filtered: number
  matches: number
}

async function processSubreddit(
  subreddit: string,
  state: BotState,
  reddit: RedditClient,
  llm: IntentExtractor,
  matcher: ProductMatcher,
  telegram: TelegramNotifier,
  config: BotConfig
): Promise<SubredditStats> {
  const stats: SubredditStats = { posts: 0, comments: 0, filtered: 0, matches: 0 }
  const subState = getSubredditState(state, subreddit)

  // Fetch latest posts and comments
  const [posts, comments] = await Promise.all([
    reddit.fetchNewPosts(subreddit),
    reddit.fetchNewComments(subreddit),
  ])

  // Filter to only unseen items
  const newPosts = filterNewItems(posts, subState.lastPostFullname)
  const newComments = filterNewItems(comments, subState.lastCommentFullname)

  stats.posts = newPosts.length
  stats.comments = newComments.length

  log(
    `  r/${subreddit}: ${newPosts.length} new posts, ${newComments.length} new comments`
  )

  // Merge and apply keyword pre-filter
  const allNew: RedditItem[] = [...newPosts, ...newComments]
  const filtered = allNew.filter(passesKeywordFilter)
  stats.filtered = filtered.length

  if (filtered.length > 0) {
    log(`  r/${subreddit}: ${filtered.length} passed keyword filter`)
  }

  // Send filtered items through LLM
  for (const item of filtered) {
    try {
      const intent = await llm.extractIntent(item)

      if (
        intent.hasPurchaseIntent &&
        intent.confidence >= config.confidenceThreshold
      ) {
        // Try to match to a product in the DB
        const product = await matcher.findMatch(intent.productQuery)
        const match: MatchResult = { redditItem: item, intent, product }

        await telegram.sendMatch(match)
        stats.matches++

        const productInfo = product
          ? ` → ${product.productName}`
          : ` → "${intent.productQuery}" (no DB match)`
        log(`  ✓ Match: ${intent.intentType}${productInfo}`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logError(`Failed to process item ${item.fullname}: ${msg}`)
    }
  }

  // Update state with newest seen IDs (first item = newest)
  const newestPost = posts[0]?.fullname ?? null
  const newestComment = comments[0]?.fullname ?? null
  updateSubredditState(state, subreddit, newestPost, newestComment)

  return stats
}

async function runCheck(
  config: BotConfig,
  reddit: RedditClient,
  llm: IntentExtractor,
  matcher: ProductMatcher,
  telegram: TelegramNotifier
): Promise<void> {
  log("Starting check...")
  const state = await loadState(config.stateFilePath)

  let totalPosts = 0
  let totalComments = 0
  let totalFiltered = 0
  let totalMatches = 0

  for (const subreddit of config.subreddits) {
    try {
      const stats = await processSubreddit(
        subreddit,
        state,
        reddit,
        llm,
        matcher,
        telegram,
        config
      )
      totalPosts += stats.posts
      totalComments += stats.comments
      totalFiltered += stats.filtered
      totalMatches += stats.matches
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logError(`Failed to process r/${subreddit}: ${msg}`)
    }
  }

  await saveState(config.stateFilePath, state)
  
  // Send summary notification
  await telegram.sendSummary({
    subreddits: config.subreddits,
    totalPosts,
    totalComments,
    filtered: totalFiltered,
    matches: totalMatches,
  })

  log("Check complete.")
}

// ── Entry Point ─────────────────────────────────────────────

async function main(): Promise<void> {
  const config = loadConfig()
  const runOnce = process.argv.includes("--once")

  log(`GrimDealz Reddit Bot starting`)
  log(`Subreddits: ${config.subreddits.join(", ")}`)
  log(`Mode: ${runOnce ? "single run" : `loop (every ${config.checkIntervalMs / 60_000}min)`}`)
  log(`Confidence threshold: ${config.confidenceThreshold}`)

  const prisma = new PrismaClient()
  const reddit = new RedditClient(config.reddit)
  const llm = new IntentExtractor(config.anthropic.apiKey)
  const matcher = new ProductMatcher(prisma)
  const telegram = new TelegramNotifier(
    config.telegram.botToken,
    config.telegram.chatId,
    config.siteUrl
  )

  try {
    if (runOnce) {
      await runCheck(config, reddit, llm, matcher, telegram)
    } else {
      // Continuous loop
      while (true) {
        await runCheck(config, reddit, llm, matcher, telegram)
        log(
          `Next check in ${config.checkIntervalMs / 60_000} minutes...\n`
        )
        await sleep(config.checkIntervalMs)
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logError(`Fatal error: ${msg}`)
    try {
      await telegram.sendError(msg)
    } catch {
      // If Telegram itself fails, just log
    }
    process.exitCode = 1
  } finally {
    await prisma.$disconnect()
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

void main()
