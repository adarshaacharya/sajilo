/**
 * The desktop app, mounted in a browser tab.
 *
 * The landing page embeds one of these per carousel slide, so what a visitor
 * sees is the product's own React tree — same components, same stylesheet, same
 * layout code — rather than a picture of it or a hand-built lookalike. The two
 * things it does not have are Tauri and a network: `src/tauri-stub/` answers
 * every command from a recording made by `apps/showcase-data`.
 *
 * The route and the theme come from the URL, because the embedder is an
 * `<iframe>` and that is the only channel it has at load time.
 */
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "../../desktop/src/App";
import "./showcase.css";

const params = new URLSearchParams(window.location.search);

const route = params.get("route") ?? "/";
const theme = params.get("theme");
if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;

/* The popover is a macOS-shaped panel; the showcase should look like one on
 * every visitor's machine, not like the opaque Linux/Windows fallback. */
document.documentElement.dataset.windowMaterial = "vibrant";

/* A panel embedded in the carousel is scenery: it must not take the pointer or
 * the tab key, or a visitor working down the page with a keyboard would fall
 * into five copies of an app they cannot see. `pointer-events` is set by the
 * embedder, but focus crosses a frame boundary the page's CSS cannot reach —
 * only the embedded document can opt itself out, which is what this does. The
 * copy in the lightbox is opened without it and is fully usable. */
if (params.get("inert") === "1") document.body.inert = true;

const root = document.getElementById("root");
if (!root) throw new Error("index.html is missing #root");

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App initialEntries={[route]} />
  </React.StrictMode>,
);
