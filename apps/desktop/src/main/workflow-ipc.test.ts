import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { workflowChannels } from "@agent-desktop/shared";
import type { WorkflowRecord } from "@agent-desktop/shared";
import { expect, it, vi } from "vitest";
import { createAtlassianClient } from "./atlassian";
import { openCursor } from "./cursor";
import { generatePlanReview, readProviderQuota, runBuild, runPlanning } from "./planner";
import { registerWorkflowHandlers } from "./workflow-ipc";
import { openWorkflowStore } from "./workflow-store";

const { handles, getPath, showOpenDialog, showSaveDialog, once } = vi.hoisted(() => ({
  handles: new Map<string, (event: unknown, ...args: unknown[]) => unknown>(),
  getPath: vi.fn(),
  showOpenDialog: vi.fn(),
  showSaveDialog: vi.fn(),
  once: vi.fn(),
}));

vi.mock("electron", () => ({
  app: { getPath, once },
  dialog: { showOpenDialog, showSaveDialog },
  ipcMain: {
    handle: (channel: string, handler: (event: unknown, ...args: unknown[]) => unknown) =>
      handles.set(channel, handler),
  },
  shell: {},
}));
vi.mock("./atlassian", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./atlassian")>()),
  createAtlassianClient: vi.fn(),
}));
vi.mock("./planner", () => ({
  runPlanning: vi.fn(),
  getPlanningOptions: vi.fn(),
  generatePlanReview: vi.fn(),
  runBuild: vi.fn(),
  readProviderQuota: vi.fn(),
}));
vi.mock("./cursor", () => ({ openCursor: vi.fn().mockResolvedValue(undefined) }));

