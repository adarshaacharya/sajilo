import { useCallback, useEffect } from "react";
import { useSWRConfig } from "swr";
import { useSettings } from "../context/settings-context";
import { api } from "../lib/ipc";
import { catchAsFailed } from "../lib/load-state";

/** Mirrors native background refreshes into SWR so an open screen updates
 * immediately and unopened screens are warm when the user visits them. */
export function BackgroundFeedRefresh() {
  const { modules } = useSettings();
  const { mutate } = useSWRConfig();

  const syncCaches = useCallback(async () => {
    const refreshes: Promise<unknown>[] = [];

    if (modules.newsEnabled) {
      refreshes.push(
        mutate("news", catchAsFailed(api.getNews(false)), {
          revalidate: false,
        }),
      );
    }
    if (modules.weatherEnabled) {
      refreshes.push(
        mutate(
          `weather:${modules.weatherLocation}`,
          catchAsFailed(api.getWeather(false, modules.weatherLocation)),
          { revalidate: false },
        ),
      );
    }
    if (modules.forexEnabled) {
      refreshes.push(
        mutate("forex", catchAsFailed(api.getForex(false)), {
          revalidate: false,
        }),
      );
    }
    if (modules.bazarEnabled) {
      refreshes.push(
        mutate("bazar-feeds", api.getBazar(false), { revalidate: false }),
        mutate("bazar-stocks", catchAsFailed(api.getStocks(false)), {
          revalidate: false,
        }),
      );
    }
    if (modules.rashifalEnabled) {
      refreshes.push(
        mutate("rashifal", catchAsFailed(api.getRashifal(false)), {
          revalidate: false,
        }),
      );
    }
    if (modules.radioEnabled) {
      refreshes.push(
        mutate("radio-stations", catchAsFailed(api.getStations(false)), {
          revalidate: false,
        }),
      );
    }

    await Promise.allSettled(refreshes);
  }, [modules, mutate]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    import("@tauri-apps/api/event")
      .then(({ listen }) =>
        listen("sajilo://feeds-refreshed", () => {
          void syncCaches();
        }),
      )
      .then((stop) => {
        unlisten = stop;
      })
      .catch(() => {});

    return () => unlisten?.();
  }, [syncCaches]);

  return null;
}
