import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import type { Job } from "@/api/events";
import { useJobs, useRetryJob } from "@/features/jobs/queries";
import { useBeats, type Beat, type Privacy } from "@/features/library/queries";
import { useAuthStatus } from "@/features/settings/authQueries";
import { serverDate, toDateTimeLocal } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  MAX_DESCRIPTION,
  MAX_TAGS,
  MAX_TITLE,
  defaultPublishAt,
  tagsLength,
} from "./metadata";
import type { BeatPatch } from "./queries";
import { usePatchBeat, useUploadBeat } from "./queries";
import { TagInput } from "./TagInput";
import { YouTubePreview } from "./YouTubePreview";

/** How long the form waits after the last keystroke before it saves. */
export const AUTOSAVE_MS = 800;

const JOB_LABEL: Record<string, string> = {
  render: "Render",
  upload: "Upload",
  publish: "Publish",
  stats: "Stats",
};

/** The editable Metadata of a Draft, as the form holds it. */
export type DraftForm = {
  title: string;
  description: string;
  tags: string[];
  privacy: Privacy;
  /** Local `datetime-local` value, or null for "publish now". */
  publishAt: string | null;
};

export function formOf(beat: Beat): DraftForm {
  return {
    title: beat.title,
    description: beat.description,
    tags: beat.tags,
    privacy: beat.privacy,
    publishAt: beat.publish_at ? toDateTimeLocal(serverDate(beat.publish_at)) : null,
  };
}

