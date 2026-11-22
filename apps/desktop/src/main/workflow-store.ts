import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type { CreateWorkflowInput, WorkflowRecord } from "@agent-desktop/shared";

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
      ) STRICT
    `);
    const insert = db.prepare(`
      INSERT INTO workflows (id, request, provider, workspace_path, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    const list = db.prepare(`
      SELECT id, request, provider, workspace_path AS workspacePath, created_at AS createdAt
      FROM workflows
      ORDER BY rowid DESC
    `);
    return {
      list: () => list.all() as unknown as WorkflowRecord[],
      create(input: CreateWorkflowInput): WorkflowRecord {
        const id = randomUUID();
        const createdAt = new Date().toISOString();
        insert.run(id, input.request, input.provider, input.workspacePath, createdAt);
        return { ...input, id, createdAt };
      },
      close: () => db.close(),
    };
  } catch (error) {
    db.close();
    throw error;
  }
}
