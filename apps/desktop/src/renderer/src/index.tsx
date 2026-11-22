import { onceUIStyle } from "@agent-desktop/ui/theme";
import { LayoutProvider, ThemeProvider, ToastProvider } from "@once-ui-system/core";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import "./index.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Missing React root");
}

const fonts = {
  heading: "Geist Variable, system-ui, sans-serif",
  body: "Geist Variable, system-ui, sans-serif",
  label: "Geist Variable, system-ui, sans-serif",
  code: "Geist Mono Variable, monospace",
};
for (const [role, family] of Object.entries(fonts)) {
  document.documentElement.style.setProperty(`--font-${role}`, family);
}

createRoot(root).render(
  <StrictMode>
    <ThemeProvider {...onceUIStyle} persistence="local">
      <LayoutProvider>
        <ToastProvider>
          <App desktop={window.desktop} api={window.workflows} />
        </ToastProvider>
      </LayoutProvider>
    </ThemeProvider>
  </StrictMode>,
);
