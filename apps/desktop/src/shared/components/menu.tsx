import { useEffect, useRef } from "react";
import { Icon } from "./icon";

/** A small menu under whatever opened it; any click outside closes it. */
export function Menu({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  return (
    <div ref={ref} role="menu" className="notes-menu">
      {children}
    </div>
  );
}

export function MenuItem({
  label,
  onClick,
  danger,
  checked,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  checked?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`notes-menu__item${danger ? " is-danger" : ""}`}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {checked && <Icon name="checkmark" className="size-3 text-accent-mark" />}
    </button>
  );
}
