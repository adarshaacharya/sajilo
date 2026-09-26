/**
 * Prints the film's timing for the music: where each section starts, how
 * many bars it runs, and every click and notification, in frames. `music.py`
 * composes to this, so the soundtrack follows the edit exactly.
 *
 *   bun src/cues.ts > public/cues.json
 */
import { BAR, CARD, CHAPTERS, chapterLength, END, OPEN, s, TOTAL } from "./timeline";

type Section = { kind: string; id: string; start: number; bars: number };

const sections: Section[] = [{ kind: "open", id: "open", start: 0, bars: OPEN / BAR }];
const clicks: number[] = [BAR];
const chimes: number[] = [];

let at = OPEN;
for (const chapter of CHAPTERS) {
  sections.push({ kind: "card", id: chapter.id, start: at, bars: CARD / BAR });
  const footage = at + CARD;
  sections.push({
    kind: chapter.notification ? "notification" : "footage",
    id: chapter.id,
    start: footage,
    bars: (chapterLength(chapter) - CARD) / BAR,
  });
  if (chapter.notification) chimes.push(footage + s(0.6));
  let clipStart = footage;
  for (const { clip } of chapter.clips) {
    for (const click of clip.clicks) clicks.push(clipStart + click);
    clipStart += clip.frames;
  }
  at += chapterLength(chapter);
}
sections.push({ kind: "end", id: "end", start: at, bars: END / BAR });

console.log(JSON.stringify({ fps: 30, bar: BAR, total: TOTAL, sections, clicks, chimes }, null, 2));
