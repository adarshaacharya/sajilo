import { Link, useNavigate } from "react-router";
import { Icon } from "../../shared/components/icon";
import { TABS } from "../../shared/components/tab-bar";
import { useSettings } from "../../shared/context/settings-context";
import { tabLayout } from "../../shared/lib/tab-layout";

/**
 * The tabs that don't fit on the tab bar, one tap away, and the way to choose
 * which ones do.
 */
export function More() {
  const { t, modules } = useSettings();
  const navigate = useNavigate();
  const { more } = tabLayout(TABS, modules);

  return (
    <div className="space-y-2.5">
      <ul className="surface-card overflow-hidden">
        {more.map((tab) => (
          <li key={tab.to} className="border-b border-divider last:border-b-0">
            <Link to={tab.to} className="more-row">
              <span className="more-row__icon">
                <Icon name={tab.icon} className="size-4" />
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                {t(tab.labelKey)}
              </span>
              <Icon name="chevronRight" className="size-3 shrink-0 text-text-muted" />
            </Link>
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => navigate("/settings?tab=modules")} className="more-edit">
        <Icon name="sliders" className="size-3.5" />
        {t("more.edit")}
      </button>
    </div>
  );
}
