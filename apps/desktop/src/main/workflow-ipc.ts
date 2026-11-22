import { mkdirSync } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { isWorkflowProvider, workflowChannels, workflowRequestLimit } from "@agent-desktop/shared";
import { app, dialog, ipcMain } from "electron";
import type { BrowserWindow, IpcMainInvokeEvent, WebContents } from "electron";
import { openWorkflowStore } from "./workflow-store";

async function workspaceDirectory(path: string): Promise<string> {
  if (isAbsolute(path)) {
    try {
      const canonical = await realpath(path);
      if ((await stat(canonical)).isDirectory()) {
        return canonical;
      }
    } catch {
      // A selected directory can disappear between selection and save.
    }
  }
  throw new Error("The workspace folder is unavailable. Choose it again.");
}

export function registerWorkflowHandlers(getWindow: () => BrowserWindow | null): void {
  const chosenWorkspaces = new WeakMap<WebContents, string>();
  let store: ReturnType<typeof openWorkflowStore> | undefined;

  function getStore() {
    if (!store) {
      try {
        const directory = app.getPath("userData");
        mkdirSync(directory, { recursive: true });
        store = openWorkflowStore(join(directory, "workflows.sqlite"));
      } catch (error) {
        console.error("Opening local workflow storage failed", error);
        throw new Error("Local workflow storage could not be opened.");
      }
    }
    return store;
  }

  function trustedWindow(event: IpcMainInvokeEvent): BrowserWindow {
    const window = getWindow();
    if (
      !window ||
      event.sender !== window.webContents ||
      event.senderFrame !== event.sender.mainFrame
    ) {
      throw new Error("Workflow commands require the main application window.");
    }
    return window;
  }

  ipcMain.handle(workflowChannels.list, (event) => {
    trustedWindow(event);
    try {
      return getStore().list();
    } catch (error) {
      console.error("Loading workflows failed", error);
      throw new Error("Saved workflows could not be loaded.");
    }
  });

  ipcMain.handle(workflowChannels.chooseWorkspace, async (event) => {
    const window = trustedWindow(event);
    const result = await dialog.showOpenDialog(window, {
      title: "Choose a workflow workspace",
      properties: ["openDirectory"],
    });
    const folder = result.filePaths[0];
    if (result.canceled || !folder) {
      return null;
    }
    const path = await workspaceDirectory(folder);
    trustedWindow(event);
    chosenWorkspaces.set(event.sender, path);
    return path;
  });

  ipcMain.handle(workflowChannels.create, async (event, input: unknown) => {
    trustedWindow(event);
    if (
      !input ||
      typeof input !== "object" ||
      !("request" in input) ||
      !("provider" in input) ||
      !("workspacePath" in input)
    ) {
      throw new Error("Enter a request, select a provider and choose a workspace.");
    }
    const { request, provider, workspacePath } = input;
    if (typeof request !== "string" || !request.trim() || request.length > workflowRequestLimit) {
      throw new Error(`Enter a request between 1 and ${workflowRequestLimit} characters.`);
    }
    if (!isWorkflowProvider(provider)) {
      throw new Error("Select a supported provider.");
    }
    if (typeof workspacePath !== "string" || chosenWorkspaces.get(event.sender) !== workspacePath) {
      throw new Error("Choose the workspace through the folder picker.");
    }

    const path = await workspaceDirectory(workspacePath);
    trustedWindow(event);
    if (path !== workspacePath || chosenWorkspaces.get(event.sender) !== path) {
      throw new Error("The selected workspace changed. Choose it again.");
    }

    try {
      const workflow = getStore().create({
        request: request.trim(),
        provider,
        workspacePath: path,
      });
      chosenWorkspaces.delete(event.sender);
      return workflow;
    } catch (error) {
      console.error("Saving workflow failed", error);
      throw new Error("The workflow could not be saved. Try again.");
    }
  });

  app.once("will-quit", () => store?.close());
}
