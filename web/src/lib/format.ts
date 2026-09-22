/** 999 -> "999", 1234 -> "1.2K", 1_500_000 -> "1.5M". Trailing ".0" is dropped. */
export function formatViews(n: number): string {
  if (n < 1000) return String(n);
  const [value, suffix] = n < 1_000_000 ? [n / 1000, "K"] : [n / 1_000_000, "M"];
  return `${value.toFixed(1).replace(/\.0$/, "")}${suffix}`;
}

/** ISO timestamp (naive UTC from the server) -> "1 Sep 2026"; null -> "". */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso.endsWith("Z") ? iso : `${iso}Z`);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
