import { useEffect, useState, type FormEvent } from "react";
import { useSaveSettings, useSettings } from "./queries";

type Entry = { name: string; handle: string; style: boolean };

/** The stored map as editable lines: a style has no handle. */
export function toEntries(map: Record<string, string | null>): Entry[] {
  return Object.entries(map).map(([name, handle]) => ({
    name,
    handle: handle ?? "",
    style: handle === null,
  }));
}

/** The lines back to the map the API takes. A line with no name, or no handle and no style, is dropped. */
export function toMap(entries: Entry[]): Record<string, string | null> {
  const map: Record<string, string | null> = {};
  for (const { name, handle, style } of entries) {
    const key = name.trim();
    if (key === "") continue;
    if (style) map[key] = null;
    else if (handle.trim() !== "") map[key] = handle.trim();
  }
  return map;
}

/**
 * Artist Handles: the Instagram account of each artist the titles name, asked once in the
 * Instagram panel and fixable here. A name marked "style" (Guitar, Reggaeton) is never tagged.
 */
export function ArtistHandlesRow() {
  const settings = useSettings();
  const save = useSaveSettings();
  const [entries, setEntries] = useState<Entry[]>([]);
  const loaded = settings.data;

  useEffect(() => {
    if (loaded) setEntries(toEntries(loaded.artist_handles));
  }, [loaded]);

  const change = (index: number, patch: Partial<Entry>) =>
    setEntries((all) => all.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)));

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!loaded) return;
    save.mutate({
      stats_hour: loaded.stats_hour,
      artist_handles: toMap(entries),
    });
  }

  return (
    <section className="settings-row">
      <div className="what">
        <b>Artist Handles</b>
        <p>
          Who to tag on Instagram for each artist in a title. The Instagram panel asks once for a
          new name; fix a wrong handle here.
        </p>
      </div>
      <div className="how">
        <form onSubmit={onSubmit} className="flex flex-col gap-3" aria-label="Artist Handles">
          {entries.length === 0 && <p className="text-muted">No artists yet.</p>}
          {entries.map((entry, index) => (
            <div key={index} className="flex flex-wrap items-center gap-2">
              <input
                className="input w-44"
                aria-label="Artist"
                value={entry.name}
                onChange={(e) => change(index, { name: e.target.value })}
              />
              <input
                className="input w-44"
                aria-label={`Handle of ${entry.name}`}
                placeholder="@handle"
                value={entry.handle}
                onChange={(e) => change(index, { handle: e.target.value })}
                disabled={entry.style}
              />
              <label className="radio">
                <input
                  type="checkbox"
                  checked={entry.style}
                  onChange={(e) => change(index, { style: e.target.checked })}
                />
                <span className="dot" />
                Style, not an artist
              </label>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                aria-label={`Remove ${entry.name}`}
                onClick={() => setEntries((all) => all.filter((_, i) => i !== index))}
              >
                Remove
              </button>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setEntries((all) => [...all, { name: "", handle: "", style: false }])}
            >
              Add artist
            </button>
            <button
              type="submit"
              className="btn btn-secondary"
              disabled={save.isPending || settings.isPending}
            >
              {save.isPending ? "Saving…" : "Save"}
            </button>
            {save.isError && (
              <span role="alert" className="text-accent">
                {save.error.message}
              </span>
            )}
            {save.isSuccess && !save.isPending && <span className="text-muted">Saved.</span>}
          </div>
        </form>
      </div>
    </section>
  );
}
