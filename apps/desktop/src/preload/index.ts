import { workflowChannels } from "@agent-desktop/shared";
import type { DesktopInfo, WorkflowApi } from "@agent-desktop/shared";
import { contextBridge, ipcRenderer } from "electron";
import { productName, version } from "../../package.json";

const desktop: DesktopInfo = { name: productName, version };
const workflows: WorkflowApi = {
  knowledge: {
    list: () => ipcRenderer.invoke(workflowChannels.listKnowledge),
    save: (id, input) => ipcRenderer.invoke(workflowChannels.saveKnowledge, id, input),
    remove: (id) => ipcRenderer.invoke(workflowChannels.removeKnowledge, id),
  },
  list: () => ipcRenderer.invoke(workflowChannels.list),
  chooseWorkspace: () => ipcRenderer.invoke(workflowChannels.chooseWorkspace),
  assignedSprintIssues: () => ipcRenderer.invoke(workflowChannels.assignedSprintIssues),
  boards: () => ipcRenderer.invoke(workflowChannels.boards),
  activeSprints: (board) => ipcRenderer.invoke(workflowChannels.activeSprints, board),
  sprintIssues: (board, sprint) => ipcRenderer.invoke(workflowChannels.sprintIssues, board, sprint),
  issue: (key) => ipcRenderer.invoke(workflowChannels.issue, key),
  openJiraLink: (url) => ipcRenderer.invoke(workflowChannels.openJiraLink, url),
  retryPlan: (id) => ipcRenderer.invoke(workflowChannels.retryPlan, id),
  answerPlan: (id, answer) => ipcRenderer.invoke(workflowChannels.answerPlan, id, answer),
  create: (input) => ipcRenderer.invoke(workflowChannels.create, input),
};

contextBridge.exposeInMainWorld("desktop", desktop);
contextBridge.exposeInMainWorld("workflows", workflows);
