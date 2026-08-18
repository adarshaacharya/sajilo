import type { ReactNode } from "react";
import { CONTROL_LABEL } from "../../../shared/components/control";

export function ToolControl({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className={CONTROL_LABEL}>{label}</span>
      {children}
    </label>
  );
}
