import { join } from "node:path";
import { app, BrowserWindow, session } from "electron";
import { productName } from "../../package.json";
import { loadDevelopmentEnvironment } from "./environment";
import { configureLogging, recordRendererConsole } from "./logging";
import { registerWorkflowHandlers } from "./workflow-ipc";

const smokeTest = process.argv.includes("--smoke-test");
let mainWindow: BrowserWindow | null = null;

app.setName(productName);

async function createWindow(): Promise<void> {
  const rendererUrl = process.env.ELECTRON_RENDERER_URL;
  const developmentUrl = !app.isPackaged && rendererUrl ? new URL(rendererUrl).href : undefined;
  if (developmentUrl && developmentUrl !== "http://127.0.0.1:5173/") {
    throw new Error("The renderer development server must use the configured loopback URL");
  }
  const window = new BrowserWindow({
    title: productName,
    width: 1350,
    height: 840,
    minWidth: 620,
    minHeight: 480,
    show: false,
    icon: join(app.getAppPath(), "resources", "icon.png"),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
    },
  });
  mainWindow = window;
  window.on("closed", () => {
    mainWindow = null;
  });

  const { webContents } = window;
  recordRendererConsole(webContents);
  webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  webContents.on("will-frame-navigate", (event) => {
    if (!developmentUrl || !event.isMainFrame || event.url !== developmentUrl) {
      event.preventDefault();
    }
  });
  webContents.on("will-redirect", (event) => event.preventDefault());
  webContents.on("will-attach-webview", (event) => event.preventDefault());
  window.once("ready-to-show", () => window.show());

  if (developmentUrl) {
    await window.loadURL(developmentUrl);
  } else {
    await window.loadFile(join(__dirname, "../renderer/index.html"));
  }

  if (smokeTest) {
    const shell = await webContents.executeJavaScript(`
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          observer.disconnect();
          reject(new Error("The React shell did not render"));
        }, 10000);
        const readShell = () => {
          const canvas = document.querySelector("[data-workflow-canvas]");
          if (!canvas?.querySelector(".react-flow__node") || !document.querySelector('#jira-issue[aria-busy="false"]')) return;
          observer.disconnect();
          clearTimeout(timer);
          resolve({
            name: document.querySelector("h1")?.textContent,
            version: document.querySelector("[data-desktop-version]")?.textContent,
            stages: ["idea", "plan", "build"].every(stage => canvas.querySelector(\`[data-stage="\${stage}"]\`)),
            display: getComputedStyle(document.querySelector("main")).display,
            hasNode: typeof require !== "undefined" || typeof process !== "undefined",
          });
        };
        const observer = new MutationObserver(readShell);
        observer.observe(document.documentElement, { childList: true, attributes: true, subtree: true });
        readShell();
      })
    `);
    if (
      shell.name !== productName ||
      shell.version !== `Version ${app.getVersion()}` ||
      !shell.stages ||
      shell.display !== "grid" ||
      shell.hasNode
    ) {
      throw new Error(`Unexpected application shell: ${JSON.stringify(shell)}`);
    }
    console.info(`Smoke test passed for ${productName} ${app.getVersion()}`);
    app.exit(0);
  }
}

function reportStartupFailure(error: unknown): void {
  console.error("Desktop startup failed", error);
  app.exit(1);
}

void app
  .whenReady()
  .then(async () => {
    configureLogging();
    if (app.commandLine.hasSwitch("no-sandbox")) {
      throw new Error("Agent Desktop requires the Chromium sandbox");
    }
    session.defaultSession.setPermissionCheckHandler(() => false);
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => {
      callback(false);
    });
    session.defaultSession.setDevicePermissionHandler(() => false);
    session.defaultSession.on("will-download", (event) => event.preventDefault());

    if (!app.isPackaged) {
      loadDevelopmentEnvironment(join(app.getAppPath(), "..", "..", ".env"));
    }
    registerWorkflowHandlers(() => mainWindow);
    await createWindow();
    app.on("activate", () => {
      if (!mainWindow) {
        void createWindow().catch(reportStartupFailure);
      }
    });
  })
  .catch(reportStartupFailure);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin" || smokeTest) {
    app.quit();
  }
});
