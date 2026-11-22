import type { KnowledgeNote } from "@agent-desktop/shared";
import { convert } from "html-to-text";
import sanitizeHtml from "sanitize-html";

export function readKnowledgeNote(input: unknown): Omit<KnowledgeNote, "id"> {
  if (
    !input ||
    typeof input !== "object" ||
    !("area" in input) ||
    typeof input.area !== "string" ||
    !input.area.trim() ||
    !("title" in input) ||
    typeof input.title !== "string" ||
    !input.title.trim() ||
    !("bodyHtml" in input) ||
    typeof input.bodyHtml !== "string" ||
    !("paths" in input) ||
    !Array.isArray(input.paths)
  ) {
    throw new Error("Enter an area and a note title.");
  }

  const paths = new Set<string>();
  for (const path of input.paths) {
    if (typeof path !== "string" || /[\r\n\0]/.test(path)) {
      throw new Error("Enter one file path per line.");
    }
    if (path.trim()) paths.add(path.trim());
  }
  const bodyHtml = sanitizeHtml(input.bodyHtml, {
    allowedTags: [
      "p",
      "br",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "b",
      "strong",
      "i",
      "em",
      "u",
      "s",
      "strike",
      "del",
      "a",
      "ul",
      "ol",
      "li",
      "blockquote",
      "pre",
      "code",
      "hr",
    ],
    allowedAttributes: { a: ["href"], ol: ["start"] },
    allowedSchemes: ["http", "https", "mailto"],
    allowProtocolRelative: false,
  });
  const bodyText = convert(bodyHtml, {
    wordwrap: false,
    selectors: [{ selector: "a", options: { hideLinkHrefIfSameAsText: true } }],
  }).trim();
  if (!bodyText && paths.size === 0) {
    throw new Error("Add a note or at least one relevant file path.");
  }
  return {
    area: input.area.trim(),
    title: input.title.trim(),
    bodyHtml,
    bodyText,
    paths: [...paths],
  };
}

export function readKnowledgeNoteIds(input: unknown): Set<string> {
  if (input === undefined) return new Set();
  if (!Array.isArray(input) || !input.every((value) => typeof value === "string" && value.trim())) {
    throw new Error("Select valid Company Knowledge notes.");
  }
  return new Set<string>(input);
}
