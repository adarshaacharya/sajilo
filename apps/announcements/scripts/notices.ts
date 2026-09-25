/**
 * Publish, withdraw and list Sajilo's notices without touching the Cloudflare
 * dashboard.
 *
 *   bun run notices                      list what is stored, and what is live
 *   bun run notices publish notice.json  add or replace (by id), after checking
 *   bun run notices withdraw <id>        take one down now
 *
 * Add --local to work on Wrangler's local store (what `bun run dev` serves),
 * and --dry-run to see the result without saving it.
 *
 * Every notice is checked with the Worker's own rules before anything is
 * saved, so one that would be refused when served is refused here instead.
 * Expired notices are dropped whenever the list is saved.
 */
import { type Announcement, isLive, NOTICES_KEY, problem } from "../src/schema";

const args = process.argv.slice(2);
const local = args.includes("--local");
const dryRun = args.includes("--dry-run");
const [command = "list", target] = args.filter((arg) => !arg.startsWith("--"));
const where = local ? "--local" : "--remote";

async function wrangler(...rest: string[]): Promise<{ ok: boolean; out: string }> {
  const child = Bun.spawn(
    ["bunx", "wrangler", "kv", "key", ...rest, "--binding", "SAJILO_ANNOUNCEMENTS", where],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { ok: code === 0, out: code === 0 ? out : `${out}${err}` };
}

async function stored(): Promise<Announcement[]> {
  const { ok, out } = await wrangler("get", NOTICES_KEY, "--text");
  if (!ok) {
    if (/not found/i.test(out)) return [];
    throw new Error(`Could not read notices:\n${out}`);
  }
  if (out.trim() === "" || /value not found/i.test(out)) return [];
  const parsed: unknown = JSON.parse(out);
  if (!Array.isArray(parsed)) throw new Error(`"${NOTICES_KEY}" is not a list; fix it before publishing.`);
  return parsed as Announcement[];
}

async function save(notices: Announcement[]): Promise<void> {
  const kept = notices.filter(
    (notice) => notice.expiresAt === undefined || Date.parse(notice.expiresAt) > Date.now(),
  );
  if (dryRun) {
    console.log(`\n--dry-run: would save ${kept.length} notice(s):`);
    console.log(JSON.stringify(kept, null, 2));
    return;
  }
  const file = `${process.env.TMPDIR ?? "/tmp"}/sajilo-notices-${process.pid}.json`;
  await Bun.write(file, JSON.stringify(kept));
  const { ok, out } = await wrangler("put", NOTICES_KEY, "--path", file);
  if (!ok) throw new Error(`Could not save notices:\n${out}`);
  console.log(`Saved ${kept.length} notice(s) ${local ? "locally" : "to Cloudflare"}.`);
}

function status(notice: Announcement): string {
  const now = Date.now();
  if (isLive(notice, now)) return "LIVE";
  if (notice.startsAt && Date.parse(notice.startsAt) > now) return `from ${notice.startsAt}`;
  return "expired";
}

function show(notice: Announcement): void {
  const who = notice.platforms?.length ? notice.platforms.join(", ") : "everyone";
  console.log(`\n[${notice.level}] ${notice.id}  (${status(notice)}, for ${who})`);
  console.log(`  EN  ${notice.title.en}\n      ${notice.body.en}`);
  console.log(`  NE  ${notice.title.ne}\n      ${notice.body.ne}`);
  if (notice.action) console.log(`  →   ${notice.action.label.en}: ${notice.action.url}`);
  if (notice.expiresAt) console.log(`  until ${notice.expiresAt}`);
}

async function main(): Promise<void> {
  switch (command) {
    case "list": {
      const notices = await stored();
      if (notices.length === 0) console.log("No notices stored.");
      notices.forEach(show);
      return;
    }
    case "publish": {
      if (!target) throw new Error("Usage: bun run notices publish <notice.json>");
      const read: unknown = JSON.parse(await Bun.file(target).text());
      const incoming = Array.isArray(read) ? read : [read];
      const problems = incoming
        .map((notice, index) => ({ index, why: problem(notice) }))
        .filter((entry) => entry.why !== null);
      if (problems.length > 0) {
        for (const { index, why } of problems) console.error(`Notice ${index + 1}: ${why}`);
        process.exit(1);
      }
      const notices = incoming as Announcement[];
      notices.forEach(show);
      const ids = new Set(notices.map((notice) => notice.id));
      const rest = (await stored()).filter((notice) => !ids.has(notice.id));
      await save([...rest, ...notices]);
      return;
    }
    case "withdraw": {
      if (!target) throw new Error("Usage: bun run notices withdraw <id>");
      const notices = await stored();
      if (!notices.some((notice) => notice.id === target)) {
        throw new Error(`No notice with id "${target}".`);
      }
      await save(notices.filter((notice) => notice.id !== target));
      return;
    }
    default:
      throw new Error(`Unknown command "${command}". Use list, publish or withdraw.`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
