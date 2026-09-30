import type { ModulePrefs } from "../context/settings-context";

/** Tabs on the bar after Today, at most: with Today and More, seven slots,
 * each wide enough for its label at the popover's width. */
export const MAX_BAR_TABS = 5;

export interface TabLike {
  to: string;
  module: keyof ModulePrefs | null;
}

/**
 * Which tabs sit on the bar and which go under More. Today is always first.
 * The rest follow the user's chosen order (`modules.tabBar`), up to
 * [`MAX_BAR_TABS`]; tabs whose module is switched off are left out of both.
 * One tab left over goes on the bar itself: a More holding one tab is a tap
 * for nothing.
 */
export function tabLayout<T extends TabLike>(tabs: readonly T[], modules: ModulePrefs) {
  const enabled = tabs.filter((tab) => !tab.module || modules[tab.module] === true);
  const today = enabled.filter((tab) => tab.to === "/");
  const others = enabled.filter((tab) => tab.to !== "/");
  const chosen = modules.tabBar
    .map((to) => others.find((tab) => tab.to === to))
    .filter((tab): tab is T => tab !== undefined)
    .slice(0, MAX_BAR_TABS);
  const rest = others.filter((tab) => !chosen.includes(tab));
  if (rest.length <= 1) return { bar: [...today, ...chosen, ...rest], more: [] as T[] };
  return { bar: [...today, ...chosen], more: rest };
}
