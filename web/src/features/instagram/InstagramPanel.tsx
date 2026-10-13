import { useState, type FormEvent } from "react";
import { formatDateTime } from "@/lib/format";
import type { Instagram } from "./queries";
import {
  useInstagram,
  useSetArtistHandle,
  useSetPosted,
  useShowReel,
  useWriteInstagram,
} from "./queries";

/** The Reel part of the panel, as the API reports it. */
type Reel = Instagram["reel"];

/** The Instagram panel of one Beat: loads its state and wires the buttons. */
export function InstagramPanel({ beatId, onClose }: { beatId: string; onClose: () => void }) {
  const panel = useInstagram(beatId);
  const show = useShowReel();
  const write = useWriteInstagram(beatId);
  const posted = useSetPosted(beatId);
  const handle = useSetArtistHandle(beatId);
  return (
    <InstagramPanelView
      panel={panel.data ?? null}
      loadError={panel.error?.message ?? null}
      onShow={() => show.mutate(beatId)}
      showPending={show.isPending}
      showError={show.error?.message ?? null}
      onWrite={() => write.mutate()}
      writePending={write.isPending}
      writeError={write.error?.message ?? null}
      onPosted={(value) => posted.mutate(value)}
      onHandle={(artist, value) => handle.mutate({ artist, handle: value })}
      handlePending={handle.isPending}
      handleError={handle.error?.message ?? null}
      onClose={onClose}
    />
  );
}

type ViewProps = {
  panel: Instagram | null;
  loadError?: string | null;
  onShow: () => void;
  showPending?: boolean;
  showError?: string | null;
  onWrite?: () => void;
  writePending?: boolean;
  writeError?: string | null;
  onPosted?: (posted: boolean) => void;
  /** Save an artist's handle, or `null` = "a style, not an artist". */
  onHandle?: (artist: string, handle: string | null) => void;
  handlePending?: boolean;
  handleError?: string | null;
  onClose: () => void;
};

/**
 * What goes to Instagram, by hand: the Reel (Render progress, then "Show in folder" to drag
 * the file into Instagram), then the Instagram Post in the order Instagram asks for it, each
 * field with a copy button, and the "Posted on Instagram" switch.
 */
export function InstagramPanelView({
  panel,
  loadError = null,
  onShow,
  showPending = false,
  showError = null,
  onWrite = () => {},
  writePending = false,
  writeError = null,
  onPosted = () => {},
  onHandle = () => {},
  handlePending = false,
  handleError = null,
  onClose,
}: ViewProps) {
  return (
    <aside className="panel fixed enter-panel" aria-label="Instagram">
      <div className="panel-head">
        <h5>Instagram</h5>
        <button
          type="button"
          className="btn btn-icon btn-sm ml-auto"
          aria-label="Close"
          onClick={onClose}
        >
          ✕
        </button>
      </div>
      <div className="panel-body">
        {loadError !== null && (
          <div className="note" role="alert">
            <span className="note-title">The panel did not load</span>
            <span className="text-soft">{loadError}</span>
          </div>
        )}
        {panel === null && loadError === null && <p className="text-muted">Loading…</p>}
        {panel !== null && (
          <>
            {panel.unknown_artists.length > 0 && (
              <HandlesBlock
                artists={panel.unknown_artists}
                onHandle={onHandle}
                pending={handlePending}
                error={handleError}
              />
            )}
            <ReelBlock reel={panel.reel} onShow={onShow} pending={showPending} error={showError} />
            <PostBlock
              panel={panel}
              onWrite={onWrite}
              pending={writePending}
              error={writeError}
              onPosted={onPosted}
            />
          </>
        )}
      </div>
    </aside>
  );
}

/** Artists of the title with no Artist Handle yet: asked once, remembered for every Beat. */
function HandlesBlock({
  artists,
  onHandle,
  pending,
  error,
}: {
  artists: string[];
  onHandle: (artist: string, handle: string | null) => void;
  pending: boolean;
  error: string | null;
}) {
  return (
    <section className="flex flex-col gap-3" aria-label="Artist Handles">
      <div className="section-head">
        <span className="label">Who to tag</span>
      </div>
      <p className="text-soft">
        The Instagram account of each artist in the title, asked once. A name that is a style, not
        an artist, is never tagged.
      </p>
      {artists.map((artist) => (
        <HandleAsk key={artist} artist={artist} onHandle={onHandle} pending={pending} />
      ))}
      {error !== null && (
        <div className="note" role="alert">
          <span className="text-soft">{error}</span>
        </div>
      )}
    </section>
  );
}

function HandleAsk({
  artist,
  onHandle,
  pending,
}: {
  artist: string;
  onHandle: (artist: string, handle: string | null) => void;
  pending: boolean;
}) {
  const [handle, setHandle] = useState("");
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (handle.trim() !== "") onHandle(artist, handle.trim());
  };
  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2" aria-label={artist}>
      <input
        className="input w-48"
        aria-label={`Instagram handle of ${artist}`}
        placeholder={`@handle of ${artist}`}
        value={handle}
        onChange={(e) => setHandle(e.target.value)}
        disabled={pending}
      />
      <button
        type="submit"
        className="btn btn-secondary btn-sm"
        disabled={pending || handle.trim() === ""}
      >
        Save
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => onHandle(artist, null)}
        disabled={pending}
      >
        {artist} is a style, not an artist
      </button>
    </form>
  );
}

