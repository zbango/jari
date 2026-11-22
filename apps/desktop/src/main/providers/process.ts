import { spawn } from "node:child_process";
import type { WorkflowProvider } from "@agent-desktop/shared";
import { readProviderEnvironment } from "../environment";

export function providerOptions(provider: WorkflowProvider, cwd: string, signal: AbortSignal) {
  const { executable, env } = readProviderEnvironment(provider);
  return { executable, options: { cwd, env, signal, windowsHide: true } };
}

export function spawnProvider(
  provider: WorkflowProvider,
  args: string[],
  cwd: string,
  signal: AbortSignal,
) {
  const { executable, options } = providerOptions(provider, cwd, signal);
  const child = spawn(executable, args, options);
  child.stderr.resume();
  // The provider can exit before consuming stdin.
  child.stdin.on("error", () => {});
  return child;
}
