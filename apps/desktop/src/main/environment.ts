import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import type { WorkflowProvider } from "@agent-desktop/shared";

const diagnosticValueKeys: readonly string[] = ["ATLASSIAN_INSTANCE_URL", "ATLASSIAN_USER_EMAIL"];

const developmentKeys = [
  "ATLASSIAN_INSTANCE_URL",
  "ATLASSIAN_USER_EMAIL",
  "ATLASSIAN_API_TOKEN",
  "JARI_ATLASSIAN_SITE",
  "JARI_ATLASSIAN_CLOUD_ID",
  "JARI_ATLASSIAN_EMAIL",
  "JARI_ATLASSIAN_TOKEN",
  "JARI_ATLASSIAN_CONFLUENCE_TOKEN",
  "JARI_CODEX_BIN",
  "JARI_CLAUDE_BIN",
  "JARI_DEBUG_ENV",
] as const;

export function loadDevelopmentEnvironment(
  path: string,
  env: NodeJS.ProcessEnv = process.env,
): void {
  let values: NodeJS.Dict<string> = {};
  try {
    values = parseEnv(readFileSync(path, "utf8"));
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
      console.warn(
        "[Environment] Could not read the local .env file. Check its permissions and format.",
      );
    }
  }

  const fromFile = new Set<string>();
  for (const key of developmentKeys) {
    const value = values[key];
    if (env[key] === undefined && value !== undefined) {
      env[key] = value;
      fromFile.add(key);
    }
  }

  if (env.JARI_DEBUG_ENV === "1") {
    console.warn(
      "[Environment] Development diagnostics write to the console and desktop.log. Set JARI_DEBUG_ENV=0 after testing.",
    );
    for (const key of developmentKeys) {
      const value = env[key];
      if (!value) {
        console.info(`[Environment] ${key}: missing or empty`);
        continue;
      }
      const source = fromFile.has(key) ? ".env" : "launch environment";
      if (diagnosticValueKeys.includes(key)) {
        console.info(`[Environment] ${key}: ${JSON.stringify(value)} (${source})`);
      } else {
        console.info(`[Environment] ${key}: set (redacted, ${source})`);
      }
    }
  }
}

export function isAtlassianCloudId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
}

export function readAtlassianConfig(env: NodeJS.ProcessEnv = process.env) {
  const site = env.ATLASSIAN_INSTANCE_URL?.trim() || env.JARI_ATLASSIAN_SITE?.trim();
  const email = env.ATLASSIAN_USER_EMAIL?.trim() || env.JARI_ATLASSIAN_EMAIL?.trim();
  const token = env.ATLASSIAN_API_TOKEN || env.JARI_ATLASSIAN_TOKEN;
  const cloudId = env.ATLASSIAN_INSTANCE_URL?.trim() ? undefined : env.JARI_ATLASSIAN_CLOUD_ID;
  if (!site || !email || !token) {
    throw new Error(
      "Configure ATLASSIAN_INSTANCE_URL, ATLASSIAN_USER_EMAIL and ATLASSIAN_API_TOKEN to connect Jira Cloud.",
    );
  }
  const url = URL.parse(site);
  if (
    !url ||
    url.protocol !== "https:" ||
    !/^[a-z0-9-]+\.atlassian\.net$/i.test(url.hostname) ||
    url.port ||
    url.username ||
    url.password ||
    /[:\r\n]/.test(email) ||
    (cloudId && !isAtlassianCloudId(cloudId))
  ) {
    throw new Error("Use the https://<site>.atlassian.net URL and your Atlassian account email.");
  }
  return {
    siteOrigin: url.origin,
    cloudId,
    email,
    token,
    confluenceToken: env.JARI_ATLASSIAN_CONFLUENCE_TOKEN || token,
  };
}

export function readProviderEnvironment(
  provider: WorkflowProvider,
  env: NodeJS.ProcessEnv = process.env,
) {
  const executable = (provider === "codex" ? env.JARI_CODEX_BIN : env.JARI_CLAUDE_BIN) || provider;
  return { executable, env: withoutAtlassianEnvironment(env) };
}

export function withoutAtlassianEnvironment(env: NodeJS.ProcessEnv = process.env) {
  return Object.fromEntries(
    Object.entries(env).filter(([key]) => !/^(JARI_)?ATLASSIAN_/i.test(key)),
  );
}
