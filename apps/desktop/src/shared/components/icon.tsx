import type { ComponentType } from "react";
import { SFArrowClockwise } from "sf-symbols-lib/monochrome/SFArrowClockwise";
import { SFArrowLeftArrowRight } from "sf-symbols-lib/monochrome/SFArrowLeftArrowRight";
import { SFArrowUpForward } from "sf-symbols-lib/monochrome/SFArrowUpForward";
import { SFArrowUpLeftAndArrowDownRight } from "sf-symbols-lib/monochrome/SFArrowUpLeftAndArrowDownRight";
import { SFBag } from "sf-symbols-lib/monochrome/SFBag";
import { SFBanknote } from "sf-symbols-lib/monochrome/SFBanknote";
import { SFBellSlash } from "sf-symbols-lib/monochrome/SFBellSlash";
import { SFBolt } from "sf-symbols-lib/monochrome/SFBolt";
import { SFBook } from "sf-symbols-lib/monochrome/SFBook";
import { SFBookClosed } from "sf-symbols-lib/monochrome/SFBookClosed";
import { SFCalendar } from "sf-symbols-lib/monochrome/SFCalendar";
import { SFCalendarBadgeCheckmark } from "sf-symbols-lib/monochrome/SFCalendarBadgeCheckmark";
import { SFCar } from "sf-symbols-lib/monochrome/SFCar";
import { SFChartLineUptrendXyaxis } from "sf-symbols-lib/monochrome/SFChartLineUptrendXyaxis";
import { SFCheckmark } from "sf-symbols-lib/monochrome/SFCheckmark";
import { SFCheckmarkShield } from "sf-symbols-lib/monochrome/SFCheckmarkShield";
import { SFChevronDown } from "sf-symbols-lib/monochrome/SFChevronDown";
import { SFChevronLeft } from "sf-symbols-lib/monochrome/SFChevronLeft";
import { SFChevronRight } from "sf-symbols-lib/monochrome/SFChevronRight";
import { SFCircleHexagongridFill } from "sf-symbols-lib/monochrome/SFCircleHexagongridFill";
import { SFClock } from "sf-symbols-lib/monochrome/SFClock";
import { SFCloudSun } from "sf-symbols-lib/monochrome/SFCloudSun";
import { SFCpu } from "sf-symbols-lib/monochrome/SFCpu";
import { SFCupAndSaucer } from "sf-symbols-lib/monochrome/SFCupAndSaucer";
import { SFDesktopcomputer } from "sf-symbols-lib/monochrome/SFDesktopcomputer";
import { SFDocument } from "sf-symbols-lib/monochrome/SFDocument";
import { SFDotRadiowavesLeftAndRight } from "sf-symbols-lib/monochrome/SFDotRadiowavesLeftAndRight";
import { SFDrop } from "sf-symbols-lib/monochrome/SFDrop";
import { SFEllipsis } from "sf-symbols-lib/monochrome/SFEllipsis";
import { SFEnvelope } from "sf-symbols-lib/monochrome/SFEnvelope";
import { SFExclamationmarkCircle } from "sf-symbols-lib/monochrome/SFExclamationmarkCircle";
import { SFEye } from "sf-symbols-lib/monochrome/SFEye";
import { SFFigureWalk } from "sf-symbols-lib/monochrome/SFFigureWalk";
import { SFForkKnife } from "sf-symbols-lib/monochrome/SFForkKnife";
import { SFFuelpump } from "sf-symbols-lib/monochrome/SFFuelpump";
import { SFGearshape } from "sf-symbols-lib/monochrome/SFGearshape";
import { SFGraduationcap } from "sf-symbols-lib/monochrome/SFGraduationcap";
import { SFHouse } from "sf-symbols-lib/monochrome/SFHouse";
import { SFInfoCircle } from "sf-symbols-lib/monochrome/SFInfoCircle";
import { SFLeaf } from "sf-symbols-lib/monochrome/SFLeaf";
import { SFLink } from "sf-symbols-lib/monochrome/SFLink";
import { SFMagnifyingglass } from "sf-symbols-lib/monochrome/SFMagnifyingglass";
import { SFMap } from "sf-symbols-lib/monochrome/SFMap";
import { SFMicrophone } from "sf-symbols-lib/monochrome/SFMicrophone";
import { SFMinus } from "sf-symbols-lib/monochrome/SFMinus";
import { SFMoon } from "sf-symbols-lib/monochrome/SFMoon";
import { SFMoonStarsFill } from "sf-symbols-lib/monochrome/SFMoonStarsFill";
import { SFMoonZzz } from "sf-symbols-lib/monochrome/SFMoonZzz";
import { SFNewspaper } from "sf-symbols-lib/monochrome/SFNewspaper";
import { SFPauseFill } from "sf-symbols-lib/monochrome/SFPauseFill";
import { SFPencil } from "sf-symbols-lib/monochrome/SFPencil";
import { SFPercent } from "sf-symbols-lib/monochrome/SFPercent";
import { SFPersonCropRectangle } from "sf-symbols-lib/monochrome/SFPersonCropRectangle";
import { SFPersonTextRectangle } from "sf-symbols-lib/monochrome/SFPersonTextRectangle";
import { SFPhone } from "sf-symbols-lib/monochrome/SFPhone";
import { SFPills } from "sf-symbols-lib/monochrome/SFPills";
import { SFPin } from "sf-symbols-lib/monochrome/SFPin";
import { SFPinFill } from "sf-symbols-lib/monochrome/SFPinFill";
import { SFPlayFill } from "sf-symbols-lib/monochrome/SFPlayFill";
import { SFPlus } from "sf-symbols-lib/monochrome/SFPlus";
import { SFPower } from "sf-symbols-lib/monochrome/SFPower";
import { SFRotateRight } from "sf-symbols-lib/monochrome/SFRotateRight";
import { SFSliderHorizontal3 } from "sf-symbols-lib/monochrome/SFSliderHorizontal3";
import { SFSofa } from "sf-symbols-lib/monochrome/SFSofa";
import { SFSpeakerSlash } from "sf-symbols-lib/monochrome/SFSpeakerSlash";
import { SFSpeakerWave2 } from "sf-symbols-lib/monochrome/SFSpeakerWave2";
import { SFSquareAndArrowDown } from "sf-symbols-lib/monochrome/SFSquareAndArrowDown";
import { SFSquareAndArrowUp } from "sf-symbols-lib/monochrome/SFSquareAndArrowUp";
import { SFSquareGrid2x2 } from "sf-symbols-lib/monochrome/SFSquareGrid2x2";
import { SFSquareOnSquare } from "sf-symbols-lib/monochrome/SFSquareOnSquare";
import { SFStar } from "sf-symbols-lib/monochrome/SFStar";
import { SFStarFill } from "sf-symbols-lib/monochrome/SFStarFill";
import { SFSteeringwheel } from "sf-symbols-lib/monochrome/SFSteeringwheel";
import { SFStopFill } from "sf-symbols-lib/monochrome/SFStopFill";
import { SFStorefront } from "sf-symbols-lib/monochrome/SFStorefront";
import { SFSunMax } from "sf-symbols-lib/monochrome/SFSunMax";
import { SFSunriseFill } from "sf-symbols-lib/monochrome/SFSunriseFill";
import { SFSunsetFill } from "sf-symbols-lib/monochrome/SFSunsetFill";
import { SFTextDocument } from "sf-symbols-lib/monochrome/SFTextDocument";
import { SFTrash } from "sf-symbols-lib/monochrome/SFTrash";
import { SFWifi } from "sf-symbols-lib/monochrome/SFWifi";
import { SFWrenchAndScrewdriver } from "sf-symbols-lib/monochrome/SFWrenchAndScrewdriver";
import { SFXmark } from "sf-symbols-lib/monochrome/SFXmark";

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
  directory: SFBook,
  keeper: SFCalendarBadgeCheckmark,
  // A chiya cup: "take a break" is "chiya break" in Nepal.
  focus: SFCupAndSaucer,
  eye: SFEye,
  walk: SFFigureWalk,
  meal: SFForkKnife,
  sleep: SFMoonZzz,
  mic: SFMicrophone,
  fullscreen: SFArrowUpLeftAndArrowDownRight,
  moon: SFMoon,
  sun: SFSunMax,
  bellOff: SFBellSlash,
  sofa: SFSofa,
  settings: SFGearshape,
  sliders: SFSliderHorizontal3,
  power: SFPower,
  search: SFMagnifyingglass,
  display: SFDesktopcomputer,
  modules: SFSquareGrid2x2,
  system: SFCpu,
  upcoming: SFCalendar,
  calendar: SFCalendar,
  festival: SFCalendar,
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
  chevronDown: SFChevronDown,
  chevronRight: SFChevronRight,
  chevronLeft: SFChevronLeft,
  copy: SFSquareOnSquare,
  checkmark: SFCheckmark,
  openExternal: SFArrowUpForward,
  play: SFPlayFill,
  pause: SFPauseFill,
  pin: SFPin,
  pinFill: SFPinFill,
  stop: SFStopFill,
  speaker: SFSpeakerWave2,
  speakerMute: SFSpeakerSlash,
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
  info: SFInfoCircle,
  link: SFLink,
  pencil: SFPencil,
  minus: SFMinus,
  close: SFXmark,
  rotate: SFRotateRight,
  idCitizenship: SFPersonTextRectangle,
  idCard: SFPersonCropRectangle,
  document: SFTextDocument,
  passport: SFBookClosed,
  steeringWheel: SFSteeringwheel,
  car: SFCar,
  shield: SFCheckmarkShield,
  wrench: SFWrenchAndScrewdriver,
  documentBlank: SFDocument,
  bolt: SFBolt,
  drop: SFDrop,
  wifi: SFWifi,
  phone: SFPhone,
  house: SFHouse,
  banknote: SFBanknote,
  graduation: SFGraduationcap,
  pills: SFPills,
  ellipsis: SFEllipsis,
  mail: SFEnvelope,
};

