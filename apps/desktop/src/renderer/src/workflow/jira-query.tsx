import type { JiraResponse } from "@agent-desktop/shared";
import { Text } from "@once-ui-system/core/components/Text";
import { useCallback, useEffect, useRef, useState } from "react";
import { workflowError } from "./workflow-error";

export function readJiraResponse<T>(value: JiraResponse<T> | T): JiraResponse<T> {
  if (
    value &&
    typeof value === "object" &&
    "data" in value &&
    "syncedAt" in value &&
    "source" in value
  ) {
    return value as JiraResponse<T>;
  }
  return { data: value as T, source: "jira", syncedAt: Date.now() };
}

export function useJiraQuery<T>(load: ((sync: boolean) => Promise<JiraResponse<T>>) | null) {
  const current = useRef<AbortController>(null);
  const [result, setResult] = useState<{
    load: typeof load;
    response?: JiraResponse<T>;
    error?: string;
    pending: boolean;
  }>();

  const run = useCallback(
    (sync: boolean) => {
      if (!load) return;
      current.current?.abort();
      const request = new AbortController();
      current.current = request;
      void load(sync).then(
        (response) => {
          if (!request.signal.aborted) {
            setResult({ load, response: readJiraResponse<T>(response), pending: false });
          }
        },
        (error: unknown) => {
          if (!request.signal.aborted) {
            setResult({
              load,
              error: workflowError(error, "Jira could not be loaded."),
              pending: false,
            });
          }
        },
      );
    },
    [load],
  );

  useEffect(() => {
    run(false);
    return () => current.current?.abort();
  }, [run]);

  const visible = result?.load === load ? result : undefined;
  return {
    response: visible?.response,
    error: visible?.error,
    pending: !!load && (visible?.pending ?? true),
    sync: () => {
      if (!load) return;
      setResult({ load, pending: true, response: visible?.response });
      run(true);
    },
  };
}

const jiraDate = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

export function JiraDataStatus({
  response,
  label,
}: {
  response: JiraResponse<unknown>;
  label?: string;
}) {
  return (
    <Text as="p" textVariant="body-default-s" onBackground="neutral-weak" role="status">
      {label ? `${label} · ` : ""}
      {response.source === "cache" ? "Local cache" : "Live Jira data"} · Last synced{" "}
      {jiraDate.format(response.syncedAt)}
    </Text>
  );
}
