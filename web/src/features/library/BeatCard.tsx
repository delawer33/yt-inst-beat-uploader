import { Link } from "react-router";
import { Eye } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatDateTime, formatViews } from "@/lib/format";
import { Cover } from "./Cover";
import type { Beat } from "./queries";
import { StatusBadge } from "./StatusBadge";

export function BeatCard({ beat }: { beat: Beat }) {
  return (
    <Card className="gap-0 overflow-hidden py-0 transition-colors hover:border-ring">
      <Link to={`/beats/${beat.id}`} className="flex flex-col" aria-label={beat.title}>
        <Cover src={beat.cover_url} title={beat.title} />
        <div className="flex flex-col gap-2 p-4">
          <h3 className="truncate font-medium" title={beat.title}>
            {beat.title || "Untitled"}
          </h3>
          <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
            <StatusBadge status={beat.status} />
            {beat.status === "scheduled" && beat.publish_at ? (
              <span aria-label="publish time">{formatDateTime(beat.publish_at)}</span>
            ) : (
              <span className="inline-flex items-center gap-1" aria-label="views">
                <Eye aria-hidden="true" className="size-4" />
                {formatViews(beat.views)}
              </span>
            )}
          </div>
        </div>
      </Link>
    </Card>
  );
}
