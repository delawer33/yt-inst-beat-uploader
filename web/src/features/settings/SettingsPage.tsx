import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { authStatusKey } from "./authQueries";
import { NightlyStatsRow } from "./NightlyStatsRow";
import { TemplatesRow } from "./TemplatesRow";
import { YouTubeRow } from "./YouTubeRow";

/**
 * Settings as rows: what on the left, how on the right. The OAuth callback lands here with
 * `?connected=1` (a toast) or `?error=<message>` (a note); both refetch the auth status and
 * "Dismiss" clears the query string.
 */
export function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const connected = params.get("connected") === "1";
  const error = params.get("error");

  useEffect(() => {
    if (!connected && error === null) return;
    void queryClient.invalidateQueries({ queryKey: authStatusKey });
  }, [connected, error, queryClient]);

  const dismiss = () => setParams({}, { replace: true });

  return (
    <div className="flex flex-col">
      {/* The DS sets the h2 margin; a Tailwind margin here would lose to it (unlayered CSS). */}
      <h2>Settings</h2>
      {connected && (
        <div role="status" className="toast mb-4">
          <b>YouTube connected.</b>
          <button type="button" className="btn btn-ghost btn-sm" onClick={dismiss}>
            Dismiss
          </button>
        </div>
      )}
      {error !== null && (
        <div role="alert" className="note mb-4">
          <span className="note-title">Connection failed</span>
          <span>{error || "Google sent no reason."}</span>
          <div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={dismiss}>
              Dismiss
            </button>
          </div>
        </div>
      )}
      <YouTubeRow />
      <NightlyStatsRow />
      <TemplatesRow />
    </div>
  );
}