function ReelBlock({
  reel,
  onShow,
  pending,
  error,
}: {
  reel: Reel;
  onShow: () => void;
  pending: boolean;
  error: string | null;
}) {
  const percent = Math.round((reel.progress ?? 0) * 100);
  return (
    <section className="flex flex-col gap-3" aria-label="Reel">
      <div className="section-head">
        <span className="label">Reel</span>
        {reel.state === "ready" && <span className="tag tag-neutral">Ready</span>}
        {reel.state === "rendering" && <span className="tag tag-accent">Rendering</span>}
        {reel.state === "failed" && <span className="tag tag-failed">Failed</span>}
      </div>

      {reel.state === "rendering" && (
        <div className="job" aria-live="polite">
          <div className="job-line">
            <span className="job-title">
              <span className="dot-live pulse">● </span>
              Rendering the Reel
            </span>
            <span className="time num">{percent}%</span>
          </div>
          <div className="progress thin striped">
            <i style={{ width: `${percent}%` }} />
          </div>
        </div>
      )}

      {reel.state === "failed" && (
        <div className="note" role="alert">
          <span className="note-title">The Reel did not render</span>
          <span className="text-soft">{reel.error}</span>
        </div>
      )}

      {reel.state === "unavailable" && (
        <p className="text-muted">This beat has no audio and cover on this machine.</p>
      )}

      {reel.state === "ready" && (
        <>
          <p className="text-soft">1080×1920, the whole beat. Cut your 30 seconds in Instagram.</p>
          <button
            type="button"
            className="btn btn-secondary btn-flush"
            onClick={onShow}
            disabled={pending}
          >
            Show in folder <span className="trail">→</span>
          </button>
        </>
      )}
      {error !== null && (
        <div className="note" role="alert">
          <span className="text-soft">{error}</span>
        </div>
      )}
    </section>
  );
}

function PostBlock({
  panel,
  onWrite,
  pending,
  error,
  onPosted,
}: {
  panel: Instagram;
  onWrite: () => void;
  pending: boolean;
  error: string | null;
  onPosted: (posted: boolean) => void;
}) {
  const { post } = panel;
  return (
    <section className="flex flex-col gap-3" aria-label="Instagram Post">
      <div className="section-head">
        <span className="label">Instagram Post</span>
        {post !== null && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onWrite}
            disabled={pending}
          >
            {pending ? "Writing…" : "Write again"}
          </button>
        )}
      </div>

      {error !== null && (
        <div className="note" role="alert">
          <span className="note-title">The post was not written</span>
          <span className="text-soft">{error}</span>
        </div>
      )}

      {post === null && (
        <>
          <p className="text-soft">
            The hook, caption, audio name and alt text are written once from the title and kept with
            the beat.
          </p>
          <button
            type="button"
            className="btn btn-secondary btn-flush"
            onClick={onWrite}
            disabled={pending}
          >
            {pending ? "Writing…" : "Write the post"} <span className="trail">→</span>
          </button>
        </>
      )}

      {post !== null && (
        <div>
          <CopyRow label="On-screen text" value={post.hook} />
          <CopyRow label="Caption" value={post.caption} />
          <CopyRow
            label="Tag people"
            value={panel.tag_people.join(", ")}
            emptyText="No artist to tag"
          />
          <CopyRow label="Audio name" value={post.audio_name} />
          <CopyRow label="Alt text" value={post.alt_text} />
          <CopyRow
            label="Publish time"
            value={formatDateTime(panel.publish_time)}
            emptyText="Not set"
          />
          <CopyRow
            label="Trial reel"
            value="on"
            hint="Shown to non-followers first; add to profile if it does well."
            copyable={false}
          />
          {panel.beatstars_url !== null && (
            <CopyRow
              label="BeatStars link"
              value={panel.beatstars_url}
              hint="To send to people who comment."
            />
          )}
        </div>
      )}

      <label className="radio">
        <input
          type="checkbox"
          checked={panel.posted}
          onChange={(e) => onPosted(e.target.checked)}
        />
        <span className="dot" />
        Posted on Instagram
      </label>
    </section>
  );
}

/** A field of the Instagram Post with its copy button. An empty value has nothing to copy. */
function CopyRow({
  label,
  value,
  hint,
  emptyText = "",
  copyable = true,
}: {
  label: string;
  value: string;
  hint?: string;
  emptyText?: string;
  copyable?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div className="copy-row" role="group" aria-label={label}>
      <span className="label">{label}</span>
      <span className={`value${value === "" ? " empty" : ""}`}>
        {value === "" ? emptyText : value}
      </span>
      {copyable && (
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          aria-label={`Copy ${label}`}
          onClick={copy}
          disabled={value === ""}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      )}
      {hint !== undefined && <span className="hint">{hint}</span>}
    </div>
  );
}
