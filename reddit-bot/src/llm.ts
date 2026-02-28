import Anthropic from "@anthropic-ai/sdk"
import type { RedditItem, PurchaseIntentResult } from "./types.js"

const SYSTEM_PROMPT = `You are a purchase intent detector for Warhammer miniatures and tabletop gaming products.

Analyze Reddit posts/comments and determine if the author intends to buy a specific Warhammer product (miniature kit, box set, paint set, codex/battletome, terrain, etc).

Respond with ONLY valid JSON in this exact format:
{
  "hasPurchaseIntent": boolean,
  "confidence": number between 0.0 and 1.0,
  "productQuery": "extracted product name or search query",
  "intentType": "looking_to_buy" | "price_check" | "recommendation_seeking",
  "summary": "one sentence summary of what the user wants"
}

Rules:
- hasPurchaseIntent = true only if the person is actively looking to purchase, not just discussing a product
- productQuery = the specific product name they want (e.g. "Leviathan", "Codex Space Marines", "Intercessors", "Combat Patrol Orks")
- If they mention multiple products, pick the primary one
- Confidence reflects how certain you are about the purchase intent
- Ignore posts that are SELLING or TRADING (not buying)
- Ignore posts showing painted models or asking rules/lore questions
- Ignore posts about 3D printing or recasting
- hasPurchaseIntent = false for general hobby discussion without buying intent`

export class IntentExtractor {
  private readonly client: Anthropic

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey })
  }

  async extractIntent(item: RedditItem): Promise<PurchaseIntentResult> {
    const text = item.title
      ? `[Post Title] ${item.title}\n[Post Body] ${item.body}`
      : `[Comment] ${item.body}`

    const userMessage = `Subreddit: r/${item.subreddit}\nAuthor: u/${item.author}\n\n${text}`

    const response = await this.client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    })

    const content = response.content[0]
    if (!content || content.type !== "text") {
      return noIntent()
    }

    try {
      const parsed = JSON.parse(content.text) as Record<string, unknown>
      return {
        hasPurchaseIntent: parsed["hasPurchaseIntent"] === true,
        confidence:
          typeof parsed["confidence"] === "number" ? parsed["confidence"] : 0,
        productQuery:
          typeof parsed["productQuery"] === "string"
            ? parsed["productQuery"]
            : "",
        intentType: validateIntentType(parsed["intentType"]),
        summary:
          typeof parsed["summary"] === "string" ? parsed["summary"] : "",
      }
    } catch {
      return noIntent()
    }
  }
}

function validateIntentType(
  value: unknown
): PurchaseIntentResult["intentType"] {
  if (
    value === "looking_to_buy" ||
    value === "price_check" ||
    value === "recommendation_seeking"
  ) {
    return value
  }
  return "looking_to_buy"
}

function noIntent(): PurchaseIntentResult {
  return {
    hasPurchaseIntent: false,
    confidence: 0,
    productQuery: "",
    intentType: "looking_to_buy",
    summary: "",
  }
}
