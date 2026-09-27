/**
 * Prints the film's timing: where each section starts, how many bars it
 * runs, every click, and every card the app chimes for, in frames. `sounds.py` puts its
 * ticks and chime on these frames.
 *
 *   bun src/cues.ts > public/cues.json
 */
import { BAR, CARD, CARD_GAP, CHAPTERS, chapterLength, END, OPEN, TOTAL } from "./timeline";

type Section = { kind: string; id: string; start: number; bars: number };

const sections: Section[] = [{ kind: "open", id: "open", start: 0, bars: OPEN / BAR }];
const clicks: number[] = [BAR];
const chimes: number[] = [];

let at = OPEN;
for (const chapter of CHAPTERS) {
  sections.push({ kind: "card", id: chapter.id, start: at, bars: CARD / BAR });
  const footage = at + CARD;
  sections.push({
    kind: "footage",
    id: chapter.id,
    start: footage,
    bars: (chapterLength(chapter) - CARD) / BAR,
  });
  let clipStart = footage;
  for (const { clip } of chapter.cards ?? []) {
    // The app chimes as it opens one of its cards.
    chimes.push(clipStart);
    for (const click of clip.clicks) clicks.push(clipStart + click);
    clipStart += clip.frames + CARD_GAP;
  }
  for (const { clip } of chapter.clips) {
    for (const click of clip.clicks) clicks.push(clipStart + click);
    clipStart += clip.frames;
  }
  at += chapterLength(chapter);
}
sections.push({ kind: "end", id: "end", start: at, bars: END / BAR });

console.log(JSON.stringify({ fps: 30, bar: BAR, total: TOTAL, sections, clicks, chimes }, null, 2));
