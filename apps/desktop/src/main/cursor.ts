import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { withoutAtlassianEnvironment } from "./environment";

export async function openCursor(workspace: string): Promise<void> {
  const executables =
    process.platform === "win32"
      ? [
          ...[
            process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Programs"),
            process.env.ProgramFiles,
          ]
            .filter((path): path is string => !!path && isAbsolute(path))
            .map((path) => join(path, "cursor", "Cursor.exe")),
          "Cursor.exe",
        ]
      : process.platform === "darwin"
        ? ["/Applications", join(homedir(), "Applications")]
            .map((path) =>
              join(path, "Cursor.app", "Contents", "Resources", "app", "bin", "cursor"),
            )
            .concat("cursor")
        : ["cursor"];
  const env = withoutAtlassianEnvironment();
  delete env.ELECTRON_RUN_AS_NODE;

  for (const executable of executables) {
    try {
      await new Promise<void>((resolve, reject) => {
        const child = spawn(executable, ["--classic", workspace], {
          detached: true,
          stdio: "ignore",
          env,
        });
        child.once("error", reject);
        child.once("spawn", () => {
          child.unref();
          resolve();
        });
      });
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw new Error(
          "Cursor could not start. Check that the application is installed and executable.",
        );
      }
    }
  }
  throw new Error("Cursor was not found. Install Cursor or add its shell command to PATH.");
}
