import { Button } from "@once-ui-system/core/components/Button";
import { Column } from "@once-ui-system/core/components/Column";
import { Row } from "@once-ui-system/core/components/Row";
import { Text } from "@once-ui-system/core/components/Text";
import type { Token } from "prismjs";
import { Fragment, useEffect, useState } from "react";
import type { highlightDiffLine } from "./diff-syntax";

function diffLines(diff: string) {
  let before = 0;
  let after = 0;
  let remainingBefore = 0;
  let remainingAfter = 0;
  const lines = diff.split("\n");
  if (lines.at(-1) === "") lines.pop();
  return lines.map((line) => {
    const text = line.replace(/\r$/, "");
    const hunk = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(text);
    if (hunk) {
      before = Number(hunk[1]);
      remainingBefore = Number(hunk[2] ?? 1);
      after = Number(hunk[3]);
      remainingAfter = Number(hunk[4] ?? 1);
      return { text, kind: "header" as const };
    }
    if (text.startsWith("+") && remainingAfter > 0) {
      remainingAfter--;
      return { text, kind: "addition" as const, after: after++ };
    }
    if (text.startsWith("-") && remainingBefore > 0) {
      remainingBefore--;
      return { text, kind: "deletion" as const, before: before++ };
    }
    if (text.startsWith(" ") && remainingBefore > 0 && remainingAfter > 0) {
      remainingBefore--;
      remainingAfter--;
      return { text, kind: "context" as const, before: before++, after: after++ };
    }
    return { text, kind: "header" as const };
  });
}

const syntaxTones = {
  keyword: "brand-strong",
  string: "success-strong",
  "attr-value": "success-strong",
  function: "accent-strong",
  tag: "brand-strong",
  "attr-name": "accent-strong",
  number: "warning-strong",
  boolean: "warning-strong",
  comment: "neutral-weak",
} as const;

function SyntaxTokens({ tokens }: { tokens: Token | Token[] }) {
  if (typeof tokens === "string") return tokens;
  if (Array.isArray(tokens)) {
    return tokens.map((token, index) => <SyntaxTokens key={index} tokens={token} />);
  }
  const tone = syntaxTones[tokens.type as keyof typeof syntaxTones];
  return tone ? (
    <Text onBackground={tone} data-syntax={tokens.type}>
      <SyntaxTokens tokens={tokens.content} />
    </Text>
  ) : (
    <SyntaxTokens tokens={tokens.content} />
  );
}

export function ProposedDiff({ diff, path }: { diff: string; path: string }) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const [highlight, setHighlight] = useState<typeof highlightDiffLine>();
  const lines = diffLines(diff);

  useEffect(() => {
    let active = true;
    void import("./diff-syntax").then(
      ({ highlightDiffLine }) => {
        if (active) setHighlight(() => highlightDiffLine);
      },
      () => {
        // The patch is readable before the highlighter loads and if it fails.
      },
    );
    return () => {
      active = false;
    };
  }, []);

  async function copyDiff() {
    try {
      await navigator.clipboard.writeText(diff);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  }

  return (
    <Column
      role="region"
      aria-label="Proposed diff"
      fillWidth
      minWidth={0}
      background="surface"
      border="neutral-alpha-weak"
      radius="m"
    >
      <Row horizontal="between" vertical="center" gap="8" paddingX="8" paddingY="4">
        <Row gap="8" aria-hidden="true">
          <Row width={32} horizontal="end">
            <Text textVariant="label-default-s" onBackground="neutral-weak">
              Old
            </Text>
          </Row>
          <Row width={32} horizontal="end">
            <Text textVariant="label-default-s" onBackground="neutral-weak">
              New
            </Text>
          </Row>
        </Row>
        <Row gap="8" vertical="center">
          {copyStatus !== "idle" && (
            <Text role="status" textVariant="label-default-s">
              {copyStatus === "copied" ? "Copied" : "Could not copy the diff."}
            </Text>
          )}
          <Button type="button" size="s" variant="tertiary" onClick={() => void copyDiff()}>
            Copy diff
          </Button>
        </Row>
      </Row>
      <Column
        tabIndex={0}
        aria-label="Diff text"
        maxHeight="20rem"
        overflowY="auto"
        paddingBottom="8"
      >
        {lines.map(({ text, kind, before, after }, index) => (
          <Row
            key={index}
            gap="8"
            paddingX="8"
            background={
              kind === "addition"
                ? "success-alpha-weak"
                : kind === "deletion"
                  ? "danger-alpha-weak"
                  : undefined
            }
            data-diff-line={kind}
          >
            <Row minWidth={32} width={32} horizontal="end" aria-hidden="true">
              <Text textVariant="code-default-s" onBackground="neutral-weak">
                {before}
              </Text>
            </Row>
            <Row minWidth={32} width={32} horizontal="end" aria-hidden="true">
              <Text textVariant="code-default-s" onBackground="neutral-weak">
                {after}
              </Text>
            </Row>
            <Text
              as="code"
              textVariant="code-default-s"
              className="request-body"
              onBackground={kind === "header" ? "neutral-weak" : "neutral-strong"}
            >
              {kind === "header" || !highlight ? (
                text
              ) : (
                <Fragment>
                  {text[0]}
                  <SyntaxTokens tokens={highlight(path, text.slice(1))} />
                </Fragment>
              )}
            </Text>
          </Row>
        ))}
      </Column>
    </Column>
  );
}
