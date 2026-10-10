import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { useCreateBeatFromFolder } from "@/features/beat/queries";

/**
 * New beat: one field for the path of a Bounce Folder. Create reads the folder in place
 * (nothing is copied, ADR 0007) and opens the Draft, where the Render is already running
 * (ADR 0004). The two-file drop is gone from this page; its components and the API stay.
 */
export function NewBeatPage() {
  const navigate = useNavigate();
  const create = useCreateBeatFromFolder();
  const [path, setPath] = useState("");
  const [error, setError] = useState<string | null>(null);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (path.trim() === "") return;
    setError(null);
    create.mutate(path.trim(), {
      onSuccess: (beat) => navigate(`/beats/${beat.id}`),
      onError: (e) => setError(e.message),
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="crumb">
        <Link to="/" className="text-muted">
          ← Library
        </Link>
        <span className="text-muted">/</span>
        <span>New beat</span>
        {create.isPending && (
          <span className="end text-muted" role="status">
            Reading the folder…
          </span>
        )}
      </div>
      <form className="flex flex-col gap-4" onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="bounce-path">Bounce Folder path</label>
          <input
            id="bounce-path"
            className="input"
            type="text"
            value={path}
            placeholder="/home/you/bounces/Jungle_104bpm_Amin_calm-dark"
            spellCheck={false}
            autoFocus
            disabled={create.isPending}
            onChange={(e) => setPath(e.target.value)}
          />
        </div>
        <p className="text-muted">
          The WAV, the tagged MP3, the cover and the stems are read from there; nothing is
          copied.
        </p>
        <div>
          <button
            className="btn btn-primary"
            type="submit"
            disabled={create.isPending || path.trim() === ""}
          >
            Create
          </button>
        </div>
      </form>
      {error && (
        <div className="note" role="alert">
          <span className="note-title">That will not do</span>
          <span className="text-soft">{error}</span>
        </div>
      )}
    </div>
  );
}
