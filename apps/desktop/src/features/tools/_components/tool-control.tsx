import { cloneElement, type ReactElement, useId } from "react";
import { CONTROL_LABEL } from "../../../shared/components/control";

export function ToolControl({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactElement<{ id?: string }>;
  className?: string;
}) {
  const inputId = useId();

  return (
    <div className={`block min-w-0 ${className}`}>
      <label htmlFor={inputId} className={CONTROL_LABEL}>
        {label}
      </label>
      {cloneElement(children, { id: inputId })}
    </div>
  );
}
