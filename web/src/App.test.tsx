import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { AppShell } from "./components/AppShell";

test("AppShell shows the navigation links", () => {
  const router = createMemoryRouter(
    [{ path: "/", element: <AppShell />, children: [{ index: true, element: <p>home</p> }] }],
    { initialEntries: ["/"] },
  );
  render(<RouterProvider router={router} />);

  expect(screen.getByRole("link", { name: "Library" })).toHaveAttribute("href", "/");
  expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
  expect(screen.getByText("home")).toBeInTheDocument();
});
