import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { useNavigate } from "react-router";
import { Upload } from "lucide-react";
import { useCreateBeat } from "@/features/beat/queries";
import { cn } from "@/lib/utils";

// Mirrors beat_upload/beat_folder.py; the server is the authority and answers 400 otherwise.
export const AUDIO_EXTENSIONS = [".mp3", ".wav"];
export const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".bmp"];

export type Picked = { audio: File; image: File };

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot).toLowerCase();
}

/** Pure. Exactly one audio and one image file, or a message saying what is wrong. */
export function pickFiles(files: File[]): { picked: Picked } | { error: string } {
  const audio = files.filter((f) => AUDIO_EXTENSIONS.includes(extensionOf(f.name)));
  const image = files.filter((f) => IMAGE_EXTENSIONS.includes(extensionOf(f.name)));
  const other = files.filter((f) => !audio.includes(f) && !image.includes(f));
  const names = (list: File[]) => list.map((f) => f.name).join(", ");

  if (other.length > 0) {
    return {
      error: `Unsupported file: ${names(other)}. Drop one audio (${AUDIO_EXTENSIONS.join(", ")}) and one image (${IMAGE_EXTENSIONS.join(", ")}).`,
    };
  }
  if (audio.length > 1) return { error: `One audio file only, got ${audio.length}: ${names(audio)}.` };
  if (image.length > 1) return { error: `One image only, got ${image.length}: ${names(image)}.` };
  if (audio.length === 0) return { error: `Missing the audio file (${AUDIO_EXTENSIONS.join(", ")}).` };
  if (image.length === 0) return { error: `Missing the cover image (${IMAGE_EXTENSIONS.join(", ")}).` };
  return { picked: { audio: audio[0], image: image[0] } };
}

/** Drop (or pick) one audio + one image: creates a draft Beat and opens its page. */
export function DropZone() {
  const navigate = useNavigate();
  const create = useCreateBeat();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  function handle(files: File[]) {
    const result = pickFiles(files);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setError(null);
    create.mutate(result.picked, {
      onSuccess: (beat) => navigate(`/beats/${beat.id}`),
      onError: (e) => setError(e.message),
    });
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setOver(false);
    handle(Array.from(event.dataTransfer.files));
  }

  function onPick(event: ChangeEvent<HTMLInputElement>) {
    handle(Array.from(event.target.files ?? []));
    event.target.value = "";
  }

  const accept = [...AUDIO_EXTENSIONS, ...IMAGE_EXTENSIONS].join(",");
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">New beat</h2>
      <div
        role="button"
        tabIndex={0}
        aria-label="Drop an audio file and a cover image, or click to choose them"
        aria-busy={create.isPending}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            input.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={cn(
          "flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground transition-colors hover:border-ring hover:text-foreground focus-visible:border-ring focus-visible:outline-none",
          over && "border-ring bg-accent text-foreground",
          create.isPending && "pointer-events-none opacity-60",
        )}
      >
        <Upload aria-hidden="true" className="size-6" />
        <p>
          {create.isPending
            ? "Uploading files…"
            : "Drop an audio file (.mp3, .wav) and a cover image here, or click to choose"}
        </p>
        <input
          ref={input}
          type="file"
          multiple
          accept={accept}
          onChange={onPick}
          className="sr-only"
          aria-label="Choose beat files"
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
