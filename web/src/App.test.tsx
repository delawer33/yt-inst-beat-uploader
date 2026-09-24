import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import { AppShell } from "./components/AppShell";

vi.mock("@/api/client", () => ({ api: { GET: vi.fn().mockResolvedValue({ data: undefined }) } }));

test("AppShell shows the sidebar navigation and the route below it", () => {
  const router = createMemoryRouter(
    [{ path: "/", element: <AppShell />, children: [{ index: true, element: <p>home</p> }] }],
    { initialEntries: ["/"] },
  );
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  expect(screen.getByRole("link", { name: /Library/ })).toHaveAttribute("href", "/");
  expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
  expect(screen.queryByRole("link", { name: /New beat/ })).not.toBeInTheDocument();
  expect(screen.getByText("home")).toBeInTheDocument();
});
