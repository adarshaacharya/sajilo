import type { CSSProperties, ReactNode } from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { color, font } from "./theme";

const DEVANAGARI = /[ऀ-ॿ]/;
/** Nepali text gets the Devanagari face; everything else Manrope. */
export const faceFor = (text: string) => (DEVANAGARI.test(text) ? font.nepali : font.latin);

/** A 0 to 1 spring from `start` frames in. */
export function useEnter(start = 0, damping = 18) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - start, fps, config: { damping, mass: 0.8 } });
}

// ---------------------------------------------------------------- the desktop

export const MENU_BAR = 44;
/** The centre of Sajilo's date in the menu bar, where the cursor clicks. */
export const DATE_X = 1550;

/** A plain dark desktop with a menu bar carrying Sajilo's date. */
export function Desktop({
  date,
  active,
  children,
}: {
  date: string;
  active: boolean;
  children?: ReactNode;
}) {
  return (
    <AbsoluteFill style={{ background: color.canvas }}>
      <div
        style={{
          position: "absolute",
          inset: "0 0 auto 0",
          height: MENU_BAR,
          background: "rgba(255,255,255,0.045)",
          borderBottom: `1px solid ${color.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 34,
          paddingRight: 40,
          color: color.secondary,
          fontFamily: font.latin,
          fontSize: 19,
        }}
      >
        <span
          style={{
            fontFamily: font.nepali,
            fontWeight: 500,
            color: active ? color.text : color.secondary,
            background: active ? "rgba(255,255,255,0.14)" : "transparent",
            borderRadius: 7,
            padding: "3px 12px",
          }}
        >
          {date}
        </span>
        <StatusIcons />
        <span style={{ fontVariantNumeric: "tabular-nums" }}>Wed 8:05 PM</span>
      </div>
      {children}
    </AbsoluteFill>
  );
}

/** Wi-Fi and battery, drawn plainly: set dressing, not anyone's logo. */
function StatusIcons() {
  return (
    <span style={{ display: "flex", gap: 22, alignItems: "center" }}>
      <svg width="24" height="18" viewBox="0 0 24 18" fill="none" aria-hidden>
        <path d="M2 6.5a15 15 0 0 1 20 0M5.5 10a10 10 0 0 1 13 0M9 13.5a5 5 0 0 1 6 0" stroke={color.secondary} strokeWidth="2" strokeLinecap="round" />
        <circle cx="12" cy="16" r="1.4" fill={color.secondary} />
      </svg>
      <svg width="34" height="16" viewBox="0 0 34 16" fill="none" aria-hidden>
        <rect x="1" y="1" width="28" height="14" rx="4" stroke={color.secondary} strokeWidth="1.6" />
        <rect x="4" y="4" width="19" height="8" rx="2" fill={color.secondary} />
        <rect x="30.5" y="5.5" width="2.5" height="5" rx="1" fill={color.secondary} />
      </svg>
    </span>
  );
}

// ---------------------------------------------------------------- the app panel

/** The captures are the popover at 3x: 1140 by 1920 pixels. */
const SHOT_W = 1140;
const SHOT_H = 1920;
export const PANEL_H = 920;
export const PANEL_W = Math.round((SHOT_W / SHOT_H) * PANEL_H);
export const PANEL_TOP = MENU_BAR + 14;
/** Centres the panel under the date. */
export const PANEL_RIGHT = 100;

/**
 * Sajilo's panel, hanging under its date. `shots` fade into each other:
 * each is [shot name, frame it appears].
 */
export function Panel({
  shots,
  open = 1,
  style,
}: {
  shots: [string, number][];
  /** 0 closed, 1 open: the spring the panel opens on. */
  open?: number;
  style?: CSSProperties;
}) {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        position: "absolute",
        top: PANEL_TOP,
        right: PANEL_RIGHT,
        width: PANEL_W,
        height: PANEL_H,
        borderRadius: 18,
        overflow: "hidden",
        border: `1px solid ${color.border}`,
        boxShadow: "0 40px 90px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.03)",
        transformOrigin: "78% 0%",
        transform: `scale(${interpolate(open, [0, 1], [0.92, 1])})`,
        opacity: open,
        background: color.surface,
        ...style,
      }}
    >
      {shots.map(([name, at], index) => {
        const next = shots[index + 1];
        const fadeIn = index === 0 ? 1 : interpolate(frame, [at, at + 8], [0, 1], clamp);
        const fadeOut = next ? interpolate(frame, [next[1], next[1] + 8], [1, 0], clamp) : 1;
        const visible = frame >= at - 1 && (!next || frame <= next[1] + 9);
        if (!visible) return null;
        return (
          <Img
            key={`${name}-${at}`}
            src={staticFile(`shots/${name}.png`)}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              opacity: Math.min(fadeIn, fadeOut),
            }}
          />
        );
      })}
    </div>
  );
}

export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// ---------------------------------------------------------------- words

/** The left column: a small label, the beat's title, and a line under it. */
export function Caption({
  label,
  title,
  line,
  start,
}: {
  label: string;
  title: string;
  line?: string;
  start: number;
}) {
  const enter = useEnter(start, 20);
  const lift = interpolate(enter, [0, 1], [26, 0]);
  return (
    <div
      style={{
        position: "absolute",
        left: 150,
        top: 0,
        bottom: 0,
        width: 860,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 22,
        opacity: enter,
        transform: `translateY(${lift}px)`,
      }}
    >
      <span style={{ color: color.gold, fontFamily: font.latin, fontWeight: 700, fontSize: 26 }}>
        {label}
      </span>
      <span
        style={{
          color: color.text,
          fontFamily: faceFor(title),
          fontWeight: 800,
          fontSize: 66,
          lineHeight: 1.12,
          letterSpacing: "-0.02em",
        }}
      >
        {title}
      </span>
      {line && (
        <span style={{ color: color.secondary, fontFamily: faceFor(line), fontWeight: 600, fontSize: 32, lineHeight: 1.35 }}>
          {line}
        </span>
      )}
    </div>
  );
}
