import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import "./index.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Missing React root");
}

createRoot(root).render(
  <StrictMode>
    <App desktop={window.desktop} />
  </StrictMode>,
);
