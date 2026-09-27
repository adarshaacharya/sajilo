/**
 * The vertical cut's sound timing, for `sounds.py`: each click that falls
 * inside a segment, and the chime as each card opens.
 *
 *   bun src/vertical-cues.ts > public/cues-vertical.json
 */
import { SEGMENTS, segmentStarts, V_TOTAL } from "./vertical-cut";

const starts = segmentStarts();
const clicks: number[] = [];
const chimes: number[] = [];
SEGMENTS.forEach((segment, index) => {
  const start = starts[index] ?? 0;
  if (segment.card && segment.from === 0) chimes.push(start);
  for (const click of segment.clip.clicks) {
    if (click >= segment.from && click < segment.to) clicks.push(start + click - segment.from);
  }
});

console.log(JSON.stringify({ fps: 30, total: V_TOTAL, clicks, chimes }, null, 2));
