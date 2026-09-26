/**
 * Records the promo's footage: the real app (the showcase, which mounts the
 * desktop app's own React tree over the recorded data) driven like a person
 * uses it, frame by frame, so every hover, tab switch and scroll is the app's
 * own and the timing is exact.
 *
 *   cd apps/showcase && bunx vite --port 8767   # in another terminal
 *   cd apps/promo && bun run record [clip]
 *
 * Each clip becomes `public/clips/<name>.mp4` (the popover at 3x) and
 * `<name>.json`: the cursor per frame, the clicks, and named marks the
 * video's captions are timed to.
 *
 * The page's clock is Playwright's fake one, advanced a frame at a time, and
 * every CSS or Web Animation is paused and seeked to that clock, so a frame
 * never depends on how fast this machine screenshots.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { BASE_PROMO, dismissRoutineTip, facts, PAID, RECORDED_AT } from "./promo-data.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const CLIPS = join(here, "public", "clips");
const BASE = process.env.SHOWCASE_URL ?? "http://localhost:8767/";
const CHROME =
  process.env.CHROME_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const FPS = 30;
const WIDTH = 380;
const HEIGHT = 640;
const SCALE = 3;

// ---------------------------------------------------------------- the face

/**
 * The app draws in the system face: San Francisco on a Mac. This machine has
 * none, so the recording uses Inter, the closest open face, instead of
 * whatever Linux falls back to.
 */
const FONT_FILES = {
  "inter.woff2": "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
  "deva.woff2":
    "@fontsource-variable/noto-sans-devanagari/files/noto-sans-devanagari-devanagari-wght-normal.woff2",
};
const FONT_CSS = `
@font-face { font-family: "Promo UI"; src: url(/__promo/inter.woff2) format("woff2"); font-weight: 100 900; }
@font-face { font-family: "Promo Deva"; src: url(/__promo/deva.woff2) format("woff2"); font-weight: 100 900; unicode-range: U+0900-097F, U+1CD0-1CF9, U+200C-200D, U+20A8, U+20B9, U+25CC, U+A830-A839, U+A8E0-A8FF; }
:root, :root[data-platform] { --font-ui: "Promo UI", "Promo Deva", sans-serif !important; }
`;

// ---------------------------------------------------------------- the director

class Director {
  constructor(page, name) {
    this.page = page;
    this.name = name;
    this.dir = join(CLIPS, `${name}-frames`);
    rmSync(this.dir, { recursive: true, force: true });
    mkdirSync(this.dir, { recursive: true });
    this.cursor = [WIDTH / 2, HEIGHT * 0.55];
    this.down = false;
    this.frames = [];
    this.clicks = [];
    this.marks = {};
    this.elapsed = 0;
  }

  /** Advances the page one frame and takes its picture. */
  async frame() {
    const target = Math.round(((this.frames.length + 1) * 1000) / FPS);
    await this.page.clock.runFor(target - this.elapsed);
    this.elapsed = target;
    await this.page.evaluate(() => {
      const now = performance.now();
      for (const animation of document.getAnimations()) {
        if (animation.__promoStart === undefined) {
          animation.__promoStart = now - (Number(animation.currentTime) || 0);
          animation.pause();
        }
        animation.currentTime = now - animation.__promoStart;
      }
    });
    const index = this.frames.length;
    await this.page.screenshot({
      path: join(this.dir, `${String(index).padStart(5, "0")}.png`),
    });
    this.frames.push([round(this.cursor[0]), round(this.cursor[1]), this.down ? 1 : 0]);
  }

  async hold(seconds) {
    for (let i = 0; i < Math.round(seconds * FPS); i++) await this.frame();
  }

  mark(name) {
    this.marks[name] = this.frames.length;
  }

  async point(target) {
    if (Array.isArray(target)) return target;
    const locator = typeof target === "string" ? this.page.getByText(target).first() : target;
    // A tab past the edge of a scrolling row comes into view first, as the
    // row's own arrow would bring it.
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    if (!box) throw new Error(`${this.name}: nothing to point at for ${target}`);
    return [box.x + box.width / 2, box.y + box.height / 2];
  }

  /** Glides the cursor to a target, easing in and out, hovering for real. */
  async move(target, seconds = 0.6) {
    const [x0, y0] = this.cursor;
    const [x1, y1] = await this.point(target);
    const steps = Math.max(1, Math.round(seconds * FPS));
    for (let i = 1; i <= steps; i++) {
      const e = ease(i / steps);
      this.cursor = [x0 + (x1 - x0) * e, y0 + (y1 - y0) * e];
      await this.page.mouse.move(...this.cursor);
      await this.frame();
    }
  }

  async click(target, seconds = 0.6, { press = true } = {}) {
    await this.move(target, seconds);
    await this.hold(0.1);
    this.clicks.push(this.frames.length);
    this.down = true;
    if (press) await this.page.mouse.down();
    await this.frame();
    await this.frame();
    this.down = false;
    if (press) await this.page.mouse.up();
    await this.frame();
  }

