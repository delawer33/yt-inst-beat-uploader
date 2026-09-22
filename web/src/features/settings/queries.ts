import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { components } from "@/api/schema";
import { authStatusKey } from "./authQueries";

export type SettingsOut = components["schemas"]["SettingsOut"];
export type GoogleClientIn = components["schemas"]["GoogleClientIn"];
export type SettingsIn = components["schemas"]["SettingsIn"];

export const settingsKey = ["settings"] as const;

function detailOf(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "detail" in error) {
    const detail = (error as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
  }
  return fallback;
}

export function useSettings() {
  return useQuery({
    queryKey: settingsKey,
    queryFn: async () => {
      const { data, error } = await api.GET("/api/settings");
      if (error || !data) throw new Error("Could not load settings");
      return data;
    },
  });
}

export function useSaveGoogleClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: GoogleClientIn) => {
      const { error } = await api.PUT("/api/settings/google", { body });
      if (error) throw new Error(detailOf(error, "Could not save the Google client"));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: settingsKey });
      await queryClient.invalidateQueries({ queryKey: authStatusKey });
    },
  });
}

export function useSaveSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: SettingsIn) => {
      const { data, error } = await api.PUT("/api/settings", { body });
      if (error || !data) throw new Error(detailOf(error, "Could not save settings"));
      return data;
    },
    onSuccess: (data) => queryClient.setQueryData(settingsKey, data),
  });
}
