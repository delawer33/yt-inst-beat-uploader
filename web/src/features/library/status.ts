import type { BeatStatus } from "./queries";

/** What the owner did with the Beat — the words the glossary uses. */
export const STATUS_LABEL: Record<BeatStatus, string> = {
  draft: "Draft",
  queued: "Queued",
  uploading: "Uploading",
  uploaded: "Uploaded",
  scheduled: "Scheduled",
  published: "Published",
};

/** Design System `.tag` modifier per Beat status. */
export const STATUS_TAG: Record<BeatStatus, string> = {
  draft: "tag-outline",
  queued: "tag-neutral",
  uploading: "tag-accent",
  uploaded: "tag-neutral",
  scheduled: "tag-neutral",
  published: "tag-ink",
};

/** Design System `.badge` modifier per Beat status: the corner of every cover in the grid. */
export const STATUS_BADGE: Record<BeatStatus, string> = {
  draft: "badge badge-outline",
  queued: "badge",
  uploading: "badge badge-accent",
  uploaded: "badge",
  scheduled: "badge",
  published: "badge badge-ink",
};
