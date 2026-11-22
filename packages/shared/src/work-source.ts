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
  url: string;
  description: string;
  descriptionDocument?: AtlassianDocumentNode;
  comments: { author: string; body: string; document?: AtlassianDocumentNode }[];
  references: {
    title: string;
    url: string;
    text?: string;
    document?: AtlassianDocumentNode;
    unavailable?: boolean;
  }[];
}
