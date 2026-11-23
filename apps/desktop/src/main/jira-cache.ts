import type { JiraResponse } from "@agent-desktop/shared";
import type { openWorkflowStore } from "./workflow-store";

type JiraStore = Pick<ReturnType<typeof openWorkflowStore>, "readJiraCache" | "writeJiraCache">;

export function jiraReply<T>(response: JiraResponse<T>, sync: unknown): JiraResponse<T> | T {
  if (typeof sync === "boolean") return response;
  // Open dev windows can still have a preload that expects the original bare payload.
  if (response.syncError) throw new Error(response.syncError);
  return response.data;
}

export function createJiraCache(getStore: () => JiraStore) {
  const inFlight = new Map<string, Promise<JiraResponse<unknown>>>();

  return async function read<T>(
    key: string,
    sync: boolean,
    load: () => Promise<T>,
  ): Promise<JiraResponse<T>> {
    const pending = inFlight.get(key);
    if (pending) return pending as Promise<JiraResponse<T>>;

    const saved = getStore().readJiraCache<T>(key);
    if (saved && !sync) return { ...saved, source: "cache" };

    const request = Promise.resolve()
      .then(load)
      .then(
        (data): JiraResponse<T> => {
          const syncedAt = Date.now();
          getStore().writeJiraCache(key, data, syncedAt);
          return { data, syncedAt, source: "jira" };
        },
        (error: unknown): JiraResponse<T> => {
          if (!saved) throw error;
          return {
            ...saved,
            source: "cache",
            syncError: error instanceof Error ? error.message : "Jira could not be reached.",
          };
        },
      )
      .finally(() => inFlight.delete(key));
    inFlight.set(key, request);
    return request;
  };
}
