import { Link } from "react-router";
import { useAuthStatus, type AuthStatus } from "@/features/settings/authQueries";

type Message = { head: string; detail: string; action: string };

const MESSAGE: Partial<Record<AuthStatus, Message>> = {
  not_configured: {
    head: "Google client is not configured.",
    detail: "Uploads and the nightly stats pull are off until it is. Rendering continues.",
    action: "Open Settings →",
  },
  not_connected: {
    head: "YouTube is not connected.",
    detail: "Uploads and the nightly stats pull are off until it is. Rendering continues.",
    action: "Connect →",
  },
  expired: {
    head: "YouTube access expired.",
    detail: "Uploads and the nightly stats pull are paused. Rendering continues.",
    action: "Reconnect →",
  },
};

/** Presentational: shown for every status except `connected`. */
export function AuthBannerView({ status }: { status: AuthStatus | undefined }) {
  const message = status && MESSAGE[status];
  if (!message) return null;
  return (
    <div role="alert" className="banner">
      <b>{message.head}</b>
      <span>{message.detail}</span>
      <Link to="/settings" className="btn btn-inverse">
        {message.action}
      </Link>
    </div>
  );
}

export function AuthBanner() {
  const { data } = useAuthStatus();
  return <AuthBannerView status={data?.status} />;
}
