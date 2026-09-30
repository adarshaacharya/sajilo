import { type ReactNode, useEffect } from "react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router";
import { SWRConfig } from "swr";
import { Bazar } from "./features/bazar/bazar";
import { Converter } from "./features/calendar/converter";
import { Dashboard } from "./features/calendar/dashboard";
import { DayDetail } from "./features/calendar/day-detail";
import { Events } from "./features/calendar/events";
import { MiniView } from "./features/calendar/mini-view";
import { BreakCard } from "./features/focus/break-card";
import { Focus } from "./features/focus/focus";
import { Keeper } from "./features/keeper/keeper";
import { PhotoViewer } from "./features/keeper/photo-viewer";
import { More } from "./features/more/more";
import { GovernmentUpdateDetail } from "./features/news/government-update-detail";
import { News } from "./features/news/news";
import { Notes } from "./features/notes/notes";
import { Radio } from "./features/radio/radio";
import { RadioMiniPlayer } from "./features/radio/radio-mini-player";
import { Rashifal } from "./features/rashifal/rashifal";
import { ReminderCard } from "./features/reminders/reminder-card";
import { Settings } from "./features/settings/settings";
import { Tools } from "./features/tools/tools";
import { Weather } from "./features/weather/weather";
import { BackgroundFeedRefresh } from "./shared/components/background-feed-refresh";
import { ErrorBoundary } from "./shared/components/error-boundary";
import { Header } from "./shared/components/header";
import { HeaderSlotProvider } from "./shared/components/header-slot";
import { TabBar } from "./shared/components/tab-bar";
import { UpdateWindow } from "./shared/components/update-prompt";
import { SettingsProvider, useSettings } from "./shared/context/settings-context";
import { UpdaterProvider } from "./shared/context/updater-context";
import type { translate } from "./shared/lib/i18n";
import { api } from "./shared/lib/ipc";
import { isMini, setMini, useMini } from "./shared/lib/popover-kept";
import { persistentCacheProvider } from "./shared/lib/swr-cache";
import { track } from "./shared/lib/usage";

type TranslationKey = Parameters<typeof translate>[0];

const ROUTES = [
  { path: "/", titleKey: "screen.today", element: <Dashboard /> },
  { path: "/converter", titleKey: "screen.date-converter", element: <Converter /> },
  { path: "/day", titleKey: "screen.date-details", element: <DayDetail /> },
  { path: "/events", titleKey: "screen.upcoming", element: <Events /> },
  { path: "/weather", titleKey: "screen.weather", element: <Weather /> },
  { path: "/news", titleKey: "screen.news", element: <News /> },
  {
    path: "/news/government",
    titleKey: "screen.official-update",
    element: <GovernmentUpdateDetail />,
  },
  { path: "/bazar", titleKey: "screen.bazar", element: <Bazar /> },
  { path: "/rashifal", titleKey: "screen.rashifal", element: <Rashifal /> },
  { path: "/radio", titleKey: "screen.radio", element: <Radio /> },
  { path: "/tools", titleKey: "screen.tools", element: <Tools /> },
  { path: "/focus", titleKey: "screen.focus", element: <Focus /> },
  { path: "/notes", titleKey: "screen.notes", element: <Notes /> },
  { path: "/keeper", titleKey: "screen.keeper", element: <Keeper /> },
  { path: "/more", titleKey: "screen.more", element: <More /> },
  { path: "/settings", titleKey: "screen.settings", element: <Settings /> },
] as const satisfies readonly { path: string; titleKey: TranslationKey; element: ReactNode }[];

function TrayNavigation() {
  const navigate = useNavigate();

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    import("@tauri-apps/api/event")
      .then(({ listen }) =>
        listen<string>("sajilo://navigate", (event) => {
          // A screen was asked for (a reminder's Open, the tray menu): the
          // mini strip has no screens, so it opens the full view first.
          if (isMini()) setMini(false);
          navigate(event.payload);
        }),
      )
      .then((stop) => {
        unlisten = stop;
      })
      .catch(() => {});

    return () => unlisten?.();
  }, [navigate]);

  return null;
}

/** Tells the shell when the pointer enters or leaves the popover. The page
 * always knows, even where the shell cannot read the pointer (a Wayland
 * session), and the shell needs it to tell a click away from a stray
 * focus-out; see `window::hide_on_blur`. */
