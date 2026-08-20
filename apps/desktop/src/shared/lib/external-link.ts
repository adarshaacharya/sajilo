import { api } from "./ipc";

/**
 * Opens `url` in the system's default browser. The popover is `alwaysOnTop`,
 * so it stays in front of the newly opened window unless it hides itself —
 * the link opens, it just looks like nothing happened.
 */
export async function openExternalLink(url: string) {
  try {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
  await api.hidePopover().catch(() => {});
}
