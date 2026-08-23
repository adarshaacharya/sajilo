import { AnimatePresence } from "motion/react";
import { type ReactNode, useEffect } from "react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router";
import { SWRConfig } from "swr";
import { Bazar } from "./features/bazar/bazar";
import { Converter } from "./features/calendar/converter";
import { Dashboard } from "./features/calendar/dashboard";
import { DayDetail } from "./features/calendar/day-detail";
import { Events } from "./features/calendar/events";
import { Forex } from "./features/forex/forex";
import { News } from "./features/news/news";
import { Radio } from "./features/radio/radio";
import { RadioMiniPlayer } from "./features/radio/radio-mini-player";
import { Rashifal } from "./features/rashifal/rashifal";
import { Samjhana } from "./features/samjhana/samjhana";
import { Settings } from "./features/settings/settings";
import { Tools } from "./features/tools/tools";
import { Weather } from "./features/weather/weather";
import { ErrorBoundary } from "./shared/components/error-boundary";
import { Header } from "./shared/components/header";
import { HeaderSlotProvider } from "./shared/components/header-slot";
import { PageTransition } from "./shared/components/motion";
import { TabBar } from "./shared/components/tab-bar";
import { SettingsProvider, useSettings } from "./shared/context/settings-context";
import type { translate } from "./shared/lib/i18n";
import { api } from "./shared/lib/ipc";
import { persistentCacheProvider } from "./shared/lib/swr-cache";

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
  { path: "/samjhana", titleKey: "screen.samjhana", element: <Samjhana /> },
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

/** Escape dismisses the popover, the way a menu-bar panel is expected to close.
 *
 * On macOS and Windows clicking away is enough. Linux has no such luxury: the
 * compositor pulls focus from an undecorated always-on-top window on its own,
 * so blur cannot be trusted to mean "the user left" and the popover stays up
 * until something asks it to go. Escape is that something. */
function DismissOnEscape() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      api.hidePopover().catch(() => {});
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return null;
}

function Shell() {
  const { t } = useSettings();
  const location = useLocation();

  return (
    <div className="app-window flex flex-col">
      <TrayNavigation />
      <DismissOnEscape />
      <AnimatePresence mode="wait" initial={false}>
        <Routes location={location} key={location.pathname}>
          {ROUTES.map((route) => (
            <Route
              key={route.path}
              path={route.path}
              element={
                <PageTransition className="flex min-h-0 min-w-0 flex-1 flex-col">
                  {route.path !== "/" && route.path !== "/weather" && (
                    <Header title={t(route.titleKey)} />
                  )}
                  <main
                    className={`min-w-0 flex-1 overflow-x-hidden overflow-y-auto ${
                      route.path === "/" ? "p-3" : route.path === "/weather" ? "" : "p-2.5"
                    }`}
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
        <SWRConfig value={{ provider: persistentCacheProvider }}>
          <SettingsProvider>
            <HeaderSlotProvider>
              <Shell />
            </HeaderSlotProvider>
          </SettingsProvider>
        </SWRConfig>
      </ErrorBoundary>
    </MemoryRouter>
  );
}
