import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import type { BotConfig } from "./types.js"

const __dirname = dirname(fileURLToPath(import.meta.url))

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

export function loadConfig(): BotConfig {
  const subredditsRaw =
    process.env["REDDIT_SUBREDDITS"] ??
    "Warhammer40k,Warhammer,ageofsigmar,WarhammerCompetitive,theOldWorld,miniswap"

  return {
    subreddits: subredditsRaw.split(",").map((s) => s.trim()),
    checkIntervalMs:
      parseInt(process.env["CHECK_INTERVAL_MINUTES"] ?? "15", 10) * 60 * 1000,
    confidenceThreshold: parseFloat(
      process.env["CONFIDENCE_THRESHOLD"] ?? "0.6"
    ),
    reddit: {
      clientId: requireEnv("REDDIT_CLIENT_ID"),
      clientSecret: requireEnv("REDDIT_CLIENT_SECRET"),
      username: requireEnv("REDDIT_USERNAME"),
      password: requireEnv("REDDIT_PASSWORD"),
      userAgent:
        process.env["REDDIT_USER_AGENT"] ??
        "GrimDealz:reddit-bot:v1.0.0 (by /u/GrimDealzBot)",
    },
    anthropic: {
      apiKey: requireEnv("ANTHROPIC_API_KEY"),
    },
    telegram: {
      botToken: requireEnv("TELEGRAM_BOT_TOKEN"),
      chatId: requireEnv("TELEGRAM_CHAT_ID"),
    },
    siteUrl: process.env["SITE_URL"] ?? "https://grimdealz.com",
    stateFilePath: resolve(__dirname, "..", "state.json"),
  }
}
