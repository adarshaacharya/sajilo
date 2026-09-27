import "@fontsource-variable/bricolage-grotesque";
import "@fontsource/mukta/700.css";
import "@fontsource/mukta/800.css";
import {
  AbsoluteFill,
  Audio,
  Img,
  interpolate,
  OffthreadVideo,
  Sequence,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { CardWindow, Cursor, clamp, Rise, useEnter } from "./scene";
import { color, font } from "./theme";
import {
  HOOK,
  OUTRO,
  SEGMENTS,
  type Segment,
  segmentLength,
  segmentStarts,
  V_TOTAL,
  V_WIDTH,
} from "./vertical-cut";

/**
 * Where things sit on a phone. TikTok, Reels and Shorts draw their tabs over
 * the top ~180 px, their buttons down the right edge, and the caption and
 * sound over the bottom ~380 px, so the words sit just under the tabs and the
 * app in the middle, clear of all three.
 */
const CAPTION_TOP = 210;
const PANEL_PX = 1.85;
const PANEL_TOP = 570;
const CARD_PX = 2.5;
const CARD_TOP = 660;

/** The vertical cut: a hook, the strongest moments, the line to remember. */
export function Vertical() {
  const starts = segmentStarts();
  return (
    <AbsoluteFill style={{ background: color.canvas }}>
      {/* Clicks and the chime only; the music is picked on the platform. */}
      <Audio src={staticFile("sounds-vertical.wav")} />
      {SEGMENTS.map((segment, index) => (
        <Sequence
          key={`${segment.name}-${segment.from}`}
          from={starts[index] ?? 0}
          durationInFrames={segmentLength(segment)}
        >
          <SegmentScene segment={segment} />
        </Sequence>
      ))}
      <Sequence durationInFrames={HOOK + 6}>
        <Hook />
      </Sequence>
      <Sequence from={V_TOTAL - OUTRO}>
        <Outro />
      </Sequence>
    </AbsoluteFill>
  );
}

function SegmentScene({ segment }: { segment: Segment }) {
  return (
    <AbsoluteFill>
      {segment.card ? (
        <CardWindow
          clip={segment.clip}
          name={segment.name}
          px={CARD_PX}
          stageWidth={V_WIDTH}
          top={CARD_TOP}
        />
      ) : (
        <PhonePanel segment={segment} />
      )}
      <Words label={segment.label} title={segment.title} line={segment.line} />
    </AbsoluteFill>
  );
}

/** The popover, large and centred, playing its stretch of the recording. */
function PhonePanel({ segment }: { segment: Segment }) {
  const frame = useCurrentFrame();
  const { clip } = segment;
  const width = clip.width * PANEL_PX;
  const height = clip.height * PANEL_PX;
  const at = Math.min(segment.from + frame, clip.frames - 1);
  const [cx = 0, cy = 0, down = 0] = clip.cursor[at] ?? [];
  const enter = interpolate(frame, [0, 5], [0.96, 1], clamp);
  return (
    <div
      style={{
        position: "absolute",
        left: (V_WIDTH - width) / 2,
        top: PANEL_TOP,
        width,
        height,
        transform: `scale(${enter})`,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: 26,
          overflow: "hidden",
          border: `1px solid ${color.border}`,
          boxShadow: "0 40px 90px rgba(0,0,0,0.6)",
          background: color.surface,
        }}
      >
        <OffthreadVideo
          src={staticFile(`clips/${segment.name}.mp4`)}
          trimBefore={segment.from}
          muted
          style={{ width: "100%", height: "100%", display: "block" }}
        />
      </div>
      <Cursor x={cx * PANEL_PX} y={cy * PANEL_PX} pressed={down === 1} scale={1.15} />
    </div>
  );
}

/** The feature's name and one line about it, centred under the phone's tabs. */
function Words({ label, title, line }: { label: string; title: string; line?: string }) {
  const labelIn = useEnter(0, 22);
  return (
    <div
      style={{
        position: "absolute",
        top: CAPTION_TOP,
        left: 70,
        right: 70,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 18,
        textAlign: "center",
      }}
    >
      <span style={{ color: color.gold, fontFamily: font.display, fontWeight: 600, fontSize: 34, opacity: labelIn }}>
        {label}
      </span>
      <Rise
        text={title}
        stagger={2}
        style={{
          color: color.text,
          fontFamily: font.display,
          fontWeight: 800,
          fontSize: 82,
          lineHeight: 1.04,
          letterSpacing: "-0.035em",
          justifyContent: "center",
        }}
      />
      {line && (
        <Rise
          text={line}
          start={6}
          stagger={1.5}
          style={{
            color: color.secondary,
            fontFamily: font.display,
            fontWeight: 500,
            fontSize: 38,
            justifyContent: "center",
          }}
        />
      )}
    </div>
  );
}

/** The question every Nepali asks a calendar, then straight into the answer. */
function Hook() {
  const frame = useCurrentFrame();
  const out = interpolate(frame, [HOOK - 4, HOOK + 6], [1, 0], clamp);
  return (
    <AbsoluteFill
      style={{
        background: color.canvas,
        opacity: out,
        justifyContent: "center",
        alignItems: "center",
        gap: 26,
        padding: "0 70px",
      }}
    >
      <Rise
        text="आज कति गते?"
        stagger={3}
        style={{
          color: color.text,
          fontFamily: font.nepali,
          fontWeight: 800,
          fontSize: 150,
          lineHeight: 1.15,
          justifyContent: "center",
        }}
      />
      <Rise
        text="Your computer can finally tell you."
        start={10}
        stagger={1.5}
        style={{
          color: color.secondary,
          fontFamily: font.display,
          fontWeight: 600,
          fontSize: 46,
          letterSpacing: "-0.02em",
          justifyContent: "center",
        }}
      />
    </AbsoluteFill>
  );
}

function Outro() {
  const logo = useEnter(0, 18);
  const cta = useEnter(26, 20);
  return (
    <AbsoluteFill
      style={{
        background: color.canvas,
        justifyContent: "center",
        alignItems: "center",
        gap: 40,
        padding: "0 70px",
        opacity: interpolate(logo, [0, 0.3], [0, 1], clamp),
      }}
    >
      <Img
        src={staticFile("icon.png")}
        style={{ width: 190, height: 190, transform: `scale(${interpolate(logo, [0, 1], [0.8, 1])})` }}
      />
      <Rise
        text="Nepal, in your menu bar."
        start={6}
        stagger={3}
        style={{
          color: color.text,
          fontFamily: font.display,
          fontWeight: 800,
          fontSize: 104,
          lineHeight: 1.02,
          letterSpacing: "-0.045em",
          justifyContent: "center",
          textAlign: "center",
        }}
      />
      <span style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, opacity: cta }}>
        <span style={{ color: color.secondary, fontFamily: font.display, fontWeight: 500, fontSize: 42 }}>
          Free for Mac, Windows and Linux
        </span>
        <span style={{ color: color.gold, fontFamily: font.display, fontWeight: 800, fontSize: 64, letterSpacing: "-0.02em" }}>
          sajilo.fyi
        </span>
      </span>
    </AbsoluteFill>
  );
}
