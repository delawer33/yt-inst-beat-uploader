import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useCreateBeat } from "@/features/beat/queries";
import { FileSlot } from "./FileSlot";
import { EMPTY, receive, type Selection } from "./files";

/**
 * New beat: two drop zones and nothing else. One takes the audio, the other the cover, so
 * the files can come from different folders (dropping both onto either zone works too).
 * As soon as both are there the Draft is created — no Create button — and its page opens,
 * where the Render is already running (ADR 0004).
 */
export function NewBeatPage() {
  const navigate = useNavigate();
  const create = useCreateBeat();
  const [selection, setSelection] = useState<Selection>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  const { mutate } = create;

  useEffect(() => {
    const { audio, image } = selection;
    if (audio === null || image === null || started.current) return;
    started.current = true;
    setError(null);
    mutate(
      { audio, image },
      {
        onSuccess: (beat) => navigate(`/beats/${beat.id}`),
        onError: (e) => {
          started.current = false;
          setError(e.message);
        },
      },
    );
  }, [selection, mutate, navigate]);

  function onFiles(files: File[]) {
    if (files.length === 0) return;
    const result = receive(selection, files);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setError(null);
    setSelection(result.selection);
  }

  const waiting = selection.audio === null ? "the audio" : selection.image === null ? "the cover" : null;
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
            Uploading the files…
          </span>
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <FileSlot
          kind="audio"
          file={selection.audio}
          onFiles={onFiles}
          disabled={create.isPending}
        />
        <FileSlot
          kind="image"
          file={selection.image}
          onFiles={onFiles}
          disabled={create.isPending}
        />
      </div>
      {error && (
        <div className="note" role="alert">
          <span className="note-title">That will not do</span>
          <span className="text-soft">{error}</span>
        </div>
      )}
      {waiting && !create.isPending && (
        <p className="text-muted">The Draft is created as soon as {waiting} is here.</p>
      )}
    </div>
  );
}
