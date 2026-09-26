/**
 * Which download a visitor most likely wants. Apple Silicon versus Intel
 * cannot be read from the user agent, so a WebGL renderer string is tried
 * first and Apple Silicon is assumed when it says nothing — that is most Macs
 * now. Shared by the hero's big button and the Download button in the nav, so
 * the two never offer different files.
 */
export interface Detected {
  platform: string;
  label: string;
  mac: boolean;
}

export function detectPlatform(): Detected {
  const ua = navigator.userAgent;
  if (/Windows/.test(ua)) return { platform: "windows", label: "Download for Windows", mac: false };
  if (/Linux/.test(ua) && !/Android/.test(ua)) {
    return { platform: "linux-appimage", label: "Download for Linux", mac: false };
  }
  if (!/Macintosh/.test(ua)) return { platform: "macos-arm64", label: "Download for macOS", mac: false };
  let arm = true;
  try {
    const gl = document.createElement("canvas").getContext("webgl");
    const dbg = gl?.getExtension("WEBGL_debug_renderer_info");
    const renderer = dbg ? String(gl?.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : "";
    if (/Intel|AMD|Radeon|NVIDIA/i.test(renderer) && !/Apple/i.test(renderer)) arm = false;
  } catch {}
  return arm
    ? { platform: "macos-arm64", label: "Download for macOS", mac: true }
    : { platform: "macos-x64", label: "Download for macOS (Intel)", mac: true };
}

/** Sent when a download starts from anywhere on the page, so the hero can
 * show what to do next (on a Mac: how to open an app from outside the App
 * Store). */
export const DOWNLOAD_STARTED = "sajilo:download-started";
