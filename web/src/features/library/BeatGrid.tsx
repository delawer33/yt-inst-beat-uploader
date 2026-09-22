import { BeatCard } from "./BeatCard";
import type { Beat } from "./queries";

export function BeatGrid({ beats }: { beats: Beat[] }) {
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {beats.map((beat) => (
        <li key={beat.id}>
          <BeatCard beat={beat} />
        </li>
      ))}
    </ul>
  );
}
