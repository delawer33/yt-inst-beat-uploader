import { Badge } from "@/components/ui/badge";
import type { BeatStatus } from "./queries";
import { STATUS_LABEL } from "./status";

type Variant = "outline" | "secondary" | "warning" | "success" | "default";

const variants: Record<BeatStatus, Variant> = {
  draft: "outline",
  queued: "warning",
  uploading: "warning",
  uploaded: "secondary",
  scheduled: "default",
  published: "success",
};

export function StatusBadge({ status }: { status: BeatStatus }) {
  return (
    <Badge variant={variants[status]} aria-label="status" data-status={status}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}
