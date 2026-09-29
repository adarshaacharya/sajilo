import { useEffect, useState } from "react";

const KATHMANDU = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kathmandu",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today in Kathmandu as `YYYY-MM-DD`: only a key for noticing a new day,
 * never a date to show. What today is in BS is always asked of the shell. */
function kathmanduDay(): string {
  return KATHMANDU.format(new Date());
}

/** How often to look for a new day while the popover stays up. */
const CHECK_MS = 30_000;

/**
 * Changes when the day in Nepal does. The popover is hidden, never closed,
 * so a screen that asked the shell for today once would still show yesterday
 * the morning after; screens that show today reload on this instead. Looked
 * at every half minute, and again the moment the window comes back.
 */
export function useNepalDay(): string {
  const [day, setDay] = useState(kathmanduDay);
  useEffect(() => {
    const check = () => setDay(kathmanduDay());
    const timer = window.setInterval(check, CHECK_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return day;
}
