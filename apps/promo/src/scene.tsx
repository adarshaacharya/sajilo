import type { ReactNode } from "react";
import {
  AbsoluteFill,
  Freeze,
  interpolate,
  OffthreadVideo,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { color, font } from "./theme";
import type { Clip } from "./timeline";

/** A caption and the frame it lands on. */
export type Cue = { start: number; title: string; line?: string };

export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

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
    <AbsoluteFill style={{ background: color.canvas, overflow: "hidden" }}>
      {children}
      <div
        style={{
          position: "absolute",
          inset: "0 0 auto 0",
          height: MENU_BAR,
          background: "rgba(22,22,25,0.92)",
          borderBottom: `1px solid ${color.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 34,
          paddingRight: 40,
          color: color.secondary,
          fontFamily: font.ui,
          fontWeight: 500,
          fontSize: 19,
        }}
      >
        <span
          style={{
            fontFamily: font.nepali,
            fontWeight: 600,
            fontSize: 20,
            color: active ? color.text : color.secondary,
            background: active ? "rgba(255,255,255,0.14)" : "transparent",
            borderRadius: 7,
            padding: "2px 12px",
          }}
        >
          {date}
        </span>
        <StatusIcons />
        <span style={{ fontVariantNumeric: "tabular-nums" }}>Wed 8:05 PM</span>
      </div>
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

// ---------------------------------------------------------------- the panel

/** As tall as the screen allows, so the whole app is always in view. */
export const PANEL_H = 1080 - MENU_BAR - 14 - 26;
export const PANEL_TOP = MENU_BAR + 14;
/** Where the panel's centre sits: under the date. */
const PANEL_CX = 1510;
/**
 * No camera zoom: a viewer on a phone must see the whole app, not a detail
 * of it. The panel is already as large as the frame allows.
 */
const ZOOM = 1;

/**
 * Sajilo's popover playing a recorded clip, with the recorded cursor drawn
 * over it and a camera that leans in and follows the cursor, the way you
 * watch someone else's screen.
 */
export function Panel({
  clip,
  name,
  open = 1,
  still = false,
  zoomFrom = 1,
}: {
  clip: Clip;
  name: string;
  /** 0 closed, 1 open: the spring the panel opens on. */
  open?: number;
  /** Hold the first frame, for the panel opening. */
  still?: boolean;
  /** The zoom the camera starts from; it eases to ZOOM. */
  zoomFrom?: number;
}) {
  const frame = useCurrentFrame();
  const px = PANEL_H / clip.height;
  const width = clip.width * px;
  const at = Math.min(Math.max(frame, 0), clip.frames - 1);

  const zoom = still
    ? 1
    : interpolate(frame, [0, 24], [zoomFrom, ZOOM], {
        ...clamp,
        easing: (t) => 1 - (1 - t) ** 3,
      });
  const followY = smoothY(clip, at) * px;
  const top = Math.min(
    PANEL_TOP,
    Math.max(Math.min(PANEL_TOP, 1080 - 26 - PANEL_H * zoom), 560 - followY * zoom),
  );
  const left = PANEL_CX - (width / 2) * zoom;
  const [cx = 0, cy = 0, down = 0] = clip.cursor[at] ?? [];

  const video = (
    <OffthreadVideo
      src={staticFile(`clips/${name}.mp4`)}
      muted
      style={{ width: "100%", height: "100%", display: "block" }}
    />
  );

  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        width,
        height: PANEL_H,
        transformOrigin: "0 0",
        transform: `scale(${zoom * interpolate(open, [0, 1], [0.94, 1])})`,
        opacity: open,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: 18,
          overflow: "hidden",
          border: `1px solid ${color.border}`,
          boxShadow: "0 40px 90px rgba(0,0,0,0.6)",
          background: color.surface,
        }}
      >
        {still ? (
          <Freeze frame={0}>{video}</Freeze>
        ) : frame >= clip.frames ? (
          // Footage shorter than its bar holds its last frame.
          <Freeze frame={clip.frames - 1}>{video}</Freeze>
        ) : (
          video
        )}
      </div>
      {!still && (
        <>
          {clip.clicks.map((click) => {
            const point = clip.cursor[click];
            if (!point || frame < click || frame >= click + 14) return null;
            return <Ripple key={click} x={(point[0] ?? 0) * px} y={(point[1] ?? 0) * px} progress={(frame - click) / 14} />;
          })}
          <Cursor x={cx * px} y={cy * px} pressed={down === 1} scale={1 / zoom} />
        </>
      )}
    </div>
  );
}

/** The cursor's height, averaged over a second, so the camera glides. */
function smoothY(clip: Clip, at: number) {
  const span = 22;
  let sum = 0;
  let count = 0;
  for (let i = at - span; i <= at + span; i++) {
    const point = clip.cursor[Math.min(Math.max(i, 0), clip.frames - 1)];
    if (!point) continue;
    sum += point[1] ?? 0;
    count++;
  }
  return count ? sum / count : clip.height / 2;
}

function Ripple({ x, y, progress }: { x: number; y: number; progress: number }) {
  const size = 26 + progress * 40;
  return (
    <div
      style={{
        position: "absolute",
        left: x - size / 2,
        top: y - size / 2,
        width: size,
        height: size,
        borderRadius: size,
        border: `3px solid ${color.gold}`,
        opacity: 1 - progress,
      }}
    />
  );
}

/** A plain arrow cursor. `scale` keeps it the same size while the camera zooms. */
export function Cursor({
  x,
  y,
  pressed = false,
  scale = 1,
}: {
  x: number;
  y: number;
  pressed?: boolean;
  scale?: number;
}) {
  return (
    <svg
      width="30"
      height="40"
      viewBox="0 0 30 40"
      style={{
        position: "absolute",
        left: x - 4,
        top: y - 2,
        transformOrigin: "4px 2px",
        transform: `scale(${scale * (pressed ? 0.86 : 1)})`,
        filter: "drop-shadow(0 3px 6px rgba(0,0,0,0.45))",
      }}
      aria-hidden
    >
      <path d="M3 2 L3 32 L10.5 25 L16 37 L21 35 L15.5 23.5 L26 23.5 Z" fill="#fff" stroke="#000" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

// ---------------------------------------------------------------- cards

/**
 * One of Sajilo's card windows (a reminder, a break): top centre, just under
 * the menu bar, where the app opens them. It appears as a window does, and
 * goes once it has been dealt with or the clip ends.
 */
export function CardWindow({ clip, name }: { clip: Clip; name: string }) {
  const frame = useCurrentFrame();
  const at = Math.min(frame, clip.frames - 1);
  // Larger than the panel's scale: a card is the whole point of its moment.
  const px = 1.9;
  const width = clip.width * px;
  const height = (clip.heights?.[at] ?? clip.height) * px;
  const lastClick = clip.clicks[clip.clicks.length - 1];
  // A card closes when its button is pressed; the cheer, if any, plays out.
  const closeAt = clip.frames - 6;
  const enter = interpolate(frame, [0, 6], [0, 1], clamp);
  const leave = interpolate(frame, [closeAt, clip.frames], [1, 0], clamp);
  const [cx = 0, cy = 0, down = 0] = clip.cursor[at] ?? [];
  return (
    <div
      style={{
        position: "absolute",
        left: (1920 - width) / 2,
        top: MENU_BAR + 14 * px,
        width,
        height,
        opacity: Math.min(enter, leave),
        transform: `translateY(${interpolate(enter, [0, 1], [-12, 0])}px)`,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: 14 * px,
          overflow: "hidden",
          boxShadow: "0 30px 70px rgba(0,0,0,0.55)",
        }}
      >
        <OffthreadVideo
          src={staticFile(`clips/${name}.mp4`)}
          muted
          style={{ width, height: clip.height * px, display: "block" }}
        />
      </div>
      {clip.pointer && lastClick !== undefined && (
        <>
          {frame >= lastClick && frame < lastClick + 14 && (
            <Ripple x={cx * px} y={cy * px} progress={(frame - lastClick) / 14} />
          )}
          <Cursor x={cx * px} y={cy * px} pressed={down === 1} />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- words

/** Words that rise into place one after another. */
export function Rise({
  text,
  start = 0,
  stagger = 2.5,
  style,
}: {
  text: string;
  start?: number;
  stagger?: number;
  style?: React.CSSProperties;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <span style={{ display: "flex", flexWrap: "wrap", columnGap: "0.24em", ...style }}>
      {text.split(" ").map((word, index) => {
        const enter = spring({
          frame: frame - start - index * stagger,
          fps,
          config: { damping: 16, mass: 0.7 },
        });
        return (
          <span key={`${word}-${index}`} style={{ display: "inline-block", overflow: "hidden", paddingBottom: "0.12em", marginBottom: "-0.12em" }}>
            <span
              style={{
                display: "inline-block",
                transform: `translateY(${interpolate(enter, [0, 1], [105, 0])}%)`,
                opacity: interpolate(enter, [0, 0.4], [0, 1], clamp),
              }}
            >
              {word}
            </span>
          </span>
        );
      })}
    </span>
  );
}

/**
 * The left column: the chapter's name, then the caption for whatever is
 * happening in the footage right now.
 */
export function Captions({ label, cues }: { label: string; cues: Cue[] }) {
  const frame = useCurrentFrame();
  const labelIn = useEnter(0, 22);
  const current = [...cues].reverse().find((cue) => frame >= cue.start) ?? cues[0];
  if (!current) return null;
  const start = current.start;
  return (
    <div
      style={{
        position: "absolute",
        left: 150,
        top: 0,
        bottom: 0,
        width: 900,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 26,
      }}
    >
      <span
        style={{
          color: color.gold,
          fontFamily: font.display,
          fontWeight: 600,
          fontSize: 30,
          opacity: labelIn,
        }}
      >
        {label}
      </span>
      <Rise
        key={`t-${start}`}
        text={current.title}
        start={start}
        style={{
          color: color.text,
          fontFamily: font.display,
          fontWeight: 800,
          fontSize: 88,
          lineHeight: 1.02,
          letterSpacing: "-0.035em",
        }}
      />
      {current.line && (
        <Rise
          key={`l-${start}`}
          text={current.line}
          start={start + 6}
          stagger={1.5}
          style={{
            color: color.secondary,
            fontFamily: font.display,
            fontWeight: 500,
            fontSize: 36,
            lineHeight: 1.3,
            letterSpacing: "-0.01em",
          }}
        />
      )}
    </div>
  );
}
