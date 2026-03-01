import type { RedditItem, BotConfig } from "./types.js"

interface TokenResponse {
  access_token: string
  expires_in: number
  token_type: string
}

interface RedditListingResponse {
  data: {
    children: Array<{
      kind: string
      data: Record<string, unknown>
    }>
    after: string | null
  }
}

export class RedditClient {
  private accessToken: string | null = null
  private tokenExpiresAt = 0
  private readonly config: BotConfig["reddit"]

  constructor(config: BotConfig["reddit"]) {
    this.config = config
  }

  private async authenticate(): Promise<void> {
    const credentials = Buffer.from(
      `${this.config.clientId}:${this.config.clientSecret}`
    ).toString("base64")

    const response = await fetch(
      "https://www.reddit.com/api/v1/access_token",
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": this.config.userAgent,
        },
        body: new URLSearchParams({
          grant_type: "password",
          username: this.config.username,
          password: this.config.password,
        }).toString(),
      }
    )

    if (!response.ok) {
      const body = await response.text()
      throw new Error(
        `Reddit auth failed: ${response.status} ${response.statusText} — ${body}`
      )
    }

    const data = (await response.json()) as TokenResponse
    this.accessToken = data.access_token
    // Refresh 60s before expiry
    this.tokenExpiresAt = Date.now() + data.expires_in * 1000 - 60_000
  }

  private async ensureAuth(): Promise<void> {
    if (!this.accessToken || Date.now() >= this.tokenExpiresAt) {
      await this.authenticate()
    }
  }

  private async apiGet(path: string): Promise<unknown> {
    await this.ensureAuth()

    const response = await fetch(`https://oauth.reddit.com${path}`, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "User-Agent": this.config.userAgent,
      },
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(
        `Reddit API error: ${response.status} ${response.statusText} — ${body}`
      )
    }

    return response.json()
  }

  /** Fetch newest posts from a subreddit, sorted newest-first */
  async fetchNewPosts(
    subreddit: string,
    limit = 100
  ): Promise<RedditItem[]> {
    const data = (await this.apiGet(
      `/r/${subreddit}/new?limit=${limit}`
    )) as RedditListingResponse

    return data.data.children
      .filter((child) => child.kind === "t3")
      .map((child) => parsePost(child.data))
  }

  /** Fetch newest comments from a subreddit, sorted newest-first */
  async fetchNewComments(
    subreddit: string,
    limit = 100
  ): Promise<RedditItem[]> {
    const data = (await this.apiGet(
      `/r/${subreddit}/comments?limit=${limit}`
    )) as RedditListingResponse

    return data.data.children
      .filter((child) => child.kind === "t1")
      .map((child) => parseComment(child.data))
  }
}

function parsePost(d: Record<string, unknown>): RedditItem {
  return {
    fullname: d["name"] as string,
    type: "post",
    subreddit: d["subreddit"] as string,
    author: d["author"] as string,
    title: (d["title"] as string) ?? null,
    body: (d["selftext"] as string) ?? "",
    permalink: `https://reddit.com${d["permalink"] as string}`,
    createdUtc: d["created_utc"] as number,
  }
}

function parseComment(d: Record<string, unknown>): RedditItem {
  return {
    fullname: d["name"] as string,
    type: "comment",
    subreddit: d["subreddit"] as string,
    author: d["author"] as string,
    title: null,
    body: (d["body"] as string) ?? "",
    permalink: `https://reddit.com${d["permalink"] as string}`,
    createdUtc: d["created_utc"] as number,
  }
}

/**
 * Filter items to only those newer than the last-seen fullname.
 * Reddit API returns items newest-first, so we iterate until we hit the known ID.
 * On first run (no lastSeen), returns the latest `seedCount` items.
 */
export function filterNewItems(
  items: RedditItem[],
  lastSeenFullname: string | null,
  seedCount = 10
): RedditItem[] {
  if (!lastSeenFullname) {
    // First run — seed with a small batch to avoid flooding
    return items.slice(0, seedCount)
  }

  const newItems: RedditItem[] = []
  for (const item of items) {
    if (item.fullname === lastSeenFullname) break
    newItems.push(item)
  }
  return newItems
}
