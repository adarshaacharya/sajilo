import type { ReactNode } from "react";
import { Select } from "../Select";
import { ToolNumberField } from "./ToolField";

export function QuantityRow<T extends string>({
  amountLabel,
  amount,
  onAmountChange,
  unitLabel,
  unit,
  onUnitChange,
  options,
  step,
}: {
  amountLabel: string;
  amount: number;
  onAmountChange: (value: number) => void;
  unitLabel: string;
  unit: T;
  onUnitChange: (value: T) => void;
  options: readonly { id: T; label: string }[];
  step?: string;
}) {
  return (
    <div className="flex items-end gap-2">
      <ToolNumberField
        label={amountLabel}
        value={amount}
        onChange={onAmountChange}
        step={step}
        className="min-w-0 flex-1"
      />
      <div className="w-[104px] shrink-0">
        <Select label={unitLabel} value={unit} onChange={onUnitChange} options={options} />
      </div>
    </div>
  );
}

export function ToolSection({ children }: { children: ReactNode }) {
  return <div className="space-y-2">{children}</div>;
}
