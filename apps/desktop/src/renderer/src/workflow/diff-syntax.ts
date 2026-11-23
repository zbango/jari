import prism from "prismjs";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-json";
import "prismjs/components/prism-markdown";
import "prismjs/components/prism-python";
import "prismjs/components/prism-sql";
import "prismjs/components/prism-yaml";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";

const languages: Record<string, string> = {
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  css: "css",
  htm: "markup",
  html: "markup",
  svg: "markup",
  xml: "markup",
  cjs: "javascript",
  js: "javascript",
  mjs: "javascript",
  jsx: "jsx",
  json: "json",
  jsonc: "json",
  md: "markdown",
  py: "python",
  sql: "sql",
  cts: "typescript",
  mts: "typescript",
  ts: "typescript",
  tsx: "tsx",
  yaml: "yaml",
  yml: "yaml",
};

export function highlightDiffLine(path: string, text: string) {
  const extension = /\.([^./\\]+)$/.exec(path)?.[1]?.toLowerCase();
  const language =
    extension && Object.hasOwn(languages, extension) ? languages[extension] : undefined;
  const grammar = language ? prism.languages[language] : undefined;
  try {
    return grammar ? prism.tokenize(text, grammar) : text;
  } catch {
    return text;
  }
}
