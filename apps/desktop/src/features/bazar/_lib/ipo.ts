import type { IpoIssue } from "../../../types/api/IpoIssue";

/**
 * Presentation helpers for CDSC's current-issue list.
 *
 * CDSC publishes whole days in Nepal time, so "open today" is decided against
 * the Kathmandu calendar day rather than the device's — someone checking from
 * abroad should see the same window a Nepali applicant does.
 */

export type IpoPhase =
  | { kind: "open"; daysLeft: number; progress: number }
  | { kind: "upcoming"; daysUntil: number }
  | { kind: "closed"; daysAgo: number }
  | { kind: "unknown" };

export type PhasedIssue = { key: string; issue: IpoIssue; phase: IpoPhase };

export type IssueGroups = {
  open: PhasedIssue[];
  upcoming: PhasedIssue[];
  closed: PhasedIssue[];
  total: number;
};

const DAY_MS = 86_400_000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

const KATHMANDU_DAY = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Kathmandu",
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

function dayNumber(iso: string): number | null {
  const match = ISO_DATE.exec(iso.trim());
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / DAY_MS;
}

/** Today's calendar day in Kathmandu, as whole days since the epoch. */
export function nepalToday(now = new Date()): number {
  const parts: Record<string, string> = {};
  for (const part of KATHMANDU_DAY.formatToParts(now)) parts[part.type] = part.value;
  return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)) / DAY_MS;
}

export function ipoPhase(issue: IpoIssue, today: number): IpoPhase {
  const open = dayNumber(issue.openDate);
  const close = dayNumber(issue.closeDate);
  if (open == null || close == null || close < open) return { kind: "unknown" };
  if (today < open) return { kind: "upcoming", daysUntil: open - today };
  if (today > close) return { kind: "closed", daysAgo: today - close };
  // Both ends are inclusive: a one-day window is half-way through on its day.
  const span = close - open + 1;
  return { kind: "open", daysLeft: close - today, progress: (today - open + 1) / span };
}

export function issueKey(issue: IpoIssue): string {
  return `${issue.companyName}|${issue.openDate}|${issue.closeDate}`;
}

/** Open first (closing soonest), then upcoming (opening soonest), then closed (latest first). */
export function groupIssues(issues: readonly IpoIssue[], today: number): IssueGroups {
  const groups: IssueGroups = { open: [], upcoming: [], closed: [], total: issues.length };
  for (const issue of issues) {
    const entry = { key: issueKey(issue), issue, phase: ipoPhase(issue, today) };
    if (entry.phase.kind === "open") groups.open.push(entry);
    else if (entry.phase.kind === "closed") groups.closed.push(entry);
    else groups.upcoming.push(entry);
  }
  const rank = (entry: PhasedIssue) => {
    switch (entry.phase.kind) {
      case "open":
        return entry.phase.daysLeft;
      case "upcoming":
        return entry.phase.daysUntil;
      case "closed":
        return entry.phase.daysAgo;
      default:
        return Number.MAX_SAFE_INTEGER;
    }
  };
  const byRank = (a: PhasedIssue, b: PhasedIssue) => rank(a) - rank(b);
  groups.open.sort(byRank);
  groups.upcoming.sort(byRank);
  groups.closed.sort(byRank);
  return groups;
}

export function findIssue(groups: IssueGroups | undefined, key: string): PhasedIssue | undefined {
  if (!groups) return undefined;
  return [...groups.open, ...groups.upcoming, ...groups.closed].find((entry) => entry.key === key);
}

/** The company as shown: the parser's split name, or the raw cell from an older cache. */
export function companyName(issue: IpoIssue): string {
  return issue.name || issue.companyName;
}

/** `IPO · General Public`, from whichever parts CDSC published. */
export function issueDetail(issue: IpoIssue): string | null {
  const parts = [issue.issueType, issue.audience].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function shortCompanyName(name: string): string {
  return name.replace(/\s+(Limited|Ltd\.?)$/i, "");
}

/** CDSC counts are whole numbers, sometimes with separators. */
export function parseCount(text: string): number | null {
  const cleaned = text.replace(/[,\s]/g, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

/** Units applied for per unit on offer; `null` until both are published. */
export function subscriptionRatio(issue: IpoIssue): number | null {
  const issued = parseCount(issue.issuedUnits);
  const applied = parseCount(issue.appliedUnits);
  if (!issued || applied == null || applied === 0) return null;
  return applied / issued;
}

export function ratioText(ratio: number): string {
  return ratio >= 10 ? ratio.toFixed(1) : ratio.toFixed(2);
}

/** A short AD date such as `Sep 7`, in the interface language. */
export function issueDate(iso: string, language: "en" | "ne"): string | null {
  const day = dayNumber(iso);
  if (day == null) return null;
  const locale = language === "ne" ? "ne-NP-u-nu-latn" : "en-US-u-nu-latn";
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(day * DAY_MS));
}

/**
 * Whether anyone can apply. Right shares and reserved quotas (foreign
 * employment, project-affected locals) are real issues but not ones to put in
 * front of everybody, so only general-public offers reach the home screen.
 */
export function isPublicOffer(issue: IpoIssue): boolean {
  if (issue.audience) return /general public/i.test(issue.audience);
  return !/right/i.test(issue.issueType ?? "");
}
