import { Link } from "react-router";
import { useAuthStatus, type AuthStatus } from "@/features/settings/authQueries";

const MESSAGE: Partial<Record<AuthStatus, string>> = {
  not_configured: "Google client is not configured. Uploads and stats are off until it is.",
  not_connected: "YouTube is not connected.",
  expired: "The YouTube connection expired. Reconnect to resume paused jobs.",
};

/** Presentational: shown for every status except `connected`. */
export function AuthBannerView({ status }: { status: AuthStatus | undefined }) {
  if (!status || status === "connected") return null;
  return (
    <div role="alert" className="border-b border-border bg-warning text-warning-foreground">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-6 py-2 text-sm">
        <span>{MESSAGE[status]}</span>
        <Link to="/settings" className="font-medium underline underline-offset-4">
          Open Settings
        </Link>
      </div>
    </div>
  );
}

export function AuthBanner() {
  const { data } = useAuthStatus();
  return <AuthBannerView status={data?.status} />;
}
