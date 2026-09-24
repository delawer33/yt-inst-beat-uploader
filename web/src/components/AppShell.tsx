import { Outlet } from "react-router";
import { useEvents } from "@/api/events";
import { AuthBanner } from "./AuthBanner";
import { Sidebar } from "./Sidebar";

/** The Design System shell: 240px sidebar, the page with its banner, the route below. */
export function AppShell() {
  useEvents();
  return (
    <div className="app h-screen">
      <Sidebar />
      <main className="page">
        <AuthBanner />
        <div className="page-body flex-1 overflow-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
