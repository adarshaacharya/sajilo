import { useEffect, useState } from "react";
import { Icon } from "../components/Icon";
import { Segmented } from "../components/Segmented";
import { ResultCard } from "../components/tools/ResultCard";
import { ToolSection } from "../components/tools/QuantityRow";
import { ToolTextField } from "../components/tools/ToolField";
import { api, type Conversion, type SupportedRange } from "../lib/ipc";
import { digits } from "../lib/numerals";
import { useSettings } from "../lib/settings";

type Direction = "bsToAd" | "adToBs";

function longGregorian(iso: string): string {
  const date = new Date(`${iso}T12:00:00`);
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function Converter() {
  const { numerals, t } = useSettings();
  const [direction, setDirection] = useState<Direction>("bsToAd");
  const [range, setRange] = useState<SupportedRange | null>(null);
  const [fields, setFields] = useState({ year: "2083", month: "1", day: "1" });
  const [result, setResult] = useState<Conversion | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.supportedRange().then(setRange).catch(() => {});
    api
      .today()
      .then(({ nepali }) =>
        setFields({
          year: String(nepali.year),
          month: String(nepali.month),
          day: String(nepali.day),
        }),
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    const year = Number(fields.year);
    const month = Number(fields.month);
    const day = Number(fields.day);
    if (![year, month, day].every(Number.isFinite)) return;

    const convert = direction === "bsToAd" ? api.bsToAd : api.adToBs;
    convert(year, month, day)
      .then((value) => {
        setResult(value);
        setError(null);
      })
      .catch((cause) => {
        setResult(null);
        setError(String(cause));
      });
  }, [direction, fields]);

  const swap = () => {
    if (result) {
      if (direction === "bsToAd") {
        const [year, month, day] = result.gregorian.split("-").map(Number);
        if (year && month && day) {
          setFields({ year: String(year), month: String(month), day: String(day) });
        }
      } else {
        setFields({
          year: String(result.nepali.year),
          month: String(result.nepali.month),
          day: String(result.nepali.day),
        });
      }
    }
    setDirection((current) => (current === "bsToAd" ? "adToBs" : "bsToAd"));
  };

  const setToday = () => {
    api
      .today()
      .then(({ nepali, gregorian }) => {
        if (direction === "bsToAd") {
          setFields({
            year: String(nepali.year),
            month: String(nepali.month),
            day: String(nepali.day),
          });
        } else {
          const [year, month, day] = gregorian.split("-").map(Number);
          if (year && month && day) {
            setFields({ year: String(year), month: String(month), day: String(day) });
          }
        }
      })
      .catch(() => {});
  };

  const bounds =
    direction === "bsToAd"
      ? { min: range?.firstYear ?? 1992, max: range?.lastYear ?? 2090 }
      : { min: 1935, max: 2034 };

  const nepaliLong = result
    ? `${result.nepaliMonthName} ${digits(result.nepali.day, numerals)}, ${digits(result.nepali.year, numerals)}`
    : "";

  const copyFormats = result
    ? [
        {
          title: "Nepali numerals",
          value: `${digits(result.nepali.year, numerals)}/${digits(result.nepali.month, numerals)}/${digits(result.nepali.day, numerals)}`,
        },
        {
          title: "English numerals",
          value: `${result.nepali.year}/${String(result.nepali.month).padStart(2, "0")}/${String(result.nepali.day).padStart(2, "0")}`,
        },
        {
          title: "Long date",
          value: longGregorian(result.gregorian),
        },
      ]
    : [];

  return (
    <ToolSection>
      <Segmented
        label="Conversion direction"
        value={direction}
        onChange={setDirection}
        options={[
          { id: "bsToAd", label: "BS → AD" },
          { id: "adToBs", label: "AD → BS" },
        ]}
      />

      <div className="flex items-end gap-2">
        <ToolTextField
          label="Year"
          value={fields.year}
          onChange={(value) => setFields((current) => ({ ...current, year: value }))}
          min={bounds.min}
          max={bounds.max}
          className="min-w-0 flex-1"
        />
        <ToolTextField
          label="Month"
          value={fields.month}
          onChange={(value) => setFields((current) => ({ ...current, month: value }))}
          className="min-w-0 flex-1"
        />
        <ToolTextField
          label="Day"
          value={fields.day}
          onChange={(value) => setFields((current) => ({ ...current, day: value }))}
          className="min-w-0 flex-1"
        />
      </div>

      {error && (
        <p className="rounded-[8px] border border-holiday/30 bg-holiday/10 px-2 py-1.5 text-[11px] text-holiday">
          {error}
        </p>
      )}

      {result && (
        <section className="surface-card p-2.5">
          <p className="text-[15px] font-semibold leading-snug">{longGregorian(result.gregorian)}</p>
          <p className="mt-0.5 text-[12px] text-text-secondary">{nepaliLong}</p>
        </section>
      )}

      {copyFormats.length > 0 && (
        <div className="space-y-1.5">
          <p className="px-0.5 text-[10px] font-semibold text-text-muted">{t("action.copy-as")}</p>
          {copyFormats.map((format) => (
            <ResultCard key={format.title} title={format.title} value={format.value} />
          ))}
        </div>
      )}

      <div className="flex items-center gap-1.5 pt-0.5">
        <button type="button" onClick={setToday} className="btn-ghost text-[11px]">
          {t("action.today")}
        </button>
        <button
          type="button"
          onClick={swap}
          aria-label={t("action.swap")}
          className="icon-btn"
        >
          <Icon name="swap" className="size-3.5" />
        </button>
      </div>
    </ToolSection>
  );
}
