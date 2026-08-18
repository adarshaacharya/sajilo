import { useEffect, useState } from "react";
import { Card } from "../components/Card";
import { CONTROL, CONTROL_LABEL } from "../components/control";
import { api, type Conversion, type SupportedRange } from "../lib/ipc";
import { digits } from "../lib/numerals";
import { useSettings } from "../lib/settings";

type Direction = "bsToAd" | "adToBs";

export function Converter() {
  const { numerals, t } = useSettings();
  const [direction, setDirection] = useState<Direction>("bsToAd");
  const [range, setRange] = useState<SupportedRange | null>(null);
  const [fields, setFields] = useState({ year: 2083, month: 1, day: 1 });
  const [result, setResult] = useState<Conversion | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .supportedRange()
      .then(setRange)
      .catch(() => {});
    // Seed with today so the screen opens on something real.
    api
      .today()
      .then(({ nepali }) => setFields({ year: nepali.year, month: nepali.month, day: nepali.day }))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const convert = direction === "bsToAd" ? api.bsToAd : api.adToBs;
    convert(fields.year, fields.month, fields.day)
      .then((value) => {
        setResult(value);
        setError(null);
      })
      .catch((cause) => {
        // A date outside the bundled table is a real answer, not a crash.
        setResult(null);
        setError(String(cause));
      });
  }, [direction, fields]);

  const swap = () => {
    // Carry the converted date across, so swapping continues the same thought
    // rather than resetting the form.
    if (result) {
      if (direction === "bsToAd") {
        const [year, month, day] = result.gregorian.split("-").map(Number);
        if (year && month && day) setFields({ year, month, day });
      } else {
        setFields({
          year: result.nepali.year,
          month: result.nepali.month,
          day: result.nepali.day,
        });
      }
    }
    setDirection((current) => (current === "bsToAd" ? "adToBs" : "bsToAd"));
  };

  const bounds =
    direction === "bsToAd"
      ? { min: range?.firstYear ?? 1992, max: range?.lastYear ?? 2090 }
      : { min: 1935, max: 2034 };

  return (
    <div className="space-y-3">
      <Card title={direction === "bsToAd" ? "बि.सं. → A.D." : "A.D. → बि.सं."}>
        <div className="grid grid-cols-3 gap-2">
          {(["year", "month", "day"] as const).map((field) => (
            <label key={field} className="block">
              <span className={CONTROL_LABEL}>{field}</span>
              <input
                type="number"
                value={fields[field]}
                min={field === "year" ? bounds.min : 1}
                max={field === "year" ? bounds.max : field === "month" ? 12 : 32}
                onChange={(event) =>
                  setFields((current) => ({ ...current, [field]: Number(event.target.value) }))
                }
                className={`${CONTROL} w-full`}
              />
            </label>
          ))}
        </div>
        <button
          type="button"
          onClick={swap}
          className="mt-3 w-full rounded-xl border border-border py-1.5 text-text-secondary hover:bg-surface-hover hover:text-text"
        >
          ⇅ {t("action.swap")}
        </button>
      </Card>

      {error && (
        <Card title={t("state.unavailable")}>
          <p className="text-text-secondary">{error}</p>
        </Card>
      )}

      {result && (
        <Card title={t("action.copy-as")}>
          <ul className="space-y-1.5">
            {[
              `${result.nepali.year}/${String(result.nepali.month).padStart(2, "0")}/${String(result.nepali.day).padStart(2, "0")}`,
              `${result.nepaliMonthName} ${digits(result.nepali.day, numerals)}, ${digits(result.nepali.year, numerals)}`,
              result.gregorian,
            ].map((text) => (
              <li key={text}>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(text)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1 text-left hover:bg-surface-hover"
                >
                  <span className="truncate">{text}</span>
                  <span className="shrink-0 text-[10px] text-text-muted">⧉</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
