import { createBrowserRouter } from "react-router";
import { AppShell } from "./components/AppShell";
import { LibraryPage } from "./features/library/LibraryPage";
import { BeatPage } from "./features/beat/BeatPage";
import { SettingsPage } from "./features/settings/SettingsPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <LibraryPage /> },
      { path: "beats/:id", element: <BeatPage /> },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
]);
