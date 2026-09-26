import {
  AbsoluteFill,
  Img,
  interpolate,
  Sequence,
  Series,
  staticFile,
  useCurrentFrame,
} from "remotion";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";
import "@fontsource/manrope/800.css";
import "@fontsource/noto-sans-devanagari/500.css";
import "@fontsource/noto-sans-devanagari/700.css";
import { Caption, clamp, DATE_X, Desktop, faceFor, MENU_BAR, Panel, useEnter } from "./scene";
import { color, font, s } from "./theme";
import {
  CARD,
  CHAPTERS,
  type Chapter,
  chapterLength,
  DEFAULT_BEAT,
  END,
  facts,
  OPEN,
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
  const click = s(1.6);
  const open = useEnter(click + 2, 16);
  const travel = interpolate(frame, [s(0.3), click], [0, 1], {
    ...clamp,
    easing: (t) => 1 - (1 - t) ** 3,
  });
  const x = interpolate(travel, [0, 1], [980, DATE_X]);
  const y = interpolate(travel, [0, 1], [640, MENU_BAR / 2 + 4]);
  const pulse = interpolate(frame, [click, click + 10], [0, 1], clamp);
  return (
    <Desktop date={facts.menuBarDate} active={frame >= click}>
      {frame >= click && <Panel shots={[["today", 0]]} open={open} />}
      <Caption label="Sajilo" title="Your day in Nepal, one click away." start={s(2.2)} />
      <Cursor x={x} y={y} pulse={frame >= click ? pulse : 0} hidden={frame > click + s(1.2)} />
    </Desktop>
  );
}

function Cursor({ x, y, pulse, hidden }: { x: number; y: number; pulse: number; hidden: boolean }) {
  if (hidden) return null;
  return (
    <>
      {pulse > 0 && pulse < 1 && (
        <div
          style={{
            position: "absolute",
            left: x - 30,
            top: y - 30,
            width: 60,
            height: 60,
            borderRadius: 30,
            border: `3px solid ${color.gold}`,
            opacity: 1 - pulse,
            transform: `scale(${0.4 + pulse})`,
          }}
        />
      )}
      <svg
        width="30"
        height="40"
        viewBox="0 0 30 40"
        style={{ position: "absolute", left: x - 4, top: y - 2 }}
        aria-hidden
      >
        <path d="M3 2 L3 32 L10.5 25 L16 37 L21 35 L15.5 23.5 L26 23.5 Z" fill="#fff" stroke="#000" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    </>
  );
}

// ---------------------------------------------------------------- chapters

/** The problem on its own, then the app answering it beat by beat. */
function ChapterScene({ chapter, number }: { chapter: Chapter; number: number }) {
  let at = CARD;
  const beats = chapter.beats.map((beat) => {
    const start = at;
    at += s(beat.seconds ?? DEFAULT_BEAT);
    return { ...beat, start };
  });
  const shots = beats.map((beat) => [beat.shot, beat.start] as [string, number]);

  return (
    <AbsoluteFill>
      <Sequence from={CARD - 6}>
        {/* A reminder arrives with the panel closed: nobody had to open the app. */}
        <Desktop date={facts.menuBarDate} active={!chapter.notification}>
          {!chapter.notification && (
            <Panel shots={shots.map(([name, start]) => [name, start - (CARD - 6)])} />
          )}
          {beats.map((beat) => (
            <Sequence key={`${beat.shot}-${beat.start}`} from={beat.start - (CARD - 6)} durationInFrames={s(beat.seconds ?? DEFAULT_BEAT)}>
              <Caption label={chapter.label} title={beat.title} line={beat.line} start={0} />
            </Sequence>
          ))}
          {chapter.notification && (
            <Sequence from={s(1)}>
              <Notification title={chapter.notification.title} body={chapter.notification.body} />
            </Sequence>
          )}
        </Desktop>
      </Sequence>
      <Sequence durationInFrames={CARD}>
        <ProblemCard number={number} ne={chapter.problemNe} en={chapter.problemEn} />
      </Sequence>
    </AbsoluteFill>
  );
}

/** Full screen, the problem in Nepali and English. Fades out into the answer. */
function ProblemCard({ number, ne, en }: { number: number; ne: string; en: string }) {
  const frame = useCurrentFrame();
  const enter = useEnter(0, 22);
  const out = interpolate(frame, [CARD - 8, CARD], [1, 0], clamp);
  return (
    <AbsoluteFill
      style={{
        background: color.canvas,
        opacity: out,
        justifyContent: "center",
        alignItems: "center",
        gap: 30,
        textAlign: "center",
      }}
    >
      <span style={{ color: color.gold, fontFamily: font.latin, fontWeight: 700, fontSize: 28, opacity: enter }}>
        {String(number).padStart(2, "0")}
      </span>
      <span
        style={{
          color: color.text,
          fontFamily: faceFor(ne),
          fontWeight: 700,
          fontSize: 104,
          lineHeight: 1.25,
          maxWidth: 1500,
          opacity: enter,
          transform: `translateY(${interpolate(enter, [0, 1], [30, 0])}px)`,
        }}
      >
        {ne}
      </span>
      <span style={{ color: color.secondary, fontFamily: font.latin, fontWeight: 600, fontSize: 40, opacity: useEnter(8, 22) }}>
        {en}
      </span>
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
        width: 560,
        display: "flex",
        gap: 20,
        alignItems: "center",
        padding: "20px 24px",
        borderRadius: 22,
        background: "rgba(40,40,44,0.97)",
        border: `1px solid ${color.border}`,
        boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
        transform: `translateX(${interpolate(enter, [0, 1], [620, 0])}px)`,
      }}
    >
      <Img src={staticFile("icon.png")} style={{ width: 60, height: 60, borderRadius: 14 }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
        <span style={{ color: color.secondary, fontFamily: font.latin, fontWeight: 700, fontSize: 20 }}>Sajilo</span>
        <span style={{ color: color.text, fontFamily: font.nepali, fontWeight: 700, fontSize: 28 }}>{title}</span>
        <span style={{ color: color.secondary, fontFamily: font.latin, fontWeight: 600, fontSize: 22 }}>{body}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- ending

function Ending() {
  const logo = useEnter(0, 18);
  const line = useEnter(s(0.5), 20);
  const cta = useEnter(s(1.3), 20);
  return (
    <AbsoluteFill style={{ background: color.canvas, justifyContent: "center", alignItems: "center", gap: 34 }}>
      <Img
        src={staticFile("icon.png")}
        style={{ width: 150, height: 150, opacity: logo, transform: `scale(${interpolate(logo, [0, 1], [0.85, 1])})` }}
      />
      <span
        style={{
          color: color.text,
          fontFamily: font.latin,
          fontWeight: 800,
          fontSize: 96,
          letterSpacing: "-0.03em",
          opacity: line,
          transform: `translateY(${interpolate(line, [0, 1], [24, 0])}px)`,
        }}
      >
        Nepal, in your menu bar.
      </span>
      <span style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, opacity: cta }}>
        <span style={{ color: color.secondary, fontFamily: font.latin, fontWeight: 600, fontSize: 36 }}>
          Free for Mac, Windows and Linux
        </span>
        <span style={{ color: color.gold, fontFamily: font.latin, fontWeight: 800, fontSize: 48 }}>sajilo.fyi</span>
      </span>
    </AbsoluteFill>
  );
}
