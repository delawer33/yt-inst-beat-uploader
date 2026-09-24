import { useState, type FormEvent } from "react";
import { GOOGLE_START_URL, useAuthStatus, useDisconnect, type AuthStatus } from "./authQueries";
import { Field } from "./Field";
import { useSaveGoogleClient, useSettings } from "./queries";

const STATE_LABEL: Record<AuthStatus, string> = {
  connected: "Connected",
  expired: "Access expired",
  not_connected: "Not connected",
  not_configured: "No client yet",
};

/**
 * The YouTube settings row: the Google OAuth client (id + write-only secret), the account
 * card with the channel and the connection state, and Reconnect / Disconnect.
 */
export function YouTubeRow() {
  const settings = useSettings();
  const auth = useAuthStatus();
  const save = useSaveGoogleClient();
  const disconnect = useDisconnect();
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");

  const storedId = settings.data?.google_client_id ?? null;
  const redirectUri = settings.data?.redirect_uri ?? "…";
  const status = auth.data?.status;
  const channel = auth.data?.channel ?? null;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await save.mutateAsync({ client_id: clientId, client_secret: clientSecret });
    setClientSecret("");
  }

  return (
    <section className="settings-row">
      <div className="what">
        <b>YouTube</b>
        <p>
          Google OAuth client with the redirect URI <span className="num">{redirectUri}</span>. The
          secret is stored on this machine and never shown again. Access expires every 7 days while
          the app is in testing.
        </p>
      </div>
      <div className="how">
        <div className="account" data-testid="account">
          <div>
            <div className="font-semibold" data-testid="channel-title">
              {channel ? channel.title : "No channel yet"}
            </div>
            <div className="text-muted num">
              {channel ? channel.id : "Connect to read the channel"}
            </div>
          </div>
          <div className="end" aria-label="Connection state">
            {status ? STATE_LABEL[status] : "…"}
          </div>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
          <div className="form-grid-2">
            <Field label="Client ID" htmlFor="client_id">
              <input
                id="client_id"
                name="client_id"
                className="input num"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder={storedId ?? "xxxx.apps.googleusercontent.com"}
                autoComplete="off"
                required
              />
            </Field>
            <Field label="Client secret" htmlFor="client_secret">
              <input
                id="client_secret"
                name="client_secret"
                type="password"
                className="input num"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder={storedId ? "(stored)" : ""}
                autoComplete="off"
                required
              />
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" className="btn btn-primary" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save"}
            </button>
            <a
              className="btn btn-secondary"
              href={GOOGLE_START_URL}
              aria-disabled={status === "not_configured" || undefined}
              onClick={(e) => status === "not_configured" && e.preventDefault()}
            >
              {status === "connected" ? "Reconnect now" : "Connect YouTube"}
            </a>
            {status === "connected" && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => disconnect.mutate()}
                disabled={disconnect.isPending}
              >
                Disconnect
              </button>
            )}
            {save.isError && (
              <span role="alert" className="text-accent">
                {save.error.message}
              </span>
            )}
            {save.isSuccess && !save.isPending && <span className="text-muted">Saved.</span>}
          </div>
        </form>
      </div>
    </section>
  );
}
