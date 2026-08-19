import { useMemo, useState } from "react";
import { useSettings } from "../../../shared/context/settings-context";
import { usePersistedList } from "../../../shared/lib/persisted";
import type { VegetableMarketSnapshot } from "../../../types/api/VegetableMarketSnapshot";
import { formatNepaliDate } from "../_lib/format";
import { BazarSearch } from "./bazar-search";
import { ProduceList } from "./produce-list";
import { SourceLink, SourceNote } from "./source-note";

const PIN_KEY = "vegetableFavourites";

export function VegetablesTab({ snapshot }: { snapshot: VegetableMarketSnapshot }) {
  const { t } = useSettings();
  const [query, setQuery] = useState("");
  const [pins, setPins] = usePersistedList(PIN_KEY);

  const needle = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!needle) return snapshot.prices;
    return snapshot.prices.filter(
      (price) =>
        price.name.toLowerCase().includes(needle) ||
        (price.englishName ?? "").toLowerCase().includes(needle),
    );
  }, [needle, snapshot.prices]);

  const pinned = matches.filter((price) => pins.includes(price.name));
  const others = matches.filter((price) => !pins.includes(price.name));

  const togglePin = (name: string) => {
    setPins((current) =>
      current.includes(name) ? current.filter((item) => item !== name) : [...current, name],
    );
  };

  const published = snapshot.publishedOn ? formatNepaliDate(snapshot.publishedOn) : undefined;

  return (
    <div className="space-y-2.5">
      <BazarSearch value={query} onChange={setQuery} placeholder={t("bazar.search-produce")} />

      {matches.length === 0 ? (
        <section className="surface-card p-2.5">
          <p className="text-[12px] text-text-secondary">{t("bazar.no-match")}</p>
        </section>
      ) : (
        <>
          <ProduceList
            title={pinned.length > 0 ? t("bazar.pinned") : undefined}
            prices={pinned}
            pins={pins}
            onTogglePin={togglePin}
          />
          <ProduceList
            title={pinned.length > 0 && others.length > 0 ? t("bazar.all-produce") : undefined}
            prices={others}
            pins={pins}
            onTogglePin={togglePin}
          />
        </>
      )}

      <p className="px-0.5 text-[10px] leading-snug text-text-muted">{t("bazar.wholesale-note")}</p>

      {published && (
        <SourceNote label={t("bazar.published")} stamp={published}>
          <SourceLink href="https://kalimatimarket.gov.np/price">
            Kalimati Fruits and Vegetable Market Development Board
          </SourceLink>
        </SourceNote>
      )}
    </div>
  );
}