  /** Scrolls the screen by `dy` pixels, easing, like a trackpad flick. */
  async scroll(dy, seconds = 1) {
    const from = await this.page.evaluate(() => document.querySelector("main")?.scrollTop ?? 0);
    const steps = Math.round(seconds * FPS);
    for (let i = 1; i <= steps; i++) {
      const top = from + dy * ease(i / steps);
      await this.page.evaluate((y) => document.querySelector("main")?.scrollTo({ top: y, behavior: "instant" }), top);
      await this.frame();
    }
  }

  async type(text, framesPerKey = 3) {
    for (const key of text) {
      await this.page.keyboard.type(key);
      for (let i = 0; i < framesPerKey; i++) await this.frame();
    }
  }

  /**
   * Picks an option in a native select. The popup itself never draws in a
   * screenshot, so the change lands as the pick; a language or numeral
   * switch then gets a moment of real time to load its face.
   */
  async select(locator, option, seconds = 0.5) {
    // A real press would open the native popup, which blocks screenshots.
    await this.click(locator, seconds, { press: false });
    await locator.selectOption(option);
    await this.page.waitForTimeout(800);
    await this.page.evaluate(() => document.fonts.ready);
  }

  /** Changes what the stub answers from here on, as the app would see it. */
  async answer(patch) {
    await this.page.evaluate((next) => Object.assign(globalThis.__SAJILO_PROMO__, next), patch);
  }

  /** Encodes the frames and writes the clip's cursor track. */
  finish() {
    execFileSync(
      "bunx",
      [
        "remotion", "ffmpeg", "-y", "-loglevel", "error",
        "-framerate", String(FPS),
        "-i", join(this.dir, "%05d.png"),
        "-c:v", "libx264", "-crf", "12", "-preset", "slow", "-pix_fmt", "yuv420p",
        join(CLIPS, `${this.name}.mp4`),
      ],
      { cwd: here, stdio: "inherit" },
    );
    writeFileSync(
      join(CLIPS, `${this.name}.json`),
      `${JSON.stringify({
        width: WIDTH,
        height: HEIGHT,
        frames: this.frames.length,
        cursor: this.frames,
        clicks: this.clicks,
        marks: this.marks,
      })}\n`,
    );
    rmSync(this.dir, { recursive: true, force: true });
    console.log(`${this.name}: ${this.frames.length} frames`);
  }
}

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const round = (n) => Math.round(n * 10) / 10;

// ---------------------------------------------------------------- the clips

const tab = (d, name) => d.page.getByRole("link", { name, exact: true });
const button = (d, name) => d.page.getByRole("button", { name }).first();
const tabButton = (d, name) => d.page.getByRole("tab", { name, exact: true }).first();

/**
 * Each clip: where it starts, what the viewer has set, and what the person
 * in the video does. Marks name the moments captions land on.
 */
