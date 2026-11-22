import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { releaseVersionFromTag } from "../packages/shared/src/release-version.ts";

const desktop = new URL("../apps/desktop/", import.meta.url);
const { version } = JSON.parse(await readFile(new URL("package.json", desktop), "utf8"));

const targets = new Map([
  ["linux-x64", ["linux-x86_64.AppImage", "linux-amd64.deb"]],
  ["macos-arm64", ["macos-arm64.dmg"]],
  ["macos-x64", ["macos-x64.dmg"]],
  ["windows-x64", ["windows-x64.exe"]],
]);

function expectedFiles(target) {
  const suffixes = targets.get(target);
  if (!suffixes) {
    throw new Error(`Unknown installer target: ${target}`);
  }
  return suffixes.map((suffix) => `agent-desktop-${version}-${suffix}`);
}

async function verifyFile(path) {
  const file = await stat(path);
  if (!file.isFile() || file.size === 0) {
    throw new Error(`Expected a nonempty installer: ${path}`);
  }
}

const [command, argument, destination] = process.argv.slice(2);

switch (command) {
  case "validate-tag": {
    if (releaseVersionFromTag(argument ?? "") !== version) {
      throw new Error(`Release tag ${argument} does not match desktop version ${version}`);
    }
    break;
  }
  case "stage": {
    await mkdir(destination, { recursive: true });
    for (const filename of expectedFiles(argument)) {
      const source = new URL(`dist/${filename}`, desktop);
      await verifyFile(source);
      await copyFile(source, join(destination, filename));
    }
    break;
  }
  case "checksums": {
    const expected = [...targets.keys()].flatMap(expectedFiles).sort();
    const actual = (await readdir(argument)).sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`Expected installers ${expected.join(", ")}. Received ${actual.join(", ")}.`);
    }
    const lines = [];
    for (const filename of expected) {
      const path = join(argument, filename);
      await verifyFile(path);
      const hash = createHash("sha256");
      for await (const chunk of createReadStream(path)) {
        hash.update(chunk);
      }
      lines.push(`${hash.digest("hex")}  ${filename}`);
    }
    await writeFile(join(argument, "SHA256SUMS"), `${lines.join("\n")}\n`);
    break;
  }
  default:
    throw new Error(
      "Expected validate-tag <tag>, stage <target> <directory>, or checksums <directory>",
    );
}
