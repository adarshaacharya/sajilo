import { useEffect, useState } from "react";
import { Icon } from "../../shared/components/icon";
import { Segmented } from "../../shared/components/segmented";
import { useSettings } from "../../shared/context/settings-context";
import { api, type Conversion, type SupportedRange } from "../../shared/lib/ipc";
import { digits } from "../../shared/lib/numerals";
import { ToolSection } from "../tools/_components/quantity-row";
import { ToolTextField } from "../tools/_components/tool-field";

type Direction = "bsToAd" | "adToBs";
type CopyFormat = { title: string; value: string };

function longGregorian(iso: string): string {
  const date = new Date(`${iso}T12:00:00`);
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function CopyFormatRow({ title, value }: CopyFormat) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard access may be unavailable in a webview, but the control
      // should still acknowledge the user's action.
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <button
      type="button"
      onClick={copy}
      className="group flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-surface-hover"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] text-text-muted">{title}</span>
        <span className="mt-0.5 block truncate text-[13px] font-semibold leading-tight tabular-nums">
          {value}
        </span>
      </span>
      <Icon
        name={copied ? "checkmark" : "copy"}
        className={`size-3.5 shrink-0 transition-colors ${
          copied
            ? "text-[color:var(--color-accent-mark)]"
            : "text-text-muted group-hover:text-text-secondary"
        }`}
      />
    </button>
  );
}

export function Converter() {
  const { numerals, t } = useSettings();
  const [direction, setDirection] = useState<Direction>("bsToAd");
  const [range, setRange] = useState<SupportedRange | null>(null);
  const [fields, setFields] = useState({ year: "2083", month: "1", day: "1" });
  const [result, setResult] = useState<Conversion | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .supportedRange()
      .then(setRange)
      .catch(() => {});
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
    let cancelled = false;
    convert(year, month, day)
      .then((value) => {
        if (cancelled) return;
        setResult(value);
        setError(null);
      })
      .catch((cause) => {
        if (cancelled) return;
        setResult(null);
        setError(String(cause));
      });

    return () => {
      cancelled = true;
    };
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

  const setToday = (targetDirection = direction) => {
    api
      .today()
      .then(({ nepali, gregorian }) => {
        if (targetDirection === "bsToAd") {
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

  // Mirrors the Swift converter: changing the segmented direction starts with
  // a valid date in that calendar, while the swap button below keeps the
  // already-converted instant in view.
  const changeDirection = (targetDirection: Direction) => {
    if (targetDirection === direction) return;
    setResult(null);
    setError(null);
    setDirection(targetDirection);
    setToday(targetDirection);
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

  const convert = () => setFields((current) => ({ ...current }));

  return (
    <ToolSection>
      <Segmented
        label="Conversion direction"
        value={direction}
        onChange={changeDirection}
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
        <section className="surface-card p-3">
          <p className="text-[15px] font-semibold leading-snug">
            {longGregorian(result.gregorian)}
          </p>
          <p className="mt-1 text-[12px] font-medium text-text-secondary">{nepaliLong}</p>
        </section>
      )}

      {copyFormats.length > 0 && (
        <section className="surface-card overflow-hidden">
          <p className="px-3 pt-2.5 text-[10px] font-semibold text-text-muted">
            {t("action.copy-as")}
          </p>
          <div className="mt-1">
            {copyFormats.map((format, index) => (
              <div key={format.title} className={index === 0 ? "" : "border-t border-border/55"}>
                <CopyFormatRow {...format} />
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="flex items-center justify-between pt-0.5">
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => setToday()} className="btn-ghost text-[11px]">
            {t("action.today")}
          </button>
          <button
            type="button"
            onClick={swap}
            className="btn-ghost inline-flex items-center gap-1 text-[11px]"
          >
            <Icon name="swap" className="size-3.5" />
            {t("action.swap")}
          </button>
        </div>
        <button
          type="button"
          onClick={convert}
          className="rounded-md bg-[color:var(--color-accent)] px-3 py-1.5 text-[11px] font-semibold text-[#fffaf0] transition-opacity hover:opacity-90 active:opacity-75"
        >
          {t("action.convert")}
        </button>
      </div>
    </ToolSection>
  );
}
