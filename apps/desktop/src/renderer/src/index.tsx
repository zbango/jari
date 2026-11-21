import { ThemeProvider } from "@agent-desktop/ui/theme";
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
    <ThemeProvider theme="system" persistence="none">
      <App desktop={window.desktop} />
    </ThemeProvider>
  </StrictMode>,
);
