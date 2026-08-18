/** macOS NSSwitch — visual track + knob. */
export function SwitchVisual({ checked }: { checked: boolean }) {
  return (
    <span className={`mac-switch shrink-0 ${checked ? "mac-switch--on" : ""}`} aria-hidden>
      <span className="mac-switch-knob" />
    </span>
  );
}

export function Switch({
  checked,
  onChange,
  disabled,
  className = "",
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`shrink-0 disabled:opacity-50 ${className}`}
    >
      <SwitchVisual checked={checked} />
    </button>
  );
}
