import { execFile } from "node:child_process";
import { access, mkdtemp, readdir, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { WorkflowBuildTask } from "@agent-desktop/shared";

type TaskGit = NonNullable<WorkflowBuildTask["git"]>;
const exec = promisify(execFile);
const conventionalSubject =
  /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([\w./-]+\))?!?: \S[^\r\n]*$/;

function isCommitSubject(subject: string): boolean {
  return subject.length <= 120 && !subject.includes("\0") && conventionalSubject.test(subject);
}

async function git(cwd: string, args: string[], index?: string): Promise<string> {
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_TERMINAL_PROMPT: "0" };
  for (const key of [
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_COMMON_DIR",
    "GIT_INDEX_FILE",
    "GIT_OBJECT_DIRECTORY",
    "GIT_ALTERNATE_OBJECT_DIRECTORIES",
    "GIT_NAMESPACE",
    "GIT_PREFIX",
  ])
    delete env[key];
  if (index) env.GIT_INDEX_FILE = index;
  try {
    return (await exec("git", args, { cwd, env, timeout: 30_000, maxBuffer: 4_000_000 })).stdout;
  } catch (error) {
    const failure = error as NodeJS.ErrnoException & { stderr?: string };
    if (failure.code === "ENOENT") throw new Error("Install Git and make it available on PATH.");
    throw new Error(failure.stderr?.trim() || `Git could not finish ${args[0]}.`, { cause: error });
  }
}

async function currentBranch(path: string) {
  const branch = await git(path, ["symbolic-ref", "--quiet", "HEAD"]).catch(() => {
    throw new Error("Check out a Git branch before building.");
  });
  const head = (
    await git(path, ["rev-parse", "--quiet", "--verify", "HEAD"]).catch(() => "")
  ).trim();
  return { branch: branch.trim(), base: head || null };
}

async function requireIdleRepository(path: string) {
  const operations = [
    "MERGE_HEAD",
    "CHERRY_PICK_HEAD",
    "REVERT_HEAD",
    "rebase-merge",
    "rebase-apply",
  ];
  const inProgress = await Promise.all(
    operations.map(async (operation) => {
      const marker = (
        await git(path, ["rev-parse", "--path-format=absolute", "--git-path", operation])
      ).trimEnd();
      return access(marker).then(
        () => true,
        (error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") return false;
          throw error;
        },
      );
    }),
  );
  if (inProgress.some(Boolean)) {
    throw new Error("Finish the current Git operation before building or approving a task.");
  }
}

export async function prepareTaskGit(path: string, previous?: TaskGit): Promise<TaskGit> {
  let root: string;
  try {
    root = (await git(path, ["rev-parse", "--show-toplevel"])).trimEnd();
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("not a git repository")) throw error;
    if (previous || (await readdir(path)).length) {
      throw new Error("Choose the root of a Git repository or an empty workspace.");
    }
    await git(path, ["init"]);
    root = path;
  }
  if ((await realpath(root)) !== path) throw new Error("Choose the root of the Git repository.");
  await requireIdleRepository(path);
  const current = await currentBranch(path);
  if (previous) {
    if (current.branch !== previous.branch || current.base !== previous.base) {
      throw new Error("Return to the Git branch and commit this task started from.");
    }
    return previous;
  }
  if (await git(path, ["status", "--porcelain=v1", "-z", "--untracked-files=all"])) {
    throw new Error("Commit or stash existing workspace changes before starting this Build task.");
  }
  return current;
}

