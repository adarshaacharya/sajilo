import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app";
import "./index.css";

const root = document.getElementById("root");
if (!root) throw new Error("index.html is missing #root");

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
