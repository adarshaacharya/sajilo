import { useMemo, useState } from "react";
import { BazarSearch } from "../../components/bazar/BazarSearch";
import { SourceLink, SourceNote } from "../../components/bazar/SourceNote";
import { Icon } from "../../components/Icon";
import { formatNepaliDate, marketUnitLabel, money } from "../../lib/bazar";
import { useSettings } from "../../lib/settings";
import type { VegetableMarketSnapshot } from "../../types/api/VegetableMarketSnapshot";
import type { VegetablePrice } from "../../types/api/VegetablePrice";

const PIN_KEY = "vegetableFavourites";

function loadPins(): string[] {
  try {
    const raw = localStorage.getItem(PIN_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function ProduceRow({
  price,
  pinned,
  onTogglePin,
}: {
  price: VegetablePrice;
  pinned: boolean;
  onTogglePin: () => void;
}) {
  return (
    <div className="row-line group flex items-center gap-1.5 py-2">
      <button
        type="button"
        onClick={onTogglePin}
        aria-label="Pin to the top"
        className={`shrink-0 p-0.5 transition-opacity ${
          pinned ? "text-[color:var(--color-accent-mark)]" : "text-text-muted opacity-0 group-hover:opacity-100"
        }`}
      >
        <Icon name={pinned ? "pinFill" : "pin"} className="size-3" />
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px]">{price.name}</p>
        {price.englishName && (
          <p className="truncate text-[11px] text-text-muted">{price.englishName}</p>
        )}
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[13px] font-medium tabular-nums">
          Rs {money.format(price.average)} {marketUnitLabel(price.unit)}
        </p>
        <p className="text-[11px] text-text-muted tabular-nums">
          {money.format(price.minimum)}–{money.format(price.maximum)}
        </p>
      </div>
    </div>
  );
}

function ProduceList({
  title,
  prices,
  pins,
  onTogglePin,
}: {
  title?: string;
  prices: VegetablePrice[];
  pins: string[];
  onTogglePin: (name: string) => void;
}) {
  if (prices.length === 0) return null;
  return (
    <section className="surface-card p-2.5">
      {title && (
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted">{title}</p>
      )}
      {prices.map((price) => (
        <ProduceRow
          key={price.name}
          price={price}
          pinned={pins.includes(price.name)}
          onTogglePin={() => onTogglePin(price.name)}
        />
      ))}
    </section>
  );
}

export function VegetablesTab({ snapshot }: { snapshot: VegetableMarketSnapshot }) {
  const { t } = useSettings();
  const [query, setQuery] = useState("");
  const [pins, setPins] = useState(loadPins);

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
    setPins((current) => {
      const next = current.includes(name)
        ? current.filter((item) => item !== name)
        : [...current, name];
      localStorage.setItem(PIN_KEY, JSON.stringify(next));
      return next;
    });
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
