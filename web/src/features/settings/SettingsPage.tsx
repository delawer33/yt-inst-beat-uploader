import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { authStatusKey } from "./authQueries";
import { GoogleForm } from "./GoogleForm";
import { ScheduleForm } from "./ScheduleForm";

/**
 * The OAuth callback lands here with `?connected=1` or `?error=<message>`. Both refetch the
 * auth status; "Dismiss" clears the query string.
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
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Settings</h1>
      {connected && (
        <p role="status" className="rounded-md border border-border bg-muted px-4 py-2 text-sm">
          YouTube connected.{" "}
          <button type="button" className="underline" onClick={dismiss}>
            Dismiss
          </button>
        </p>
      )}
      {error !== null && (
        <p
          role="alert"
          className="rounded-md border border-destructive bg-destructive/10 px-4 py-2 text-sm text-destructive"
        >
          Connection failed: {error || "unknown error"}.{" "}
          <button type="button" className="underline" onClick={dismiss}>
            Dismiss
          </button>
        </p>
      )}
      <GoogleForm />
      <ScheduleForm />
    </div>
  );
}
