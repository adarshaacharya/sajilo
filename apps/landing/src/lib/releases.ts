import { marked } from "marked";
import releasesData from "../data/releases.json";

export interface ReleaseAsset {
  platform: string;
  label: string;
  filename: string;
  url: string;
  size: number;
}

export interface Release {
  version: string;
  name: string;
  publishedAt: string;
  body: string;
  prerelease: boolean;
  htmlUrl: string;
  assets: ReleaseAsset[];
}

export interface RenderedRelease extends Release {
  bodyHtml: string;
  date: string;
  excerpt: string;
}

export const PAGE_SIZE = 8;

const releases = releasesData as Release[];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export function formatSize(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** A one-line taste of the notes, markdown syntax stripped, for the list view. */
function excerptOf(body: string): string {
  const plain = body
    .replace(/^#+\s*/gm, "")
    .replace(/[*_`>]/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\r?\n+/g, " ")
    .trim();
  if (!plain) return "No notes for this release.";
  return plain.length > 160 ? `${plain.slice(0, 160).trimEnd()}…` : plain;
}

function render(r: Release): RenderedRelease {
  return {
    ...r,
    bodyHtml: marked.parse(r.body || "_No notes for this release._", { async: false }) as string,
    date: formatDate(r.publishedAt),
    excerpt: excerptOf(r.body),
  };
}

export function allReleases(): RenderedRelease[] {
  return releases.map(render);
}

export function releaseCount(): number {
  return releases.length;
}

export function pageCount(): number {
  return Math.max(1, Math.ceil(releases.length / PAGE_SIZE));
}

export function releasesForPage(page: number): RenderedRelease[] {
  const start = (page - 1) * PAGE_SIZE;
  return releases.slice(start, start + PAGE_SIZE).map(render);
}

/** Releases are always newest-first, so the first entry is the one `/dl/*` actually serves. */
export function latestVersion(): string | undefined {
  return releases[0]?.version;
}

export function findRelease(version: string): RenderedRelease | undefined {
  const r = releases.find((x) => x.version === version);
  return r ? render(r) : undefined;
}

/** For the prev/next links on a release's own page — newest first, same as the list. */
export function neighborsOf(version: string): { newer?: Release; older?: Release } {
  const i = releases.findIndex((x) => x.version === version);
  if (i === -1) return {};
  return { newer: releases[i - 1], older: releases[i + 1] };
}
