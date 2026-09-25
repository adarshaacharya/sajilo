import { type CollectionEntry, getCollection } from "astro:content";

export type Doc = CollectionEntry<"docs">;

/** The sidebar groups, in order. */
export const SECTIONS = [
  { id: "start", label: "Getting started" },
  { id: "features", label: "Using Sajilo" },
  { id: "help", label: "Help" },
] as const;

/** Every page, in reading order: by section, then by `order`. */
export async function orderedDocs(): Promise<Doc[]> {
  const docs = await getCollection("docs");
  const rank = (doc: Doc) => SECTIONS.findIndex((section) => section.id === doc.data.section);
  return docs.sort((a, b) => rank(a) - rank(b) || a.data.order - b.data.order);
}

export function docHref(doc: Doc): string {
  return `/docs/${doc.id}.html`;
}
