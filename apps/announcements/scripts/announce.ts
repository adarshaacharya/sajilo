/**
 * Write an announcement into `data/config/announcements.json` and publish it.
 *
 *   bun run announce            ask for each field, then commit and push
 *   bun run announce --dry-run  ask, write the file, but don't commit
 *   bun run announce --prune    only drop expired announcements
 *
 * The pack is validated with the app's own rules (`sajilo-config-publish
 * check`) before anything is committed. Pushing to `main` starts Publish
 * config, which waits for your approval on GitHub before it goes live.
 *
 * Versions older than 0.1.35 don't read the pack; if an announcement targets
 * them, this offers to post it through the old Worker as well
 * (`bun run notices publish`).
 */
import { $ } from "bun";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const pruneOnly = args.includes("--prune");

const ROOT = new URL("../../../", import.meta.url).pathname;
const PACK = `${ROOT}data/config/announcements.json`;
/** The first version that reads announcements from the pack. */
const PACK_FROM = [0, 1, 35] as const;

const CATEGORIES = ["notice", "greeting", "update", "status", "tip", "ask", "general"] as const;
const LEVELS = ["info", "important", "urgent"] as const;
const SCREENS = ["today", "bazar", "news", "rashifal", "radio", "weather"] as const;
const PLATFORMS = ["windows", "macos", "linux"] as const;

type Text = { en: string; ne: string };
type Notice = {
  id: string;
  level: (typeof LEVELS)[number];
  category: (typeof CATEGORIES)[number];
  delivery?: "quiet" | "popup";
  screen?: string;
  title: Text;
  body: Text;
  startsAt?: string;
  expiresAt?: string;
  action?: { url: string; label: Text };
  platforms?: string[];
  minVersion?: string;
  maxVersion?: string;
};

function ask(question: string, fallback = ""): string {
  const hint = fallback ? ` [${fallback}]` : "";
  const answer = prompt(`${question}${hint}:`)?.trim() ?? "";
  return answer || fallback;
}

function choose<T extends string>(question: string, options: readonly T[], fallback: T): T {
  for (;;) {
    const answer = ask(`${question} (${options.join(" / ")})`, fallback) as T;
    if (options.includes(answer)) return answer;
    console.log(`  Pick one of: ${options.join(", ")}`);
  }
}

function required(question: string): string {
  for (;;) {
    const answer = ask(question);
    if (answer) return answer;
    console.log("  Required.");
  }
}

