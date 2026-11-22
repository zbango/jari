import { mkdirSync } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { isWorkflowProvider, maxPlanAnswerLength, workflowChannels } from "@agent-desktop/shared";
import type { WorkItem, WorkflowPlan, WorkflowRecord } from "@agent-desktop/shared";
import { app, dialog, ipcMain, shell } from "electron";
import type { BrowserWindow, IpcMainInvokeEvent, WebContents } from "electron";
import { createAtlassianClient, issueKey, jiraId } from "./atlassian";
import { readKnowledgeNote, readKnowledgeNoteIds } from "./knowledge";
import { runPlanning } from "./planner";
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
  const inspectedIssues = new WeakMap<WebContents, Map<string, WorkItem>>();
  const running = new Map<string, AbortController>();
  let shuttingDown = false;
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

  ipcMain.handle(workflowChannels.listKnowledge, (event) => {
    trustedWindow(event);
    return getStore().listKnowledge();
  });

  ipcMain.handle(workflowChannels.saveKnowledge, (event, id: unknown, input: unknown) => {
    trustedWindow(event);
    if (id !== null && (typeof id !== "string" || !id)) throw new Error("Invalid knowledge note.");
    return getStore().saveKnowledge(id, readKnowledgeNote(input));
  });

  ipcMain.handle(workflowChannels.removeKnowledge, (event, id: unknown) => {
    trustedWindow(event);
    if (typeof id !== "string" || !id) throw new Error("Invalid knowledge note.");
    getStore().removeKnowledge(id);
  });

  ipcMain.handle(workflowChannels.list, (event) => {
    trustedWindow(event);
    try {
      return getStore()
        .list()
        .map((record) =>
          record.plan?.state === "running" && !running.has(record.id)
            ? { ...record, plan: { ...record.plan, state: "interrupted" } }
            : record,
        );
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

  ipcMain.handle(workflowChannels.assignedSprintIssues, (event) => {
    trustedWindow(event);
    return createAtlassianClient().assignedSprintIssues();
  });

  ipcMain.handle(workflowChannels.boards, (event) => {
    trustedWindow(event);
    return createAtlassianClient().boards();
  });

  ipcMain.handle(workflowChannels.activeSprints, (event, board: unknown) => {
    trustedWindow(event);
    return createAtlassianClient().activeSprints(jiraId(board));
  });

  ipcMain.handle(workflowChannels.sprintIssues, (event, board: unknown, sprint: unknown) => {
    trustedWindow(event);
    return createAtlassianClient().sprintIssues(jiraId(board), jiraId(sprint));
  });

  ipcMain.handle(workflowChannels.openJiraLink, async (event, input: unknown) => {
    trustedWindow(event);
    const url = typeof input === "string" ? URL.parse(input) : null;
    if (!url || !["http:", "https:"].includes(url.protocol) || url.username || url.password) {
      throw new Error("This Jira link is unavailable.");
    }
    await shell.openExternal(url.href);
  });

  ipcMain.handle(workflowChannels.issue, async (event, key: unknown) => {
    trustedWindow(event);
    const issue = await createAtlassianClient().issue(issueKey(key));
    trustedWindow(event);
    let cache = inspectedIssues.get(event.sender);
    if (!cache) {
      cache = new Map();
      inspectedIssues.set(event.sender, cache);
    }
    cache.delete(issue.key);
    cache.set(issue.key, issue);
    const oldest = cache.keys().next().value;
    if (cache.size > 10 && oldest) cache.delete(oldest);
    return issue;
  });

  function startPlan(record: WorkflowRecord, source: WorkItem): void {
    const control = new AbortController();
    const clarifications = record.plan?.clarifications;
    running.set(record.id, control);
    void runPlanning(
      record.provider,
      source,
      record.workspacePath,
      control.signal,
      record.knowledge,
      clarifications,
    )
      .then((plan) => {
        if (!shuttingDown) {
          getStore().updatePlan(record.id, clarifications ? { ...plan, clarifications } : plan);
        }
      })
      .catch((error: unknown) => {
        console.error("Saving the planning result failed", error);
      })
      .finally(() => running.delete(record.id));
  }

  ipcMain.handle(workflowChannels.create, async (event, input: unknown) => {
    trustedWindow(event);
    if (
      !input ||
      typeof input !== "object" ||
      !("issueKey" in input) ||
      !("provider" in input) ||
      !("workspacePath" in input) ||
      !isWorkflowProvider(input.provider)
    ) {
      throw new Error("Select a Jira issue, provider and workspace.");
    }
    const { provider, workspacePath } = input;
    const noteIds = readKnowledgeNoteIds(
      "knowledgeNoteIds" in input ? input.knowledgeNoteIds : undefined,
    );
    const source = inspectedIssues.get(event.sender)?.get(issueKey(input.issueKey));
    if (!source) {
      throw new Error("Inspect the Jira issue before starting a plan.");
    }
    if (typeof workspacePath !== "string" || chosenWorkspaces.get(event.sender) !== workspacePath) {
      throw new Error("Choose the workspace through the folder picker.");
    }
    const path = await workspaceDirectory(workspacePath);
    trustedWindow(event);
    if (
      path !== workspacePath ||
      chosenWorkspaces.get(event.sender) !== path ||
      inspectedIssues.get(event.sender)?.get(source.key) !== source
    ) {
      throw new Error("The selected workspace or issue changed. Select it again.");
    }

    const database = getStore();
    const knowledge = noteIds.size
      ? database
          .listKnowledge()
          .filter(({ id }) => noteIds.has(id))
          .map(({ area, title, bodyText, paths }) => ({ area, title, bodyText, paths }))
      : [];
    if (knowledge.length !== noteIds.size) {
      throw new Error("A selected knowledge note is unavailable. Review your selection.");
    }

    try {
      const record = database.create({
        request: `${source.key} · ${source.title}`,
        provider,
        workspacePath: path,
        source,
        ...(knowledge.length ? { knowledge } : {}),
        plan: { state: "running" },
      });
      chosenWorkspaces.delete(event.sender);
      startPlan(record, source);
      return record;
    } catch (error) {
      console.error("Saving workflow failed", error);
      throw new Error("The workflow could not be saved. Try again.");
    }
  });

  async function resumePlan(event: IpcMainInvokeEvent, id: unknown, answer?: string) {
    trustedWindow(event);
    const database = getStore();
    const record = database.list().find((item) => item.id === id);
    if (!record?.source || record.plan?.state === "ready" || running.has(record.id)) {
      throw new Error("This workflow is unavailable to continue planning.");
    }
    const previousPlan = record.plan;
    const plan: WorkflowPlan = { state: "running" };
    if (answer !== undefined) {
      if (previousPlan?.state !== "needs-input") {
        throw new Error("This workflow is no longer waiting for an answer.");
      }
      plan.clarifications = [
        ...(previousPlan.clarifications ?? []),
        { questions: previousPlan.text, answer },
      ];
    } else if (previousPlan?.clarifications) {
      plan.clarifications = previousPlan.clarifications;
    }
    const path = await workspaceDirectory(record.workspacePath);
    trustedWindow(event);
    const latest = database.list().find((item) => item.id === id);
    if (
      !latest ||
      path !== latest.workspacePath ||
      running.has(record.id) ||
      JSON.stringify(latest.plan) !== JSON.stringify(previousPlan)
    ) {
      throw new Error("The workspace or plan changed. Review the current workflow and try again.");
    }
    const updated = { ...record, plan };
    database.updatePlan(updated.id, updated.plan);
    startPlan(updated, record.source);
    return updated;
  }

  ipcMain.handle(workflowChannels.retryPlan, (event, id: unknown) => resumePlan(event, id));
  ipcMain.handle(workflowChannels.answerPlan, (event, id: unknown, input: unknown) => {
    const answer = typeof input === "string" ? input.trim() : "";
    if (!answer) throw new Error("Enter an answer before continuing.");
    if (answer.length > maxPlanAnswerLength) {
      throw new Error(
        `Keep your answer within ${maxPlanAnswerLength.toLocaleString("en-US")} characters.`,
      );
    }
    return resumePlan(event, id, answer);
  });

  app.once("will-quit", () => {
    shuttingDown = true;
    for (const control of running.values()) control.abort();
    store?.close();
  });
}
