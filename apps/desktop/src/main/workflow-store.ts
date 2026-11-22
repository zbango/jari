import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type {
  KnowledgeContext,
  KnowledgeNote,
  WorkItem,
  WorkflowPlan,
  WorkflowRecord,
} from "@agent-desktop/shared";

type StoredWorkflow = Omit<WorkflowRecord, "source" | "plan" | "knowledge"> & {
  source: string | null;
  plan: string | null;
  knowledge: string | null;
};
type StoredKnowledgeNote = Omit<KnowledgeNote, "paths"> & { paths: string };

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
      ) STRICT
    `);
    const insert = db.prepare(`
      INSERT INTO workflows (id, request, provider, workspace_path, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    const insertIntake = db.prepare(
      "INSERT INTO workflow_intake (id, source, plan) VALUES (?, ?, ?)",
    );
    const update = db.prepare("UPDATE workflow_intake SET plan = ? WHERE id = ?");
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
    const list = db.prepare(`
      SELECT w.id, w.request, w.provider, w.workspace_path AS workspacePath,
        w.created_at AS createdAt, i.source, i.plan, k.snapshot AS knowledge
      FROM workflows w LEFT JOIN workflow_intake i ON i.id = w.id
      LEFT JOIN workflow_knowledge k ON k.id = w.id
      ORDER BY w.rowid DESC
    `);
    return {
      list(): WorkflowRecord[] {
        return (list.all() as unknown as StoredWorkflow[]).map(
          ({ source, plan, knowledge, ...record }) => ({
            ...record,
            ...(source && plan
              ? { source: JSON.parse(source) as WorkItem, plan: JSON.parse(plan) as WorkflowPlan }
              : {}),
            ...(knowledge ? { knowledge: JSON.parse(knowledge) as KnowledgeContext[] } : {}),
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
