/**
 * Which desktop the webview is running on, read from the user agent: WebView2
 * on Windows reports "Windows", WKWebView on macOS "Macintosh". Only for
 * presentation — anything that must be right about the OS is decided in Rust.
 */
export const isWindows =
  typeof navigator !== "undefined" && navigator.userAgent.includes("Windows");