function isoOf(local: string | null): string | null {
  if (local === null) return null;
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Only what the owner actually changed goes into the patch. Pure. */
export function patchOf(form: DraftForm, beat: Beat): BeatPatch {
  const patch: BeatPatch = {};
  if (form.title !== beat.title) patch.title = form.title;
  if (form.description !== beat.description) patch.description = form.description;
  if (JSON.stringify(form.tags) !== JSON.stringify(beat.tags)) patch.tags = form.tags;

  const publishAt = isoOf(form.publishAt);
  const current = beat.publish_at ? serverDate(beat.publish_at).toISOString() : null;
  if (publishAt !== current) patch.publish_at = publishAt;
  // YouTube only schedules private videos, so a schedule decides the privacy.
  const privacy: Privacy = form.publishAt === null ? form.privacy : "private";
  if (privacy !== beat.privacy) patch.privacy = privacy;
  return patch;
}

/** A schedule the owner has started typing but not finished is not worth saving. */
function savable(form: DraftForm): boolean {
  return form.publishAt === null || isoOf(form.publishAt) !== null;
}

/** "Draft saved 14:03". */
function savedLabel(at: Date | null): string {
  if (at === null) return "";
  const time = at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  return `Draft saved ${time}`;
}

/** The Beat page of a Draft or a Queued Beat: hooks in, view below (Mockup 3b). */
export function DraftBeatPage({ beat }: { beat: Beat }) {
  const patch = usePatchBeat();
  const upload = useUploadBeat();
  const beats = useBeats();
  const auth = useAuthStatus();
  const jobs = useJobs(beat.id);
  const retry = useRetryJob();

  const failed = beat.active_job === null && !beat.rendered
    ? (jobs.data ?? []).find((job) => job.kind === "render" && job.status === "failed") ?? null
    : null;

  return (
    <DraftBeatView
      beat={beat}
      channel={auth.data?.channel?.title ?? null}
      library={beats.data ?? []}
      failedRender={failed}
      onSave={(body) => patch.mutate({ id: beat.id, patch: body })}
      onSend={(body) => {
        const send = () => upload.mutate(beat.id);
        if (Object.keys(body).length === 0) send();
        else patch.mutate({ id: beat.id, patch: body }, { onSuccess: send });
      }}
      onRetry={(id) => retry.mutate(id)}
      saving={patch.isPending || upload.isPending}
      error={patch.error?.message ?? upload.error?.message ?? null}
      savedAt={patch.isSuccess ? (patch.submittedAt ? new Date(patch.submittedAt) : null) : null}
    />
  );
}

type ViewProps = {
  beat: Beat;
  channel: string | null;
  library: { id: string; title: string; tags: string[] }[];
  failedRender: Job | null;
  onSave: (patch: BeatPatch) => void;
  onSend: (patch: BeatPatch) => void;
  onRetry: (jobId: string) => void;
  saving?: boolean;
  error?: string | null;
  savedAt?: Date | null;
};

/**
 * Mockup 3b: the form on the left with the file facts and the Render above it, the YouTube
 * preview on the right. The form autosaves — a debounced PATCH of whatever changed — and
 * the head says when it last did. "Save & upload when rendered" saves and sends the Beat;
 * "Save draft" only saves.
 */
export function DraftBeatView({
  beat,
  channel,
  library,
  failedRender,
  onSave,
  onSend,
  onRetry,
  saving = false,
  error = null,
  savedAt = null,
}: ViewProps) {
  const [form, setForm] = useState<DraftForm>(() => formOf(beat));
  const [coverSize, setCoverSize] = useState<{ width: number; height: number } | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const pending = useRef<BeatPatch | null>(null);

  const dirty = patchOf(form, beat);
  const dirtyKey = JSON.stringify(dirty);
  pending.current = dirty;

  // Autosave: one PATCH of everything that changed, once the typing stops.
  useEffect(() => {
    const body = pending.current;
    if (body === null || Object.keys(body).length === 0 || !savable(form)) return;
    const timer = setTimeout(() => onSave(body), AUTOSAVE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirtyKey]);

  useEffect(() => {
    if (savedAt !== null) setLastSaved(savedAt);
  }, [savedAt]);

  const set = <K extends keyof DraftForm>(key: K, value: DraftForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const tagsLen = tagsLength(form.tags);
  const scheduled = form.publishAt !== null;
  const tooLong =
    form.title.length > MAX_TITLE || form.description.length > MAX_DESCRIPTION || tagsLen > MAX_TAGS;
  const blocked = saving || tooLong || !savable(form);
  const job = beat.active_job;

  return (
    <div className="flex flex-col">
      <div className="crumb">
        <Link to="/" className="text-muted">
          ← Library
        </Link>
        <span className="text-muted">/</span>
        <span>{beat.title || "New beat"}</span>
        <span className={cn("tag", beat.status === "queued" ? "tag-accent" : "tag-outline")}>
          {beat.status === "queued" ? "Queued" : "Draft"}
        </span>
        <span className="end text-muted num" role="status">
          {savedLabel(lastSaved)}
        </span>
      </div>

      <div className="split-form">
        <div className="col-form">
          <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-3.5">
            <div className="thumb lg">
              {beat.cover_url && <img src={beat.cover_url} alt={`Cover of ${beat.title}`} />}
            </div>
            <div className="file-meta">
              {coverSize && (
                <div className="fact-row">
                  <span className="text-soft">Cover</span>
                  <span>
                    {coverSize.width}×{coverSize.height}
                  </span>
                </div>
              )}
              <div className="fact-row">
                <span className="text-soft">Video</span>
                <span>
                  {beat.rendered
                    ? "video ready"
                    : job
                      ? `${JOB_LABEL[job.kind]} ${Math.round(job.progress * 100)}%`
                      : failedRender
                        ? "render failed"
                        : "not rendered yet"}
                </span>
              </div>
            </div>
          </div>

          {job && (
            <div className="job">
              <div className="job-line">
                <span className="job-title">
                  <span className="dot-live pulse">● </span>
                  {JOB_LABEL[job.kind]}
                </span>
                <span className="time num">
                  {job.status === "queued" ? "queued" : `${Math.round(job.progress * 100)}%`}
                </span>
              </div>
              <div className="progress thin striped">
                <i style={{ width: `${Math.round(job.progress * 100)}%` }} />
              </div>
              {job.message && <pre className="log clip">{job.message}</pre>}
            </div>
          )}

          {failedRender && (
            <div className="note" role="alert">
              <div className="note-title">Render failed</div>
              {failedRender.error && <pre className="log">{failedRender.error}</pre>}
              <div className="job-actions">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => onRetry(failedRender.id)}
                >
                  Retry render
                </button>
              </div>
            </div>
          )}

          <div className="field">
            <label htmlFor="title">
              Title
              <span className={cn("counter", form.title.length > MAX_TITLE && "text-accent")}>
                {form.title.length} / {MAX_TITLE}
              </span>
            </label>
            <input
              id="title"
              className="input title"
              value={form.title}
              aria-invalid={form.title.length > MAX_TITLE || undefined}
              onChange={(e) => set("title", e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="description">
              Description
              <span
                className={cn("counter", form.description.length > MAX_DESCRIPTION && "text-accent")}
              >
                {form.description.length} / {MAX_DESCRIPTION}
              </span>
            </label>
            <textarea
              id="description"
              className="input"
              rows={6}
              value={form.description}
              aria-invalid={form.description.length > MAX_DESCRIPTION || undefined}
              onChange={(e) => set("description", e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="tags">
              Tags
              <span className={cn("counter", tagsLen > MAX_TAGS && "text-accent")}>
                {tagsLen} / {MAX_TAGS}
              </span>
            </label>
            <TagInput id="tags" tags={form.tags} onChange={(tags) => set("tags", tags)} />
          </div>

          <div className="form-grid-2">
            <div className="field">
              <label>Privacy</label>
              <div className="seg">
                {(["public", "unlisted", "private"] as const).map((value) => (
                  <label key={value} className="seg-opt">
                    <input
                      type="radio"
                      name="privacy"
                      value={value}
                      disabled={scheduled}
                      checked={!scheduled && form.privacy === value}
                      onChange={() => set("privacy", value)}
                    />
                    {value[0].toUpperCase() + value.slice(1)}
                  </label>
                ))}
              </div>
            </div>
            <div className="field">
              <label>Publish</label>
              <div className="seg">
                <label className="seg-opt">
                  <input
                    type="radio"
                    name="publish"
                    checked={!scheduled}
                    onChange={() => set("publishAt", null)}
                  />
                  Now
                </label>
                <label className="seg-opt">
                  <input
                    type="radio"
                    name="publish"
                    checked={scheduled}
                    onChange={() => set("publishAt", toDateTimeLocal(defaultPublishAt()))}
                  />
                  Schedule
                </label>
              </div>
            </div>
          </div>

          {scheduled && (
            <div className="field">
              <label htmlFor="publish_at">Publish at</label>
              <input
                id="publish_at"
                type="datetime-local"
                className="input"
                value={form.publishAt ?? ""}
                aria-invalid={!savable(form) || undefined}
                onChange={(e) => set("publishAt", e.target.value)}
              />
              <span className="drop-hint">
                Your local time. Uploaded as private; YouTube makes it public then.
              </span>
            </div>
          )}

          {error && (
            <div className="note" role="alert">
              <div className="note-title">YouTube will not take that</div>
              <span className="text-soft">{error}</span>
            </div>
          )}

          <div className="action-bar">
            {beat.status === "draft" && (
              <button
                type="button"
                className="btn btn-primary btn-flush btn-grow"
                disabled={blocked || !beat.has_files}
                onClick={() => onSend(patchOf(form, beat))}
              >
                Save &amp; upload when rendered <span className="trail">→</span>
              </button>
            )}
            <button
              type="button"
              className="btn btn-secondary"
              disabled={blocked || Object.keys(dirty).length === 0}
              onClick={() => onSave(patchOf(form, beat))}
            >
              Save draft
            </button>
          </div>
        </div>

        <div className="col-preview">
          <YouTubePreview
            beatId={beat.id}
            title={form.title}
            tags={form.tags}
            coverUrl={beat.cover_url}
            channel={channel}
            publishAt={isoOf(form.publishAt)}
            library={library}
            onCoverSize={setCoverSize}
          />
        </div>
      </div>
    </div>
  );
}
