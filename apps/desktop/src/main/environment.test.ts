import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import {
  loadDevelopmentEnvironment,
  readAtlassianConfig,
  readProviderEnvironment,
} from "./environment";

it("keeps Atlassian settings out of provider child processes", () => {
  const host = {
    PATH: "/bin",
    JARI_ATLASSIAN_TOKEN: "jira-fixture",
    atlassian_api_token: "preferred-fixture",
    jari_atlassian_confluence_token: "confluence-fixture",
    JARI_ATLASSIAN_SITE: "https://example.atlassian.net",
    JARI_CODEX_BIN: "/bin/custom-codex",
    CODEX_HOME: "/codex",
  };

  const codex = readProviderEnvironment("codex", host);
  expect(codex.executable).toBe("/bin/custom-codex");
  expect(codex.env).toEqual({
    PATH: "/bin",
    JARI_CODEX_BIN: "/bin/custom-codex",
    CODEX_HOME: "/codex",
  });
  expect(readProviderEnvironment("claude", host).executable).toBe("claude");
  expect(host.JARI_ATLASSIAN_TOKEN).toBe("jira-fixture");
});

it("loads a written .env, preserves launch values, and displays only allowlisted values", () => {
  const directory = mkdtempSync(join(tmpdir(), "jari-environment-"));
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const info = vi.spyOn(console, "info").mockImplementation(() => {});
  try {
    const path = join(directory, ".env");
    writeFileSync(
      path,
      [
        "ATLASSIAN_INSTANCE_URL=https://local-example.atlassian.net",
        "ATLASSIAN_USER_EMAIL=user@example.test",
        'ATLASSIAN_API_TOKEN="local-fixture#token"',
        "JARI_ATLASSIAN_TOKEN=jira-token-fixture",
        "JARI_ATLASSIAN_CONFLUENCE_TOKEN=confluence-token-fixture",
        "JARI_CODEX_BIN=/bin/custom-codex",
        "JARI_CLAUDE_BIN=",
        "JARI_DEBUG_ENV=1",
        "UNRELATED_SECRET=fixture-unrelated",
      ].join("\n"),
    );
    const env: NodeJS.ProcessEnv = { ATLASSIAN_USER_EMAIL: "launch@example.test" };

    loadDevelopmentEnvironment(path, env);

    expect(readAtlassianConfig(env)).toMatchObject({
      email: "launch@example.test",
      token: "local-fixture#token",
      siteOrigin: "https://local-example.atlassian.net",
    });
    expect(readProviderEnvironment("claude", env).executable).toBe("claude");
    expect(env.UNRELATED_SECRET).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("after testing"));
    expect(info).toHaveBeenCalledWith(
      '[Environment] ATLASSIAN_INSTANCE_URL: "https://local-example.atlassian.net" (.env)',
    );
    expect(info).toHaveBeenCalledWith(
      '[Environment] ATLASSIAN_USER_EMAIL: "launch@example.test" (launch environment)',
    );
    for (const key of [
      "ATLASSIAN_API_TOKEN",
      "JARI_ATLASSIAN_TOKEN",
      "JARI_ATLASSIAN_CONFLUENCE_TOKEN",
      "JARI_CODEX_BIN",
    ]) {
      expect(info).toHaveBeenCalledWith(`[Environment] ${key}: set (redacted, .env)`);
    }
    expect(JSON.stringify(info.mock.calls)).not.toMatch(
      /local-fixture|-token-fixture|fixture-unrelated/,
    );

    info.mockClear();
    loadDevelopmentEnvironment(path, { JARI_DEBUG_ENV: "0" });
    expect(info).not.toHaveBeenCalled();
  } finally {
    warn.mockRestore();
    info.mockRestore();
    rmSync(directory, { recursive: true, force: true });
  }
});
