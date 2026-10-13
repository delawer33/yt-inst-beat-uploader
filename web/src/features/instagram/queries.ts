import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { instagramKey } from "@/api/events";
import type { components } from "@/api/schema";
import { describe, unwrap } from "@/api/unwrap";

export type Instagram = components["schemas"]["InstagramOut"];

/**
 * The Instagram panel of a Beat. Reading it also queues the Reel when the Beat has none
 * current, so this is only called once the panel is open.
 */
export function useInstagram(beatId: string) {
  return useQuery({
    queryKey: instagramKey(beatId),
    queryFn: () =>
      unwrap(api.GET("/api/beats/{beat_id}/instagram", { params: { path: { beat_id: beatId } } })),
  });
}

/** "Show in folder": the server opens the file manager with the Reel selected. */
export function useShowReel() {
  return useMutation({
    mutationFn: async (beatId: string) => {
      const { error } = await api.POST("/api/beats/{beat_id}/reel/show", {
        params: { path: { beat_id: beatId } },
      });
      if (error !== undefined) throw new Error(describe(error));
    },
  });
}
