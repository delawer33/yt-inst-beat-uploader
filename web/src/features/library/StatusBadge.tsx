import { Badge } from "@/components/ui/badge";
import type { BeatStatus } from "./queries";

type Variant = "outline" | "secondary" | "warning" | "success" | "default";

const variants: Record<BeatStatus, Variant> = {
  draft: "outline",
  queued: "warning",
  rendering: "warning",
  uploading: "warning",
  uploaded: "secondary",
  scheduled: "default",
  published: "success",
};

const labels: Record<BeatStatus, string> = {
  draft: "Draft",
  queued: "Queued",
  rendering: "Rendering",
  uploading: "Uploading",
  uploaded: "Uploaded",
  scheduled: "Scheduled",
  published: "Published",
};

export function StatusBadge({ status }: { status: BeatStatus }) {
  return (
    <Badge variant={variants[status]} aria-label="status" data-status={status}>
      {labels[status]}
    </Badge>
  );
}
