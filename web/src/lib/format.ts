/** 999 -> "999", 1234 -> "1.2K", 1_500_000 -> "1.5M". Trailing ".0" is dropped. */
export function formatViews(n: number): string {
  if (n < 1000) return String(n);
  const [value, suffix] = n < 1_000_000 ? [n / 1000, "K"] : [n / 1_000_000, "M"];
  return `${value.toFixed(1).replace(/\.0$/, "")}${suffix}`;
}

/** Server timestamps are naive UTC ("2026-09-01T12:30:00"); read them as such. */
export function serverDate(iso: string): Date {
  return new Date(/Z|[+-]\d\d:\d\d$/.test(iso) ? iso : `${iso}Z`);
}

/** ISO timestamp (naive UTC from the server) -> "1 Sep 2026"; null -> "". */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = serverDate(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** ISO timestamp (naive UTC from the server) -> "1 Sep 2026, 18:00" in local time; null -> "". */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = serverDate(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Local time as `<input type="datetime-local">` wants it: "2026-09-24T18:00". The input has
 * no seconds, so this cuts to the minute: anything comparing a stored timestamp against this
 * round trip has to compare at minute granularity too, or every schedule set elsewhere reads
 * as an edit (see `patchOf` in `features/beat/DraftBeatPage.tsx`).
 */
export function toDateTimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}
