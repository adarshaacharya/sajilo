import "@fontsource-variable/bricolage-grotesque";
import "@fontsource/mukta/500.css";
import "@fontsource/mukta/700.css";
import "@fontsource/mukta/800.css";
import {
  AbsoluteFill,
  Img,
  interpolate,
  Sequence,
  Series,
  staticFile,
  useCurrentFrame,
} from "remotion";
import {
  Captions,
  type Cue,
  Cursor,
  clamp,
  DATE_X,
  Desktop,
  MENU_BAR,
  Panel,
  Rise,
  useEnter,
} from "./scene";
import { color, font, s } from "./theme";
import {
  CARD,
  CHAPTERS,
  type Chapter,
  chapterLength,
  CUT,
  END,
  facts,
  OPEN,
  openingClip,
} from "./timeline";

/** The whole film: an opening, one chapter per everyday problem, the ending. */
export function Tour() {
  return (
    <AbsoluteFill style={{ background: color.canvas }}>
      <Series>
        <Series.Sequence durationInFrames={OPEN}>
          <Opening />
        </Series.Sequence>
        {CHAPTERS.map((chapter, index) => (
          <Series.Sequence key={chapter.id} durationInFrames={chapterLength(chapter)}>
            <ChapterScene chapter={chapter} number={index + 1} />
          </Series.Sequence>
        ))}
        <Series.Sequence durationInFrames={END}>
          <Ending />
        </Series.Sequence>
      </Series>
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------- opening

/** A quiet desktop; the cursor finds the date and the panel springs open. */
function Opening() {
  const frame = useCurrentFrame();
  const click = s(1.2);
  const open = useEnter(click + 2, 16);
  const travel = interpolate(frame, [s(0.2), click], [0, 1], {
    ...clamp,
    easing: (t) => 1 - (1 - t) ** 3,
  });
  const x = interpolate(travel, [0, 1], [900, DATE_X]);
  const y = interpolate(travel, [0, 1], [700, MENU_BAR / 2 + 4]);
  const pulse = interpolate(frame, [click, click + 12], [0, 1], clamp);
  return (
    <Desktop date={facts.menuBarDate} active={frame >= click}>
      {frame >= click && <Panel clip={openingClip} name="calendar" open={open} still />}
      <Captions label="Sajilo" cues={[{ start: s(1.8), title: "Nepal, one click away.", line: "A tiny app that lives in your menu bar." }]} />
      {frame >= click && pulse < 1 && (
        <div
          style={{
            position: "absolute",
            left: DATE_X - 34,
            top: MENU_BAR / 2 - 30,
            width: 68,
            height: 68,
            borderRadius: 34,
            border: `3px solid ${color.gold}`,
            opacity: 1 - pulse,
            transform: `scale(${0.4 + pulse})`,
          }}
        />
      )}
      {frame < click + s(0.8) && <Cursor x={x} y={y} pressed={frame >= click && frame < click + 3} />}
    </Desktop>
  );
}

// ---------------------------------------------------------------- chapters

/** The problem on its own, then someone using the app to answer it. */
function ChapterScene({ chapter, number }: { chapter: Chapter; number: number }) {
  let at = CARD;
  const clips = chapter.clips.map((entry) => {
    const start = at;
    at += entry.clip.frames;
    return { ...entry, start };
  });
  const cues: Cue[] = chapter.notification
    ? chapter.notification.beats.map((beat) => ({ ...beat, start: CARD }))
    : clips.flatMap(({ clip, beats, start }) =>
        beats.map((beat) => ({ ...beat, start: start + (clip.marks[beat.at] ?? 0) })),
      );
  if (cues[0]) cues[0] = { ...cues[0], start: CARD };

  return (
    <AbsoluteFill>
      <Desktop date={facts.menuBarDate} active={!chapter.notification}>
        {clips.map(({ name, clip, start }, index) => (
          <Sequence key={name} from={start} durationInFrames={clip.frames + (index < clips.length - 1 ? CUT : 0)}>
            <Panel clip={clip} name={name} zoomFrom={index === 0 ? 1 : 1.34} />
          </Sequence>
        ))}
        {chapter.notification && (
          <Sequence from={CARD + s(0.6)}>
            <Notification title={chapter.notification.title} body={chapter.notification.body} />
          </Sequence>
        )}
        <Captions label={chapter.label} cues={cues} />
      </Desktop>
      <Sequence durationInFrames={CARD}>
        <ProblemCard number={number} ne={chapter.problemNe} en={chapter.problemEn} />
      </Sequence>
    </AbsoluteFill>
  );
}

/** Full screen, the problem in Nepali and English, word by word. */
function ProblemCard({ number, ne, en }: { number: number; ne: string; en: string }) {
  const frame = useCurrentFrame();
  const out = interpolate(frame, [CARD - 7, CARD], [1, 0], clamp);
  const lift = interpolate(frame, [CARD - 7, CARD], [0, -40], clamp);
  const numberIn = useEnter(0, 22);
  return (
    <AbsoluteFill
      style={{
        background: color.canvas,
        opacity: out,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 18,
          transform: `translateY(${lift}px)`,
        }}
      >
        <span style={{ color: color.gold, fontFamily: font.display, fontWeight: 700, fontSize: 30, opacity: numberIn }}>
          {String(number).padStart(2, "0")}
        </span>
        <Rise
          text={ne}
          start={2}
          stagger={3}
          style={{
            color: color.text,
            fontFamily: font.nepali,
            fontWeight: 800,
            fontSize: 124,
            lineHeight: 1.2,
            justifyContent: "center",
            maxWidth: 1600,
          }}
        />
        <Rise
          text={en}
          start={12}
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
      </div>
    </AbsoluteFill>
  );
}

/** A system notification, the way Sajilo's holiday reminder arrives. */
function Notification({ title, body }: { title: string; body: string }) {
  const enter = useEnter(0, 16);
  return (
    <div
      style={{
        position: "absolute",
        top: MENU_BAR + 20,
        right: 40,
        width: 600,
        display: "flex",
        gap: 20,
        alignItems: "center",
        padding: "22px 26px",
        borderRadius: 22,
        background: "rgba(40,40,44,0.97)",
        border: `1px solid ${color.border}`,
        boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
        transform: `translateX(${interpolate(enter, [0, 1], [660, 0])}px)`,
      }}
    >
      <Img src={staticFile("icon.png")} style={{ width: 64, height: 64, borderRadius: 14 }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
        <span style={{ color: color.secondary, fontFamily: font.display, fontWeight: 600, fontSize: 21 }}>Sajilo</span>
        <span style={{ color: color.text, fontFamily: font.nepali, fontWeight: 700, fontSize: 32 }}>{title}</span>
        <span style={{ color: color.secondary, fontFamily: font.display, fontWeight: 500, fontSize: 24 }}>{body}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- ending

function Ending() {
  const logo = useEnter(0, 18);
  const cta = useEnter(s(1.4), 20);
  return (
    <AbsoluteFill style={{ background: color.canvas, justifyContent: "center", alignItems: "center", gap: 36 }}>
      <Img
        src={staticFile("icon.png")}
        style={{ width: 150, height: 150, opacity: logo, transform: `scale(${interpolate(logo, [0, 1], [0.8, 1])})` }}
      />
      <Rise
        text="Nepal, in your menu bar."
        start={s(0.4)}
        stagger={3}
        style={{
          color: color.text,
          fontFamily: font.display,
          fontWeight: 800,
          fontSize: 120,
          letterSpacing: "-0.045em",
          justifyContent: "center",
        }}
      />
      <span style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, opacity: cta }}>
        <span style={{ color: color.secondary, fontFamily: font.display, fontWeight: 500, fontSize: 38 }}>
          Free for Mac, Windows and Linux
        </span>
        <span style={{ color: color.gold, fontFamily: font.display, fontWeight: 800, fontSize: 54, letterSpacing: "-0.02em" }}>
          sajilo.fyi
        </span>
      </span>
    </AbsoluteFill>
  );
}
