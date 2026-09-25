import { isTauri } from "@tauri-apps/api/core";
import { api } from "./ipc";

/**
 * Opens `url` in the system's default browser. The popover is `alwaysOnTop`,
 * so it stays in front of the newly opened window unless it hides itself —
 * the link opens, it just looks like nothing happened.
 */
export async function openExternalLink(url: string) {
  // The showcase and ordinary browser development do not have native IPC.
  if (!isTauri()) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }

  try {
    await api.openExternalUrl(url);
    await api.hidePopover().catch(() => {});
  } catch (error) {
    // Keep the popover visible when the browser hand-off fails. Previously it
    // disappeared into the tray, which made a failed Linux launcher look like
    // the article itself had opened.
    console.error("Could not open external link", error);
    const { message } = await import("@tauri-apps/plugin-dialog");
    // Worded for any link: a web page goes to the browser, an email address
    // to the mail app, and naming the wrong one sends people looking for the
    // wrong problem.
    await message("Could not open this link.\n\nयो लिङ्क खोल्न सकिएन।", {
      title: "Couldn’t open link / लिङ्क खुलेन",
      kind: "error",
    }).catch(() => {});
  }
}

/** Buy me a momo: the one place people can say thanks for Sajilo. */
export const SUPPORT_URL = "https://buymemomo.com/adarsha";
