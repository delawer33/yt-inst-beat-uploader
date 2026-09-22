import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { components } from "@/api/schema";

export type AuthStatus = components["schemas"]["AuthStatus"];
export type AuthStatusOut = components["schemas"]["AuthStatusOut"];

export const authStatusKey = ["auth", "status"] as const;

/** Where the browser goes to start the Google OAuth flow (a plain navigation, not fetch). */
export const GOOGLE_START_URL = "/api/auth/google/start";

export async function fetchAuthStatus(): Promise<AuthStatusOut> {
  const { data, error } = await api.GET("/api/auth/status");
  if (error || !data) throw new Error("Could not load the connection status");
  return data;
}

export function useAuthStatus() {
  return useQuery({ queryKey: authStatusKey, queryFn: fetchAuthStatus, staleTime: 30_000 });
}

export function useDisconnect() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await api.POST("/api/auth/disconnect");
      if (error) throw new Error("Could not disconnect");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: authStatusKey }),
  });
}
