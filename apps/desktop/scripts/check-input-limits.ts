/**
 * Fails when a text field has no `maxLength`: every box the user types into
 * stops at a limit from `shared/lib/limits.ts`, the same one the save
 * command enforces. Number, date and time fields are bounded by min/max or
 * by their type instead.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const BOUNDED_BY_TYPE = new Set([
  "number",
  "date",
  "time",
  "checkbox",
  "radio",
  "range",
  "file",
  "hidden",
  "color",
]);

function* files(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else if (path.endsWith(".tsx")) yield path;
  }
}

const missing: string[] = [];
for (const file of files("src")) {
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(/<(input|textarea)\b([\s\S]*?)\/?>/g)) {
    const attrs = match[2];
    const type = /type="(\w+)"/.exec(attrs)?.[1] ?? "text";
    if (match[1] === "input" && BOUNDED_BY_TYPE.has(type)) continue;
    if (/\bmaxLength=/.test(attrs) || /\breadOnly\b/.test(attrs)) continue;
    const line = source.slice(0, match.index).split("\n").length;
    missing.push(`${file}:${line}`);
  }
}

if (missing.length > 0) {
  console.error("Text fields without maxLength (see src/shared/lib/limits.ts):");
  for (const place of missing) console.error(`  ${place}`);
  process.exit(1);
}
