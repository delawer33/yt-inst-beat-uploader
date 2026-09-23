import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Beat, Privacy } from "@/features/library/queries";
import { serverDate, toDateTimeLocal } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PrivacySelect, type PrivacyChoice } from "./PrivacySelect";
import type { BeatPatch } from "./queries";

// Mirrors beat_upload/config.py; the server validates and answers 422 with a message.
export const MAX_TITLE = 100;
export const MAX_DESCRIPTION = 5000;
export const MAX_TAGS = 500;

export function parseTags(text: string): string[] {
  return text
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

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

type Props = {
  beat: Beat;
  onSave: (patch: BeatPatch) => void;
  saving?: boolean;
  error?: string | null;
  saved?: boolean;
};

/**
 * Editable Metadata of a draft. Only the fields the user changed go into the patch.
 *
 * "Scheduled" in the privacy select is `privacy: "private"` plus `publish_at`; the
 * date-time input is local time and is sent as UTC. Any other choice clears `publish_at`.
 */
export function MetadataForm({ beat, onSave, saving = false, error = null, saved = false }: Props) {
  const [title, setTitle] = useState(beat.title);
  const [description, setDescription] = useState(beat.description);
  const [tagsText, setTagsText] = useState(beat.tags.join(", "));
  const [choice, setChoice] = useState<PrivacyChoice>(beat.publish_at ? "scheduled" : beat.privacy);
  const [publishAt, setPublishAt] = useState(() =>
    toDateTimeLocal(beat.publish_at ? serverDate(beat.publish_at) : defaultPublishAt()),
  );

  const tags = parseTags(tagsText);
  const tagsLen = tagsLength(tags);
  const overLimit = title.length > MAX_TITLE || description.length > MAX_DESCRIPTION || tagsLen > MAX_TAGS;
  const scheduled = choice === "scheduled";
  const publishAtInvalid = scheduled && Number.isNaN(new Date(publishAt).getTime());

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const patch: BeatPatch = {};
    if (title !== beat.title) patch.title = title;
    if (description !== beat.description) patch.description = description;
    if (tagsText !== beat.tags.join(", ")) patch.tags = tags;
    const privacy: Privacy = scheduled ? "private" : choice;
    if (privacy !== beat.privacy) patch.privacy = privacy;
    const publishAtIso = scheduled ? new Date(publishAt).toISOString() : null;
    const beatPublishAtIso = beat.publish_at ? serverDate(beat.publish_at).toISOString() : null;
    if (publishAtIso !== beatPublishAtIso) {
      patch.publish_at = publishAtIso;
      if (publishAtIso) patch.privacy = "private"; // YouTube schedules private videos only
    }
    onSave(patch);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Metadata</h2>
      <Field label="Title" htmlFor="title" count={title.length} max={MAX_TITLE}>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-invalid={title.length > MAX_TITLE || undefined}
          required
        />
      </Field>
      <Field label="Description" htmlFor="description" count={description.length} max={MAX_DESCRIPTION}>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={10}
          aria-invalid={description.length > MAX_DESCRIPTION || undefined}
          className="w-full rounded-md border border-input bg-input/30 px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive"
        />
      </Field>
      <Field label="Tags (comma separated)" htmlFor="tags" count={tagsLen} max={MAX_TAGS}>
        <Input
          id="tags"
          value={tagsText}
          onChange={(e) => setTagsText(e.target.value)}
          aria-invalid={tagsLen > MAX_TAGS || undefined}
        />
      </Field>
      <div className="flex flex-col gap-1 text-sm">
        <label htmlFor="privacy">Privacy</label>
        <PrivacySelect id="privacy" value={choice} onChange={setChoice} allowScheduled />
      </div>
      {scheduled && (
        <div className="flex flex-col gap-1 text-sm">
          <label htmlFor="publish_at">Publish at</label>
          <Input
            id="publish_at"
            type="datetime-local"
            value={publishAt}
            onChange={(e) => setPublishAt(e.target.value)}
            aria-invalid={publishAtInvalid || undefined}
            required
            className="w-fit"
          />
          <span className="text-xs text-muted-foreground">
            Your local time. Uploaded as private; YouTube makes it public at this time.
          </span>
        </div>
      )}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={saving || overLimit || publishAtInvalid}>
          Save
        </Button>
        {error && (
          <span role="alert" className="text-sm text-destructive">
            {error}
          </span>
        )}
        {saved && !error && (
          <span role="status" className="text-sm text-muted-foreground">
            Saved.
          </span>
        )}
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  count,
  max,
  children,
}: {
  label: string;
  htmlFor: string;
  count: number;
  max: number;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 text-sm">
      <div className="flex items-baseline justify-between">
        <label htmlFor={htmlFor}>{label}</label>
        <span
          aria-label={`${label} length`}
          className={cn("text-xs text-muted-foreground", count > max && "text-destructive")}
        >
          {count}/{max}
        </span>
      </div>
      {children}
    </div>
  );
}
