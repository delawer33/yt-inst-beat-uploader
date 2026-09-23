// Mirrors beat_upload/beat_folder.py; the server is the authority and answers 400 otherwise.
export const AUDIO_EXTENSIONS = [".mp3", ".wav"];
export const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".bmp"];

export type Kind = "audio" | "image";

export type Selection = { audio: File | null; image: File | null };

export const EMPTY: Selection = { audio: null, image: null };

export const EXTENSIONS: Record<Kind, string[]> = {
  audio: AUDIO_EXTENSIONS,
  image: IMAGE_EXTENSIONS,
};

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot).toLowerCase();
}

export function kindOf(file: File): Kind | null {
  const ext = extensionOf(file.name);
  if (AUDIO_EXTENSIONS.includes(ext)) return "audio";
  if (IMAGE_EXTENSIONS.includes(ext)) return "image";
  return null;
}

/**
 * Pure. Merge dropped (or picked) files into the current selection: each file fills the
 * slot of its kind, replacing what was there. Files may come one at a time from any
 * folder, or both at once. Two of the same kind in one drop, or an unsupported file, is
 * an error and the selection stays as it was.
 */
export function receive(
  current: Selection,
  files: File[],
): { selection: Selection } | { error: string } {
  const names = (list: File[]) => list.map((f) => f.name).join(", ");
  const audio = files.filter((f) => kindOf(f) === "audio");
  const image = files.filter((f) => kindOf(f) === "image");
  const other = files.filter((f) => kindOf(f) === null);

  if (other.length > 0) {
    return {
      error: `Unsupported file: ${names(other)}. Audio must be ${AUDIO_EXTENSIONS.join(", ")}; the cover ${IMAGE_EXTENSIONS.join(", ")}.`,
    };
  }
  if (audio.length > 1) return { error: `One audio file only, got ${audio.length}: ${names(audio)}.` };
  if (image.length > 1) return { error: `One image only, got ${image.length}: ${names(image)}.` };
  return {
    selection: {
      audio: audio[0] ?? current.audio,
      image: image[0] ?? current.image,
    },
  };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
