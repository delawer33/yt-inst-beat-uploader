import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Image, Music, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EXTENSIONS, formatBytes, type Kind } from "./files";

const LABEL: Record<Kind, string> = { audio: "Audio", image: "Cover image" };
const ICON: Record<Kind, typeof Music> = { audio: Music, image: Image };

/** Object URL of a file for an <img> preview; null when the browser (or jsdom) has none. */
function useObjectUrl(file: File | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (file === null || typeof URL.createObjectURL !== "function") {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url;
}

type Props = {
  kind: Kind;
  file: File | null;
  /** Everything dropped or picked on this slot; the page sorts it into slots. */
  onFiles: (files: File[]) => void;
  onClear: () => void;
  disabled?: boolean;
};

/**
 * One slot of the new-beat form: a drop target and file picker for one kind of file.
 * Shows the chosen file (and a preview for the cover) with a way to clear it. Dropping
 * both files onto either slot works too: `onFiles` receives all of them.
 */
export function FileSlot({ kind, file, onFiles, onClear, disabled = false }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const preview = useObjectUrl(kind === "image" ? file : null);
  const Icon = ICON[kind];
  const label = LABEL[kind];
  const extensions = EXTENSIONS[kind].join(", ");

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setOver(false);
    if (disabled) return;
    onFiles(Array.from(event.dataTransfer.files));
  }

  function onPick(event: ChangeEvent<HTMLInputElement>) {
    onFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-medium">{label}</h2>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={file ? `${label}: ${file.name}. Click to replace` : `Choose ${label.toLowerCase()}`}
        aria-disabled={disabled}
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
          "relative flex min-h-48 cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border-2 border-dashed border-border p-4 text-center text-sm text-muted-foreground transition-colors hover:border-ring hover:text-foreground focus-visible:border-ring focus-visible:outline-none",
          over && "border-ring bg-accent text-foreground",
          file && "border-solid",
          disabled && "pointer-events-none opacity-60",
        )}
      >
        {preview && (
          <img
            src={preview}
            alt=""
            className="absolute inset-0 size-full object-cover opacity-30"
          />
        )}
        <Icon aria-hidden="true" className="relative size-8" />
        {file ? (
          <div className="relative flex flex-col gap-1">
            <p className="max-w-64 truncate font-medium text-foreground" title={file.name}>
              {file.name}
            </p>
            <p>{formatBytes(file.size)} · click or drop to replace</p>
          </div>
        ) : (
          <p className="relative">
            Drop the {label.toLowerCase()} here or click to choose
            <br />
            <span className="text-xs">{extensions}</span>
          </p>
        )}
        <input
          ref={input}
          type="file"
          accept={EXTENSIONS[kind].join(",")}
          onChange={onPick}
          disabled={disabled}
          className="sr-only"
          aria-label={`Choose ${label.toLowerCase()} file`}
        />
      </div>
      {file && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-fit"
          onClick={onClear}
          disabled={disabled}
        >
          <X aria-hidden="true" />
          Remove {label.toLowerCase()}
        </Button>
      )}
    </section>
  );
}
