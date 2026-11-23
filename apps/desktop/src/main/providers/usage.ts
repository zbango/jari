import type { ProviderQuotaWindow, ProviderTokenUsage } from "@agent-desktop/shared";

function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function count(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function percent(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function unixSeconds(value: unknown) {
  const seconds = count(value);
  return seconds && seconds < 8.64e12 ? seconds * 1000 : null;
}

export function codexTokens(value: unknown): ProviderTokenUsage | undefined {
  const usage = object(value);
  const total = object(usage?.total);
  const input = count(total?.inputTokens);
  const output = count(total?.outputTokens);
  if (input === undefined || output === undefined) return;
  return {
    input,
    output,
    cacheRead: count(total?.cachedInputTokens),
    cacheWrite: count(total?.cacheWriteInputTokens),
    reasoning: count(total?.reasoningOutputTokens),
    contextWindow: count(usage?.modelContextWindow),
  };
}

export function claudeTokens(value: unknown): ProviderTokenUsage | undefined {
  const models = Object.values(object(value) ?? {}).map(object);
  if (!models.length) return;
  const total: ProviderTokenUsage = { input: 0, output: 0 };
  for (const model of models) {
    const input = count(model?.inputTokens);
    const output = count(model?.outputTokens);
    if (input === undefined || output === undefined) return;
    const read = count(model?.cacheReadInputTokens);
    const write = count(model?.cacheCreationInputTokens);
    // Claude's uncached input excludes both cache fields.
    total.input += input + (read ?? 0) + (write ?? 0);
    total.output += output;
    if (read !== undefined) total.cacheRead = (total.cacheRead ?? 0) + read;
    if (write !== undefined) total.cacheWrite = (total.cacheWrite ?? 0) + write;
  }
  const reasoning = models.map((model) => count(model?.thinkingTokens));
  if (reasoning.every((tokens) => tokens !== undefined)) {
    total.reasoning = reasoning.reduce((sum, tokens) => sum + tokens, 0);
  }
  return total;
}

export function codexQuota(value: unknown): ProviderQuotaWindow[] {
  const response = object(value);
  const buckets = Object.values(object(response?.rateLimitsByLimitId) ?? {});
  return (buckets.length ? buckets : [response?.rateLimits]).flatMap((entry) => {
    const bucket = object(entry);
    const name =
      typeof bucket?.limitName === "string"
        ? bucket.limitName
        : typeof bucket?.limitId === "string" && bucket.limitId !== "codex"
          ? bucket.limitId
          : "Codex";
    return (["primary", "secondary"] as const).flatMap((key) => {
      const window = object(bucket?.[key]);
      const usedPercent = percent(window?.usedPercent);
      if (usedPercent === undefined) return [];
      const minutes = count(window?.windowDurationMins);
      const period = !minutes
        ? key === "primary"
          ? "Primary"
          : "Secondary"
        : minutes % 1440 === 0
          ? `${minutes / 1440}-day`
          : minutes % 60 === 0
            ? `${minutes / 60}-hour`
            : `${minutes}-minute`;
      return [
        { label: `${name} · ${period}`, usedPercent, resetsAt: unixSeconds(window?.resetsAt) },
      ];
    });
  });
}

export function claudeQuota(value: unknown): ProviderQuotaWindow[] {
  const limits = object(object(value)?.rate_limits)?.limits;
  if (!Array.isArray(limits)) return [];
  return limits.flatMap((entry: unknown) => {
    const limit = object(entry);
    const usedPercent = percent(limit?.percent);
    if (usedPercent === undefined) return [];
    const kind = typeof limit?.kind === "string" ? limit.kind : "Usage";
    const scope = object(limit?.scope);
    const model = object(scope?.model)?.display_name;
    const surface = object(scope?.surface)?.display_name;
    const label =
      kind === "five_hour" ? "5-hour" : kind === "seven_day" ? "7-day" : kind.replaceAll("_", " ");
    const resetsAt = typeof limit?.resets_at === "string" ? Date.parse(limit.resets_at) : NaN;
    return [
      {
        label: [label, model, surface]
          .filter((part): part is string => typeof part === "string" && !!part)
          .join(" · "),
        usedPercent,
        resetsAt: Number.isFinite(resetsAt) ? resetsAt : null,
      },
    ];
  });
}
