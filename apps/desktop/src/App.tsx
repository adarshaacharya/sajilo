import { type ReactNode, useEffect } from "react";
import { AnimatePresence } from "motion/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Header } from "./components/Header";
import { PageTransition } from "./components/motion";
import { RadioMiniPlayer } from "./components/RadioMiniPlayer";
import { TabBar } from "./components/TabBar";
import type { translate } from "./lib/i18n";
import { SettingsProvider, useSettings } from "./lib/settings";
import { Bazar } from "./routes/bazar";
import { Converter } from "./routes/converter";
import { Dashboard } from "./routes/dashboard";
import { DayDetail } from "./routes/day";
import { Events } from "./routes/events";
import { Weather } from "./routes/weather";
import { Forex } from "./routes/forex";
import { News } from "./routes/news";
import { Radio } from "./routes/radio";
import { Rashifal } from "./routes/rashifal";
import { Settings } from "./routes/settings";
import { Tools } from "./routes/tools";

type TranslationKey = Parameters<typeof translate>[0];

const ROUTES = [
  { path: "/", titleKey: "screen.today", element: <Dashboard /> },
  { path: "/converter", titleKey: "screen.date-converter", element: <Converter /> },
  { path: "/day", titleKey: "screen.date-details", element: <DayDetail /> },
  { path: "/events", titleKey: "screen.upcoming", element: <Events /> },
  { path: "/weather", titleKey: "screen.weather", element: <Weather /> },
  { path: "/forex", titleKey: "screen.exchange-rates", element: <Forex /> },
  { path: "/news", titleKey: "screen.news", element: <News /> },
  { path: "/bazar", titleKey: "screen.bazar", element: <Bazar /> },
  { path: "/rashifal", titleKey: "screen.rashifal", element: <Rashifal /> },
  { path: "/radio", titleKey: "screen.radio", element: <Radio /> },
  { path: "/tools", titleKey: "screen.tools", element: <Tools /> },
  { path: "/settings", titleKey: "screen.settings", element: <Settings /> },
] as const satisfies readonly { path: string; titleKey: TranslationKey; element: ReactNode }[];

function TrayNavigation() {
  const navigate = useNavigate();

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    import("@tauri-apps/api/event")
      .then(({ listen }) => listen<string>("sajilo://navigate", (event) => navigate(event.payload)))
      .then((stop) => {
        unlisten = stop;
      })
      .catch(() => {});

    return () => unlisten?.();
  }, [navigate]);

  return null;
}

function Shell() {
  const { t } = useSettings();
  const location = useLocation();

  return (
    <div className="app-window flex flex-col">
      <TrayNavigation />
      <AnimatePresence mode="wait" initial={false}>
        <Routes location={location} key={location.pathname}>
          {ROUTES.map((route) => (
            <Route
              key={route.path}
              path={route.path}
              element={
                <PageTransition className="flex min-h-0 flex-1 flex-col">
                  {route.path !== "/" && <Header title={t(route.titleKey)} />}
                  <main
                    className={`flex-1 overflow-y-auto ${route.path === "/" ? "p-3" : "p-2.5"}`}
                  >
                    <ErrorBoundary key={route.path}>{route.element}</ErrorBoundary>
                  </main>
                </PageTransition>
              }
            />
          ))}
        </Routes>
      </AnimatePresence>
      <RadioMiniPlayer />
      <TabBar />
    </div>
  );
}

export function App() {
  return (
    <MemoryRouter>
      <ErrorBoundary>
        <SettingsProvider>
          <Shell />
        </SettingsProvider>
      </ErrorBoundary>
    </MemoryRouter>
  );
}
