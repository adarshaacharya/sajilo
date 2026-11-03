/** How long ago a value was fetched, as a card footer says it: "Updated 5 min ago". */
export function relativeFreshness(
  iso: string | undefined,
  t: (
    key:
      | "dashboard.updated-now"
      | "dashboard.updated-minute"
      | "dashboard.updated-minutes"
      | "dashboard.updated-hour"
      | "dashboard.updated-hours",
  ) => string,
): string | null {
  if (!iso) return null;
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return t("dashboard.updated-now");
  if (mins === 1) return t("dashboard.updated-minute");
  if (mins < 60) return t("dashboard.updated-minutes").replace("{n}", String(mins));
  const hours = Math.round(mins / 60);
  return hours === 1
    ? t("dashboard.updated-hour")
    : t("dashboard.updated-hours").replace("{n}", String(hours));
}
