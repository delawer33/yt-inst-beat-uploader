import type { Beat } from "@/features/library/queries";

type Preview = NonNullable<Beat["beatstars"]>;

const RELEASE: Record<Preview["release"], string> = {
  with_video: "With the video",
  skipped_private: "Not sent to BeatStars: the video is private or unlisted without a time",
  skipped_by_owner: "Skipped by you",
};

function Chips({ values }: { values: string[] }) {
  if (values.length === 0) return <span className="text-soft">none</span>;
  return (
    <span className="flex flex-wrap justify-end gap-1">
      {values.map((value) => (
        <span key={value} className="tag tag-outline">
          {value}
        </span>
      ))}
    </span>
  );
}

/**
 * What will go to BeatStars for a Beat from a Bounce Folder, read-only (CONTEXT.md,
 * "BeatStars Track"). Title, tags and genres come from the saved YouTube title; `moods`
 * and `instruments` are the form's, so what Fill from title just matched shows at once.
 * When the title cannot be read yet it says so instead of showing guesses.
 */
export function BeatStarsBlock({
  preview,
  moods,
  instruments,
}: {
  preview: Preview;
  moods: string[];
  instruments: string[];
}) {
  return (
    <section className="flex flex-col gap-3" aria-label="BeatStars">
      <span className="group-label">BeatStars</span>
      {preview.error ? (
        <div className="note" role="status">
          <div className="note-title">Not ready for BeatStars</div>
          <span className="text-soft">{preview.error}</span>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <div className="fact-row">
            <span className="text-soft">Title</span>
            <span>{preview.title}</span>
          </div>
          <div className="fact-row">
            <span className="text-soft">Tags</span>
            <Chips values={preview.tags} />
          </div>
          <div className="fact-row">
            <span className="text-soft">Genres</span>
            <Chips values={preview.genres} />
          </div>
          <div className="fact-row">
            <span className="text-soft">Moods</span>
            <Chips values={moods} />
          </div>
          <div className="fact-row">
            <span className="text-soft">Instruments</span>
            <Chips values={instruments} />
          </div>
          <div className="fact-row">
            <span className="text-soft">Samples</span>
            <span>{preview.samples ? "Loops and samples" : "none"}</span>
          </div>
          <div className="fact-row">
            <span className="text-soft">Release</span>
            <span>{RELEASE[preview.release]}</span>
          </div>
        </div>
      )}
      {preview.url && (
        <a href={preview.url} target="_blank" rel="noreferrer">
          On BeatStars ↗
        </a>
      )}
    </section>
  );
}
