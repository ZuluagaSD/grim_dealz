import type { RedditItem } from "./types.js"

/**
 * Keyword pre-filter: cheap first pass to avoid sending every post to the LLM.
 * Returns true if the text contains any purchase-intent keyword pattern.
 */

const PURCHASE_INTENT_PATTERNS: RegExp[] = [
  // Direct buy intent
  /\bwtb\b/i,
  /\bwant\s+to\s+buy\b/i,
  /\blooking\s+to\s+buy\b/i,
  /\bplanning\s+to\s+buy\b/i,
  /\bgoing\s+to\s+buy\b/i,
  /\babout\s+to\s+buy\b/i,
  /\bready\s+to\s+buy\b/i,
  /\bhoping\s+to\s+(buy|get|find)\b/i,
  /\bneed\s+to\s+(buy|pick\s+up|grab)\b/i,
  /\blooking\s+to\s+(pick\s+up|grab|get|start)\b/i,
  /\bwant\s+to\s+(pick\s+up|grab|get|start)\b/i,

  // Shopping queries
  /\bwhere\s+(to|can\s+I|do\s+I|should\s+I)\s+(buy|get|find|order)\b/i,
  /\bbest\s+place\s+to\s+(buy|get|order)\b/i,
  /\bcheapest\s+place\b/i,
  /\bbest\s+price\b/i,
  /\bbest\s+deal\b/i,
  /\bgood\s+deal\b/i,

  // Purchase consideration
  /\bshould\s+I\s+(buy|get|pick\s+up|grab)\b/i,
  /\bworth\s+(buying|getting|picking\s+up)\b/i,
  /\bthinking\s+(about|of)\s+(buying|getting|picking\s+up)\b/i,
  /\bconsidering\s+(buying|getting)\b/i,
  /\btempted\s+to\s+(buy|get|grab)\b/i,

  // Price checking
  /\bhow\s+much\s+(is|does|are|do)\b/i,
  /\bprice\s+check\b/i,
  /\bany\s+discount/i,
  /\bon\s+sale\b/i,
]

const IGNORED_AUTHORS = new Set(["AutoModerator", "[deleted]", "[removed]"])

export function passesKeywordFilter(item: RedditItem): boolean {
  if (IGNORED_AUTHORS.has(item.author)) {
    return false
  }

  const text = item.title ? `${item.title} ${item.body}` : item.body

  return PURCHASE_INTENT_PATTERNS.some((pattern) => pattern.test(text))
}
