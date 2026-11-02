import { Link, useNavigate } from "react-router";
import { Icon } from "../../shared/components/icon";
import { TABS } from "../../shared/components/tab-bar";
import { DROP_MORE, useTabDrag, useTabDropZone } from "../../shared/components/tab-drag";
import { useSettings } from "../../shared/context/settings-context";
import { tabLayout } from "../../shared/lib/tab-layout";

type Tab = (typeof TABS)[number];

/**
 * The tabs that don't fit on the tab bar, one tap away, and the way to choose
 * which ones do. Each row drags onto the tab bar, and a tab from the bar drops
 * into this list (see `TabDragProvider`).
 */
export function More() {
  const { t, modules } = useSettings();
  const navigate = useNavigate();
  const { more } = tabLayout(TABS, modules);
  const zone = useTabDropZone(`${DROP_MORE}list`);

  return (
    <div className="space-y-2.5">
      <ul
        ref={zone.ref}
        className={`more-list surface-card overflow-hidden${zone.isOver ? " is-drop" : ""}`}
      >
        {more.map((tab) => (
          <MoreRow key={tab.to} tab={tab} label={t(tab.labelKey)} />
        ))}
      </ul>
      <button type="button" onClick={() => navigate("/settings?tab=modules")} className="more-edit">
        <Icon name="sliders" className="size-3.5" />
        {t("more.edit")}
      </button>
    </div>
  );
}

function MoreRow({ tab, label }: { tab: Tab; label: string }) {
  const { ref, handlers, isDragging, isOver } = useTabDrag(tab.to, `${DROP_MORE}${tab.to}`);
  return (
    <li
      ref={ref}
      className={`more-row-item border-b border-divider last:border-b-0${isDragging ? " is-dragging" : ""}${
        isOver ? " is-drop" : ""
      }`}
    >
      <Link to={tab.to} className="more-row" draggable={false} {...handlers}>
        <span className="more-row__icon">
          <Icon name={tab.icon} className="size-4" />
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{label}</span>
        <Icon name="chevronRight" className="size-3 shrink-0 text-text-muted" />
      </Link>
    </li>
  );
}