const CLIP_LIST = [
  {
    name: "calendar",
    route: "/",
    act: async (d) => {
      await d.hold(0.8);
      d.mark("today");
      await d.move(button(d, /^10\s*26$/), 0.8);
      await d.hold(1.2);
      d.mark("upNext");
      await d.move(button(d, /Public holiday/), 0.7);
      await d.hold(1.4);
      d.mark("dashain");
      await d.click(button(d, "Next month"), 0.7);
      await d.hold(0.6);
      await d.move(button(d, "Next month"), 0.1);
      await d.hold(1.8);
      await d.click(button(d, "Previous month"), 0.5);
      await d.hold(0.4);
      await d.click(button(d, /^10\s*26$/), 0.6);
      d.mark("day");
      await d.hold(1.2);
      await d.scroll(360, 1.2);
      await d.hold(1.4);
    },
  },
  {
    name: "converter",
    route: "/tools",
    act: async (d) => {
      await d.hold(0.3);
      await d.click(button(d, /Date Converter/), 0.6);
      await d.hold(0.6);
      d.mark("converter");
      // The recording holds today's conversion, so the demo converts today:
      // any other input would show a stale answer.
      await d.click(d.page.getByText(/AD\s*→\s*BS/).first(), 0.6);
      await d.hold(1.2);
      await d.click(d.page.getByText(/BS\s*→\s*AD/).first(), 0.5);
      await d.hold(0.8);
      await d.move(d.page.getByText("Nepali numerals").first(), 0.6);
      await d.hold(1.4);
    },
  },
  {
    name: "bazar",
    route: "/",
    act: async (d) => {
      await d.hold(0.3);
      await d.click(tab(d, "Bazar"), 0.7);
      await d.hold(0.6);
      d.mark("nepse");
      await d.scroll(520, 1.4);
      await d.hold(0.8);
      await d.scroll(-520, 0.6);
      d.mark("forex");
      await d.click(tabButton(d, "Forex"), 0.5);
      await d.hold(1.8);
      d.mark("gold");
      await d.click(tabButton(d, "Gold & Silver"), 0.5);
      await d.hold(1.8);
      d.mark("vegetables");
      await d.click(tabButton(d, "Vegetables"), 0.5);
      await d.hold(0.8);
      await d.scroll(400, 1.2);
      await d.hold(0.8);
    },
  },
  {
    name: "news",
    route: "/",
    act: async (d) => {
      await d.hold(0.3);
      await d.click(tab(d, "News"), 0.7);
      await d.hold(0.8);
      d.mark("news");
      await d.move([200, 380], 0.5);
      await d.scroll(900, 2.2);
      await d.hold(0.6);
      await d.scroll(-900, 0.8);
      await d.hold(1);
    },
  },
  {
    name: "weather",
    route: "/",
    act: async (d) => {
      await d.hold(0.3);
      await d.move([200, 420], 0.4);
      await d.scroll(300, 0.8);
      await d.click(button(d, /^Kathmandu/), 0.6);
      await d.hold(1);
      d.mark("weather");
      await d.move([200, 360], 0.5);
      await d.scroll(420, 1.4);
      await d.hold(1.8);
    },
  },
  {
    name: "keeper",
    route: "/",
    act: async (d) => {
      await d.hold(0.3);
      await d.click(tab(d, "Keeper"), 0.7);
      await d.hold(1);
      d.mark("bill");
      await d.move(button(d, /Mark paid/), 0.7);
      await d.hold(0.6);
      await d.answer({ keeper_snapshot: PAID });
      await d.click(button(d, /Mark paid/), 0.1);
      d.mark("paid");
      await d.hold(1.6);
      d.mark("papers");
      await d.move([200, 420], 0.5);
      await d.scroll(420, 1.3);
      await d.hold(1.6);
    },
  },
  {
    name: "routine",
    route: "/focus",
    setup: dismissRoutineTip,
    act: async (d) => {
      await d.hold(0.6);
      d.mark("breaks");
      await d.move([200, 300], 0.6);
      await d.hold(1.2);
      await d.scroll(700, 1.4);
      d.mark("calls");
      await d.hold(1.2);
      await d.click(d.page.getByText("This week", { exact: true }).first(), 0.6);
      await d.hold(0.3);
      await d.scroll(2000, 1.4);
      d.mark("week");
      await d.hold(1.6);
    },
  },
  {
    name: "tools",
    route: "/tools",
    act: async (d) => {
      await d.hold(0.4);
      d.mark("tools");
      await d.click(button(d, /Ropani/), 0.7);
      await d.move([200, 300], 0.6);
      await d.hold(1.6);
      d.mark("rashifal");
      await d.click(tab(d, "Rashifal"), 0.7);
      await d.hold(1.8);
      d.mark("radio");
      await d.click(tab(d, "Radio"), 0.6);
      await d.hold(1.8);
    },
  },
  {
    name: "yours",
    route: "/settings?tab=display",
    act: async (d) => {
      await d.hold(0.4);
      d.mark("language");
      const language = d.page.locator("select").nth(2);
      await d.select(language, { index: 0 }, 0.7);
      await d.hold(1.4);
      d.mark("numerals");
      const numerals = d.page.locator("select").nth(3);
      await d.select(numerals, { index: 0 });
      await d.hold(1.2);
      d.mark("theme");
      const theme = d.page.locator("select").nth(0);
      await d.select(theme, { index: 1 });
      await d.hold(1.6);
    },
  },
];

// ---------------------------------------------------------------- run

mkdirSync(CLIPS, { recursive: true });
writeFileSync(join(here, "public", "facts.json"), `${JSON.stringify(facts, null, 2)}\n`);
const browser = await chromium.launch({ executablePath: CHROME });
const only = process.argv[2];

for (const clip of CLIP_LIST) {
  if (only && clip.name !== only) continue;
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: SCALE,
    colorScheme: "dark",
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => console.warn(`${clip.name}: ${error.message}`));
  await page.route("**/__promo/*", (route) => {
    const file = FONT_FILES[route.request().url().split("/").pop()];
    return route.fulfill({
      body: readFileSync(join(here, "node_modules", file)),
      contentType: "font/woff2",
    });
  });
  await page.clock.install({ time: new Date(RECORDED_AT) });
  await page.addInitScript(
    ([answers, css]) => {
      globalThis.__SAJILO_PROMO__ = answers;
      document.addEventListener("DOMContentLoaded", () => {
        const style = document.createElement("style");
        style.textContent = css;
        document.head.append(style);
      });
    },
    [{ ...BASE_PROMO, ...clip.promo }, FONT_CSS],
  );

  const url = new URL(BASE);
  url.searchParams.set("route", clip.route);
  url.searchParams.set("theme", "dark");
  await page.goto(url.toString());
  // Let the app load and settle: real time for modules and fonts, the fake
  // clock for its own timers.
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(300);
    await page.clock.runFor(500);
  }
  await page.evaluate(() => document.fonts.ready);
  if (clip.setup) await clip.setup(page);

  const director = new Director(page, clip.name);
  await clip.act(director);
  director.finish();
  await context.close();
}

await browser.close();
