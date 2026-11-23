import { openWorkItemBlockers } from "@agent-desktop/shared";
import type {
  AtlassianDocumentNode,
  WorkBoard,
  WorkItem,
  WorkItemLink,
  WorkItemSummary,
  WorkSprint,
} from "@agent-desktop/shared";
import { isAtlassianCloudId, readAtlassianConfig } from "./environment";

type JiraIssue = {
  key: string;
  fields: {
    summary: string;
    status?: JiraStatus;
    description?: AtlassianDocumentNode | null;
    issuelinks?: JiraIssueLink[];
  };
};
type JiraStatus = { name: string; statusCategory?: { key?: string } };
type JiraLinkedIssue = {
  key: string;
  fields?: { summary?: string; status?: JiraStatus };
};
type JiraIssueLink = {
  type: { name?: string; inward: string; outward: string };
  inwardIssue?: JiraLinkedIssue;
  outwardIssue?: JiraLinkedIssue;
};
type JiraComment = { author?: { displayName?: string }; body: AtlassianDocumentNode };
type JiraRemoteLink = { object?: { title?: string; url?: string } };
type OffsetPage<T> = { values: T[]; isLast?: boolean; total?: number };
type Board = { id: number; name: string };
type Sprint = { id: number; name: string };

function readDocument(document: AtlassianDocumentNode | null | undefined): {
  text: string;
  links: string[];
} {
  const links = new Set<string>();
  function visit(node: AtlassianDocumentNode): string {
    for (const mark of node.marks ?? []) {
      if (mark.attrs?.href) links.add(mark.attrs.href);
    }
    if (node.attrs?.url) links.add(node.attrs.url);
    if (node.type === "hardBreak") return "\n";
    const text = node.text ?? node.content?.map(visit).join("") ?? node.attrs?.url ?? "";
    return ["paragraph", "heading", "listItem", "codeBlock", "tableRow"].includes(node.type ?? "")
      ? `${text}\n`
      : text;
  }
  return { text: document ? visit(document).trim() : "", links: [...links] };
}

function isIssueKey(value: unknown): value is string {
  return typeof value === "string" && value.length <= 80 && /^[A-Z][A-Z0-9_]*-[0-9]+$/.test(value);
}

export function issueKey(value: unknown): string {
  if (!isIssueKey(value)) {
    throw new Error("Select a valid Jira issue.");
  }
  return value;
}

export function jiraId(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error("Select a valid Jira board or sprint.");
  }
  return value;
}

function summarize(issue: JiraIssue): WorkItemSummary {
  return {
    key: issueKey(issue.key),
    title: issue.fields.summary,
    status: issue.fields.status?.name ?? "Unknown",
  };
}

