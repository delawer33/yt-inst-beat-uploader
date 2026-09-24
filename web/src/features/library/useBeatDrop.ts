import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useCreateBeat } from "@/features/beat/queries";
import { AUDIO_EXTENSIONS, EMPTY, IMAGE_EXTENSIONS, receive } from "@/features/new-beat/files";

/** What the drop tile and the hidden file input accept. */
export const ACCEPT = [...AUDIO_EXTENSIONS, ...IMAGE_EXTENSIONS].join(",");

export const NEEDS_BOTH = "A Draft needs both files: drop the audio and the cover together.";

export type BeatDrop = {
  /** Something draggable is over the window. */
  active: boolean;
  pending: boolean;
  error: string | null;
  /** Files from a drop or from the tile's file input. */
  onFiles: (files: File[]) => void;
};

/**
 * Dropping anywhere in the window creates a Draft and opens its page. The same handler
 * serves the grid's drop tile and the first-run hero; the file rules come from
 * `new-beat/files.ts`, the Draft from `POST /api/beats`.
 */
export function useBeatDrop(): BeatDrop {
  const navigate = useNavigate();
  const create = useCreateBeat();
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const depth = useRef(0);
  // `create.isPending` only turns true on the next render, so two drops in one tick would
  // both slip through it and make two Drafts of which only the second is ever opened.
  const creating = useRef(false);

  const onFiles = useCallback(
    (files: File[]) => {
      if (files.length === 0 || creating.current) return;
      const result = receive(EMPTY, files);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      const { audio, image } = result.selection;
      if (audio === null || image === null) {
        setError(NEEDS_BOTH);
        return;
      }
      setError(null);
      creating.current = true;
      create.mutate(
        { audio, image },
        {
          onSuccess: (beat) => {
            creating.current = false;
            void navigate(`/beats/${beat.id}`);
          },
          onError: (failure) => {
            creating.current = false;
            setError(failure.message);
          },
        },
      );
    },
    [create, navigate],
  );

  useEffect(() => {
    const over = (event: DragEvent) => event.preventDefault();
    // A cover image dragged out of a BeatCard carries no files; only a drag from outside
    // the window can become a Draft, so only that one lights the drop target up.
    const hasFiles = (event: DragEvent) => [...(event.dataTransfer?.types ?? [])].includes("Files");
    const enter = (event: DragEvent) => {
      event.preventDefault();
      if (!hasFiles(event)) return;
      depth.current += 1;
      setActive(true);
    };
    const leave = () => {
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setActive(false);
    };
    const drop = (event: DragEvent) => {
      event.preventDefault();
      depth.current = 0;
      setActive(false);
      onFiles([...(event.dataTransfer?.files ?? [])]);
    };
    window.addEventListener("dragover", over);
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, [onFiles]);

  return { active, pending: create.isPending, error, onFiles };
}
