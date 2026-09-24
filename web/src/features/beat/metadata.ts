// Mirrors beat_upload/config.py; the server validates and answers 422 with a message.
export const MAX_TITLE = 100;
export const MAX_DESCRIPTION = 5000;
export const MAX_TAGS = 500;

/** Beyond this a title is cut in a YouTube search result; it is not an error. */
export const SEARCH_TITLE_LIMIT = 70;

export function tagsLength(tags: string[]): number {
  return tags.reduce((n, t) => n + t.length, 0);
}

/** Default publish time for a new schedule: tomorrow at the current hour, local time. */
export function defaultPublishAt(now: Date = new Date()): Date {
  const date = new Date(now);
  date.setDate(date.getDate() + 1);
  date.setMinutes(0, 0, 0);
  return date;
}

export type TitleFit = { verdict: "fits" | "cut in search" | "too long"; chars: number };

/**
 * How the title will read as a search result: it fits, YouTube cuts it, or YouTube refuses
 * it. Pure; the preview column shows `verdict · chars`.
 */
export function titleFit(title: string): TitleFit {
  const chars = title.length;
  if (chars > MAX_TITLE) return { verdict: "too long", chars };
  if (chars > SEARCH_TITLE_LIMIT) return { verdict: "cut in search", chars };
  return { verdict: "fits", chars };
}

export type SharedTags = { title: string; shared: number; total: number };

/**
 * The Beat in the Library that shares the most tags with these ones. Pure. Null when
 * nothing overlaps, so the preview can leave the row out.
 */
export function sharedTags(
  tags: string[],
  others: { id: string; title: string; tags: string[] }[],
  selfId: string,
): SharedTags | null {
  const mine = new Set(tags.map((t) => t.toLowerCase()));
  if (mine.size === 0) return null;
  let best: SharedTags | null = null;
  for (const other of others) {
    if (other.id === selfId) continue;
    const shared = other.tags.filter((t) => mine.has(t.toLowerCase())).length;
    if (shared === 0 || (best !== null && shared <= best.shared)) continue;
    best = { title: other.title || "Untitled", shared, total: mine.size };
  }
  return best;
}
