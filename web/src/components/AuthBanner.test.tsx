import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import type { ReactNode } from "react";
import { AuthBanner, AuthBannerView } from "./AuthBanner";

// openapi-fetch builds a Request from a relative URL, which Node rejects outside a browser;
// mock the client itself instead of global fetch.
const GET = vi.fn();
vi.mock("@/api/client", () => ({ api: { GET: (...args: unknown[]) => GET(...args) } }));

function renderInRouter(node: ReactNode) {
  const router = createMemoryRouter([{ path: "/", element: node }], { initialEntries: ["/"] });
  return render(<RouterProvider router={router} />);
}

test("AuthBannerView renders for EXPIRED with a link to Settings", () => {
  renderInRouter(<AuthBannerView status="expired" />);
  expect(screen.getByRole("alert")).toHaveTextContent("expired");
  expect(screen.getByRole("link", { name: "Open Settings" })).toHaveAttribute("href", "/settings");
});

test("AuthBannerView is hidden for CONNECTED and while unknown", () => {
  const { unmount } = renderInRouter(<AuthBannerView status="connected" />);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  unmount();
  renderInRouter(<AuthBannerView status={undefined} />);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("AuthBanner fetches /api/auth/status and shows the banner for EXPIRED", async () => {
  GET.mockResolvedValue({ data: { status: "expired", channel: null } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  renderInRouter(
    <QueryClientProvider client={client}>
      <AuthBanner />
    </QueryClientProvider>,
  );

  expect(await screen.findByRole("alert")).toHaveTextContent("Reconnect");
  expect(GET).toHaveBeenCalledWith("/api/auth/status");
});
