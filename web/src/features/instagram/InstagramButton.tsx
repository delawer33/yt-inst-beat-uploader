import { useState } from "react";
import type { Beat } from "@/features/library/queries";
import { InstagramPanel } from "./InstagramPanel";

/**
 * The "Instagram" button of the Beat page and the panel it opens. Hidden for a Beat with no
 * audio and cover on disk (one only synced from the channel): there is no Reel to make.
 */
export function InstagramButton({ beat }: { beat: Beat }) {
  const [open, setOpen] = useState(false);
  if (!beat.has_files) return null;
  return (
    <>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        Instagram
      </button>
      {open && <InstagramPanel beatId={beat.id} onClose={() => setOpen(false)} />}
    </>
  );
}
