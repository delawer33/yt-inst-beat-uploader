import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { components } from "@/api/schema";
import { unwrap } from "@/api/unwrap";

export type Beat = components["schemas"]["BeatOut"];
export type BeatStatus = components["schemas"]["BeatStatus"];
export type Privacy = components["schemas"]["PrivacyStatus"];

/** Invalidated as a family by `useEvents` on every "beat" SSE event. */
export const beatsKey = ["beats"] as const;
export const beatKey = (id: string) => ["beats", id] as const;

export function useBeats() {
  return useQuery({
    queryKey: beatsKey,
    queryFn: () => unwrap(api.GET("/api/beats")),
  });
}

export function useBeat(id: string) {
  return useQuery({
    queryKey: beatKey(id),
    queryFn: () => unwrap(api.GET("/api/beats/{beat_id}", { params: { path: { beat_id: id } } })),
  });
}

/** Put one beat into the cache and refresh the list it belongs to. */
export function useBeatMutation<TVars>(run: (vars: TVars) => Promise<Beat>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: (beat) => {
      queryClient.setQueryData(beatKey(beat.id), beat);
      void queryClient.invalidateQueries({ queryKey: beatsKey, exact: true });
    },
  });
}

export type PrivacyChange = {
  privacy: Privacy;
  /** UTC ISO time: schedule (or reschedule) the beat; omitted or null: remove any schedule. */
  publish_at?: string | null;
};

export function useSetPrivacy() {
  return useBeatMutation(({ id, privacy, publish_at = null }: { id: string } & PrivacyChange) =>
    unwrap(
      api.POST("/api/beats/{beat_id}/privacy", {
        params: { path: { beat_id: id } },
        body: { privacy, publish_at },
      }),
    ),
  );
}
