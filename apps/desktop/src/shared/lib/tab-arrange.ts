import type { ModulePrefs } from "../context/settings-context";
import { MAX_BAR_TABS, tabLayout } from "./tab-layout";

/** The switches among the settings: what a tab's module can be. */
type Switch = {
  [K in keyof ModulePrefs]: ModulePrefs[K] extends boolean ? K : never;
}[keyof ModulePrefs];

interface TabLike {
  to: string;
  module: Switch | null;
}

export type TabGroup = "bar" | "more" | "hidden";
/** Every tab but Today, by where it lives, in order (routes, `/news`). */
export type TabGroups = Record<TabGroup, string[]>;

export const TAB_GROUPS: readonly TabGroup[] = ["bar", "more", "hidden"];

/** Where every tab lives now, as the tab bar draws it. */
export function tabGroups(tabs: readonly TabLike[], modules: ModulePrefs): TabGroups {
  const { bar, more } = tabLayout(tabs, modules);
  return {
    bar: bar.filter((tab) => tab.to !== "/").map((tab) => tab.to),
    more: more.map((tab) => tab.to),
    hidden: tabs.filter((tab) => tab.module && modules[tab.module] !== true).map((tab) => tab.to),
  };
}

export function groupOf(groups: TabGroups, to: string): TabGroup | undefined {
  return TAB_GROUPS.find((group) => groups[group].includes(to));
}

/**
 * `to` moved into `group`, before `before` (a tab already there) or at the
 * end. Within one group it lands where `before` was, so dragging a tab down
 * past its neighbour puts it after that neighbour.
 */
export function moveTab(
  groups: TabGroups,
  to: string,
  group: TabGroup,
  before?: string,
): TabGroups {
  const from = groupOf(groups, to);
  const list = groups[group];
  const sameGroup = from === group;
  const fromIndex = list.indexOf(to);
  const next = Object.fromEntries(
    TAB_GROUPS.map((name) => [name, groups[name].filter((item) => item !== to)]),
  ) as TabGroups;
  let at = before === undefined ? -1 : next[group].indexOf(before);
  if (at === -1) at = next[group].length;
  else if (sameGroup && before !== undefined && fromIndex < list.indexOf(before)) at += 1;
  next[group].splice(at, 0, to);
  return next;
}

/**
 * The settings for `groups`. The bar keeps [`MAX_BAR_TABS`]; any past that go
 * to the top of More, so a tab dropped on a full bar pushes its last one out.
 */
export function withTabGroups(
  modules: ModulePrefs,
  tabs: readonly TabLike[],
  groups: TabGroups,
): ModulePrefs {
  const next: ModulePrefs = {
    ...modules,
    tabBar: groups.bar.slice(0, MAX_BAR_TABS),
    moreOrder: [...groups.bar.slice(MAX_BAR_TABS), ...groups.more],
  };
  for (const tab of tabs) {
    if (tab.module) next[tab.module] = !groups.hidden.includes(tab.to);
  }
  return next;
}
