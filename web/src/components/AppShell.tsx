import { NavLink, Outlet } from "react-router";
import { cn } from "@/lib/utils";
import { useEvents } from "@/api/events";

const links = [
  { to: "/", label: "Library", end: true },
  { to: "/settings", label: "Settings", end: false },
];

export function AppShell() {
  useEvents();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <nav className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3">
          <span className="font-semibold tracking-tight">beat-upload</span>
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                cn(
                  "text-sm text-muted-foreground transition-colors hover:text-foreground",
                  isActive && "text-foreground",
                )
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
      </header>
      {/* AuthBanner slot (slice 7) */}
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
