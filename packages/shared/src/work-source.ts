export interface WorkBoard {
  id: number;
  name: string;
}

export interface WorkSprint {
  id: number;
  name: string;
}

export interface WorkItemSummary {
  key: string;
  title: string;
  status: string;
}

export interface WorkItemLink {
  key: string;
  relationship: string;
  title?: string;
  status?: string;
  statusCategory?: string;
  isBlocker?: boolean;
}

export function openWorkItemBlockers(links: readonly WorkItemLink[] = []): WorkItemLink[] {
  return links.filter(
    ({ isBlocker, statusCategory }) =>
      isBlocker && statusCategory !== "done" && statusCategory !== "completed",
  );
}

export interface AtlassianDocumentNode {
  type?: string;
  text?: string;
  attrs?: {
    url?: string;
    text?: string;
    alt?: string;
    level?: number;
    order?: number;
    colspan?: number;
    rowspan?: number;
  };
  marks?: { type?: string; attrs?: { href?: string } }[];
  content?: AtlassianDocumentNode[];
}

export interface WorkItem extends WorkItemSummary {
  kind?: "simulated";
  url?: string;
  description: string;
  descriptionDocument?: AtlassianDocumentNode;
  linkedIssues?: WorkItemLink[];
  comments: { author: string; body: string; document?: AtlassianDocumentNode }[];
  references: {
    title: string;
    url: string;
    text?: string;
    document?: AtlassianDocumentNode;
    unavailable?: boolean;
  }[];
}
