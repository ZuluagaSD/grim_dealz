import { readFile, writeFile } from "node:fs/promises"
import type { BotState, SubredditState } from "./types.js"

const EMPTY_STATE: BotState = { subreddits: {} }

export async function loadState(filePath: string): Promise<BotState> {
  try {
    const raw = await readFile(filePath, "utf-8")
    return JSON.parse(raw) as BotState
  } catch {
    return { ...EMPTY_STATE, subreddits: {} }
  }
}

export async function saveState(
  filePath: string,
  state: BotState
): Promise<void> {
  await writeFile(filePath, JSON.stringify(state, null, 2), "utf-8")
}

export function getSubredditState(
  state: BotState,
  subreddit: string
): SubredditState {
  return (
    state.subreddits[subreddit] ?? {
      lastPostFullname: null,
      lastCommentFullname: null,
      lastRunAt: new Date().toISOString(),
    }
  )
}

export function updateSubredditState(
  state: BotState,
  subreddit: string,
  postFullname: string | null,
  commentFullname: string | null
): void {
  const existing = state.subreddits[subreddit]
  state.subreddits[subreddit] = {
    lastPostFullname: postFullname ?? existing?.lastPostFullname ?? null,
    lastCommentFullname:
      commentFullname ?? existing?.lastCommentFullname ?? null,
    lastRunAt: new Date().toISOString(),
  }
}
