import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { applyJobEvent } from "@/api/events";
import type { components } from "@/api/schema";
import { describe, unwrap } from "@/api/unwrap";
import { beatKey, beatsKey, useBeatMutation, type Beat } from "@/features/library/queries";

export type BeatPatch = components["schemas"]["BeatPatch"];

export const BEATS_URL = "/api/beats";

/**
 * `POST /api/beats` is multipart; the generated client types the files as strings, so this
 * one goes through `fetch` with a FormData body. Errors carry the server's `detail`.
 */
export async function createBeat(audio: File, image: File): Promise<Beat> {
  const form = new FormData();
  form.append("audio", audio, audio.name);
  form.append("image", image, image.name);
  const response = await fetch(BEATS_URL, { method: "POST", body: form });
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) throw new Error(describe(body));
  return body as Beat;
}

export function useCreateBeat() {
  return useBeatMutation(({ audio, image }: { audio: File; image: File }) =>
    createBeat(audio, image),
  );
}

export function usePatchBeat() {
  return useBeatMutation(({ id, patch }: { id: string; patch: BeatPatch }) =>
    unwrap(
      api.PATCH("/api/beats/{beat_id}", {
        params: { path: { beat_id: id } },
        body: patch,
      }),
    ),
  );
}

/**
 * Sends the beat ("Save & upload when rendered"): it turns QUEUED at once and comes back with
 * the Job that is now working on it, if any (the render still running, or the fresh upload).
 */
export function useUploadBeat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.POST("/api/beats/{beat_id}/upload", { params: { path: { beat_id: id } } })),
    onSuccess: (beat) => {
      if (beat.active_job) applyJobEvent(queryClient, beat.active_job);
      void queryClient.invalidateQueries({ queryKey: beatsKey });
    },
  });
}

export function useDeleteBeat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE("/api/beats/{beat_id}", {
        params: { path: { beat_id: id } },
      });
      if (error !== undefined) throw new Error(describe(error));
      return id;
    },
    onSuccess: (id) => {
      queryClient.removeQueries({ queryKey: beatKey(id) });
      void queryClient.invalidateQueries({ queryKey: beatsKey, exact: true });
    },
  });
}