async function snapshot(path: string, base: string | null) {
  const directory = await mkdtemp(join(tmpdir(), "jari-git-index-"));
  const index = join(directory, "index");
  try {
    await git(path, base ? ["read-tree", base] : ["read-tree", "--empty"], index);
    await git(path, ["add", "-A", "--", "."], index);
    const tree = (await git(path, ["write-tree"], index)).trim();
    const changed = await git(
      path,
      ["diff", "--cached", "--name-only", "--no-renames", "-z", ...(base ? [base] : [])],
      index,
    );
    return { tree, files: changed.split("\0").filter(Boolean) };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function defaultSubject(title: string, files: string[]) {
  if (isCommitSubject(title)) return title;
  const type = /\b(fix|repair|correct|resolve)\b/i.test(title)
    ? "fix"
    : /\b(refactor|restructure|extract)\b/i.test(title)
      ? "refactor"
      : /\b(test|tests)\b/i.test(title)
        ? "test"
        : files.length && files.every((file) => /(^docs\/|\.(md|mdx)$)/i.test(file))
          ? "docs"
          : /\b(add|introduce|implement|support|enable|persist)\b/i.test(title)
            ? "feat"
            : "chore";
  return `${type}: ${title.replace(/\s+/g, " ").trim().slice(0, 110)}`;
}

export async function captureTaskChanges(
  path: string,
  taskGit: TaskGit,
  title: string,
): Promise<TaskGit> {
  await prepareTaskGit(path, taskGit);
  const changes = await snapshot(path, taskGit.base);
  return { ...taskGit, review: { ...changes, subject: defaultSubject(title, changes.files) } };
}

export async function commitTaskChanges(
  path: string,
  taskGit: TaskGit,
  marker: string,
  requestedSubject: unknown,
): Promise<TaskGit> {
  const review = taskGit.review;
  if (!review) throw new Error("Run the task again to capture its changes for review.");
  await requireIdleRepository(path);
  const current = await currentBranch(path);
  if (current.branch !== taskGit.branch)
    throw new Error("Check out the branch used for this task.");
  if (current.base !== taskGit.base) {
    if (current.base) {
      const commit = await git(path, [
        "log",
        "-1",
        "--format=%T%x00%s%x00%(trailers:key=Jari-Task,valueonly)",
        "HEAD",
      ]);
      const [tree, subject, trailer] = commit.trimEnd().split("\0");
      if (tree === review.tree && subject && trailer === marker) {
        return { ...taskGit, commit: { hash: current.base, subject } };
      }
    }
    throw new Error(
      "The Git branch advanced after this task started. Its changes need a new review.",
    );
  }
  const changes = await snapshot(path, taskGit.base);
  if (changes.tree !== review.tree) {
    throw new Error(
      "Workspace changes differ from the reviewed snapshot. Request changes to run a new review.",
    );
  }
  const staged = await git(path, ["diff", "--cached", "--name-only", "-z"]);
  if (staged && (await git(path, ["write-tree"])).trim() !== review.tree) {
    throw new Error("Unstage other changes before approving this task.");
  }
  if (!review.files.length) return taskGit;
  const subject = typeof requestedSubject === "string" ? requestedSubject.trim() : review.subject;
  if (!isCommitSubject(subject)) {
    throw new Error("Enter a Conventional Commit subject such as fix: correct the payment total.");
  }
  const beforeCommit = await currentBranch(path);
  if (beforeCommit.branch !== taskGit.branch || beforeCommit.base !== taskGit.base) {
    throw new Error(
      "The Git branch changed while approving this task. Check the workspace and retry.",
    );
  }
  await git(path, ["read-tree", review.tree]);
  try {
    await git(path, ["commit", "-m", subject, "-m", `Jari-Task: ${marker}`]);
  } catch (error) {
    const after = await currentBranch(path);
    if (
      after.branch === taskGit.branch &&
      after.base === taskGit.base &&
      (await git(path, ["write-tree"])).trim() === review.tree
    ) {
      await git(path, taskGit.base ? ["read-tree", taskGit.base] : ["read-tree", "--empty"]);
    }
    throw error;
  }
  const [hash, tree, committedSubject] = (
    await git(path, ["log", "-1", "--format=%H%x00%T%x00%s", "HEAD"])
  )
    .trimEnd()
    .split("\0");
  if (!hash || tree !== review.tree || !committedSubject || !isCommitSubject(committedSubject)) {
    throw new Error(
      "Git created a commit that differs from the reviewed changes. Inspect the commit before continuing.",
    );
  }
  return { ...taskGit, commit: { hash, subject: committedSubject } };
}
