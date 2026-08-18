import type { ComponentType } from "react";
import { SFArrowClockwise } from "sf-symbols-lib/monochrome/SFArrowClockwise";
import { SFArrowLeftArrowRight } from "sf-symbols-lib/monochrome/SFArrowLeftArrowRight";
import { SFArrowUpForward } from "sf-symbols-lib/monochrome/SFArrowUpForward";
import { SFCheckmark } from "sf-symbols-lib/monochrome/SFCheckmark";
import { SFChevronLeft } from "sf-symbols-lib/monochrome/SFChevronLeft";
import { SFClock } from "sf-symbols-lib/monochrome/SFClock";
import { SFExclamationmarkCircle } from "sf-symbols-lib/monochrome/SFExclamationmarkCircle";
import { SFPlus } from "sf-symbols-lib/monochrome/SFPlus";
import { SFSunriseFill } from "sf-symbols-lib/monochrome/SFSunriseFill";
import { SFSunsetFill } from "sf-symbols-lib/monochrome/SFSunsetFill";
import { SFTrash } from "sf-symbols-lib/monochrome/SFTrash";
import { SFBag } from "sf-symbols-lib/monochrome/SFBag";
import { SFBanknote } from "sf-symbols-lib/monochrome/SFBanknote";
import { SFCalendar } from "sf-symbols-lib/monochrome/SFCalendar";
import { SFCalendarBadgeCheckmark } from "sf-symbols-lib/monochrome/SFCalendarBadgeCheckmark";
import { SFChartLineUptrendXyaxis } from "sf-symbols-lib/monochrome/SFChartLineUptrendXyaxis";
import { SFCircleHexagongridFill } from "sf-symbols-lib/monochrome/SFCircleHexagongridFill";
import { SFCloudSun } from "sf-symbols-lib/monochrome/SFCloudSun";
import { SFCpu } from "sf-symbols-lib/monochrome/SFCpu";
import { SFDesktopcomputer } from "sf-symbols-lib/monochrome/SFDesktopcomputer";
import { SFDotRadiowavesLeftAndRight } from "sf-symbols-lib/monochrome/SFDotRadiowavesLeftAndRight";
import { SFFuelpump } from "sf-symbols-lib/monochrome/SFFuelpump";
import { SFGearshape } from "sf-symbols-lib/monochrome/SFGearshape";
import { SFHouse } from "sf-symbols-lib/monochrome/SFHouse";
import { SFLeaf } from "sf-symbols-lib/monochrome/SFLeaf";
import { SFMagnifyingglass } from "sf-symbols-lib/monochrome/SFMagnifyingglass";
import { SFMap } from "sf-symbols-lib/monochrome/SFMap";
import { SFMoonStarsFill } from "sf-symbols-lib/monochrome/SFMoonStarsFill";
import { SFNewspaper } from "sf-symbols-lib/monochrome/SFNewspaper";
import { SFPin } from "sf-symbols-lib/monochrome/SFPin";
import { SFPinFill } from "sf-symbols-lib/monochrome/SFPinFill";
import { SFPercent } from "sf-symbols-lib/monochrome/SFPercent";
import { SFPlayFill } from "sf-symbols-lib/monochrome/SFPlayFill";
import { SFPauseFill } from "sf-symbols-lib/monochrome/SFPauseFill";
import { SFPower } from "sf-symbols-lib/monochrome/SFPower";
import { SFSquareAndArrowDown } from "sf-symbols-lib/monochrome/SFSquareAndArrowDown";
import { SFSquareAndArrowUp } from "sf-symbols-lib/monochrome/SFSquareAndArrowUp";
import { SFSquareOnSquare } from "sf-symbols-lib/monochrome/SFSquareOnSquare";
import { SFSparkles } from "sf-symbols-lib/monochrome/SFSparkles";
import { SFSquareGrid2x2 } from "sf-symbols-lib/monochrome/SFSquareGrid2x2";
import { SFStar } from "sf-symbols-lib/monochrome/SFStar";
import { SFStarFill } from "sf-symbols-lib/monochrome/SFStarFill";
import { SFStopFill } from "sf-symbols-lib/monochrome/SFStopFill";
import { SFStorefront } from "sf-symbols-lib/monochrome/SFStorefront";
import { SFWrenchAndScrewdriver } from "sf-symbols-lib/monochrome/SFWrenchAndScrewdriver";

