import { workflowChannels } from "@agent-desktop/shared";
import type { DesktopInfo, WorkflowApi } from "@agent-desktop/shared";
import { contextBridge, ipcRenderer } from "electron";
import { productName, version } from "../../package.json";

const desktop: DesktopInfo = { name: productName, version };
const workflows: WorkflowApi = {
  list: () => ipcRenderer.invoke(workflowChannels.list),
  chooseWorkspace: () => ipcRenderer.invoke(workflowChannels.chooseWorkspace),
  create: (input) => ipcRenderer.invoke(workflowChannels.create, input),
};

contextBridge.exposeInMainWorld("desktop", desktop);
contextBridge.exposeInMainWorld("workflows", workflows);
