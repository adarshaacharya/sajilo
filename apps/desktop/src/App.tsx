import { useEffect } from "react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router";
import { Header } from "./components/Header";
import { TabBar } from "./components/TabBar";
import { Placeholder } from "./routes/Placeholder";

/**
 * The routes M6 through M9 fill in. Listed here from the start so the shell's
 * navigation is real and testable before any of it has content.
 */
const ROUTES = [
  { path: "/", title: "Today" },
  { path: "/converter", title: "Date converter" },
  { path: "/day", title: "Day details" },
  { path: "/events", title: "Upcoming events" },
  { path: "/weather", title: "Weather" },
  { path: "/forex", title: "Forex" },
  { path: "/news", title: "News" },
  { path: "/bazar", title: "Bazar" },
  { path: "/rashifal", title: "Rashifal" },
  { path: "/radio", title: "Radio" },
  { path: "/tools", title: "Tools" },
  { path: "/settings", title: "Settings" },
] as const;

/** The tray's Settings item navigates by event, since the routes live here. */
function TrayNavigation() {
  const navigate = useNavigate();

  useEffect(() => {
    // Imported lazily so the app still renders in a plain browser during
    // `bun run dev`, where no Tauri IPC exists.
    let unlisten: (() => void) | undefined;
    import("@tauri-apps/api/event")
      .then(({ listen }) => listen<string>("sajilo://navigate", (event) => navigate(event.payload)))
      .then((stop) => {
        unlisten = stop;
      })
      .catch(() => {
        /* Not running under Tauri; the tray cannot navigate anyway. */
      });

    return () => unlisten?.();
  }, [navigate]);

  return null;
}

function Shell() {
  return (
    <div className="flex h-full flex-col">
      <TrayNavigation />
      <Routes>
        {ROUTES.map((route) => (
          <Route
            key={route.path}
            path={route.path}
            element={
              <>
                <Header title={route.title} />
                <main className="flex-1 overflow-y-auto p-3">
                  <Placeholder title={route.title} />
                </main>
              </>
            }
          />
        ))}
      </Routes>
      <TabBar />
    </div>
  );
}

export function App() {
  // Memory routing, not browser history: the popover has no address bar, and a
  // real URL would survive a reload in a way the user never asked for.
  return (
    <MemoryRouter>
      <Shell />
    </MemoryRouter>
  );
}
