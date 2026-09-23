import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { useCreateBeat } from "@/features/beat/queries";
import { FileSlot } from "./FileSlot";
import { EMPTY, receive, type Kind, type Selection } from "./files";

/**
 * New beat: two independent slots, one for the audio and one for the cover, so the files
 * can come from different folders. "Create beat" uploads both, creates a draft Beat and
 * opens its page.
 */
export function NewBeatPage() {
  const navigate = useNavigate();
  const create = useCreateBeat();
  const [selection, setSelection] = useState<Selection>(EMPTY);
  const [error, setError] = useState<string | null>(null);

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

  function clear(kind: Kind) {
    setError(null);
    setSelection({ ...selection, [kind]: null });
  }

  function submit() {
    if (!selection.audio || !selection.image) return;
    setError(null);
    create.mutate(
      { audio: selection.audio, image: selection.image },
      {
        onSuccess: (beat) => navigate(`/beats/${beat.id}`),
        onError: (e) => setError(e.message),
      },
    );
  }

  const ready = selection.audio !== null && selection.image !== null;
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
        ← Library
      </Link>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">New beat</h1>
        <p className="text-sm text-muted-foreground">
          Pick the audio and the cover separately; they can live in different folders.
          Dropping both at once onto either slot works as well.
        </p>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <FileSlot
          kind="audio"
          file={selection.audio}
          onFiles={onFiles}
          onClear={() => clear("audio")}
          disabled={create.isPending}
        />
        <FileSlot
          kind="image"
          file={selection.image}
          onFiles={onFiles}
          onClear={() => clear("image")}
          disabled={create.isPending}
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex items-center gap-3">
        <Button type="button" onClick={submit} disabled={!ready || create.isPending}>
          {create.isPending ? "Uploading files…" : "Create beat"}
        </Button>
        {!ready && !create.isPending && (
          <span className="text-sm text-muted-foreground">
            {selection.audio ? "Now add the cover image." : selection.image ? "Now add the audio." : "Both files are required."}
          </span>
        )}
      </div>
    </div>
  );
}
