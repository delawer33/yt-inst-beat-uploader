import { useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { GOOGLE_START_URL, useAuthStatus, useDisconnect, type AuthStatus } from "./authQueries";
import { useSaveGoogleClient, useSettings } from "./queries";

const STATUS_LABEL: Record<AuthStatus, { text: string; variant: "success" | "warning" | "secondary" }> = {
  connected: { text: "Connected", variant: "success" },
  expired: { text: "Expired", variant: "warning" },
  not_connected: { text: "Not connected", variant: "secondary" },
  not_configured: { text: "Not configured", variant: "secondary" },
};

/** Google OAuth client (id + write-only secret) and the YouTube connection built on it. */
export function GoogleForm() {
  const settings = useSettings();
  const auth = useAuthStatus();
  const save = useSaveGoogleClient();
  const disconnect = useDisconnect();
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");

  const storedId = settings.data?.google_client_id ?? null;
  const status = auth.data?.status;
  const channel = auth.data?.channel ?? null;
  const label = status ? STATUS_LABEL[status] : null;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await save.mutateAsync({ client_id: clientId, client_secret: clientSecret });
    setClientSecret("");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Google</CardTitle>
        <CardDescription>
          OAuth client of type &ldquo;Web application&rdquo; from Google Cloud Console with the
          redirect URI <code className="text-foreground">{window.location.origin}/api/auth/google/callback</code>.
          The secret is stored on this machine and never shown again.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span>Client ID</span>
            <Input
              name="client_id"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder={storedId ?? "xxxx.apps.googleusercontent.com"}
              autoComplete="off"
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>Client secret</span>
            <Input
              name="client_secret"
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder={storedId ? "(stored)" : ""}
              autoComplete="off"
              required
            />
          </label>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
            {save.isError && (
              <span className="text-sm text-destructive">{save.error.message}</span>
            )}
            {save.isSuccess && !save.isPending && (
              <span className="text-sm text-muted-foreground">Saved.</span>
            )}
          </div>
        </form>

        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <span className="text-sm font-medium">YouTube</span>
          {label && <Badge variant={label.variant}>{label.text}</Badge>}
          {channel && (
            <span className="text-sm text-muted-foreground" data-testid="channel-title">
              {channel.title}
            </span>
          )}
          <span className="grow" />
          {status === "connected" ? (
            <Button
              variant="outline"
              onClick={() => disconnect.mutate()}
              disabled={disconnect.isPending}
            >
              Disconnect
            </Button>
          ) : (
            <Button asChild disabled={status === "not_configured"}>
              <a
                href={GOOGLE_START_URL}
                aria-disabled={status === "not_configured"}
                onClick={(e) => status === "not_configured" && e.preventDefault()}
              >
                {status === "expired" ? "Reconnect YouTube" : "Connect YouTube"}
              </a>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
