import { BeatCard } from "./BeatCard";
import { DropTile } from "./DropTile";
import type { Beat } from "./queries";
import type { BeatDrop } from "./useBeatDrop";

type Props = { beats: Beat[]; failed: Set<string>; drop: BeatDrop };

/** Mockup 1b: the drop tile is the first cell, every Beat a `.beat-card` after it. */
export function BeatGrid({ beats, failed, drop }: Props) {
  return (
    <div className="beat-grid page-body">
      <DropTile drop={drop} variant="tile" />
      {beats.map((beat) => (
        <BeatCard key={beat.id} beat={beat} failed={failed.has(beat.id)} />
      ))}
    </div>
  );
}
