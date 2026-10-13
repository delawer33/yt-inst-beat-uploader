import type { Instagram } from "./queries";
import { useInstagram, useShowReel } from "./queries";

/** The Reel part of the panel, as the API reports it. */
type Reel = Instagram["reel"];

/** The Instagram panel of one Beat: loads its state and wires "Show in folder". */
export function InstagramPanel({ beatId, onClose }: { beatId: string; onClose: () => void }) {
  const panel = useInstagram(beatId);
  const show = useShowReel();
  return (
    <InstagramPanelView
      reel={panel.data?.reel ?? null}
      loadError={panel.error?.message ?? null}
      onShow={() => show.mutate(beatId)}
      showPending={show.isPending}
      showError={show.error?.message ?? null}
      onClose={onClose}
    />
  );
}

type ViewProps = {
  reel: Reel | null;
  loadError?: string | null;
  onShow: () => void;
  showPending?: boolean;
  showError?: string | null;
  onClose: () => void;
};

/**
 * What goes to Instagram, by hand. For now the Reel: its Render progress, then "Show in
 * folder" to drag the file into Instagram. The Instagram Post's fields come below it.
 */
export function InstagramPanelView({
  reel,
  loadError = null,
  onShow,
  showPending = false,
  showError = null,
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
        {reel === null && loadError === null && <p className="text-muted">Loading…</p>}
        {reel !== null && (
          <ReelBlock reel={reel} onShow={onShow} pending={showPending} error={showError} />
        )}
      </div>
    </aside>
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
