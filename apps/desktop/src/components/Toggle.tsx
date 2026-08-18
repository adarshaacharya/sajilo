import { Switch } from "./Switch";

/** A labelled macOS-style switch, with room for the note that explains what it does. */
export function Toggle({
  label,
  note,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  note?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className={disabled ? "opacity-50" : ""}>
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 text-[12px] text-text">{label}</span>
        <Switch checked={checked} onChange={onChange} disabled={disabled} />
      </div>
      {note && <p className="mt-0.5 text-[10px] leading-snug text-text-muted">{note}</p>}
    </div>
  );
}
