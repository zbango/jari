import { join } from "node:path";
import { app, BrowserWindow, session } from "electron";
import { productName } from "../../package.json";

const smokeTest = process.argv.includes("--smoke-test");
let mainWindow: BrowserWindow | null = null;

app.setName(productName);

async function createWindow(): Promise<void> {
  const window = new BrowserWindow({
    title: productName,
    width: 840,
    height: 580,
    minWidth: 320,
    minHeight: 300,
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
  webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  webContents.on("will-frame-navigate", (event) => event.preventDefault());
  webContents.on("will-redirect", (event) => event.preventDefault());
  webContents.on("will-attach-webview", (event) => event.preventDefault());
  window.once("ready-to-show", () => window.show());

  const developmentUrl = process.env.ELECTRON_RENDERER_URL;
  if (!app.isPackaged && developmentUrl) {
    const url = new URL(developmentUrl);
    if (url.origin !== "http://127.0.0.1:5173" || url.pathname !== "/" || url.search || url.hash) {
      throw new Error("The renderer development server must use the configured loopback URL");
    }
    await window.loadURL(url.href);
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
          const status = document.querySelector("[data-desktop-status]");
          if (!status) return;
          observer.disconnect();
          clearTimeout(timer);
          resolve({
            name: document.querySelector("h1")?.textContent,
            version: document.querySelector("[data-desktop-version]")?.textContent,
            status: status.textContent,
            display: getComputedStyle(document.querySelector("main")).display,
            hasNode: typeof require !== "undefined" || typeof process !== "undefined",
          });
        };
        const observer = new MutationObserver(readShell);
        observer.observe(document.documentElement, { childList: true, subtree: true });
        readShell();
      })
    `);
    if (
      shell.name !== productName ||
      shell.version !== `Version ${app.getVersion()}` ||
      shell.status !== "Application shell is operational" ||
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
    if (app.commandLine.hasSwitch("no-sandbox")) {
      throw new Error("Agent Desktop requires the Chromium sandbox");
    }
    session.defaultSession.setPermissionCheckHandler(() => false);
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => {
      callback(false);
    });
    session.defaultSession.setDevicePermissionHandler(() => false);
    session.defaultSession.on("will-download", (event) => event.preventDefault());

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
