import { ACCEPT, type BeatDrop } from "./useBeatDrop";

type Props = { drop: BeatDrop; variant: "tile" | "hero" };

/**
 * The drop target itself: the first cell of the grid (`tile`), or the first-run `hero`. A
 * label, so a click opens the file picker; the window-wide drop lives in `useBeatDrop`.
 */
export function DropTile({ drop, variant }: Props) {
  return (
    <label className={`drop ${variant}${drop.active ? " active" : ""}`}>
      <input
        type="file"
        multiple
        accept={ACCEPT}
        aria-label="Add a beat"
        disabled={drop.pending}
        className="sr-only"
        onChange={(event) => {
          drop.onFiles([...(event.target.files ?? [])]);
          event.target.value = "";
        }}
      />
      {variant === "hero" ? (
        <>
          <div className="hero">
            Drop
            <br />a beat<span className="text-accent">.</span>
          </div>
          <div className="text-soft">
            mp3 + png. It appears here as a Draft, you fill in the title and tags, and it goes to
            YouTube.
          </div>
          <div className="drop-hint">Anywhere in this window works as a drop target.</div>
        </>
      ) : (
        <>
          <div className="drop-title">
            {drop.pending ? (
              "Uploading…"
            ) : (
              <>
                Drop
                <br />
                mp3 + png
              </>
            )}
          </div>
          <div className="drop-hint">or click</div>
        </>
      )}
    </label>
  );
}
