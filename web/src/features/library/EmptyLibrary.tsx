import { useTriggerSync } from "@/features/jobs/queries";
import { GOOGLE_START_URL, useAuthStatus } from "@/features/settings/authQueries";
import { DropTile } from "./DropTile";
import type { BeatDrop } from "./useBeatDrop";

/**
 * Mockup 1d, first run: the hero drop on the left, and on the right the offer to pull in
 * the beats that are already on the channel. "Import channel" runs a sync Job.
 */
export function EmptyLibrary({ drop }: { drop: BeatDrop }) {
  const auth = useAuthStatus();
  const sync = useTriggerSync();
  const connected = auth.data?.status === "connected";

  return (
    <div className="page-body grid flex-1 gap-6 md:grid-cols-2">
      <DropTile drop={drop} variant="hero" />
      <div className="flex flex-col justify-end gap-4">
        <h2>
          Already have beats
          <br />
          on the channel?
        </h2>
        <p className="text-soft">
          Connect YouTube and they show up here with their stats. No files needed — those cards
          only track.
        </p>
        {(drop.error ?? sync.error) && (
          <p role="alert" className="note">
            {drop.error ?? sync.error?.message}
          </p>
        )}
        <div className="flex gap-2">
          {!connected && (
            <a className="btn btn-primary" href={GOOGLE_START_URL}>
              Connect YouTube
            </a>
          )}
          <button
            type="button"
            className="btn btn-secondary"
            disabled={!connected || sync.isPending}
            onClick={() => sync.mutate()}
          >
            {sync.isPending ? "Importing…" : "Import channel"}
          </button>
        </div>
      </div>
    </div>
  );
}
