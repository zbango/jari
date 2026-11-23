import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { createJiraCache, jiraReply } from "./jira-cache";
import { openWorkflowStore } from "./workflow-store";

it("reuses Jira responses across database reopen and keeps the last sync on failure", async () => {
  const directory = mkdtempSync(join(tmpdir(), "jari-jira-cache-"));
  const file = join(directory, "workflows.sqlite");
  let store = openWorkflowStore(file);
  try {
    const load = vi.fn().mockResolvedValueOnce(["FIN-1"]).mockResolvedValueOnce(["FIN-2"]);
    let read = createJiraCache(() => store);
    const [first, duplicate] = await Promise.all([
      read("account:assigned", false, load),
      read("account:assigned", false, load),
    ]);
    expect(first).toMatchObject({ data: ["FIN-1"], source: "jira" });
    expect(duplicate).toEqual(first);
    expect(jiraReply(first, undefined)).toEqual(["FIN-1"]);
    expect(jiraReply(first, false)).toEqual(first);
    expect(jiraReply(first, true)).toEqual(first);
    expect(load).toHaveBeenCalledOnce();

    store.close();
    store = openWorkflowStore(file);
    read = createJiraCache(() => store);
    await expect(read("account:assigned", false, load)).resolves.toEqual({
      ...first,
      source: "cache",
    });
    expect(load).toHaveBeenCalledOnce();

    const synced = await read("account:assigned", true, load);
    expect(synced).toMatchObject({ data: ["FIN-2"], source: "jira" });
    load.mockRejectedValueOnce(new Error("Jira is offline"));
    await expect(read("account:assigned", true, load)).resolves.toEqual({
      ...synced,
      source: "cache",
      syncError: "Jira is offline",
    });
    await expect(read("account:assigned", false, load)).resolves.toEqual({
      ...synced,
      source: "cache",
    });
    expect(load).toHaveBeenCalledTimes(3);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
