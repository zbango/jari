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
  removeWorkflow: (id) => ipcRenderer.invoke(workflowChannels.removeWorkflow, id),
  readTranscript: (id, after) => ipcRenderer.invoke(workflowChannels.readTranscript, id, after),
  exportTranscript: (id) => ipcRenderer.invoke(workflowChannels.exportTranscript, id),
  restoreWorkspace: () => ipcRenderer.invoke(workflowChannels.restoreWorkspace),
  chooseWorkspace: () => ipcRenderer.invoke(workflowChannels.chooseWorkspace),
  openWorkspaceInCursor: (id) => ipcRenderer.invoke(workflowChannels.openWorkspaceInCursor, id),
  planningOptions: (provider, path, id) =>
    ipcRenderer.invoke(workflowChannels.planningOptions, provider, path, id),
  assignedSprintIssues: (sync) => ipcRenderer.invoke(workflowChannels.assignedSprintIssues, sync),
  boards: (sync) => ipcRenderer.invoke(workflowChannels.boards, sync),
  activeSprints: (board, sync) => ipcRenderer.invoke(workflowChannels.activeSprints, board, sync),
  sprintIssues: (board, sprint, sync) =>
    ipcRenderer.invoke(workflowChannels.sprintIssues, board, sprint, sync),
  issue: (key, sync) => ipcRenderer.invoke(workflowChannels.issue, key, sync),
  linkedIssue: (key, sync) => ipcRenderer.invoke(workflowChannels.linkedIssue, key, sync),
  openJiraLink: (url) => ipcRenderer.invoke(workflowChannels.openJiraLink, url),
  retryPlan: (id) => ipcRenderer.invoke(workflowChannels.retryPlan, id),
  replayPlan: (id, input) => ipcRenderer.invoke(workflowChannels.replayPlan, id, input),
  answerPlan: (id, answer) => ipcRenderer.invoke(workflowChannels.answerPlan, id, answer),
  generatePlanReview: (id) => ipcRenderer.invoke(workflowChannels.generatePlanReview, id),
  approvePlan: (id) => ipcRenderer.invoke(workflowChannels.approvePlan, id),
  startBuild: (id) => ipcRenderer.invoke(workflowChannels.startBuild, id),
  reviewBuildTask: (id, input) => ipcRenderer.invoke(workflowChannels.reviewBuildTask, id, input),
  create: (input) => ipcRenderer.invoke(workflowChannels.create, input),
};

contextBridge.exposeInMainWorld("desktop", desktop);
contextBridge.exposeInMainWorld("workflows", workflows);
