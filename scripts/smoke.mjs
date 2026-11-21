import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";

const [executable, ...args] = process.argv.slice(2);
if (!executable) {
  throw new Error("Expected an Electron or packaged application executable");
}

const profile = await mkdtemp(join(tmpdir(), "agent-desktop-smoke-"));
try {
  await new Promise((resolve, reject) => {
    const child = spawn(executable, [...args, "--smoke-test", `--user-data-dir=${profile}`], {
      stdio: ["ignore", "pipe", "inherit"],
      timeout: 45_000,
      killSignal: "SIGKILL",
      env: { ...process.env, ELECTRON_ENABLE_LOGGING: "1" },
    });
    let output = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => {
      process.stdout.write(chunk);
      output += chunk;
    });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0 && output.includes("Smoke test passed for Agent Desktop")) {
        resolve();
      } else {
        reject(new Error(`Desktop smoke test failed (exit ${code}, signal ${signal})`));
      }
    });
  });
} finally {
  await rm(profile, { recursive: true, force: true });
}
