import { spawn } from "node:child_process";
import type {
  MilestoneCommand,
  MilestoneInput,
  WorkflowMilestone,
  WorkflowStageSettings,
} from "@agent-desktop/shared";
import { withoutAtlassianEnvironment } from "./environment";

function readMilestoneProperties(title: unknown, description: unknown) {
  if (typeof title !== "string" || !title.trim() || title.length > 80) {
    throw new Error("Enter a milestone name of up to 80 characters.");
  }
  if (description !== undefined && (typeof description !== "string" || description.length > 500)) {
    throw new Error("Keep the milestone description within 500 characters.");
  }
  return { title: title.trim(), description: description?.trim() ?? "" };
}

export function readStageSettings(value: unknown): WorkflowStageSettings {
  if (!value || typeof value !== "object") throw new Error("Enter milestone settings.");
  const { title, description, expandDetails } = value as Partial<WorkflowStageSettings>;
  if (
    expandDetails !== "default" &&
    expandDetails !== "expanded" &&
    expandDetails !== "collapsed"
  ) {
    throw new Error("Choose how the milestone details open.");
  }
  return { ...readMilestoneProperties(title, description), expandDetails };
}

export function readMilestoneInput(value: unknown): MilestoneInput {
  if (!value || typeof value !== "object") throw new Error("Enter milestone settings.");
  const { title, description, timing, action, executable, args, timeoutMinutes, trigger } =
    value as Partial<Omit<MilestoneCommand, "action">> & {
      title?: unknown;
      description?: unknown;
      timing?: unknown;
      action?: unknown;
    };
  const properties = readMilestoneProperties(title, description);
  if (timing !== "before-build" && timing !== "after-build" && timing !== "follow-up") {
    throw new Error("Choose when the milestone runs.");
  }
  if (action === "checkpoint") return { ...properties, timing, action };
  if (action !== undefined && action !== "command") throw new Error("Choose a milestone action.");
  if (
    typeof executable !== "string" ||
    !executable.trim() ||
    executable.length > 1024 ||
    /[\0\r\n]/.test(executable) ||
    !Array.isArray(args) ||
    args.length > 64 ||
    !args.every((arg) => typeof arg === "string" && arg.length <= 4096 && !/[\0\r\n]/.test(arg))
  ) {
    throw new Error("Enter an executable and up to 64 arguments, one per line.");
  }
  if (
    timeoutMinutes !== undefined &&
    (!Number.isInteger(timeoutMinutes) || timeoutMinutes < 1 || timeoutMinutes > 120)
  ) {
    throw new Error("Enter a command timeout between 1 and 120 minutes.");
  }
  if (trigger !== undefined && trigger !== "automatic" && trigger !== "manual") {
    throw new Error("Choose how this command starts.");
  }
  if (timing === "follow-up" && trigger === "automatic") {
    throw new Error("Follow-up commands start manually.");
  }
  return {
    ...properties,
    timing,
    action: "command",
    executable: executable.trim(),
    args,
    timeoutMinutes,
    trigger: trigger ?? (timing === "follow-up" ? "manual" : "automatic"),
  };
}

export function runWorkflowCommand(
  { executable, args, timeoutMinutes = 10 }: MilestoneCommand,
  cwd: string,
  signal: AbortSignal,
): Promise<Pick<WorkflowMilestone, "state" | "output" | "message">> {
  return new Promise((resolve) => {
    const child = spawn(executable, args, {
      cwd,
      env: withoutAtlassianEnvironment(),
      signal,
      killSignal: "SIGKILL",
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let output = "";
    const capture = (chunk: string) => {
      output = (output + chunk).slice(-32_000);
    };
    child.stdout.setEncoding("utf8").on("data", capture);
    child.stderr.setEncoding("utf8").on("data", capture);

    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      child.stdout.destroy();
      child.stderr.destroy();
      resolve({
        state: "failed",
        output,
        message: `Command exceeded its time limit (${timeoutMinutes} min).`,
      });
    }, timeoutMinutes * 60_000);
    child.once("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timeout);
      child.stdout.destroy();
      child.stderr.destroy();
      const message = signal.aborted
        ? "The command was interrupted."
        : `Command could not start (${error.code ?? "unknown error"}).`;
      resolve({ state: signal.aborted ? "interrupted" : "failed", output, message });
    });
    child.once("close", (code, exitSignal) => {
      clearTimeout(timeout);
      resolve(
        code === 0
          ? { state: "completed", output }
          : {
              state: "failed",
              output,
              message: `Command failed (${code ?? exitSignal ?? "unknown error"}).`,
            },
      );
    });
  });
}
