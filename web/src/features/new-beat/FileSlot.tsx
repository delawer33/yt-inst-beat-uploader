import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { cn } from "@/lib/utils";
import { EXTENSIONS, formatBytes, type Kind } from "./files";

const LABEL: Record<Kind, string> = { audio: "Audio", image: "Cover image" };

type Props = {
  kind: Kind;
  file: File | null;
  /** Everything dropped or picked on this slot; the page sorts it into slots. */
  onFiles: (files: File[]) => void;
  disabled?: boolean;
};

/**
 * One drop zone of New beat: a drop target and file picker for one kind of file. Dropping
 * both files onto either zone works too — `onFiles` receives all of them. Clicking a full
 * zone replaces its file; there is nothing else on the screen, because the Draft is created
 * as soon as both files are here.
 */
export function FileSlot({ kind, file, onFiles, disabled = false }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const label = LABEL[kind];

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
      className={cn("drop hero", over && "active", disabled && "dimmed")}
    >
      <span className="drop-title">{label}</span>
      <span className="drop-hint">
        {file
          ? `${file.name} · ${formatBytes(file.size)} · click to replace`
          : `Drop it here or click to choose · ${EXTENSIONS[kind].join(", ")}`}
      </span>
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
  );
}
