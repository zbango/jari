import { join } from "node:path";
import { app } from "electron";
import type { WebContents } from "electron";
import log from "electron-log/node";

export function configureLogging(): void {
  const file = log.transports.file;
  file.setAppName(app.getName());
  file.resolvePathFn = () => join(app.getPath("userData"), "logs", "desktop.log");
  file.level = "debug";
  file.writeOptions = { ...file.writeOptions, mode: 0o600 };

  Object.assign(console, log.functions);
  console.info(`Agent Desktop ${app.getVersion()} started`);
}

export function recordRendererConsole(contents: WebContents): void {
  const renderer = log.scope("renderer");
  contents.on("console-message", ({ frame, level, message }) => {
    if (contents.isDestroyed() || frame !== contents.mainFrame) return;
    renderer[level === "warning" ? "warn" : level](message);
  });
}
