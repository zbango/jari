import { workflowProviders } from "@agent-desktop/shared";
import type { ProviderQuotaSnapshot, WorkflowApi, WorkflowProvider } from "@agent-desktop/shared";
import { Button } from "@once-ui-system/core/components/Button";
import { Column } from "@once-ui-system/core/components/Column";
import { Dialog } from "@once-ui-system/core/components/Dialog";
import { ProgressBar } from "@once-ui-system/core/components/ProgressBar";
import { Row } from "@once-ui-system/core/components/Row";
import { Text } from "@once-ui-system/core/components/Text";
import { useEffect, useState } from "react";

const checkedTime = new Intl.DateTimeFormat(undefined, { timeStyle: "short" });
const resetTime = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
const formatPercent = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 1,
  style: "percent",
});

function remaining(used: number) {
  return formatPercent.format(Math.max(0, 100 - used) / 100);
}

export function ProviderQuota({
  provider,
  readQuota,
  providerRunning,
}: {
  provider: WorkflowProvider;
  readQuota: WorkflowApi["providerQuota"];
  providerRunning: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [request, setRequest] = useState(0);
  const [checking, setChecking] = useState(true);
  const [snapshot, setSnapshot] = useState<ProviderQuotaSnapshot>();
  const windows = snapshot?.windows ?? [];
  const used = windows.length ? Math.max(...windows.map((window) => window.usedPercent)) : null;

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      setChecking(true);
      const startedAt = Date.now();
      setSnapshot(
        (previous) =>
          previous && {
            ...previous,
            windows: previous.windows.filter(
              ({ resetsAt }) => resetsAt === null || resetsAt > startedAt,
            ),
          },
      );
      let next: ProviderQuotaSnapshot | undefined;
      try {
        next = await readQuota(provider);
      } catch {
        next = { checkedAt: Date.now(), windows: [] };
      }
      if (!active) return;
      const now = Date.now();
      setSnapshot({
        ...next,
        windows: next.windows.filter(({ resetsAt }) => resetsAt === null || resetsAt > now),
      });
      setChecking(false);
      const resetWait = next.windows.flatMap(({ resetsAt }) =>
        resetsAt !== null && resetsAt > now ? [resetsAt - now + 1000] : [],
      );
      timer = setTimeout(() => void refresh(), Math.max(10_000, Math.min(60_000, ...resetWait)));
    }
    void refresh();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [provider, readQuota, providerRunning, request]);

  const label =
    used !== null
      ? `Quota · ${remaining(used)} left`
      : checking
        ? "Quota · Checking…"
        : "Quota · Unavailable";

  return (
    <>
      <Button
        size="s"
        variant="secondary"
        tone={used !== null && used >= 90 ? "warning" : "neutral"}
        prefixIcon="barChart"
        type="button"
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`${workflowProviders[provider]} quota`}
        description="The workflow header shows the lowest remaining percentage across these windows."
        footer={
          <Button
            variant="secondary"
            size="s"
            type="button"
            prefixIcon="refresh"
            loading={checking}
            disabled={checking}
            onClick={() => setRequest((value) => value + 1)}
          >
            Refresh quota
          </Button>
        }
      >
        <Column gap="16" fillWidth>
          {windows.map((window, index) => (
            <Column key={`${window.label}-${index}`} gap="8" fillWidth>
              <Row gap="12" wrap horizontal="between">
                <Text textVariant="label-strong-s">{window.label}</Text>
                <Text textVariant="label-default-s">{remaining(window.usedPercent)} left</Text>
              </Row>
              <ProgressBar
                value={Math.min(100, window.usedPercent)}
                size="s"
                showLabel={false}
                aria-label={`${window.label} used`}
                barBackground={window.usedPercent >= 90 ? "warning-strong" : "brand-strong"}
              />
              {window.resetsAt !== null && (
                <Text textVariant="body-default-s" onBackground="neutral-weak">
                  Resets {resetTime.format(window.resetsAt)}
                </Text>
              )}
            </Column>
          ))}
          {!windows.length && (
            <Text as="p" role="status">
              {checking
                ? "Checking provider quota…"
                : "Quota is unavailable for the current sign-in or provider version."}
            </Text>
          )}
          {snapshot && (
            <Text textVariant="label-default-s" onBackground="neutral-weak">
              Last checked {checkedTime.format(snapshot.checkedAt)}
            </Text>
          )}
        </Column>
      </Dialog>
    </>
  );
}
