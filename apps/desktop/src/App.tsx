import { type ReactNode, useEffect } from "react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router";
import { Header } from "./components/Header";
import { TabBar } from "./components/TabBar";
import { SettingsProvider } from "./lib/settings";
import { Converter } from "./routes/converter";
import { Dashboard } from "./routes/dashboard";
import { DayDetail } from "./routes/day";
import { Events } from "./routes/events";
import { Placeholder } from "./routes/Placeholder";
import { Radio } from "./routes/radio";
import { Settings } from "./routes/settings";
import { Tools } from "./routes/tools";

/**
 * The routes M6 through M9 fill in. Listed here from the start so the shell's
 * navigation is real and testable before any of it has content.
 */
/**
 * The offline half is real as of M6. The rest still render a placeholder, and
 * are listed here from the start so the shell's navigation is complete.
 */
const ROUTES = [
  { path: "/", title: "Today", element: <Dashboard /> },
  { path: "/converter", title: "Date Converter", element: <Converter /> },
  { path: "/day", title: "Date Details", element: <DayDetail /> },
  { path: "/events", title: "Upcoming events", element: <Events /> },
  { path: "/weather", title: "Weather" },
  { path: "/forex", title: "Exchange Rates" },
  { path: "/news", title: "News" },
  { path: "/bazar", title: "Bazar" },
  { path: "/rashifal", title: "Rashifal" },
  { path: "/radio", title: "Radio", element: <Radio /> },
  { path: "/tools", title: "Tools", element: <Tools /> },
  { path: "/settings", title: "Settings", element: <Settings /> },
] as const satisfies readonly { path: string; title: string; element?: ReactNode }[];

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
                  {"element" in route ? route.element : <Placeholder title={route.title} />}
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
      <SettingsProvider>
        <Shell />
      </SettingsProvider>
    </MemoryRouter>
  );
}
