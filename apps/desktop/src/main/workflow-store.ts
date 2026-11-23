import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type {
  KnowledgeContext,
  KnowledgeNote,
  ProviderRunMetric,
  ProviderTranscriptEntry,
  WorkItem,
  WorkflowBuild,
  WorkflowPlan,
  WorkflowRecord,
} from "@agent-desktop/shared";
import type { TranscriptWriter } from "./providers/types";

type StoredWorkflow = Omit<WorkflowRecord, "source" | "plan" | "build" | "knowledge"> & {
  source: string | null;
  plan: string | null;
  build: string | null;
  knowledge: string | null;
};
type StoredKnowledgeNote = Omit<KnowledgeNote, "paths"> & { paths: string };
export type ProviderRunScope =
  | { phase: "Plan" | "Plan review" }
  | { phase: "Build"; taskId: string; attempt: number };
export function openWorkflowStore(path: string) {
  const db = new DatabaseSync(path);
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS workflows (
        id TEXT PRIMARY KEY,
        request TEXT NOT NULL CHECK (length(trim(request)) > 0),
        provider TEXT NOT NULL CHECK (provider IN ('codex', 'claude')),
        workspace_path TEXT NOT NULL,
        created_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS workflow_intake (
        id TEXT PRIMARY KEY REFERENCES workflows(id),
        source TEXT NOT NULL,
        plan TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS knowledge_notes (
        id TEXT PRIMARY KEY,
        area TEXT NOT NULL COLLATE NOCASE,
        title TEXT NOT NULL,
        body_html TEXT NOT NULL,
        body_text TEXT NOT NULL,
        paths TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS workflow_knowledge (
        id TEXT PRIMARY KEY REFERENCES workflows(id),
        snapshot TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS workflow_build (
        id TEXT PRIMARY KEY REFERENCES workflows(id),
        payload TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS workflow_transcript (
        sequence INTEGER PRIMARY KEY,
        workflow_id TEXT NOT NULL REFERENCES workflows(id),
        run_id TEXT NOT NULL,
        phase TEXT NOT NULL,
        task_id TEXT,
        attempt INTEGER,
        created_at TEXT NOT NULL,
        kind TEXT NOT NULL,
        text TEXT NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS workflow_transcript_workflow
        ON workflow_transcript (workflow_id, sequence);
      CREATE TABLE IF NOT EXISTS workflow_provider_run (
        run_id TEXT PRIMARY KEY,
        workflow_id TEXT NOT NULL REFERENCES workflows(id),
        phase TEXT NOT NULL,
        task_id TEXT,
        attempt INTEGER,
        started_at TEXT NOT NULL,
        status TEXT NOT NULL,
        duration_ms INTEGER
      ) STRICT;
      CREATE INDEX IF NOT EXISTS workflow_provider_run_workflow
        ON workflow_provider_run (workflow_id);
      CREATE TABLE IF NOT EXISTS workflow_preferences (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS jira_cache (
        key TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        synced_at INTEGER NOT NULL
      ) STRICT;
    `);
    const insert = db.prepare(`
      INSERT INTO workflows (id, request, provider, workspace_path, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    const insertIntake = db.prepare(
      "INSERT INTO workflow_intake (id, source, plan) VALUES (?, ?, ?)",
    );
    const removeIntake = db.prepare("DELETE FROM workflow_intake WHERE id = ?");
    const removeSnapshot = db.prepare("DELETE FROM workflow_knowledge WHERE id = ?");
    const removeBuild = db.prepare("DELETE FROM workflow_build WHERE id = ?");
    const removeTranscript = db.prepare("DELETE FROM workflow_transcript WHERE workflow_id = ?");
    const removeRuns = db.prepare("DELETE FROM workflow_provider_run WHERE workflow_id = ?");
    const insertRun = db.prepare(`
      INSERT INTO workflow_provider_run
        (run_id, workflow_id, phase, task_id, attempt, started_at, status)
      VALUES (?, ?, ?, ?, ?, ?, 'running')
    `);
    const updateRun = db.prepare(`
      UPDATE workflow_provider_run SET status = ?, duration_ms = ?
      WHERE run_id = ? AND status = 'running'
    `);
    const readRuns = db.prepare(`
      SELECT run_id AS runId, phase, task_id AS taskId, attempt, started_at AS startedAt,
        status, duration_ms AS durationMs
      FROM workflow_provider_run WHERE workflow_id = ? ORDER BY rowid
    `);
    const appendTranscript = db.prepare(`
      INSERT INTO workflow_transcript
        (workflow_id, run_id, phase, task_id, attempt, created_at, kind, text)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const readTranscript = db.prepare(`
      SELECT sequence, run_id AS runId, phase, task_id AS taskId, attempt,
        created_at AS createdAt, kind, text
      FROM workflow_transcript WHERE workflow_id = ? AND sequence > ? ORDER BY sequence LIMIT ?
    `);
    const removeWorkflow = db.prepare("DELETE FROM workflows WHERE id = ?");
    const update = db.prepare("UPDATE workflow_intake SET plan = ? WHERE id = ?");
    const saveBuild = db.prepare(`
      INSERT INTO workflow_build (id, payload) VALUES (?, ?)
      ON CONFLICT(id) DO UPDATE SET payload = excluded.payload
    `);
    const insertSnapshot = db.prepare(
      "INSERT INTO workflow_knowledge (id, snapshot) VALUES (?, ?)",
    );
    const listKnowledge = db.prepare(`
      SELECT id, area, title, body_html AS bodyHtml, body_text AS bodyText, paths
      FROM knowledge_notes ORDER BY area, title COLLATE NOCASE, id
    `);
    const findArea = db.prepare("SELECT area FROM knowledge_notes WHERE area = ? LIMIT 1");
    const insertKnowledge = db.prepare(`
      INSERT INTO knowledge_notes (area, title, body_html, body_text, paths, id)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const updateKnowledge = db.prepare(`
      UPDATE knowledge_notes SET area = ?, title = ?, body_html = ?, body_text = ?, paths = ?
      WHERE id = ?
    `);
    const removeKnowledge = db.prepare("DELETE FROM knowledge_notes WHERE id = ?");
    const readJira = db.prepare(
      "SELECT payload, synced_at AS syncedAt FROM jira_cache WHERE key = ?",
    );
    const writeJira = db.prepare(`
      INSERT INTO jira_cache (key, payload, synced_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET payload = excluded.payload, synced_at = excluded.synced_at
    `);
    const pruneJira = db.prepare(`
      DELETE FROM jira_cache WHERE key IN (
        SELECT key FROM jira_cache ORDER BY synced_at DESC, rowid DESC LIMIT -1 OFFSET 200
      )
    `);
    const lastWorkspace = db.prepare(
      "SELECT value FROM workflow_preferences WHERE key = 'last_workspace'",
    );
    const saveWorkspace = db.prepare(`
      INSERT INTO workflow_preferences (key, value) VALUES ('last_workspace', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    const list = db.prepare(`
      SELECT w.id, w.request, w.provider, w.workspace_path AS workspacePath,
        w.created_at AS createdAt, i.source, i.plan, k.snapshot AS knowledge, b.payload AS build
      FROM workflows w LEFT JOIN workflow_intake i ON i.id = w.id
      LEFT JOIN workflow_knowledge k ON k.id = w.id
      LEFT JOIN workflow_build b ON b.id = w.id
      ORDER BY w.rowid DESC
    `);
    return {
      readJiraCache<T>(key: string): { data: T; syncedAt: number } | undefined {
        const row = readJira.get(key) as { payload: string; syncedAt: number } | undefined;
        if (row) return { data: JSON.parse(row.payload) as T, syncedAt: row.syncedAt };
      },
      writeJiraCache<T>(key: string, data: T, syncedAt: number): void {
        writeJira.run(key, JSON.stringify(data), syncedAt);
        pruneJira.run();
      },
      lastWorkspace(): string | null {
        return (lastWorkspace.get()?.value as string | undefined) ?? null;
      },
      saveWorkspace(workspacePath: string): void {
        saveWorkspace.run(workspacePath);
      },
      list(): WorkflowRecord[] {
        return (list.all() as unknown as StoredWorkflow[]).map(
          ({ source, plan, build, knowledge, ...record }) => ({
            ...record,
            ...(source && plan
              ? { source: JSON.parse(source) as WorkItem, plan: JSON.parse(plan) as WorkflowPlan }
              : {}),
            ...(knowledge ? { knowledge: JSON.parse(knowledge) as KnowledgeContext[] } : {}),
            ...(build ? { build: JSON.parse(build) as WorkflowBuild } : {}),
          }),
        );
      },
      create(input: Omit<WorkflowRecord, "id" | "createdAt">): WorkflowRecord {
        const id = randomUUID();
        const createdAt = new Date().toISOString();
        db.exec("BEGIN");
        try {
          insert.run(id, input.request, input.provider, input.workspacePath, createdAt);
          if (input.source && input.plan) {
            insertIntake.run(id, JSON.stringify(input.source), JSON.stringify(input.plan));
          }
          if (input.knowledge?.length) insertSnapshot.run(id, JSON.stringify(input.knowledge));
          if (input.build) saveBuild.run(id, JSON.stringify(input.build));
          db.exec("COMMIT");
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
        return { ...input, id, createdAt };
      },
      updatePlan(id: string, plan: WorkflowPlan): void {
        update.run(JSON.stringify(plan), id);
      },
      removeWorkflow(id: string): void {
        db.exec("BEGIN");
        try {
          removeIntake.run(id);
          removeSnapshot.run(id);
          removeBuild.run(id);
          removeTranscript.run(id);
          removeRuns.run(id);
          removeWorkflow.run(id);
          db.exec("COMMIT");
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
      },
      saveBuild(id: string, build: WorkflowBuild): void {
        saveBuild.run(id, JSON.stringify(build));
      },
      transcriptWriter(id: string, run: ProviderRunScope, runId = randomUUID()): TranscriptWriter {
        return (kind, text) => {
          appendTranscript.run(
            id,
            runId,
            run.phase,
            run.phase === "Build" ? run.taskId : null,
            run.phase === "Build" ? run.attempt : null,
            new Date().toISOString(),
            kind,
            text,
          );
        };
      },
      startProviderRun(id: string, run: ProviderRunScope) {
        const runId = randomUUID();
        insertRun.run(
          runId,
          id,
          run.phase,
          run.phase === "Build" ? run.taskId : null,
          run.phase === "Build" ? run.attempt : null,
          new Date().toISOString(),
        );
        return { runId, write: this.transcriptWriter(id, run, runId) };
      },
      finishProviderRun(
        runId: string,
        status: Exclude<ProviderRunMetric["status"], "running">,
        durationMs: number,
      ): void {
        updateRun.run(status, durationMs, runId);
      },
      providerRuns(id: string): ProviderRunMetric[] {
        return readRuns.all(id) as unknown as ProviderRunMetric[];
      },
      transcript(id: string, after = 0, limit = -1): ProviderTranscriptEntry[] {
        return readTranscript.all(id, after, limit) as unknown as ProviderTranscriptEntry[];
      },
      listKnowledge(): KnowledgeNote[] {
        return (listKnowledge.all() as unknown as StoredKnowledgeNote[]).map(
          ({ paths, ...note }) => ({
            ...note,
            paths: JSON.parse(paths) as string[],
          }),
        );
      },
      saveKnowledge(id: string | null, input: Omit<KnowledgeNote, "id">): KnowledgeNote {
        const area = (findArea.get(input.area)?.area as string | undefined) ?? input.area;
        const note = { ...input, area, id: id ?? randomUUID() };
        const statement = id === null ? insertKnowledge : updateKnowledge;
        const result = statement.run(
          area,
          note.title,
          note.bodyHtml,
          note.bodyText,
          JSON.stringify(note.paths),
          note.id,
        );
        if (!result.changes) throw new Error("This knowledge note no longer exists.");
        return note;
      },
      removeKnowledge(id: string): void {
        removeKnowledge.run(id);
      },
      close: () => db.close(),
    };
  } catch (error) {
    db.close();
    throw error;
  }
}
