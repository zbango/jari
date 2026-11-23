import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { realpath, stat, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import {
  isWorkflowProvider,
  maxPlanAnswerLength,
  milestoneRequiresManualAction,
  nextManualMilestone,
  pendingMilestones,
  simulatedIssueLimits,
  workflowChannels,
  workflowSections,
  workflowSectionSources,
} from "@agent-desktop/shared";
import type {
  CustomPlanOptions,
  ProviderRunMetric,
  ProviderQuotaSnapshot,
  WorkItem,
  WorkflowBuild,
  WorkflowBuildTask,
  WorkflowMilestone,
  WorkflowPlan,
  WorkflowProvider,
  WorkflowSectionChange,
  WorkflowRecord,
} from "@agent-desktop/shared";
import { app, dialog, ipcMain, shell } from "electron";
import type { BrowserWindow, IpcMainInvokeEvent, WebContents } from "electron";
import { createAtlassianClient, issueKey, jiraId } from "./atlassian";
import { openCursor } from "./cursor";
import { readAtlassianConfig } from "./environment";
import { createJiraCache, jiraReply } from "./jira-cache";
import { readKnowledgeNote, readKnowledgeNoteIds } from "./knowledge";
import {
  generatePlanReview,
  getPlanningOptions,
  readProviderQuota,
  runBuild,
  runPlanning,
} from "./planner";
import type { TranscriptWriter } from "./providers/types";
import { readMilestoneInput, readStageSettings, runWorkflowCommand } from "./workflow-command";
import {
  captureTaskChanges,
  commitTaskChanges,
  prepareTaskGit,
  readCommitFileDiff,
  WorkspaceBaselineRequired,
} from "./workflow-git";
import { openWorkflowStore } from "./workflow-store";
import type { ProviderRunScope } from "./workflow-store";

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

function readSimulatedIssue(input: unknown): WorkItem {
  if (!input || typeof input !== "object" || !("title" in input) || !("description" in input)) {
    throw new Error("Enter a simulated issue title and description.");
  }
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const description = typeof input.description === "string" ? input.description.trim() : "";
  if (
    !title ||
    !description ||
    title.length > simulatedIssueLimits.title ||
    description.length > simulatedIssueLimits.description
  ) {
    throw new Error("Enter a title and description within the simulated issue limits.");
  }
  return {
    kind: "simulated",
    key: "SIM-1",
    title,
    description,
    status: "Simulated",
    comments: [],
    references: [],
    linkedIssues: [],
  };
}

function verifyPlanningSource(source: WorkItem): Promise<WorkItem> {
  return source.kind === "simulated"
    ? Promise.resolve(source)
    : createAtlassianClient().verifyPlanningIssue(source);
}

function createBuildTasks(
  review: NonNullable<Extract<WorkflowPlan, { state: "ready" }>["review"]>,
): WorkflowBuildTask[] {
  const steps = review.steps.length
    ? review.steps
    : [
        {
          title: "Implement the approved proposal",
          detail: review.proposal,
          files: review.files.map(({ path }) => path),
        },
      ];
  return steps.map((step, index) => ({
    ...step,
    id: String(index + 1),
    state: "queued",
    attempt: 0,
    revisions: [],
  }));
}

function readCustomPlanOptions(value: unknown): CustomPlanOptions | undefined {
  if (value === undefined) return;
  if (
    !value ||
    typeof value !== "object" ||
    !("skillIds" in value) ||
    !Array.isArray(value.skillIds) ||
    !value.skillIds.every((id: unknown) => typeof id === "string" && id.length > 0)
  ) {
    throw new Error("Review the selected planning skills.");
  }
  const model = "model" in value ? value.model : undefined;
  if (
    model !== undefined &&
    (typeof model !== "string" || !/^[a-zA-Z0-9][\w.:/@+[\]-]{0,199}$/.test(model))
  ) {
    throw new Error("Enter a valid provider model ID.");
  }
  const effort = "effort" in value ? value.effort : undefined;
  if (
    effort !== undefined &&
    (typeof effort !== "string" || !/^[a-z][a-z0-9_-]{0,31}$/.test(effort))
  ) {
    throw new Error("Select a valid reasoning effort.");
  }
  return {
    skillIds: [...new Set<string>(value.skillIds)],
    ...(model ? { model } : {}),
    ...(effort ? { effort } : {}),
  };
}

export function registerWorkflowHandlers(getWindow: () => BrowserWindow | null): void {
  const chosenWorkspaces = new WeakMap<WebContents, string>();
  const inspectedIssues = new WeakMap<WebContents, Map<string, WorkItem>>();
  const running = new Map<string, AbortController>();
  const building = new Map<string, { path: string; control: AbortController }>();
  const providerRuns = new Map<string, number>();
  const quotaRequests = new Map<WorkflowProvider, Promise<ProviderQuotaSnapshot>>();
  const quotaCache = new Map<WorkflowProvider, ProviderQuotaSnapshot>();
  const quotaControl = new AbortController();
  let shuttingDown = false;
  let store: ReturnType<typeof openWorkflowStore> | undefined;
  const readJira = createJiraCache(getStore);
  let jiraSession: { scope: string; client: ReturnType<typeof createAtlassianClient> } | undefined;

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

  async function measureProviderCall<T>(
    id: string,
    scope: ProviderRunScope,
    call: (write: TranscriptWriter) => Promise<T>,
    failed?: (result: T) => boolean,
  ): Promise<T> {
    const database = getStore();
    const { runId, write } = database.startProviderRun(id, scope);
    const started = performance.now();
    providerRuns.set(runId, started);
    let status: "completed" | "failed" = "failed";
    try {
      const transcript: TranscriptWriter = (kind, text) => {
        if (!shuttingDown) write(kind, text);
      };
      transcript.reportTokens = (usage) => {
        if (shuttingDown) return;
        try {
          database.saveProviderTokens(runId, usage);
        } catch (error) {
          console.error("Saving provider token usage failed", error);
        }
      };
      const result = await call(transcript);
      if (!failed?.(result)) status = "completed";
      return result;
    } finally {
      const durationMs = Math.round(performance.now() - started);
      providerRuns.delete(runId);
      if (!shuttingDown) database.finishProviderRun(runId, status, durationMs);
    }
  }

  function providerMetrics(id: string): ProviderRunMetric[] {
    return getStore()
      .providerRuns(id)
      .map((run) => {
        if (run.status !== "running") return run;
        const started = providerRuns.get(run.runId);
        return started === undefined
          ? { ...run, status: "interrupted" }
          : { ...run, durationMs: Math.round(performance.now() - started) };
      });
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

  function browseJira<T>(
    resource: string,
    sync: unknown,
    load: (client: ReturnType<typeof createAtlassianClient>) => Promise<T>,
  ) {
    const scope = createHash("sha256").update(JSON.stringify(readAtlassianConfig())).digest("hex");
    if (jiraSession?.scope !== scope) jiraSession = { scope, client: createAtlassianClient() };
    const { client } = jiraSession;
    return readJira(`v1:${scope}:${resource}`, sync !== false, () => load(client));
  }

  async function jiraBrowseReply<T>(
    resource: string,
    sync: unknown,
    load: (client: ReturnType<typeof createAtlassianClient>) => Promise<T>,
  ) {
    return jiraReply(await browseJira(resource, sync, load), sync);
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
        .map((record) => {
          const { plan, build } = record;
          if (!running.has(record.id)) {
            if (plan?.state === "running") record.plan = { ...plan, state: "interrupted" };
            if (plan?.state === "ready" && plan.reviewAttempt?.state === "running") {
              record.plan = {
                ...plan,
                reviewAttempt: { state: "failed", message: "Review generation was interrupted." },
              };
            }
          }
          if (build?.state === "running" && !building.has(record.id)) {
            record.build = {
              ...build,
              state: "interrupted",
              tasks: build.tasks?.map((task) =>
                task.state === "running" ? { ...task, state: "interrupted" } : task,
              ),
            };
            getStore().saveBuild(record.id, record.build);
          }
          if (
            !building.has(record.id) &&
            record.milestones?.some(({ state }) => state === "running")
          ) {
            record.milestones = record.milestones.map((milestone) =>
              milestone.state === "running"
                ? { ...milestone, state: "interrupted", message: "The command was interrupted." }
                : milestone,
            );
            getStore().saveMilestones(record.id, record.milestones);
          }
          if (
            record.build &&
            record.build.state !== "completed" &&
            !record.build.tasks &&
            plan?.state === "ready" &&
            plan.review
          ) {
            record.build.tasks = createBuildTasks(plan.review);
          }
          return record;
        });
    } catch (error) {
      console.error("Loading workflows failed", error);
      throw new Error("Saved workflows could not be loaded.");
    }
  });

  ipcMain.handle(workflowChannels.removeWorkflow, (event, id: unknown) => {
    trustedWindow(event);
    if (typeof id !== "string" || !id) throw new Error("Select a valid workflow.");
    if (running.has(id) || building.has(id)) {
      throw new Error("Wait for this workflow to finish before deleting it.");
    }
    getStore().removeWorkflow(id);
  });

  ipcMain.handle(workflowChannels.providerQuota, (event, provider: unknown) => {
    trustedWindow(event);
    if (!isWorkflowProvider(provider)) throw new Error("Select a supported provider.");
    const pending = quotaRequests.get(provider);
    if (pending) return pending;
    const cached = quotaCache.get(provider);
    if (cached && Date.now() - cached.checkedAt < 10_000) return cached;
    const directory = join(app.getPath("userData"), "provider-usage");
    mkdirSync(directory, { recursive: true });
    const signal = AbortSignal.any([AbortSignal.timeout(15_000), quotaControl.signal]);
    const request = readProviderQuota(provider, directory, signal)
      .catch(() => [])
      .then((windows): ProviderQuotaSnapshot => {
        const snapshot = { checkedAt: Date.now(), windows };
        quotaCache.set(provider, snapshot);
        return snapshot;
      })
      .finally(() => quotaRequests.delete(provider));
    quotaRequests.set(provider, request);
    return request;
  });

  ipcMain.handle(workflowChannels.readTranscript, (event, id: unknown, after: unknown) => {
    trustedWindow(event);
    if (
      typeof id !== "string" ||
      typeof after !== "number" ||
      !Number.isSafeInteger(after) ||
      after < 0
    ) {
      throw new Error("Select a valid workflow transcript.");
    }
    const pageSize = 50;
    const entries = getStore().transcript(id, after, pageSize + 1);
    return {
      entries: entries.slice(0, pageSize),
      hasMore: entries.length > pageSize,
      runs: providerMetrics(id),
    };
  });

  ipcMain.handle(workflowChannels.exportTranscript, async (event, id: unknown) => {
    const window = trustedWindow(event);
    const database = getStore();
    const record = database.list().find((workflow) => workflow.id === id);
    if (!record) throw new Error("Select a saved workflow.");
    if (!database.transcript(record.id, 0, 1).length && !providerMetrics(record.id).length) {
      throw new Error("This workflow has no recorded provider calls yet.");
    }
    const { canceled, filePath } = await dialog.showSaveDialog(window, {
      title: "Export provider transcript",
      defaultPath: `workflow-${record.id}-transcript.txt`,
      filters: [{ name: "Plain text", extensions: ["txt"] }],
    });
    if (canceled || !filePath) return false;
    trustedWindow(event);
    const entries = database.transcript(record.id);
    const runs = providerMetrics(record.id);
    if (!entries.length && !runs.length)
      throw new Error("This workflow no longer has a provider transcript.");
    const messages = entries.map(({ createdAt, phase, taskId, attempt, runId, kind, text }) => {
      const scope = taskId === null ? phase : `${phase} · Task ${taskId} · Attempt ${attempt}`;
      return `[${createdAt}] ${scope} · ${runId} · ${kind}\n${text}`;
    });
    const timing = runs.map(
      ({ startedAt, phase, taskId, attempt, runId, status, durationMs, tokens }) => {
        const scope = taskId === null ? phase : `${phase} · Task ${taskId} · Attempt ${attempt}`;
        const usage = tokens
          ? ` · ${tokens.input} input tokens · ${tokens.output} output tokens`
          : "";
        return `[${startedAt}] ${scope} · ${runId} · ${status} · ${durationMs === null ? "Duration unavailable" : `${durationMs} ms`}${usage}`;
      },
    );
    await writeFile(
      filePath,
      `Workflow ${record.id} · ${record.provider}\n\n${timing.length ? `Provider call durations\n${timing.join("\n")}\n\n` : ""}${messages.join("\n\n")}\n`,
      {
        encoding: "utf8",
        mode: 0o600,
      },
    );
    return true;
  });

  ipcMain.handle(workflowChannels.restoreWorkspace, async (event) => {
    trustedWindow(event);
    const database = getStore();
    const saved = database.lastWorkspace();
    if (!saved) return null;
    const path = await workspaceDirectory(saved);
    trustedWindow(event);
    if (path !== saved || database.lastWorkspace() !== saved) {
      throw new Error("The saved workspace folder changed. Choose it again.");
    }
    chosenWorkspaces.set(event.sender, path);
    return path;
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
    getStore().saveWorkspace(path);
    chosenWorkspaces.set(event.sender, path);
    return path;
  });

  ipcMain.handle(workflowChannels.openWorkspaceInCursor, async (event, id: unknown) => {
    trustedWindow(event);
    const workflow = getStore()
      .list()
      .find((record) => record.id === id);
    if (!workflow) throw new Error("Select a saved workflow.");
    const path = await workspaceDirectory(workflow.workspacePath);
    trustedWindow(event);
    if (path !== workflow.workspacePath) throw new Error("The saved workspace folder changed.");
    await openCursor(path);
  });

  ipcMain.handle(
    workflowChannels.planningOptions,
    async (event, provider: unknown, path: unknown, id: unknown) => {
      trustedWindow(event);
      const canReadWorkspace = () =>
        typeof id === "string"
          ? getStore()
              .list()
              .some((record) => record.id === id && record.workspacePath === path)
          : chosenWorkspaces.get(event.sender) === path;
      if (!isWorkflowProvider(provider) || typeof path !== "string" || !canReadWorkspace()) {
        throw new Error("Select a provider and choose a workspace through the folder picker.");
      }
      if ((await workspaceDirectory(path)) !== path) {
        throw new Error("The workspace folder changed. Choose it again.");
      }
      try {
        const options = await getPlanningOptions(provider, path, AbortSignal.timeout(20_000));
        trustedWindow(event);
        if (!canReadWorkspace()) {
          throw new Error("The workspace folder changed. Choose it again.");
        }
        return options;
      } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") {
          throw new Error(
            "The provider CLI was not found. Install it or configure its executable path.",
          );
        }
        throw error;
      }
    },
  );

  ipcMain.handle(workflowChannels.assignedSprintIssues, (event, sync: unknown) => {
    trustedWindow(event);
    return jiraBrowseReply("assigned", sync, (client) => client.assignedSprintIssues());
  });

  ipcMain.handle(workflowChannels.boards, (event, sync: unknown) => {
    trustedWindow(event);
    return jiraBrowseReply("boards", sync, (client) => client.boards());
  });

  ipcMain.handle(workflowChannels.activeSprints, (event, board: unknown, sync: unknown) => {
    trustedWindow(event);
    const id = jiraId(board);
    return jiraBrowseReply(`sprints:${id}`, sync, (client) => client.activeSprints(id));
  });

  ipcMain.handle(
    workflowChannels.sprintIssues,
    (event, board: unknown, sprint: unknown, sync: unknown) => {
      trustedWindow(event);
      const boardId = jiraId(board);
      const sprintId = jiraId(sprint);
      return jiraBrowseReply(`sprint:${boardId}:${sprintId}`, sync, (client) =>
        client.sprintIssues(boardId, sprintId),
      );
    },
  );

  ipcMain.handle(workflowChannels.openJiraLink, async (event, input: unknown) => {
    trustedWindow(event);
    const url = typeof input === "string" ? URL.parse(input) : null;
    if (!url || !["http:", "https:"].includes(url.protocol) || url.username || url.password) {
      throw new Error("This Jira link is unavailable.");
    }
    await shell.openExternal(url.href);
  });

  function browseIssue(key: unknown, sync: unknown) {
    const id = issueKey(key);
    return browseJira(`issue:${id}`, sync, (client) => client.issue(id));
  }

  ipcMain.handle(workflowChannels.linkedIssue, async (event, key: unknown, sync: unknown) => {
    trustedWindow(event);
    return jiraReply(await browseIssue(key, sync), sync);
  });

  ipcMain.handle(workflowChannels.issue, async (event, key: unknown, sync: unknown) => {
    trustedWindow(event);
    const response = await browseIssue(key, sync);
    trustedWindow(event);
    const issue = response.data;
    let cache = inspectedIssues.get(event.sender);
    if (!cache) {
      cache = new Map();
      inspectedIssues.set(event.sender, cache);
    }
    cache.delete(issue.key);
    cache.set(issue.key, issue);
    const oldest = cache.keys().next().value;
    if (cache.size > 10 && oldest) cache.delete(oldest);
    return jiraReply(response, sync);
  });

  function startPlan(record: WorkflowRecord, source: WorkItem): void {
    const control = new AbortController();
    const { clarifications, custom, revision } = record.plan ?? {};
    running.set(record.id, control);
    void measureProviderCall(
      record.id,
      { phase: "Plan" },
      (write) =>
        runPlanning(
          record.provider,
          source,
          record.workspacePath,
          control.signal,
          record.knowledge,
          clarifications,
          custom,
          write,
          revision,
        ),
      (result) => result.state === "failed",
    )
      .then(async (result) => {
        if (shuttingDown) return;
        const plan = {
          ...result,
          ...(clarifications ? { clarifications } : {}),
          ...(custom ? { custom } : {}),
          ...(revision ? { revision } : {}),
        };
        if (plan.state === "ready" && !plan.review) {
          getStore().updatePlan(record.id, { ...plan, reviewAttempt: { state: "running" } });
          await savePlanReview(record, source, plan, control.signal);
        } else {
          getStore().updatePlan(record.id, plan);
        }
      })
      .catch((error: unknown) => {
        console.error("Saving the planning result failed", error);
      })
      .finally(() => running.delete(record.id));
  }

  async function savePlanReview(
    record: WorkflowRecord,
    source: WorkItem,
    plan: Extract<WorkflowPlan, { state: "ready" }>,
    signal: AbortSignal,
  ) {
    let updated: WorkflowPlan;
    try {
      const review = await measureProviderCall(record.id, { phase: "Plan review" }, (write) =>
        generatePlanReview(record.provider, source, record.workspacePath, plan, signal, write),
      );
      updated = { ...plan, review, reviewAttempt: undefined };
    } catch (error) {
      updated = {
        ...plan,
        reviewAttempt: {
          state: "failed",
          message:
            error instanceof Error
              ? error.message
              : "The structured review could not be generated.",
        },
      };
    }
    if (!shuttingDown) getStore().updatePlan(record.id, updated);
  }

  ipcMain.handle(workflowChannels.generatePlanReview, async (event, id: unknown) => {
    trustedWindow(event);
    const database = getStore();
    const record = database.list().find((item) => item.id === id);
    const plan = record?.plan;
    if (!record?.source || plan?.state !== "ready" || plan.review || running.has(record.id)) {
      throw new Error("This plan is unavailable for review generation.");
    }
    const path = await workspaceDirectory(record.workspacePath);
    trustedWindow(event);
    const latest = database.list().find((item) => item.id === id);
    if (
      path !== record.workspacePath ||
      running.has(record.id) ||
      JSON.stringify(latest?.plan) !== JSON.stringify(plan)
    ) {
      throw new Error("The workspace or plan changed. Reopen the workflow and try again.");
    }
    const reviewPlan = { ...plan, reviewAttempt: { state: "running" as const } };
    const control = new AbortController();
    database.updatePlan(record.id, reviewPlan);
    running.set(record.id, control);
    void savePlanReview(record, record.source, plan, control.signal)
      .catch((error: unknown) => console.error("Saving structured review failed", error))
      .finally(() => running.delete(record.id));
    return { ...record, plan: reviewPlan };
  });

  ipcMain.handle(workflowChannels.approvePlan, (event, id: unknown) => {
    trustedWindow(event);
    const database = getStore();
    const record = database.list().find((item) => item.id === id);
    if (!record?.source || record.plan?.state !== "ready" || !record.plan.review) {
      throw new Error("Generate and review the structured plan before approving it.");
    }
    if (record.build) return record;
    const build: WorkflowBuild = {
      state: "ready",
      approvedAt: new Date().toISOString(),
      tasks: createBuildTasks(record.plan.review),
    };
    database.saveBuild(record.id, build);
    return { ...record, build };
  });

  function milestoneWorkflow(id: unknown) {
    const record = getStore()
      .list()
      .find((item) => item.id === id);
    if (!record) throw new Error("Select a saved workflow.");
    if (building.has(record.id)) throw new Error("Wait for workspace execution to finish.");
    return record;
  }

  function checkMilestoneEdit(record: WorkflowRecord, milestone?: WorkflowMilestone) {
    if (milestone?.state === "completed") throw new Error("This milestone has already completed.");
    if (
      milestone?.timing === "before-build" &&
      (record.build?.state === "review" ||
        record.build?.state === "completed" ||
        record.build?.tasks?.some(({ state }) => state === "approved"))
    ) {
      throw new Error("Before Build hooks must be configured before the first task is reviewed.");
    }
  }

  ipcMain.handle(
    workflowChannels.saveStageSettings,
    (event, id: unknown, stage: unknown, input: unknown) => {
      trustedWindow(event);
      if (stage !== "idea" && stage !== "plan" && stage !== "build") {
        throw new Error("Select a workflow milestone.");
      }
      const database = getStore();
      const record = database.list().find((item) => item.id === id);
      if (!record) throw new Error("Select a saved workflow.");
      const stageSettings = {
        ...record.stageSettings,
        [stage]: { ...record.stageSettings?.[stage], ...readStageSettings(input) },
      };
      database.saveStageSettings(record.id, stageSettings);
      return { ...record, stageSettings };
    },
  );

  ipcMain.handle(
    workflowChannels.editWorkflowSection,
    (event, id: unknown, stage: unknown, value: unknown) => {
      trustedWindow(event);
      if (stage !== "idea" && stage !== "plan" && stage !== "build")
        throw new Error("Select a workflow milestone.");
      const database = getStore();
      const record = database.list().find((entry) => entry.id === id);
      if (!record) throw new Error("Select a saved workflow.");
      if (!value || typeof value !== "object") throw new Error("Choose a canvas detail to edit.");
      const change = value as WorkflowSectionChange;
      const sections = [...workflowSections(stage, record.stageSettings)];
      const index = sections.findIndex((section) => section.id === change.id);
      if (change.id !== null && index === -1)
        throw new Error("This canvas detail no longer exists.");
      if (change.action === "remove" && index >= 0) {
        sections.splice(index, 1);
      } else if (change.action === "save" && change.input && typeof change.input === "object") {
        const { source, title, notes } = change.input;
        if (
          typeof source !== "string" ||
          (source !== "note" && !Object.hasOwn(workflowSectionSources[stage], source))
        ) {
          throw new Error("Choose a supported detail type.");
        }
        if (
          source !== "note" &&
          sections.some((section, offset) => offset !== index && section.source === source)
        ) {
          throw new Error("This view is already on the milestone.");
        }
        if (
          typeof title !== "string" ||
          !title.trim() ||
          title.length > 80 ||
          typeof notes !== "string" ||
          notes.length > 24_000
        ) {
          throw new Error(
            "Enter a name of up to 80 characters and notes of up to 24,000 characters.",
          );
        }
        const section = {
          id: sections[index]?.id ?? randomUUID(),
          source,
          title: title.trim(),
          notes,
        };
        if (index < 0) sections.push(section);
        else sections[index] = section;
      } else {
        throw new Error("Choose a canvas detail to edit.");
      }
      const stageSettings = {
        ...record.stageSettings,
        [stage]: { ...record.stageSettings?.[stage], sections },
      };
      database.saveStageSettings(record.id, stageSettings);
      return { ...record, stageSettings };
    },
  );

  ipcMain.handle(
    workflowChannels.saveMilestone,
    (event, id: unknown, milestoneId: unknown, input: unknown) => {
      trustedWindow(event);
      const record = milestoneWorkflow(id);
      const definition = readMilestoneInput(input);
      const milestones = [...(record.milestones ?? [])];
      const index = milestones.findIndex((milestone) => milestone.id === milestoneId);
      if (milestoneId !== null && index === -1) throw new Error("This milestone no longer exists.");
      const previous = milestones[index];
      // Normalize older command records before comparing their execution settings.
      const executionSettings = ({
        title: _title,
        description: _description,
        ...settings
      }: ReturnType<typeof readMilestoneInput>) => JSON.stringify(settings);
      const sameExecution =
        previous &&
        executionSettings(readMilestoneInput(previous)) === executionSettings(definition);
      const milestone: WorkflowMilestone = sameExecution
        ? { ...previous, ...definition }
        : { ...definition, id: previous?.id ?? randomUUID(), state: "ready" };
      if (!sameExecution) {
        checkMilestoneEdit(record, previous);
        checkMilestoneEdit(record, milestone);
      }
      if (previous) milestones[index] = milestone;
      else milestones.push(milestone);
      getStore().saveMilestones(record.id, milestones);
      return { ...record, milestones };
    },
  );

  ipcMain.handle(workflowChannels.removeMilestone, (event, id: unknown, milestoneId: unknown) => {
    trustedWindow(event);
    const record = milestoneWorkflow(id);
    const milestone = record.milestones?.find((entry) => entry.id === milestoneId);
    if (!milestone) throw new Error("This milestone no longer exists.");
    checkMilestoneEdit(record, milestone);
    const milestones = record.milestones!.filter((entry) => entry.id !== milestoneId);
    getStore().saveMilestones(record.id, milestones);
    return { ...record, milestones };
  });

  async function executeMilestones(
    record: WorkflowRecord,
    queue: WorkflowMilestone[],
    signal: AbortSignal,
    explicitId?: string,
  ) {
    const database = getStore();
    for (const milestone of queue) {
      signal.throwIfAborted();
      if (
        milestone.action === "checkpoint" ||
        (milestoneRequiresManualAction(milestone) && milestone.id !== explicitId)
      ) {
        return { milestone, paused: true };
      }
      const updateMilestone = (updated: WorkflowMilestone) => {
        record.milestones = record.milestones?.map((entry) =>
          entry.id === milestone.id ? updated : entry,
        );
        if (!shuttingDown && record.milestones)
          database.saveMilestones(record.id, record.milestones);
      };
      const active = {
        ...milestone,
        state: "running" as const,
        message: undefined,
        output: undefined,
      };
      updateMilestone(active);
      let result: Pick<WorkflowMilestone, "state" | "output" | "message">;
      try {
        const path = await workspaceDirectory(record.workspacePath);
        if (path !== record.workspacePath) throw new Error("The workspace folder changed.");
        signal.throwIfAborted();
        result = await runWorkflowCommand(active, path, signal);
      } catch (error) {
        const message = error instanceof Error ? error.message : "The command could not start.";
        result = { state: signal.aborted ? "interrupted" : "failed", message };
      }
      updateMilestone({ ...active, ...result });
      if (result.state !== "completed") return { milestone, paused: false };
    }
  }

  function checkWorkspaceAvailable(record: WorkflowRecord) {
    if ([...building.values()].some(({ path }) => path === record.workspacePath)) {
      throw new Error("A task is already running in this workspace.");
    }
  }

  function startMilestones(
    record: WorkflowRecord,
    queue: WorkflowMilestone[],
    explicitId?: string,
  ) {
    const first = queue[0];
    if (!first || (milestoneRequiresManualAction(first) && first.id !== explicitId)) return record;
    checkWorkspaceAvailable(record);
    const control = new AbortController();
    building.set(record.id, { path: record.workspacePath, control });
    void executeMilestones(record, queue, control.signal, explicitId)
      .catch((error: unknown) => console.error("Executing milestones failed", error))
      .finally(() => building.delete(record.id));
    return record;
  }

  ipcMain.handle(workflowChannels.runMilestone, (event, id: unknown, milestoneId: unknown) => {
    trustedWindow(event);
    const record = milestoneWorkflow(id);
    const next = nextManualMilestone(record);
    if (!next && record.build?.state !== "completed") throw new Error("Complete Build first.");
    if (!next || next.id !== milestoneId) {
      throw new Error("Run or approve the next unfinished milestone in the flow.");
    }
    const hooks = pendingMilestones(record.milestones, "after-build");
    checkWorkspaceAvailable(record);
    if (next.action === "checkpoint") {
      record.milestones = record.milestones?.map((milestone) =>
        milestone.id === next.id
          ? { ...milestone, state: "completed", message: undefined }
          : milestone,
      );
      getStore().saveMilestones(record.id, record.milestones ?? []);
      return next.timing === "after-build" ? startMilestones(record, hooks.slice(1)) : record;
    }
    return startMilestones(record, next.timing === "after-build" ? hooks : [next], next.id);
  });

  function startBuildTask(
    record: WorkflowRecord,
    source: WorkItem,
    plan: Extract<WorkflowPlan, { state: "ready" }>,
    build: WorkflowBuild,
    tasks: WorkflowBuildTask[],
    task: WorkflowBuildTask,
    baselineFiles?: string[],
  ) {
    const { id, workspacePath } = record;
    checkWorkspaceAvailable(record);
    const database = getStore();
    const activeTask: WorkflowBuildTask = {
      ...task,
      state: "running",
      attempt: task.attempt + 1,
      summary: undefined,
      message: undefined,
      git: task.git && { branch: task.git.branch, base: task.git.base },
    };
    const replaceTask = (updated: WorkflowBuildTask) =>
      tasks.map((entry) => (entry.id === updated.id ? updated : entry));
    const activeTasks = replaceTask(activeTask);
    const activeBuild: WorkflowBuild = {
      approvedAt: build.approvedAt,
      state: "running",
      tasks: activeTasks,
    };
    const control = new AbortController();
    database.saveBuild(id, activeBuild);
    building.set(id, { path: workspacePath, control });

    async function implement() {
      const path = await workspaceDirectory(workspacePath);
      if (path !== workspacePath)
        throw new Error("The workspace folder changed. Review the workflow before building.");
      control.signal.throwIfAborted();
      const verified = await verifyPlanningSource(source);
      control.signal.throwIfAborted();
      activeTask.git = await prepareTaskGit(path, activeTask.git, baselineFiles);
      baselineFiles = undefined;
      control.signal.throwIfAborted();
      if (!shuttingDown) database.saveBuild(id, activeBuild);
      const blocked = await executeMilestones(
        record,
        pendingMilestones(record.milestones, "before-build"),
        control.signal,
      );
      if (blocked?.paused) return;
      if (blocked)
        throw new Error(
          `Before Build hook failed: ${blocked.milestone.title}. Open it for details.`,
        );
      control.signal.throwIfAborted();
      const summary = await measureProviderCall(
        id,
        { phase: "Build", taskId: activeTask.id, attempt: activeTask.attempt },
        (write) =>
          runBuild(
            record.provider,
            verified,
            path,
            plan,
            activeTask,
            activeTasks,
            control.signal,
            write,
          ),
      );
      control.signal.throwIfAborted();
      const git = await captureTaskChanges(path, activeTask.git, task.title);
      return { summary, git };
    }

    void implement()
      .then(
        (result) => {
          if (shuttingDown) return;
          database.saveBuild(
            id,
            result
              ? {
                  ...activeBuild,
                  state: "review",
                  tasks: replaceTask({ ...activeTask, state: "review", ...result }),
                }
              : {
                  ...activeBuild,
                  state: "ready",
                  tasks: replaceTask({ ...task, git: activeTask.git }),
                },
          );
        },
        (error: unknown) => {
          if (!shuttingDown) {
            const message = error instanceof Error ? error.message : "The build task failed.";
            const files = error instanceof WorkspaceBaselineRequired ? error.files : baselineFiles;
            database.saveBuild(id, {
              ...activeBuild,
              state: "failed",
              message,
              ...(files?.length ? { baselineFiles: files } : {}),
              tasks: replaceTask({
                ...activeTask,
                attempt: activeTask.git ? activeTask.attempt : task.attempt,
                state: "failed",
                message,
              }),
            });
          }
        },
      )
      .catch((error: unknown) => console.error("Saving the Build result failed", error))
      .finally(() => building.delete(id));
    return { ...record, build: activeBuild };
  }

  ipcMain.handle(workflowChannels.startBuild, (event, id: unknown, commitBaseline: unknown) => {
    trustedWindow(event);
    const record = getStore()
      .list()
      .find((item) => item.id === id);
    const plan = record?.plan;
    const build = record?.build;
    if (
      !record?.source ||
      plan?.state !== "ready" ||
      !plan.review ||
      !build ||
      build.state === "completed"
    ) {
      throw new Error("Approve the structured plan before starting Build.");
    }
    const tasks = build.tasks ?? createBuildTasks(plan.review);
    const before = pendingMilestones(record.milestones, "before-build")[0];
    if (before && milestoneRequiresManualAction(before)) {
      const action = before.action === "checkpoint" ? "Approve" : "Run";
      throw new Error(`${action} ${before.title} on the canvas before starting Build.`);
    }
    const task = tasks.find((entry) => entry.state !== "approved");
    if (!task || task.state === "review") {
      throw new Error("Review the current task before continuing Build.");
    }
    const baselineFiles = build.state === "failed" ? build.baselineFiles : undefined;
    if (commitBaseline === true && !baselineFiles?.length) {
      throw new Error("Review the initial Git commit before continuing.");
    }
    return startBuildTask(
      record,
      record.source,
      plan,
      build,
      tasks,
      task,
      commitBaseline === true ? baselineFiles : undefined,
    );
  });

  ipcMain.handle(workflowChannels.reviewBuildTask, async (event, id: unknown, input: unknown) => {
    trustedWindow(event);
    if (!input || typeof input !== "object" || !("taskId" in input) || !("attempt" in input)) {
      throw new Error("Select the task attempt you reviewed.");
    }
    const database = getStore();
    const record = database.list().find((item) => item.id === id);
    const plan = record?.plan;
    const build = record?.build;
    const task = build?.tasks?.find((entry) => entry.state !== "approved");
    if (
      !record?.source ||
      plan?.state !== "ready" ||
      build?.state !== "review" ||
      !build.tasks ||
      task?.state !== "review" ||
      task.id !== input.taskId ||
      task.attempt !== input.attempt ||
      building.has(record.id)
    ) {
      throw new Error("This task attempt has changed. Review its latest result.");
    }

    if ("feedback" in input) {
      const feedback = typeof input.feedback === "string" ? input.feedback.trim() : "";
      if (!feedback || feedback.length > maxPlanAnswerLength) {
        throw new Error(`Enter feedback between 1 and ${maxPlanAnswerLength} characters.`);
      }
      const revision = {
        ...task,
        revisions: [...task.revisions, { summary: task.summary ?? "", feedback }],
      };
      return startBuildTask(record, record.source, plan, build, build.tasks, revision);
    }

    if (!task.git?.review) {
      throw new Error(
        "This task has no Git review snapshot. Request another run from a clean Git workspace.",
      );
    }
    if ([...building.values()].some(({ path }) => path === record.workspacePath)) {
      throw new Error("A task is already running in this workspace.");
    }
    const control = new AbortController();
    building.set(record.id, { path: record.workspacePath, control });
    let git: WorkflowBuildTask["git"];
    try {
      const path = await workspaceDirectory(record.workspacePath);
      if (path !== record.workspacePath) throw new Error("The workspace folder changed.");
      control.signal.throwIfAborted();
      git = await commitTaskChanges(
        path,
        task.git,
        `${record.id}/${task.id}/${task.attempt}`,
        "commitSubject" in input ? input.commitSubject : undefined,
      );
      control.signal.throwIfAborted();
    } finally {
      building.delete(record.id);
    }
    const tasks = build.tasks.map((entry) =>
      entry.id === task.id ? { ...entry, state: "approved" as const, git } : entry,
    );
    const next = tasks.find((entry) => entry.state === "queued");
    if (next) {
      const ready: WorkflowBuild = { ...build, state: "ready", tasks };
      database.saveBuild(record.id, ready);
      return startBuildTask(record, record.source, plan, ready, tasks, next);
    }

    const completed: WorkflowBuild = {
      approvedAt: build.approvedAt,
      state: "completed",
      summary: "All Build tasks approved.",
      tasks,
    };
    database.saveBuild(record.id, completed);
    return startMilestones(
      { ...record, build: completed },
      pendingMilestones(record.milestones, "after-build"),
    );
  });

  ipcMain.handle(
    workflowChannels.readBuildCommitDiff,
    async (event, id: unknown, taskId: unknown, file: unknown) => {
      trustedWindow(event);
      const record = getStore()
        .list()
        .find((workflow) => workflow.id === id);
      const task = record?.build?.tasks?.find((entry) => entry.id === taskId);
      if (
        !record ||
        !task?.git?.commit ||
        typeof file !== "string" ||
        !task.git.review?.files.includes(file)
      ) {
        throw new Error("Select a file from this task's approved commit.");
      }
      const path = await workspaceDirectory(record.workspacePath);
      trustedWindow(event);
      if (path !== record.workspacePath) throw new Error("The saved workspace folder changed.");
      return readCommitFileDiff(path, task.git.commit.hash, file);
    },
  );

  ipcMain.handle(workflowChannels.create, async (event, input: unknown) => {
    trustedWindow(event);
    if (
      !input ||
      typeof input !== "object" ||
      "issueKey" in input === "simulatedIssue" in input ||
      !("provider" in input) ||
      !("workspacePath" in input) ||
      !isWorkflowProvider(input.provider)
    ) {
      throw new Error("Choose an issue source, provider and workspace.");
    }
    const { provider, workspacePath } = input;
    const custom = readCustomPlanOptions("customPlan" in input ? input.customPlan : undefined);
    const noteIds = readKnowledgeNoteIds(
      "knowledgeNoteIds" in input ? input.knowledgeNoteIds : undefined,
    );
    const source =
      "simulatedIssue" in input
        ? readSimulatedIssue(input.simulatedIssue)
        : inspectedIssues
            .get(event.sender)
            ?.get(issueKey("issueKey" in input ? input.issueKey : undefined));
    if (!source) {
      throw new Error("Inspect the Jira issue before starting a plan.");
    }
    if (typeof workspacePath !== "string" || chosenWorkspaces.get(event.sender) !== workspacePath) {
      throw new Error("Choose the workspace through the folder picker.");
    }
    const path = await workspaceDirectory(workspacePath);
    const verifiedSource = await verifyPlanningSource(source);
    trustedWindow(event);
    if (
      path !== workspacePath ||
      chosenWorkspaces.get(event.sender) !== path ||
      (source.kind !== "simulated" && inspectedIssues.get(event.sender)?.get(source.key) !== source)
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
        source: verifiedSource,
        ...(knowledge.length ? { knowledge } : {}),
        plan: { state: "running", ...(custom ? { custom } : {}) },
      });
      chosenWorkspaces.delete(event.sender);
      startPlan(record, verifiedSource);
      return record;
    } catch (error) {
      console.error("Saving workflow failed", error);
      throw new Error("The workflow could not be saved. Try again.");
    }
  });

  ipcMain.handle(workflowChannels.replayPlan, async (event, id: unknown, input: unknown) => {
    trustedWindow(event);
    const database = getStore();
    const record = database.list().find((item) => item.id === id);
    if (!record?.source || !record.plan || running.has(record.id) || building.has(record.id)) {
      throw new Error("Wait for the workflow to finish before replaying its plan.");
    }
    if (!input || typeof input !== "object" || !("mode" in input)) {
      throw new Error("Choose how to replay the plan.");
    }
    const plan: WorkflowPlan = { state: "running" };
    let provider = record.provider;
    if (input.mode === "revise") {
      const feedback =
        "feedback" in input && typeof input.feedback === "string" ? input.feedback.trim() : "";
      if (record.plan.state !== "ready" || !feedback || feedback.length > maxPlanAnswerLength) {
        throw new Error("Choose a completed plan and describe what should change.");
      }
      plan.revision = { previousPlan: record.plan.text, feedback };
      plan.custom = record.plan.custom;
      plan.clarifications = record.plan.clarifications;
    } else if (
      input.mode === "fresh" &&
      "provider" in input &&
      isWorkflowProvider(input.provider)
    ) {
      provider = input.provider;
      plan.custom = readCustomPlanOptions("customPlan" in input ? input.customPlan : undefined);
    } else {
      throw new Error("Choose a provider and how to replay the plan.");
    }

    const path = await workspaceDirectory(record.workspacePath);
    const source = await verifyPlanningSource(record.source);
    trustedWindow(event);
    if (
      path !== record.workspacePath ||
      running.has(record.id) ||
      building.has(record.id) ||
      !database.list().some((candidate) => candidate.id === record.id)
    ) {
      throw new Error("The workflow or its workspace changed. Reopen it and try again.");
    }
    const replay = database.create({
      request: `${source.key} · ${source.title} · ${plan.revision ? "Revised plan" : "Fresh plan"}`,
      provider,
      workspacePath: path,
      source,
      knowledge: record.knowledge,
      plan,
    });
    startPlan(replay, source);
    return replay;
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
    if (previousPlan?.custom) plan.custom = previousPlan.custom;
    if (previousPlan?.revision) plan.revision = previousPlan.revision;
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
    const verifiedSource = await verifyPlanningSource(record.source);
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
    startPlan(updated, verifiedSource);
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
    quotaControl.abort();
    for (const [runId, started] of providerRuns) {
      store?.finishProviderRun(runId, "interrupted", Math.round(performance.now() - started));
    }
    for (const control of running.values()) control.abort();
    for (const { control } of building.values()) control.abort();
    store?.close();
  });
}
