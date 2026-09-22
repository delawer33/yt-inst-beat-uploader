import { Link, useParams } from "react-router";
import { ExternalLink, Eye, MessageSquare, ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JobList } from "@/features/jobs/JobList";
import { Cover } from "@/features/library/Cover";
import { StatusBadge } from "@/features/library/StatusBadge";
import { useBeat, useSetPrivacy, type Beat } from "@/features/library/queries";
import { useBeatStats } from "@/features/stats/queries";
import { ViewsChart } from "@/features/stats/ViewsChart";
import { formatDate, formatViews } from "@/lib/format";
import { PrivacySelect } from "./PrivacySelect";

/**
 * One Beat. Layout, top to bottom:
 *   header  — cover, title, status, counters, published date, "Open on YouTube"
 *   metadata — read-only today; slice 5 swaps in MetadataForm for DRAFT/QUEUED beats
 *   stats   — ViewsChart of the last 28 days, only for beats on YouTube
 *   jobs    — JobList beatId=id
 */
export function BeatPage() {
  const { id = "" } = useParams();
  const beat = useBeat(id);

  if (beat.isPending) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (beat.error) {
    return (
      <div className="flex flex-col gap-4">
        <p role="alert" className="text-sm text-destructive">
          {beat.error.message}
        </p>
        <Link to="/" className="text-sm underline">
          Back to Library
        </Link>
      </div>
    );
  }
  return <BeatView beat={beat.data} />;
}

function BeatView({ beat }: { beat: Beat }) {
  return (
    <div className="flex flex-col gap-8">
      <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
        ← Library
      </Link>
      <header className="grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Cover src={beat.cover_url} title={beat.title} className="rounded-xl border" />
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold">{beat.title || "Untitled"}</h1>
            <div className="flex items-center gap-3">
              <StatusBadge status={beat.status} />
              {beat.published_at && (
                <span className="text-sm text-muted-foreground">
                  Published {formatDate(beat.published_at)}
                </span>
              )}
            </div>
          </div>
          <Counters beat={beat} />
          {beat.youtube_url && (
            <Button asChild variant="outline" size="sm" className="w-fit">
              <a href={beat.youtube_url} target="_blank" rel="noreferrer">
                Open on YouTube
                <ExternalLink aria-hidden="true" />
              </a>
            </Button>
          )}
        </div>
      </header>
      <Metadata beat={beat} />
      {beat.youtube_id && <Stats beatId={beat.id} />}
      <JobList beatId={beat.id} />
    </div>
  );
}

function Counters({ beat }: { beat: Beat }) {
  const items = [
    { label: "views", icon: Eye, value: formatViews(beat.views) },
    { label: "likes", icon: ThumbsUp, value: formatViews(beat.likes) },
    { label: "comments", icon: MessageSquare, value: formatViews(beat.comments) },
  ];
  return (
    <dl className="flex gap-6">
      {items.map(({ label, icon: Icon, value }) => (
        <div key={label} className="flex flex-col gap-1">
          <dt className="inline-flex items-center gap-1 text-xs text-muted-foreground capitalize">
            <Icon aria-hidden="true" className="size-3.5" />
            {label}
          </dt>
          <dd className="text-lg font-semibold" aria-label={label}>
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Read-only metadata plus the privacy selector. Slice 5 replaces this with MetadataForm. */
function Metadata({ beat }: { beat: Beat }) {
  const setPrivacy = useSetPrivacy();
  const onYouTube = beat.youtube_id !== null;
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Metadata</h2>
      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[8rem_minmax(0,1fr)]">
        <dt className="text-muted-foreground">Description</dt>
        <dd className="whitespace-pre-wrap">{beat.description || "—"}</dd>
        <dt className="text-muted-foreground">Tags</dt>
        <dd>{beat.tags.length ? beat.tags.join(", ") : "—"}</dd>
        <dt className="text-muted-foreground">Category</dt>
        <dd>{categoryLabel(beat.category_id)}</dd>
        <dt className="text-muted-foreground">
          <label htmlFor="privacy">Privacy</label>
        </dt>
        <dd className="flex items-center gap-3">
          <PrivacySelect
            id="privacy"
            value={beat.privacy}
            disabled={!onYouTube || setPrivacy.isPending}
            onChange={(privacy) => setPrivacy.mutate({ id: beat.id, privacy })}
          />
          {!onYouTube && (
            <span className="text-muted-foreground">Set on YouTube after upload.</span>
          )}
          {setPrivacy.error && (
            <span role="alert" className="text-destructive">
              {setPrivacy.error.message}
            </span>
          )}
        </dd>
      </dl>
    </section>
  );
}

function Stats({ beatId }: { beatId: string }) {
  const stats = useBeatStats(beatId);
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Views, last 28 days</h2>
      {stats.isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
      {stats.error && (
        <p role="alert" className="text-sm text-destructive">
          {stats.error.message}
        </p>
      )}
      {stats.data && <ViewsChart points={stats.data} />}
    </section>
  );
}

function categoryLabel(id: number): string {
  return id === 10 ? "Music (10)" : String(id);
}