/** "2026-10-23" or "2026-10-23 18:00" (Nepal time) → ISO UTC. */
function nepalTime(text: string): string | undefined {
  if (!text) return undefined;
  const [date, time = "00:00"] = text.split(/[ T]/);
  const parsed = new Date(`${date}T${time}:00+05:45`);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Not a date: ${text}`);
  return parsed.toISOString();
}

function version(text: string): number[] | null {
  const parts = text.split(".").map(Number);
  return parts.length === 3 && parts.every(Number.isInteger) ? parts : null;
}

function older(a: number[], b: readonly number[]): boolean {
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) < (b[i] ?? 0);
  }
  return false;
}

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

async function load(): Promise<Notice[]> {
  const pack = (await Bun.file(PACK).json()) as { notices?: Notice[] };
  return pack.notices ?? [];
}

function live(notices: Notice[]): Notice[] {
  return notices.filter((notice) => !notice.expiresAt || Date.parse(notice.expiresAt) > Date.now());
}

async function save(notices: Notice[]): Promise<void> {
  await Bun.write(PACK, `${JSON.stringify({ notices }, null, 2)}\n`);
}

async function validate(): Promise<void> {
  const check = await $`cargo run -q -p sajilo-config-publish -- check`.cwd(ROOT).nothrow().quiet();
  if (check.exitCode !== 0) {
    throw new Error(`The pack doesn't pass the app's checks:\n${check.stderr}${check.stdout}`);
  }
}

async function publish(message: string): Promise<void> {
  if (dryRun) {
    console.log("\n--dry-run: written, not committed.");
    return;
  }
  await $`git pull --ff-only --quiet`.cwd(ROOT);
  await $`git add ${PACK}`.cwd(ROOT);
  await $`git commit --quiet -m ${message}`.cwd(ROOT);
  await $`git push --quiet origin main`.cwd(ROOT);
  console.log(
    "\nPushed. Publish config is now waiting for your approval:" +
      "\n  GitHub › Actions › Publish config › Review deployments › Approve and deploy" +
      "\nOnce approved, apps pick it up within about an hour.",
  );
}

async function main() {
  const before = await load();
  const kept = live(before);
  const pruned = before.length - kept.length;

  if (pruneOnly) {
    if (pruned === 0) return console.log("Nothing has expired.");
    await save(kept);
    await validate();
    await publish(`chore(config): drop ${pruned} expired announcement(s)`);
    return;
  }

  console.log("New announcement — press Enter to accept a [default].\n");
  const category = choose("Category", CATEGORIES, "notice");
  const level = choose("Level", LEVELS, category === "notice" ? "important" : "info");
  const delivery = choose("Delivery (default follows the category)", ["default", "quiet", "popup"] as const, "default");
  const titleEn = required("Title (English)");
  const titleNe = required("Title (Nepali)");
  const bodyEn = required("Body (English)");
  const bodyNe = required("Body (Nepali)");
  const url = ask("Link (https://…, optional)");
  const label = url
    ? { en: ask("Link label (English)", "Details"), ne: ask("Link label (Nepali)", "थप जानकारी") }
    : null;
  const screen =
    category === "status" ? choose("Screen", SCREENS, "bazar") : ask("Screen (optional: bazar, news, …)");
  const starts = ask("Starts (Nepal time, e.g. 2026-10-23 06:00; Enter for now)");
  const inThreeDays = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
  const expires = ask("Expires (Nepal time)", inThreeDays);
  const platforms = ask(`Platforms (${PLATFORMS.join(", ")}; Enter for all)`)
    .split(/[ ,]+/)
    .filter(Boolean);
  const minVersion = ask("Oldest version shown (e.g. 0.1.35; Enter for any)");
  const maxVersion = ask("Newest version shown (Enter for any)");

  const notice: Notice = {
    id: `${slug(titleEn)}-${new Date().toISOString().slice(0, 10)}`,
    level,
    category,
    ...(delivery !== "default" && { delivery }),
    ...(screen && screen !== "today" && { screen }),
    title: { en: titleEn, ne: titleNe },
    body: { en: bodyEn, ne: bodyNe },
    ...(nepalTime(starts) && { startsAt: nepalTime(starts) }),
    ...(nepalTime(expires) && { expiresAt: nepalTime(expires) }),
    ...(url && label && { action: { url, label } }),
    ...(platforms.length > 0 && { platforms }),
    ...(minVersion && { minVersion }),
    ...(maxVersion && { maxVersion }),
  };

  console.log(`\n${JSON.stringify(notice, null, 2)}`);
  if (pruned > 0) console.log(`(${pruned} expired announcement(s) will be dropped.)`);
  if (ask("\nPublish this? (y/n)", "y").toLowerCase() !== "y") return console.log("Not published.");

  await save([...kept.filter((item) => item.id !== notice.id), notice]);
  try {
    await validate();
  } catch (error) {
    await save(before);
    throw error;
  }
  await publish(`feat(announcement): ${titleEn}`);

  // Versions before the pack only read the old Worker.
  const max = maxVersion ? version(maxVersion) : null;
  if (!maxVersion || (max && older(max, PACK_FROM))) {
    const reach = maxVersion ? `versions up to ${maxVersion}` : "versions before 0.1.35";
    if (ask(`\nAlso post to the old Worker, for ${reach}? (y/n)`, "n").toLowerCase() === "y") {
      const { category: _c, delivery: _d, screen: _s, ...legacy } = notice;
      const file = `${process.env.TMPDIR ?? "/tmp"}/sajilo-announce-${process.pid}.json`;
      await Bun.write(file, JSON.stringify({ ...legacy, maxVersion: maxVersion || "0.1.34" }));
      await $`bun scripts/notices.ts publish ${file} ${dryRun ? "--dry-run" : ""}`.cwd(
        new URL("../", import.meta.url).pathname,
      );
    }
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
