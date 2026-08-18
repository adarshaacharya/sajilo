import { CONTROL } from "../../../shared/components/control";
import { Icon } from "../../../shared/components/icon";

export function BazarSearch({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative">
      <Icon
        name="search"
        className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-text-muted"
      />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={`${CONTROL} w-full pl-7 pr-7 text-[12px]`}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear"
          className="absolute top-1/2 right-2 -translate-y-1/2 text-[10px] text-text-muted hover:text-text-secondary"
        >
          ✕
        </button>
      )}
    </div>
  );
}
