import type { ReactNode } from "react";
import type { IconName } from "../../../shared/components/icon";
import { Icon } from "../../../shared/components/icon";
import { Switch } from "../../../shared/components/switch";

/** One module row — icon, title, note, toggle, optional detail when on. */
export function ModuleRow({
  title,
  note,
  icon,
  checked,
  onChange,
  children,
}: {
  title: string;
  note: string;
  icon: IconName;
  checked: boolean;
  onChange: (value: boolean) => void;
  children?: ReactNode;
}) {
  return (
    <div className="surface-card p-2.5">
      <div className="flex items-start gap-2">
        <Icon
          name={icon}
          className={`mt-0.5 size-4 shrink-0 ${
            checked ? "text-[color:var(--color-accent-mark)]" : "text-text-muted"
          }`}
        />
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-medium leading-snug">{title}</p>
          <p className="mt-0.5 text-[10px] leading-snug text-text-muted">{note}</p>
        </div>
        <Switch checked={checked} onChange={onChange} className="mt-0.5" />
      </div>
      {checked && children ? <div className="mt-2 pl-6">{children}</div> : null}
    </div>
  );
}