type SFComp = ComponentType<{ size?: number; className?: string }>;

/**
 * Named glyphs mapped to the same SF Symbols the Swift app uses
 * (`newspaper`, `storefront`, `moon.stars.fill`, …).
 *
 * Monochrome + `currentColor` so active/hover colors flow from the parent.
 */
const GLYPHS: Record<IconName, SFComp> = {
  today: SFHouse,
  news: SFNewspaper,
  bazar: SFStorefront,
  rashifal: SFMoonStarsFill,
  radio: SFDotRadiowavesLeftAndRight,
  tools: SFWrenchAndScrewdriver,
  settings: SFGearshape,
  power: SFPower,
  search: SFMagnifyingglass,
  display: SFDesktopcomputer,
  modules: SFSquareGrid2x2,
  system: SFCpu,
  upcoming: SFCalendar,
  festival: SFSparkles,
  holiday: SFCalendarBadgeCheckmark,
  gold: SFCircleHexagongridFill,
  fuel: SFFuelpump,
  vegetables: SFLeaf,
  land: SFMap,
  weight: SFBag,
  percent: SFPercent,
  interest: SFChartLineUptrendXyaxis,
  weather: SFCloudSun,
  forex: SFBanknote,
  refresh: SFArrowClockwise,
  swap: SFArrowLeftArrowRight,
  chevronLeft: SFChevronLeft,
  copy: SFSquareOnSquare,
  checkmark: SFCheckmark,
  openExternal: SFArrowUpForward,
  play: SFPlayFill,
  pause: SFPauseFill,
  pin: SFPin,
  pinFill: SFPinFill,
  stop: SFStopFill,
  star: SFStar,
  starFill: SFStarFill,
  export: SFSquareAndArrowUp,
  import: SFSquareAndArrowDown,
  sunrise: SFSunriseFill,
  sunset: SFSunsetFill,
  clock: SFClock,
  warning: SFExclamationmarkCircle,
  plus: SFPlus,
  trash: SFTrash,
};

export type IconName =
  | "today"
  | "news"
  | "bazar"
  | "rashifal"
  | "radio"
  | "tools"
  | "settings"
  | "power"
  | "search"
  | "display"
  | "modules"
  | "system"
  | "upcoming"
  | "festival"
  | "holiday"
  | "gold"
  | "fuel"
  | "vegetables"
  | "land"
  | "weight"
  | "percent"
  | "interest"
  | "weather"
  | "forex"
  | "refresh"
  | "swap"
  | "chevronLeft"
  | "copy"
  | "checkmark"
  | "openExternal"
  | "play"
  | "pause"
  | "pin"
  | "pinFill"
  | "stop"
  | "star"
  | "starFill"
  | "export"
  | "import"
  | "sunrise"
  | "sunset"
  | "clock"
  | "warning"
  | "plus"
  | "trash";

function sizeFromClass(className: string | undefined): number | undefined {
  if (!className) return undefined;
  const bracket = className.match(/(?:^|\s)size-\[(\d+(?:\.\d+)?)px?\]/);
  if (bracket) return Number(bracket[1]);
  const preset: Record<string, number> = {
    "size-3": 12,
    "size-3.5": 14,
    "size-4": 16,
    "size-5": 20,
  };
  for (const [token, px] of Object.entries(preset)) {
    if (className.split(/\s+/).includes(token)) return px;
  }
  return undefined;
}

export function Icon({
  name,
  className = "size-4",
  size,
}: {
  name: IconName;
  className?: string;
  size?: number;
}) {
  const Comp = GLYPHS[name];
  const px = size ?? sizeFromClass(className) ?? 16;
  return <Comp size={px} className={className} />;
}