function ReportPointer() {
  useEffect(() => {
    const root = document.documentElement;
    const enter = () => api.popoverPointer(true).catch(() => {});
    const leave = () => api.popoverPointer(false).catch(() => {});
    root.addEventListener("mouseenter", enter);
    root.addEventListener("mouseleave", leave);
    return () => {
      root.removeEventListener("mouseenter", enter);
      root.removeEventListener("mouseleave", leave);
    };
  }, []);

  return null;
}

/** Counts each screen as it opens, for the daily usage report. */
function TrackScreens() {
  const { pathname } = useLocation();
  useEffect(() => {
    const name = pathname === "/" ? "today" : pathname.slice(1).replaceAll("/", "-");
    track(`screen.${name}`);
  }, [pathname]);
  return null;
}

/** Escape dismisses the popover, the way a menu-bar panel is expected to close.
 *
 * Clicking away closes it too. On Linux the shell reads a focus-out as a click
 * away only when it looks like one (see `window::hide_on_blur`), so Escape is
 * the dismissal that never depends on the compositor. */
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
  const mini = useMini();

  return (
    <div className="app-window flex flex-col">
      <TrayNavigation />
      <DismissOnEscape />
      <ReportPointer />
      <TrackScreens />
      {mini && <MiniView />}
      {/* Hidden rather than unmounted while mini, like the window itself:
          the radio keeps playing and every screen is as it was left. */}
      <div className="flex min-h-0 flex-1 flex-col" hidden={mini}>
        <Routes location={location}>
          {ROUTES.map((route) => (
            <Route
              key={route.path}
              path={route.path}
              element={
                <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                  {route.path !== "/" && <Header title={t(route.titleKey)} />}
                  <main
                    className={`min-w-0 flex-1 overflow-x-hidden overflow-y-auto ${
                      route.path === "/" ? "p-3" : "p-2.5"
                    }`}
                  >
                    <ErrorBoundary key={route.path}>{route.element}</ErrorBoundary>
                  </main>
                </div>
              }
            />
          ))}
        </Routes>
        <RadioMiniPlayer />
        <TabBar />
      </div>
    </div>
  );
}

/**
 * `initialEntries` exists for the landing page, which renders this same app —
 * not a mock of it — one screen per carousel slide, against a recorded IPC
 * layer. The popover itself never passes it and opens on "/" as always.
 */
export function App({ initialEntries }: { initialEntries?: string[] } = {}) {
  const surface = new URLSearchParams(window.location.search).get("surface");
  const isUpdateWindow = surface === "update";

  // Focus's break card runs in its own small window; see `commands::focus`.
  if (surface === "break") {
    return (
      <ErrorBoundary>
        <SettingsProvider>
          <BreakCard />
        </SettingsProvider>
      </ErrorBoundary>
    );
  }

  // Festival, day plan, Keeper, IPO and SIP reminders shown as a card; see
  // `commands::reminder_card`.
  if (surface === "reminder") {
    return (
      <ErrorBoundary>
        <SettingsProvider>
          <ReminderCard />
        </SettingsProvider>
      </ErrorBoundary>
    );
  }

  // Keeper's photo viewer runs in its own window; see `open_keeper_viewer`.
  if (surface === "viewer") {
    return (
      <ErrorBoundary>
        <SettingsProvider>
          <PhotoViewer />
        </SettingsProvider>
      </ErrorBoundary>
    );
  }

  if (isUpdateWindow) {
    return (
      <ErrorBoundary>
        <SettingsProvider>
          <UpdaterProvider mode="owner">
            <UpdateWindow />
          </UpdaterProvider>
        </SettingsProvider>
      </ErrorBoundary>
    );
  }

  return (
    <MemoryRouter initialEntries={initialEntries}>
      <ErrorBoundary>
        <SWRConfig value={{ provider: persistentCacheProvider }}>
          <SettingsProvider>
            <UpdaterProvider mode="mirror">
              <BackgroundFeedRefresh />
              <HeaderSlotProvider>
                <Shell />
              </HeaderSlotProvider>
            </UpdaterProvider>
          </SettingsProvider>
        </SWRConfig>
      </ErrorBoundary>
    </MemoryRouter>
  );
}
