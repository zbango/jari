import { CodeBlock } from "@once-ui-system/core/code";

import { codeLanguages } from "./code-languages";

export function CodeDiff({
  diff,
  path,
  label = "Proposed diff",
}: {
  diff: string;
  path: string;
  label?: string;
}) {
  const extension = /\.([^./\\]+)$/.exec(path)?.[1]?.toLowerCase();
  const syntax = extension && codeLanguages.get(extension);
  return (
    <CodeBlock
      key={syntax || "diff"}
      role="region"
      aria-label={label}
      fillWidth
      minWidth={0}
      codeHeight="20rem"
      lineNumbers
      codes={[{ code: diff, language: syntax ? ["diff", syntax] : "diff", label }]}
    />
  );
}