export function createAtlassianClient(env?: NodeJS.ProcessEnv, transport = fetch) {
  const { siteOrigin, cloudId, email, token, confluenceToken } = readAtlassianConfig(env);

  const gatewayProducts = new Set<"jira" | "confluence">();
  let discoveredCloudId: Promise<string> | undefined;

  async function send(url: URL, headers: Record<string, string>): Promise<Response> {
    try {
      return await transport(url, {
        headers: { Accept: "application/json", ...headers },
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new Error("Atlassian Cloud is unreachable. Check the network and try again.");
    }
  }

  async function discoverCloudId(): Promise<string> {
    const response = await send(new URL("/_edge/tenant_info", siteOrigin), {});
    const tenant = response.ok ? await response.json().catch(() => null) : null;
    if (
      !tenant ||
      typeof tenant !== "object" ||
      !("cloudId" in tenant) ||
      !isAtlassianCloudId(tenant.cloudId)
    ) {
      throw new Error(
        "Could not discover the Cloud ID for the configured Atlassian site. Check your instance URL.",
      );
    }
    return tenant.cloudId;
  }

  async function get<T>(
    product: "jira" | "confluence",
    path: string,
    query: Record<string, string> = {},
  ): Promise<T> {
    const credential = product === "jira" ? token : confluenceToken;
    const authorization = `Basic ${Buffer.from(`${email}:${credential}`).toString("base64")}`;
    const params = new URLSearchParams(query);
    const siteUrl = new URL(path, siteOrigin);
    siteUrl.search = params.toString();
    const headers = { Authorization: authorization };
    let response =
      cloudId || gatewayProducts.has(product) ? undefined : await send(siteUrl, headers);

    if (!response || response.status === 401 || response.status === 403) {
      const id = cloudId ?? (await (discoveredCloudId ??= discoverCloudId()));
      const gatewayUrl = new URL(`https://api.atlassian.com/ex/${product}/${id}${path}`);
      gatewayUrl.search = params.toString();
      response = await send(gatewayUrl, headers);
      if (response.ok) gatewayProducts.add(product);
    }
    if (!response.ok) {
      const detail =
        response.status === 401 || response.status === 403
          ? "Check the account, token scopes and Atlassian permissions."
          : response.status === 429
            ? "Atlassian rate-limited the request. Try again shortly."
            : "Check that the resource is accessible on your site.";
      throw new Error(`Atlassian returned HTTP ${response.status}. ${detail}`);
    }
    return response.json() as Promise<T>;
  }

  async function offsets<T>(path: string, query: Record<string, string>): Promise<T[]> {
    const values: T[] = [];
    for (;;) {
      const page = await get<OffsetPage<T>>("jira", path, {
        ...query,
        startAt: String(values.length),
        maxResults: "50",
      });
      values.push(...page.values);
      if (
        page.isLast ||
        !page.values.length ||
        (page.total !== undefined && values.length >= page.total)
      ) {
        return values;
      }
    }
  }

  async function searchIssues(
    path: string,
    query: Record<string, string> = {},
  ): Promise<WorkItemSummary[]> {
    const issues: WorkItemSummary[] = [];
    const cursors = new Set<string>();
    let cursor: string | undefined;
    do {
      const page = await get<{ issues: JiraIssue[]; nextPageToken?: string }>("jira", path, {
        ...query,
        fields: "summary,status",
        maxResults: "50",
        ...(cursor ? { nextPageToken: cursor } : {}),
      });
      issues.push(...page.issues.map(summarize));
      cursor = page.nextPageToken;
      if (cursor && cursors.has(cursor)) throw new Error("Jira returned a repeated issue page.");
      if (cursor) cursors.add(cursor);
    } while (cursor);
    return issues;
  }

  async function issueRelationships(
    key: string,
    relations: JiraIssueLink[],
  ): Promise<WorkItemLink[]> {
    const links: WorkItemLink[] = [];
    for (const { type, inwardIssue, outwardIssue } of relations) {
      const blockerType =
        type.name?.trim().toLowerCase() === "blocks" ||
        type.outward.trim().toLowerCase() === "blocks" ||
        type.inward.trim().toLowerCase() === "is blocked by";
      for (const [linked, relationship, isBlocker] of [
        [inwardIssue, type.inward, blockerType],
        [outwardIssue, type.outward, false],
      ] as const) {
        if (!linked || !isIssueKey(linked.key) || linked.key === key) continue;
        const status = linked.fields?.status;
        links.push({
          key: linked.key,
          relationship,
          ...(linked.fields?.summary ? { title: linked.fields.summary } : {}),
          ...(status?.name ? { status: status.name } : {}),
          ...(status?.statusCategory?.key ? { statusCategory: status.statusCategory.key } : {}),
          ...(isBlocker ? { isBlocker: true } : {}),
        });
      }
    }
    const unknownKeys = new Set(
      links.filter((link) => link.isBlocker && !link.statusCategory).map(({ key }) => key),
    );
    const statuses = await Promise.all(
      [...unknownKeys].map(async (key) => {
        const issue = await get<JiraLinkedIssue>("jira", `/rest/api/3/issue/${key}`, {
          fields: "status",
        }).catch(() => undefined);
        return [key, issue?.fields?.status] as const;
      }),
    );
    const statusByKey = new Map(statuses);
    return links.map((link) => {
      const status = statusByKey.get(link.key);
      return status?.statusCategory?.key
        ? { ...link, status: status.name, statusCategory: status.statusCategory.key }
        : link;
    });
  }

  return {
    assignedSprintIssues(): Promise<WorkItemSummary[]> {
      return searchIssues("/rest/api/3/search/jql", {
        jql: "assignee = currentUser() AND sprint IN openSprints() ORDER BY updated DESC",
      });
    },
    async boards(): Promise<WorkBoard[]> {
      return (await offsets<Board>("/rest/agile/1.0/board", { type: "scrum" })).map(
        ({ id, name }) => ({ id, name }),
      );
    },
    async activeSprints(boardId: number): Promise<WorkSprint[]> {
      return (
        await offsets<Sprint>(`/rest/agile/1.0/board/${jiraId(boardId)}/sprint`, {
          state: "active",
        })
      ).map(({ id, name }) => ({ id, name }));
    },
    sprintIssues(boardId: number, sprintId: number): Promise<WorkItemSummary[]> {
      return searchIssues(
        `/rest/software/1.0/board/${jiraId(boardId)}/sprint/${jiraId(sprintId)}/issue`,
      );
    },
    async verifyPlanningIssue(source: WorkItem): Promise<WorkItem> {
      let linkedIssues: WorkItemLink[];
      try {
        const item = await get<JiraIssue>("jira", `/rest/api/3/issue/${issueKey(source.key)}`, {
          fields: "issuelinks",
        });
        if (!Array.isArray(item.fields.issuelinks)) throw new Error("Jira omitted issue links.");
        linkedIssues = await issueRelationships(item.key, item.fields.issuelinks);
      } catch {
        throw new Error(
          "Jira dependencies could not be checked. Check Jira access and try again before planning.",
        );
      }
      const blockers = openWorkItemBlockers(linkedIssues);
      if (blockers.length) {
        const detail = blockers
          .map(
            ({ key, status, statusCategory }) =>
              `${key} (${statusCategory ? (status ?? statusCategory) : "status unverified"})`,
          )
          .join(", ");
        throw new Error(
          `Planning is blocked by ${detail}. Check Jira and try again once the blockers are Done.`,
        );
      }
      const linkedKeys = new Set(linkedIssues.map(({ key }) => key));
      const mentions =
        source.linkedIssues?.filter(
          ({ key, relationship }) => relationship === "References" && !linkedKeys.has(key),
        ) ?? [];
      return { ...source, linkedIssues: [...linkedIssues, ...mentions] };
    },
    async issue(key: string): Promise<WorkItem> {
      const path = `/rest/api/3/issue/${issueKey(key)}`;
      const [item, remoteLinks] = await Promise.all([
        get<JiraIssue>("jira", path, { fields: "summary,description,status,issuelinks" }),
        get<JiraRemoteLink[]>("jira", `${path}/remotelink`).catch(() => []),
      ]);
      const descriptionDocument = item.fields.description ?? undefined;
      const { text: description, links } = readDocument(descriptionDocument);
      const comments: WorkItem["comments"] = [];
      for (;;) {
        const page = await get<{ comments: JiraComment[]; total: number }>(
          "jira",
          `${path}/comment`,
          {
            startAt: String(comments.length),
            maxResults: "50",
          },
        );
        for (const { author, body } of page.comments) {
          const comment = readDocument(body);
          comments.push({
            author: author?.displayName ?? "Unknown author",
            body: comment.text,
            document: body,
          });
          links.push(...comment.links);
        }
        if (!page.comments.length || comments.length >= page.total) break;
      }
      const references: WorkItem["references"] = [];
      const linkedIssues = await issueRelationships(item.key, item.fields.issuelinks ?? []);
      const linkedKeys = new Set(linkedIssues.map(({ key }) => key));
      const urls = new Map(links.map((url) => [url, url]));
      for (const { object } of remoteLinks) {
        if (object?.url) urls.set(object.url, object.title ?? object.url);
      }
      for (const [url, title] of urls) {
        const parsed = url.startsWith("/") ? URL.parse(url, siteOrigin) : URL.parse(url);
        if (!parsed || (parsed.protocol !== "https:" && parsed.protocol !== "http:")) continue;
        const mentioned =
          parsed.origin === siteOrigin
            ? /^\/browse\/([^/]+)\/?$/.exec(parsed.pathname)?.[1]
            : undefined;
        if (isIssueKey(mentioned) && mentioned !== item.key) {
          if (!linkedKeys.has(mentioned)) {
            linkedIssues.push({ key: mentioned, relationship: "References" });
            linkedKeys.add(mentioned);
          }
          continue;
        }
        if (!URL.canParse(url)) continue;
        const id =
          parsed.origin === siteOrigin
            ? (/\/wiki\/(?:spaces\/[^/]+\/pages\/|pages\/)([0-9]+)(?:\/|$)/.exec(
                parsed.pathname,
              )?.[1] ??
              (parsed.pathname === "/wiki/pages/viewpage.action"
                ? parsed.searchParams.get("pageId")
                : null))
            : null;
        if (!id || !/^\d+$/.test(id)) {
          references.push({ title, url });
          continue;
        }
        try {
          const page = await get<{
            title: string;
            body?: { atlas_doc_format?: { value: string } };
          }>("confluence", `/wiki/api/v2/pages/${id}`, { "body-format": "atlas_doc_format" });
          const body = page.body?.atlas_doc_format?.value;
          const document = body ? (JSON.parse(body) as AtlassianDocumentNode | null) : null;
          references.push({
            title: page.title,
            url,
            ...(document ? { document, text: readDocument(document).text } : {}),
          });
        } catch {
          references.push({ title, url, unavailable: true });
        }
      }
      return {
        ...summarize(item),
        url: `${siteOrigin}/browse/${item.key}`,
        description,
        ...(descriptionDocument ? { descriptionDocument } : {}),
        comments,
        references,
        linkedIssues,
      };
    },
  };
}
