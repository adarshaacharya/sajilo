import { Icon } from "../../../shared/components/icon";
import { TABS } from "../../../shared/components/tab-bar";
import { useSettings } from "../../../shared/context/settings-context";
import { digits } from "../../../shared/lib/numerals";
import { MAX_BAR_TABS, tabLayout } from "../../../shared/lib/tab-layout";

/**
 * Which tabs sit on the tab bar, in what order, and which go under More.
 * Today always leads; switched-off modules aren't listed. Buttons rather than
 * dragging, so it works the same with a trackpad, a mouse or the keyboard.
 */
export function TabBarEditor() {
  const { t, language, modules, setModules } = useSettings();
  const { bar, more } = tabLayout(TABS, modules);
  const onBar = bar.filter((tab) => tab.to !== "/");
  const full = onBar.length >= MAX_BAR_TABS;

  const save = (next: string[]) => setModules((current) => ({ ...current, tabBar: next }));
  const order = onBar.map((tab) => tab.to);
  const move = (index: number, by: -1 | 1) => {
    const next = [...order];
    const [taken] = next.splice(index, 1);
    if (taken) next.splice(index + by, 0, taken);
    save(next);
  };

  return (
    <section className="surface-card space-y-2 p-3">
      <div>
        <h3 className="text-[12px] font-semibold">{t("settings.tab-bar")}</h3>
        <p className="mt-0.5 text-[10.5px] leading-snug text-text-muted">
          {t("settings.tab-bar-note").replace(
            "{n}",
            digits(MAX_BAR_TABS, language === "ne" ? "devanagari" : "latin"),
          )}
        </p>
      </div>

      <p className="tab-editor__label">{t("settings.tab-bar-on")}</p>
      <ul className="space-y-0.5">
        <li className="tab-editor__row is-fixed">
          <Icon name="today" className="size-3.5" />
          <span className="min-w-0 flex-1 truncate">{t("tab.today")}</span>
        </li>
        {onBar.map((tab, index) => (
          <li key={tab.to} className="tab-editor__row">
            <Icon name={tab.icon} className="size-3.5" />
            <span className="min-w-0 flex-1 truncate">{t(tab.labelKey)}</span>
            <button
              type="button"
              className="icon-btn"
              disabled={index === 0}
              onClick={() => move(index, -1)}
              aria-label={`${t(tab.labelKey)}: ${t("settings.move-up")}`}
            >
              <Icon name="chevronUp" className="size-3" />
            </button>
            <button
              type="button"
              className="icon-btn"
              disabled={index === onBar.length - 1}
              onClick={() => move(index, 1)}
              aria-label={`${t(tab.labelKey)}: ${t("settings.move-down")}`}
            >
              <Icon name="chevronDown" className="size-3" />
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={() => save(order.filter((to) => to !== tab.to))}
              aria-label={`${t(tab.labelKey)}: ${t("settings.remove-from-bar")}`}
              title={t("settings.remove-from-bar")}
            >
              <Icon name="minus" className="size-3" />
            </button>
          </li>
        ))}
      </ul>

      {more.length > 0 && (
        <>
          <p className="tab-editor__label">{t("settings.tab-bar-in-more")}</p>
          <ul className="space-y-0.5">
            {more.map((tab) => (
              <li key={tab.to} className="tab-editor__row is-more">
                <Icon name={tab.icon} className="size-3.5" />
                <span className="min-w-0 flex-1 truncate">{t(tab.labelKey)}</span>
                <button
                  type="button"
                  className="icon-btn"
                  disabled={full}
                  onClick={() => save([...order, tab.to])}
                  aria-label={`${t(tab.labelKey)}: ${t("settings.add-to-bar")}`}
                  title={full ? t("settings.tab-bar-full") : t("settings.add-to-bar")}
                >
                  <Icon name="plus" className="size-3" />
                </button>
              </li>
            ))}
          </ul>
          {full && <p className="text-[10.5px] text-text-muted">{t("settings.tab-bar-full")}</p>}
        </>
      )}
    </section>
  );
}
