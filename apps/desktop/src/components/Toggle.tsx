/** A labelled switch, with room for the note that explains what it does. */
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
    <label className={`block py-1.5 ${disabled ? "opacity-50" : ""}`}>
      <span className="flex items-center justify-between gap-2">
        <span>{label}</span>
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          className="shrink-0 accent-accent"
        />
      </span>
      {note && <span className="mt-0.5 block text-[11px] text-text-muted">{note}</span>}
    </label>
  );
}
