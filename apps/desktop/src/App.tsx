import { type ReactNode, useEffect } from "react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Header } from "./components/Header";
import { TabBar } from "./components/TabBar";
import type { translate } from "./lib/i18n";
import { SettingsProvider, useSettings } from "./lib/settings";
import { Bazar } from "./routes/bazar";
import { Converter } from "./routes/converter";
import { Dashboard } from "./routes/dashboard";
import { DayDetail } from "./routes/day";
import { Events } from "./routes/events";
import { Placeholder } from "./routes/Placeholder";
import { Radio } from "./routes/radio";
import { Rashifal } from "./routes/rashifal";
import { Settings } from "./routes/settings";
import { Tools } from "./routes/tools";

type TranslationKey = Parameters<typeof translate>[0];

/**
 * The routes M6 through M9 fill in. Listed here from the start so the shell's
 * navigation is real and testable before any of it has content.
 */
/**
 * The offline half is real as of M6. The rest still render a placeholder, and
 * are listed here from the start so the shell's navigation is complete.
 */
const ROUTES = [
  { path: "/", titleKey: "screen.today", element: <Dashboard /> },
  { path: "/converter", titleKey: "screen.date-converter", element: <Converter /> },
  { path: "/day", titleKey: "screen.date-details", element: <DayDetail /> },
  { path: "/events", titleKey: "screen.upcoming", element: <Events /> },
  { path: "/weather", titleKey: "screen.weather" },
  { path: "/forex", titleKey: "screen.exchange-rates" },
  { path: "/news", titleKey: "screen.news" },
  { path: "/bazar", titleKey: "screen.bazar", element: <Bazar /> },
  { path: "/rashifal", titleKey: "screen.rashifal", element: <Rashifal /> },
  { path: "/radio", titleKey: "screen.radio", element: <Radio /> },
  { path: "/tools", titleKey: "screen.tools", element: <Tools /> },
  { path: "/settings", titleKey: "screen.settings", element: <Settings /> },
] as const satisfies readonly { path: string; titleKey: TranslationKey; element?: ReactNode }[];

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
  const { t } = useSettings();

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
                <Header title={t(route.titleKey)} />
                <main className="flex-1 overflow-y-auto p-2.5">
                  {/* Per route, and keyed by path: a screen that throws must
                      leave the header and tab bar standing, and navigating away
                      must clear the error rather than stick on it. */}
                  <ErrorBoundary key={route.path}>
                    {"element" in route ? route.element : <Placeholder title={t(route.titleKey)} />}
                  </ErrorBoundary>
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
      {/* A second boundary above the routes: a fault in the header, the tab bar
          or the settings provider would otherwise unmount everything and leave
          a blank window with nothing to act on. */}
      <ErrorBoundary>
        <SettingsProvider>
          <Shell />
        </SettingsProvider>
      </ErrorBoundary>
    </MemoryRouter>
  );
}