it("runs and revises one approved Build task at a time", async () => {
  const directory = mkdtempSync(join(tmpdir(), "jari-simulate-issue-"));
  const workspace = join(directory, "workspace");
  mkdirSync(workspace);
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: workspace, encoding: "utf8" }).trim();
  writeFileSync(join(workspace, "README.md"), "# Existing workspace\n");
  writeFileSync(join(workspace, ".gitignore"), "fixture.local\n");
  writeFileSync(join(workspace, "fixture.local"), "Ignored fixture\n");
  getPath.mockReturnValue(directory);
  showOpenDialog.mockResolvedValue({ filePaths: [workspace], canceled: false });
  vi.mocked(runPlanning)
    .mockResolvedValueOnce({ state: "needs-input", text: "What should we scaffold?" })
    .mockResolvedValueOnce({ state: "ready", text: "Scaffold Pocket Tasks." });
  const review = {
    proposal: "Scaffold a small tracker.",
    findings: ["The workspace has a README."],
    considerations: [],
    steps: [
      { title: "Add the entry point", detail: "Add the task view.", files: ["src/main.ts"] },
      { title: "Persist tasks", detail: "Store tasks locally.", files: ["src/storage.ts"] },
    ],
    files: [],
    reproduction: [],
    verification: ["Open the tracker."],
  };
  vi.mocked(generatePlanReview).mockResolvedValue(review);
  vi.mocked(runBuild).mockImplementation(
    async (_provider, _issue, _cwd, _plan, task, tasks, _signal, transcript) => {
      const result =
        task.id === "2"
          ? "Implemented local storage."
          : task.attempt === 1
            ? "Implemented the task view."
            : "Added an accessible label.";
      expect(readFileSync(join(workspace, "fixture.local"), "utf8")).toBe("prepared");
      transcript?.("user", JSON.stringify(tasks.map(({ id, state }) => ({ id, state }))));
      transcript?.("assistant", `  ${result}\n\n`);
      transcript?.reportTokens?.({ input: 540, output: 80, cacheRead: 120 });
      mkdirSync(join(workspace, "src"), { recursive: true });
      writeFileSync(join(workspace, task.id === "1" ? "src/main.ts" : "src/storage.ts"), result);
      return result;
    },
  );
  const sender = { mainFrame: {} };
  const event = { sender, senderFrame: sender.mainFrame };
  registerWorkflowHandlers(
    () =>
      ({ webContents: sender }) as unknown as ReturnType<
        Parameters<typeof registerWorkflowHandlers>[0]
      >,
  );
  const invoke = async (channel: string, ...args: unknown[]) =>
    await handles.get(channel)?.(event, ...args);
  const list = async () => (await invoke(workflowChannels.list)) as WorkflowRecord[];
  try {
    const workspacePath = await invoke(workflowChannels.chooseWorkspace);
    const fixture = { title: "Pocket Tasks", description: "Create a local task tracker." };
    const record = (await invoke(workflowChannels.create, {
      simulatedIssue: fixture,
      provider: "codex",
      workspacePath,
    })) as WorkflowRecord;
    expect(record.source).toMatchObject({ ...fixture, kind: "simulated", linkedIssues: [] });
    expect(record.source?.url).toBeUndefined();
    vi.mocked(readProviderQuota).mockResolvedValue([
      { label: "Codex · 5-hour", usedPercent: 25, resetsAt: null },
    ]);
    await expect(invoke(workflowChannels.providerQuota, "codex")).resolves.toMatchObject({
      windows: [{ usedPercent: 25 }],
    });
    await invoke(workflowChannels.providerQuota, "codex");
    expect(readProviderQuota).toHaveBeenCalledOnce();
    await expect(invoke(workflowChannels.providerQuota, "bogus")).rejects.toThrow(
      /supported provider/,
    );
    const edited = (await invoke(workflowChannels.editWorkflowSection, record.id, "plan", {
      action: "save",
      id: "context",
      input: { source: "context", title: "Project background", notes: "Ask the project owner." },
    })) as WorkflowRecord;
    expect(edited.stageSettings?.plan?.sections?.[0]).toMatchObject({
      id: "context",
      title: "Project background",
    });
    await invoke(workflowChannels.editWorkflowSection, record.id, "plan", {
      action: "remove",
      id: "risks",
    });
    const added = (await invoke(workflowChannels.editWorkflowSection, record.id, "plan", {
      action: "save",
      id: null,
      input: { source: "note", title: "Open questions", notes: "Who owns rollout?" },
    })) as WorkflowRecord;
    expect(added.stageSettings?.plan?.sections?.at(-1)).toMatchObject({
      source: "note",
      notes: "Who owns rollout?",
    });
    await invoke(workflowChannels.saveStageSettings, record.id, "plan", {
      title: "Planning",
      description: "Review the proposed plan.",
      expandDetails: "expanded",
    });
    expect((await list())[0]?.stageSettings?.plan?.sections).toEqual(
      added.stageSettings?.plan?.sections,
    );
    expect(added.stageSettings?.plan?.sections?.some(({ id }) => id === "risks")).toBe(false);
    await expect(
      invoke(workflowChannels.openWorkspaceInCursor, record.id),
    ).resolves.toBeUndefined();
    expect(openCursor).toHaveBeenCalledExactlyOnceWith(workspacePath);
    await expect(invoke(workflowChannels.openWorkspaceInCursor, "/arbitrary/path")).rejects.toThrow(
      /saved workflow/,
    );
    await vi.waitFor(async () => expect((await list())[0]?.plan?.state).toBe("needs-input"));
    await invoke(workflowChannels.answerPlan, record.id, "Use vanilla TypeScript.");
    await vi.waitFor(async () =>
      expect((await list())[0]?.plan).toMatchObject({
        state: "ready",
        text: "Scaffold Pocket Tasks.",
        review,
      }),
    );
    expect(runPlanning).toHaveBeenLastCalledWith(
      "codex",
      record.source,
      workspacePath,
      expect.any(AbortSignal),
      undefined,
      [{ questions: "What should we scaffold?", answer: "Use vanilla TypeScript." }],
      undefined,
      expect.any(Function),
      undefined,
    );
    expect(generatePlanReview).toHaveBeenCalledOnce();
    await expect(invoke(workflowChannels.startBuild, record.id)).rejects.toThrow(/Approve/);
    expect(runBuild).not.toHaveBeenCalled();
    const addCommand = async (title: string, timing: string, source: string) => {
      const updated = (await invoke(workflowChannels.saveMilestone, record.id, null, {
        title,
        timing,
        executable: process.execPath,
        args: ["-e", source],
      })) as WorkflowRecord;
      return updated.milestones!.at(-1)!.id;
    };
    const before = await addCommand(
      "Prepare workspace",
      "before-build",
      'require("node:fs").writeFileSync("fixture.local", "prepared"); console.log("prepared")',
    );
    const preflight = await addCommand("Review setup", "follow-up", 'console.log("unused")');
    await expect(
      invoke(workflowChannels.saveMilestone, record.id, preflight, {
        title: "Review setup",
        description: "Confirm the workspace is ready.",
        timing: "before-build",
        action: "checkpoint",
      }),
    ).resolves.toMatchObject({
      milestones: expect.arrayContaining([
        expect.objectContaining({ id: preflight, action: "checkpoint", timing: "before-build" }),
      ]),
    });
    const manual = (await invoke(workflowChannels.saveMilestone, record.id, null, {
      title: "Inspect setup",
      timing: "before-build",
      action: "command",
      trigger: "manual",
      executable: process.execPath,
      args: ["-e", 'console.log("inspected")'],
      timeoutMinutes: 2,
    })) as WorkflowRecord;
    const manualId = manual.milestones?.at(-1)?.id;
    await invoke(workflowChannels.saveMilestone, record.id, null, {
      title: "Review implementation",
      timing: "after-build",
      action: "checkpoint",
    });
    const afterReview = (await list())[0]?.milestones?.at(-1)?.id;
    const after = await addCommand(
      "Check output",
      "after-build",
      'if (require("node:fs").readFileSync("fixture.local", "utf8") !== "verify") process.exit(2); console.log("verified")',
    );
    const testing = await addCommand(
      "Testing",
      "follow-up",
      'console.log("x".repeat(140_000)); console.log("tests passed")',
    );
    const milestone = async (id: string | undefined) =>
      (await list())[0]?.milestones?.find((entry) => entry.id === id);
    const stageSettings = {
      title: "Implementation",
      description: "Implement approved tasks.",
      expandDetails: "collapsed",
    };
    await invoke(workflowChannels.saveStageSettings, record.id, "build", stageSettings);
    expect((await list())[0]?.stageSettings?.build).toEqual(stageSettings);
    await expect(invoke(workflowChannels.runMilestone, record.id, testing)).rejects.toThrow(
      /Complete Build/,
    );
    await expect(invoke(workflowChannels.approvePlan, record.id)).resolves.toMatchObject({
      build: {
        state: "ready",
        tasks: [
          { id: "1", state: "queued" },
          { id: "2", state: "queued" },
        ],
      },
    });
    expect(runBuild).not.toHaveBeenCalled();
    await expect(invoke(workflowChannels.startBuild, record.id)).resolves.toMatchObject({
      build: { state: "running", tasks: [{ state: "running" }, { state: "queued" }] },
    });
    const waitForBaseline = (files: string[]) =>
      vi.waitFor(async () =>
        expect((await list())[0]?.build).toMatchObject({ state: "failed", baselineFiles: files }),
      );
    await waitForBaseline([".gitignore", "README.md"]);
    expect(git("log", "--all", "--format=%s")).toBe("");
    expect(runBuild).not.toHaveBeenCalled();
    writeFileSync(join(workspace, "notes.txt"), "Added after the preview.\n");
    await invoke(workflowChannels.startBuild, record.id, true);
    await waitForBaseline([".gitignore", "README.md", "notes.txt"]);
    expect(git("log", "--all", "--format=%s")).toBe("");
    expect(runBuild).not.toHaveBeenCalled();
    git("config", "user.email", "jari-test@example.com");
    git("config", "user.name", "Jari Test");
    git("config", "commit.gpgsign", "false");
    await invoke(workflowChannels.startBuild, record.id, true);
    await vi.waitFor(async () => {
      expect(await milestone(before)).toMatchObject({ state: "completed", output: "prepared\n" });
      expect((await list())[0]?.build?.state).toBe("ready");
    });
    expect(runBuild).not.toHaveBeenCalled();
    await expect(invoke(workflowChannels.startBuild, record.id)).rejects.toThrow(
      /Approve Review setup/,
    );
    await invoke(workflowChannels.runMilestone, record.id, preflight);
    await expect(invoke(workflowChannels.startBuild, record.id)).rejects.toThrow(
      /Run Inspect setup/,
    );
    await invoke(workflowChannels.runMilestone, record.id, manualId);
    await vi.waitFor(async () =>
      expect(await milestone(manualId)).toMatchObject({
        state: "completed",
        output: "inspected\n",
      }),
    );
    await invoke(workflowChannels.startBuild, record.id);
    const waitForReview = (tasks: object[]) =>
      vi.waitFor(async () =>
        expect((await list())[0]?.build).toMatchObject({ state: "review", tasks }),
      );
    await waitForReview([{ state: "review", attempt: 1 }, { state: "queued" }]);
    expect(await milestone(preflight)).toMatchObject({ state: "completed" });
    expect(await milestone(after)).toMatchObject({ state: "ready" });
    expect(git("log", "--format=%s")).toBe("chore: record existing workspace");
    expect(git("ls-tree", "-r", "--name-only", "HEAD")).toBe(".gitignore\nREADME.md\nnotes.txt");
    expect(git("diff", "--cached", "--name-only")).toBe("");
    expect(runBuild).toHaveBeenCalledExactlyOnceWith(
      "codex",
      record.source,
      workspacePath,
      expect.objectContaining({ state: "ready", text: "Scaffold Pocket Tasks.", review }),
      expect.objectContaining({ id: "1", attempt: 1 }),
      [
        expect.objectContaining({ id: "1", state: "running" }),
        expect.objectContaining({ id: "2", state: "queued" }),
      ],
      expect.any(AbortSignal),
      expect.any(Function),
    );
    await expect(invoke(workflowChannels.startBuild, record.id)).rejects.toThrow(/Review/);
    await expect(
      invoke(workflowChannels.reviewBuildTask, record.id, { taskId: "2", attempt: 1 }),
    ).rejects.toThrow(/latest result/);

    const feedback = "Give the task input an accessible label.";
    await invoke(workflowChannels.reviewBuildTask, record.id, {
      taskId: "1",
      attempt: 1,
      feedback,
    });
    await waitForReview([
      {
        state: "review",
        attempt: 2,
        revisions: [{ feedback, summary: "Implemented the task view." }],
      },
      { state: "queued" },
    ]);
    expect(runBuild).toHaveBeenCalledTimes(2);
    expect(vi.mocked(runBuild).mock.lastCall?.[4]).toMatchObject({
      id: "1",
      attempt: 2,
      revisions: [{ feedback }],
    });
    await expect(
      invoke(workflowChannels.reviewBuildTask, record.id, { taskId: "1", attempt: 1 }),
    ).rejects.toThrow(/latest result/);

    writeFileSync(join(workspace, "unrelated.txt"), "Created after review.");
    await expect(
      invoke(workflowChannels.reviewBuildTask, record.id, {
        taskId: "1",
        attempt: 2,
      }),
    ).rejects.toThrow(/differ from the reviewed snapshot/);
    expect(runBuild).toHaveBeenCalledTimes(2);
    rmSync(join(workspace, "unrelated.txt"));
    await expect(
      invoke(workflowChannels.reviewBuildTask, record.id, {
        taskId: "1",
        attempt: 2,
        commitSubject: "wrong prefix",
      }),
    ).rejects.toThrow(/Conventional Commit/);
    git("config", "commit.gpgsign", "true");
    git("config", "gpg.format", "openpgp");
    git("config", "gpg.program", "jari-test-missing-signing-program");
    await expect(
      invoke(workflowChannels.reviewBuildTask, record.id, { taskId: "1", attempt: 2 }),
    ).rejects.toThrow(/sign/i);
    expect((await list())[0]?.build?.state).toBe("review");
    expect(runBuild).toHaveBeenCalledTimes(2);
    expect(git("diff", "--cached", "--name-only")).toBe("");
    git("config", "commit.gpgsign", "false");
    await invoke(workflowChannels.reviewBuildTask, record.id, {
      taskId: "1",
      attempt: 2,
      commitSubject: "fix: add an accessible task label",
    });
    await waitForReview([
      { state: "approved", attempt: 2 },
      { state: "review", attempt: 1 },
    ]);
    expect(vi.mocked(runBuild).mock.lastCall?.[4]).toMatchObject({ id: "2" });
    expect(vi.mocked(runBuild).mock.lastCall?.[5]).toEqual([
      expect.objectContaining({ id: "1", state: "approved" }),
      expect.objectContaining({ id: "2", state: "running" }),
    ]);
    await invoke(workflowChannels.reviewBuildTask, record.id, { taskId: "2", attempt: 1 });
    expect(await milestone(after)).toMatchObject({ state: "ready" });
    await expect(invoke(workflowChannels.runMilestone, record.id, after)).rejects.toThrow(
      /next unfinished milestone/,
    );
    await invoke(workflowChannels.runMilestone, record.id, afterReview);
    await vi.waitFor(async () =>
      expect(await milestone(after)).toMatchObject({
        state: "failed",
        message: "Command failed (2).",
      }),
    );
    await expect(invoke(workflowChannels.runMilestone, record.id, testing)).rejects.toThrow(
      /next unfinished milestone/,
    );
    writeFileSync(join(workspace, "fixture.local"), "verify");
    await invoke(workflowChannels.runMilestone, record.id, after);
    await vi.waitFor(async () =>
      expect(await milestone(after)).toMatchObject({
        state: "completed",
        output: "verified\n",
      }),
    );
    await invoke(workflowChannels.runMilestone, record.id, testing);
    await vi.waitFor(async () =>
      expect(await milestone(testing)).toMatchObject({
        state: "completed",
        output: expect.stringMatching(/tests passed\n$/),
      }),
    );
    expect((await milestone(testing))?.output).toHaveLength(32_000);
    expect(git("log", "--format=%s")).toBe(
      "feat: Persist tasks\nfix: add an accessible task label\nchore: record existing workspace",
    );
    expect(git("diff-tree", "--root", "--no-commit-id", "--name-only", "-r", "HEAD^")).toBe(
      "src/main.ts",
    );
    expect(git("diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD")).toBe("src/storage.ts");
    expect(git("status", "--porcelain")).toBe("");
    const firstFile = join(workspace, "src/main.ts");
    const settledContents = readFileSync(firstFile);
    writeFileSync(firstFile, "A later, uncommitted edit.");
    const committedDiff = await invoke(
      workflowChannels.readBuildCommitDiff,
      record.id,
      "1",
      "src/main.ts",
    );
    expect(committedDiff).toContain("+Added an accessible label.");
    expect(committedDiff).not.toContain("A later, uncommitted edit.");
    await expect(
      invoke(workflowChannels.readBuildCommitDiff, record.id, "1", "src/storage.ts"),
    ).rejects.toThrow(/approved commit/);
    writeFileSync(firstFile, settledContents);
    expect((await list())[0]?.build).toMatchObject({
      state: "completed",
      tasks: [
        {
          state: "approved",
          summary: "Added an accessible label.",
          git: { commit: { subject: "fix: add an accessible task label" } },
        },
        { state: "approved", summary: "Implemented local storage." },
      ],
    });
    expect(createAtlassianClient).not.toHaveBeenCalled();
    const filePath = join(directory, "provider-transcript.txt");
    showSaveDialog.mockResolvedValueOnce({ canceled: true });
    await expect(invoke(workflowChannels.exportTranscript, record.id)).resolves.toBe(false);
    showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath });
    await expect(invoke(workflowChannels.exportTranscript, record.id)).resolves.toBe(true);
    const exported = readFileSync(filePath, "utf8");
    expect(exported).toContain("Provider call durations");
    expect(exported).toContain("Build · Task 1 · Attempt 1");
    expect(exported).toContain("Build · Task 1 · Attempt 2");
    expect(exported).toContain("Build · Task 2 · Attempt 1");
    expect(exported).toContain("540 input tokens · 80 output tokens");
    expect(exported).toContain('\n[{"id":"1","state":"approved"},{"id":"2","state":"running"}]');
    expect(exported).toContain("\n  Added an accessible label.\n\n");

    const reopened = openWorkflowStore(join(directory, "workflows.sqlite"));
    try {
      expect(reopened.transcript(record.id)).toHaveLength(6);
      const runs = reopened.providerRuns(record.id);
      expect(
        runs.map(({ phase, taskId, attempt, status }) => [phase, taskId, attempt, status]),
      ).toEqual([
        ["Plan", null, null, "completed"],
        ["Plan", null, null, "completed"],
        ["Plan review", null, null, "completed"],
        ["Build", "1", 1, "completed"],
        ["Build", "1", 2, "completed"],
        ["Build", "2", 1, "completed"],
      ]);
      expect(runs.every(({ durationMs }) => durationMs !== null && durationMs >= 0)).toBe(true);
      expect(reopened.transcript(record.id)[0]?.runId).toBe(runs[3]?.runId);
      const append = reopened.transcriptWriter(record.id, {
        phase: "Build",
        taskId: "2",
        attempt: 1,
      });
      for (let index = 0; index < 50; index++) append("assistant", `Message ${index}`);
      const firstPage = await invoke(workflowChannels.readTranscript, record.id, 0);
      expect(firstPage).toMatchObject({ hasMore: true });
      const entries = (firstPage as { entries: { sequence: number; text: string }[] }).entries;
      expect(entries).toHaveLength(50);
      expect(entries[49]?.text).toBe("Message 43");
      await expect(
        invoke(workflowChannels.readTranscript, record.id, entries[49]?.sequence),
      ).resolves.toMatchObject({
        hasMore: false,
        entries: Array.from({ length: 6 }, (_, index) => ({ text: `Message ${44 + index}` })),
      });
      await expect(invoke(workflowChannels.readTranscript, "another-workflow", 0)).resolves.toEqual(
        {
          entries: [],
          hasMore: false,
          runs: [],
        },
      );
      await expect(invoke(workflowChannels.readTranscript, record.id, -1)).rejects.toThrow(/valid/);
      vi.mocked(runPlanning).mockResolvedValue({ state: "ready", text: "A new plan.", review });
      const revised = (await invoke(workflowChannels.replayPlan, record.id, {
        mode: "revise",
        feedback: "Keep the existing storage.",
      })) as WorkflowRecord;
      expect(revised).toMatchObject({
        provider: "codex",
        workspacePath,
        plan: {
          revision: {
            previousPlan: "Scaffold Pocket Tasks.",
            feedback: "Keep the existing storage.",
          },
          clarifications: [{ answer: "Use vanilla TypeScript." }],
        },
      });
      expect(revised.id).not.toBe(record.id);
      expect(revised.build).toBeUndefined();
      expect(vi.mocked(runPlanning).mock.lastCall?.[8]).toEqual(revised.plan?.revision);
      const fresh = (await invoke(workflowChannels.replayPlan, record.id, {
        mode: "fresh",
        provider: "claude",
        customPlan: { model: "sonnet", effort: "high", skillIds: [] },
      })) as WorkflowRecord;
      expect(fresh).toMatchObject({
        provider: "claude",
        workspacePath,
        plan: { custom: { model: "sonnet", effort: "high" } },
      });
      expect(fresh.plan?.clarifications).toBeUndefined();
      expect(vi.mocked(runPlanning).mock.lastCall?.[8]).toBeUndefined();
      await vi.waitFor(async () => {
        const records = await list();
        expect(records.find(({ id }) => id === fresh.id)?.plan?.state).toBe("ready");
        expect(records.find(({ id }) => id === revised.id)?.plan?.state).toBe("ready");
        expect(records.find(({ id }) => id === record.id)?.build?.state).toBe("completed");
      });
      await invoke(workflowChannels.removeWorkflow, record.id);
      expect(reopened.transcript(record.id)).toEqual([]);
      expect(reopened.providerRuns(record.id)).toEqual([]);
    } finally {
      reopened.close();
    }
  } finally {
    once.mock.calls.find(([event]) => event === "will-quit")?.[1]();
    rmSync(directory, { recursive: true, force: true });
  }
});
