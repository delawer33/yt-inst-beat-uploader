import { Link, useNavigate, useParams } from "react-router";
import { ExternalLink, Eye, MessageSquare, ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { JobList } from "@/features/jobs/JobList";
import { useJobs } from "@/features/jobs/queries";
import { Cover } from "@/features/library/Cover";
import { StatusBadge } from "@/features/library/StatusBadge";
import { useBeat, useSetPrivacy, type Beat } from "@/features/library/queries";
import { formatDate, formatViews } from "@/lib/format";
import { MetadataForm } from "./MetadataForm";
import { PrivacySelect } from "./PrivacySelect";
import { useDeleteBeat, usePatchBeat, useUploadBeat } from "./queries";

/**
 * One Beat. Layout, top to bottom:
 *   header  — cover, title, status, counters, published date, "Open on YouTube";
 *             a draft gets "Upload to YouTube" / "Delete draft", a running render or
 *             upload job its progress line
 *   metadata — MetadataForm for DRAFT/QUEUED beats, read-only Metadata afterwards
 *   (slice 6: ViewsChart goes between metadata and jobs)
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

const EDITABLE = new Set<Beat["status"]>(["draft", "queued"]);

function BeatView({ beat }: { beat: Beat }) {
  const editable = EDITABLE.has(beat.status);
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
          {beat.status === "draft" && <DraftActions beat={beat} />}
          <CurrentJob beatId={beat.id} />
        </div>
      </header>
      {editable ? <EditableMetadata beat={beat} /> : <Metadata beat={beat} />}
      <JobList beatId={beat.id} />
    </div>
  );
}

/** Upload (render then upload) and delete, for drafts only. */
function DraftActions({ beat }: { beat: Beat }) {
  const navigate = useNavigate();
  const upload = useUploadBeat();
  const remove = useDeleteBeat();
  const error = upload.error ?? remove.error;

  function onDelete() {
    if (!window.confirm(`Delete the draft "${beat.title || "Untitled"}" and its files?`)) return;
    remove.mutate(beat.id, { onSuccess: () => navigate("/") });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        size="sm"
        disabled={!beat.has_files || upload.isPending}
        onClick={() => upload.mutate(beat.id)}
      >
        Upload to YouTube
      </Button>
      <Button variant="outline" size="sm" disabled={remove.isPending} onClick={onDelete}>
        Delete draft
      </Button>
      {!beat.has_files && (
        <span className="text-sm text-muted-foreground">Audio and cover are missing.</span>
      )}
      {error && (
        <span role="alert" className="text-sm text-destructive">
          {error.message}
        </span>
      )}
    </div>
  );
}

const JOB_LABEL: Record<string, string> = { render: "Rendering", upload: "Uploading" };

/** A compact progress line while a RENDER or UPLOAD job of this beat is queued or running. */
function CurrentJob({ beatId }: { beatId: string }) {
  const jobs = useJobs(beatId);
  const job = jobs.data?.find(
    (j) => (j.kind === "render" || j.kind === "upload") && (j.status === "running" || j.status === "queued"),
  );
  if (!job) return null;
  const percent = Math.round(job.progress * 100);
  return (
    <div className="flex flex-col gap-1.5" aria-live="polite">
      <span className="text-sm text-muted-foreground">
        {job.status === "queued" ? `${JOB_LABEL[job.kind]} queued` : `${JOB_LABEL[job.kind]}… ${percent}%`}
      </span>
      <Progress value={percent} aria-label={`${job.kind} progress`} />
    </div>
  );
}

/** MetadataForm wired to PATCH; the server's 422 message lands next to the Save button. */
function EditableMetadata({ beat }: { beat: Beat }) {
  const patch = usePatchBeat();
  return (
    <section>
      <MetadataForm
        key={beat.updated_at}
        beat={beat}
        onSave={(p) => patch.mutate({ id: beat.id, patch: p })}
        saving={patch.isPending}
        error={patch.error?.message ?? null}
        saved={patch.isSuccess}
      />
    </section>
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

/** Read-only metadata plus the privacy selector, for beats past the draft stage. */
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

function categoryLabel(id: number): string {
  return id === 10 ? "Music (10)" : String(id);
}
