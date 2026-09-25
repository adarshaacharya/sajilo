import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

/**
 * The docs: one Markdown file per page in `src/content/docs/`. The file name is
 * the URL (`install-windows.md` → `/docs/install-windows.html`).
 */
const docs = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/docs" }),
  schema: z.object({
    title: z.string(),
    /** One sentence, for search results and link previews. */
    description: z.string(),
    /** The sidebar group the page sits in; see `SECTIONS` in `lib/docs.ts`. */
    section: z.enum(["start", "features", "help"]),
    /** Position within its section, smallest first. */
    order: z.number(),
    /** Shorter name for the sidebar, when the title is long. */
    nav: z.string().optional(),
    /**
     * The app screen to show beside the page, as the app's own route
     * (`/weather`, `/settings`). The real app renders it from the showcase
     * recording, so it never goes out of date. Omit for pages about the
     * computer rather than the app, like installing.
     */
    screen: z.string().optional(),
  }),
});

export const collections = { docs };
