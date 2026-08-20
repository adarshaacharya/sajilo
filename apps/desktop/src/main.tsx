import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./index.css";

// macOS supplies the frosted material behind our transparent shell. Other
// desktop compositors do not, so give them an opaque base without changing the
// visual treatment or the rounded transparent corners of the popover.
if (!navigator.userAgent.includes("Macintosh")) {
  document.documentElement.dataset.windowMaterial = "opaque";
}

const root = document.getElementById("root");
if (!root) throw new Error("index.html is missing #root");

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
