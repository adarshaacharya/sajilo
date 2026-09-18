import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { CONTROL } from "../../../shared/components/control";
import { Icon } from "../../../shared/components/icon";
import { RemindDays } from "../../../shared/components/remind-days";
import { Select } from "../../../shared/components/select";
import { Switch } from "../../../shared/components/switch";
import { useSettings } from "../../../shared/context/settings-context";
import type { SipStatus } from "../../../types/api/SipStatus";
import { dayOfMonth, sipDueBs, sipDueDate, sipIsClose, sipWhen } from "../_lib/funds";

const DAYS = Array.from({ length: 31 }, (_, index) => String(index + 1));

/**
 * A fund's monthly SIP, under the units it adds to. Off, it is one switch and
 * nothing else; on, the day the bank debits it, the amount, and when the next
 * payment falls — the date Rust worked out, in AD with its BS day beside it.
 */
export function SipSetup({
  sip,
  onSet,
  onRemove,
}: {
  sip: SipStatus | undefined;
  onSet: (day: number, amount: number | null, remindDays: number[]) => void;
  onRemove: () => void;
}) {
  const { t, language } = useSettings();
  const navigate = useNavigate();
  const [amount, setAmount] = useState(sip?.amount ? String(sip.amount) : "");
  useEffect(() => setAmount(sip?.amount ? String(sip.amount) : ""), [sip?.amount]);

  const parsedAmount = () => {
    const value = Number(amount);
    return Number.isFinite(value) && value > 0 ? value : null;
  };
  const dayLabel = (day: number) =>
    t("funds.sip-every-month").replace("{day}", dayOfMonth(day, language));
  const bs = sip ? sipDueBs(sip, language) : null;

  return (
    <div className="section-divider mt-2.5 pt-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-medium">{t("funds.sip")}</p>
        <Switch
          checked={Boolean(sip)}
          // Starting today's day of the month is the likeliest guess for
          // someone setting it up on the day they started.
          onChange={(on) => (on ? onSet(new Date().getDate(), null, [3, 0]) : onRemove())}
        />
      </div>

      {sip && (
        <div className="mt-2 space-y-2">
          <Select
            label={t("funds.sip-pays-on")}
            value={String(sip.day)}
            onChange={(day) => onSet(Number(day), sip.amount, sip.remindDays)}
            options={DAYS.map((day) => ({ id: day, label: dayLabel(Number(day)) }))}
          />
          <label className="block">
            <span className="mb-1 block text-[10px] text-text-muted">{t("funds.sip-amount")}</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              placeholder={t("funds.sip-amount-optional")}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              // Saved when the field is left, not on every keystroke.
              onBlur={() => {
                if (parsedAmount() !== sip.amount) {
                  onSet(sip.day, parsedAmount(), sip.remindDays);
                }
              }}
              className={`${CONTROL} w-full tabular-nums`}
            />
          </label>
          <RemindDays
            value={sip.remindDays}
            onChange={(remindDays) => onSet(sip.day, sip.amount, remindDays)}
            span={7}
            label={t("funds.sip-remind")}
            onDayLabel={t("funds.sip-on-day")}
          />
          <div className="flex items-baseline justify-between gap-2 text-[11px]">
            <span className="text-text-muted">{t("funds.sip-next")}</span>
            <span className="text-right tabular-nums">
              {sipDueDate(sip, language)}
              {bs && <span className="text-text-muted"> · {bs}</span>}
              {sipIsClose(sip) && (
                <span className="ml-1 font-medium text-[color:var(--color-accent-mark)]">
                  · {sipWhen(t, sip.days)}
                </span>
              )}
            </span>
          </div>
          {sip.day > 28 && (
            <p className="text-[10px] leading-snug text-text-muted">{t("funds.sip-short-month")}</p>
          )}
          <button
            type="button"
            onClick={() => navigate("/keeper?view=reminders&section=sips")}
            className="flex items-center gap-1 text-[10px] font-medium text-accent-mark hover:underline"
          >
            {t("funds.sip-view-keeper")}
            <Icon name="link" className="size-2.5" />
          </button>
        </div>
      )}
    </div>
  );
}
