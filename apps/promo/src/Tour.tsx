import "@fontsource-variable/bricolage-grotesque";
import "@fontsource/mukta/500.css";
import "@fontsource/mukta/700.css";
import "@fontsource/mukta/800.css";
import {
  AbsoluteFill,
  Audio,
  Img,
  interpolate,
  Sequence,
  Series,
  staticFile,
  useCurrentFrame,
} from "remotion";
import {
  CardWindow,
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
  BAR,
  CARD,
  CARD_GAP,
  CHAPTERS,
  type Chapter,
  chapterLength,
  CUT,
  END,
  facts,
  OPEN,
  openingClip,
  TOTAL,
} from "./timeline";

export type TourProps = {
  /**
   * A licensed music track in `public/`, e.g. "track.mp3", or null for none.
   * Pass it with `--props='{"track":"track.mp3"}'`.
   */
  track: string | null;
};

/** The whole film: an opening, one chapter per everyday problem, the ending. */
export function Tour({ track }: TourProps) {
  return (
    <AbsoluteFill style={{ background: color.canvas }}>
      {/* Clicks and the reminder's chime, from sounds.py. */}
      <Audio src={staticFile("sounds.wav")} />
      {track && (
        <Audio
          src={staticFile(track)}
          volume={(frame) =>
            0.8 *
            interpolate(frame, [0, 12, TOTAL - s(2.5), TOTAL], [0, 1, 1, 0], clamp)
          }
        />
      )}
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
  // The click lands on the second bar's downbeat, with the music.
  const click = BAR;
  const open = useEnter(click + 2, 16);
  const travel = interpolate(frame, [s(0.4), click], [0, 1], {
    ...clamp,
    easing: (t) => 1 - (1 - t) ** 3,
  });
  const x = interpolate(travel, [0, 1], [900, DATE_X]);
  const y = interpolate(travel, [0, 1], [700, MENU_BAR / 2 + 4]);
  const pulse = interpolate(frame, [click, click + 12], [0, 1], clamp);
  return (
    <Desktop date={facts.menuBarDate} active={frame >= click}>
      {frame >= click && <Panel clip={openingClip} name="calendar" open={open} still />}
      <Captions label="Sajilo" cues={[{ start: BAR + 20, title: "Nepal, one click away.", line: "A tiny app that lives in your menu bar." }]} />
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

/**
 * The problem on its own; then any of Sajilo's own cards arriving over the
 * desktop; then someone using the app to answer it.
 */
function ChapterScene({ chapter, number }: { chapter: Chapter; number: number }) {
  let at = CARD;
  const cards = (chapter.cards ?? []).map((entry) => {
    const start = at;
    at += entry.clip.frames + CARD_GAP;
    return { ...entry, start };
  });
  const clips = chapter.clips.map((entry) => {
    const start = at;
    at += entry.clip.frames;
    return { ...entry, start };
  });
  const cues: Cue[] = [...cards, ...clips].flatMap(({ clip, beats, start }) =>
    beats.map((beat) => ({ ...beat, start: start + (clip.marks[beat.at] ?? 0) })),
  );
  if (cues[0]) cues[0] = { ...cues[0], start: CARD };
  const panelFrom = clips[0]?.start ?? Number.POSITIVE_INFINITY;
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill>
      <Desktop date={chapter.date ?? facts.menuBarDate} active={frame >= panelFrom}>
        {clips.map(({ name, clip, start }, index) => (
          <Sequence
            key={name}
            from={start}
            durationInFrames={index < clips.length - 1 ? clip.frames + CUT : chapterLength(chapter) - start}
          >
            <Panel clip={clip} name={name} zoomFrom={1} />
          </Sequence>
        ))}
        {cards.map(({ name, clip, start }) => (
          <Sequence key={name} from={start} durationInFrames={clip.frames}>
            <CardWindow clip={clip} name={name} />
          </Sequence>
        ))}
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
