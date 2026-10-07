/**
 * A swatch for the lucky colour a reading names, so it reads at a glance.
 * Matched on the colour word Hamro Patro writes; a shade word ("हल्का",
 * "फिक्का") lightens it. A colour not listed simply shows no swatch.
 */
const SWATCHES: [word: string, colour: string][] = [
  ["सुनौलो", "#d4a72c"],
  ["सिन्दुरी", "#e0442f"],
  ["कलेजी", "#7b2d3a"],
  ["आकाशे", "#5bb5e8"],
  ["गुलाबी", "#e9779e"],
  ["बैजनी", "#8e5ac8"],
  ["सुन्तला", "#ef8a2d"],
  ["सुन्तले", "#ef8a2d"],
  ["पहेंलो", "#e8c432"],
  ["पहेलो", "#e8c432"],
  ["हरियो", "#3fa25b"],
  ["निलो", "#3a6fd8"],
  ["नीलो", "#3a6fd8"],
  ["रातो", "#d83a3a"],
  ["खैरो", "#8a5a35"],
  ["खरानी", "#8d8f94"],
  ["चाँदी", "#c4c7cc"],
  ["कालो", "#1f1f22"],
  ["सेतो", "#f4f4f2"],
];

const LIGHTER = ["हल्का", "फिक्का"];

export function swatchFor(name: string): string | null {
  const found = SWATCHES.find(([word]) => name.includes(word));
  if (!found) return null;
  const [, colour] = found;
  return LIGHTER.some((word) => name.includes(word))
    ? `color-mix(in srgb, ${colour} 55%, white)`
    : colour;
}