export type IconName =
  | "today"
  | "news"
  | "bazar"
  | "rashifal"
  | "radio"
  | "tools"
  | "directory"
  | "keeper"
  | "focus"
  | "eye"
  | "walk"
  | "meal"
  | "sleep"
  | "mic"
  | "fullscreen"
  | "moon"
  | "sun"
  | "bellOff"
  | "sofa"
  | "settings"
  | "sliders"
  | "power"
  | "search"
  | "display"
  | "modules"
  | "system"
  | "upcoming"
  | "calendar"
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
  | "chevronDown"
  | "chevronRight"
  | "chevronLeft"
  | "copy"
  | "checkmark"
  | "openExternal"
  | "play"
  | "pause"
  | "pin"
  | "pinFill"
  | "stop"
  | "speaker"
  | "speakerMute"
  | "star"
  | "starFill"
  | "export"
  | "import"
  | "sunrise"
  | "sunset"
  | "clock"
  | "warning"
  | "plus"
  | "trash"
  | "info"
  | "link"
  | "pencil"
  | "minus"
  | "close"
  | "rotate"
  | "idCitizenship"
  | "idCard"
  | "document"
  | "passport"
  | "steeringWheel"
  | "car"
  | "shield"
  | "wrench"
  | "documentBlank"
  | "bolt"
  | "drop"
  | "wifi"
  | "phone"
  | "house"
  | "banknote"
  | "graduation"
  | "pills"
  | "ellipsis"
  | "mail";

function sizeFromClass(className: string | undefined): number | undefined {
  if (!className) return undefined;
  const bracket = className.match(/(?:^|\s)size-\[(\d+(?:\.\d+)?)px?\]/);
  if (bracket) return Number(bracket[1]);
  // Tailwind's own scale (1 unit = 4px, .5 steps = 2px) — kept complete so an
  // icon's rendered stroke weight always matches the box its className sizes
  // it to, whichever step gets used next.
  const preset: Record<string, number> = {
    "size-1": 4,
    "size-1.5": 6,
    "size-2": 8,
    "size-2.5": 10,
    "size-3": 12,
    "size-3.5": 14,
    "size-4": 16,
    "size-5": 20,
    "size-6": 24,
    "size-7": 28,
    "size-8": 32,
    "size-10": 40,
    "size-11": 44,
    "size-14": 56,
    "size-16": 64,
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
