/**
 * Which desktop the webview is running on, read from the user agent: WebView2
 * on Windows reports "Windows", WKWebView on macOS "Macintosh". Only for
 * presentation — anything that must be right about the OS is decided in Rust.
 */
export const isWindows =
  typeof navigator !== "undefined" && navigator.userAgent.includes("Windows");

/** WebKitGTK on Linux reports "Linux" and no "Android". */
export const isLinux =
  typeof navigator !== "undefined" &&
  navigator.userAgent.includes("Linux") &&
  !navigator.userAgent.includes("Android");

/** Only macOS puts the date in the menu bar with no icon beside it. */
export const hasTrayIcon = isWindows || isLinux;
