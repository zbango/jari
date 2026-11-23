import { expect, it } from "vitest";
import { createAtlassianClient } from "./atlassian";

const env = {
  JARI_ATLASSIAN_SITE: "https://example.atlassian.net",
  JARI_ATLASSIAN_CLOUD_ID: "11111111-2222-3333-4444-555555555555",
  JARI_ATLASSIAN_EMAIL: "dev@example.test",
  JARI_ATLASSIAN_TOKEN: "fixture-jira-token",
  JARI_ATLASSIAN_CONFLUENCE_TOKEN: "fixture-confluence-token",
};

const threeVariables = {
  ATLASSIAN_INSTANCE_URL: "https://example.atlassian.net/jira/software",
  ATLASSIAN_USER_EMAIL: "dev@example.test",
  ATLASSIAN_API_TOKEN: "fixture-shared-token",
};

const expectedAuth = `Basic ${Buffer.from(
  `${threeVariables.ATLASSIAN_USER_EMAIL}:${threeVariables.ATLASSIAN_API_TOKEN}`,
).toString("base64")}`;

it("uses only the three supplied variables and discovers the scoped gateway without sending credentials to discovery", async () => {
  const calls: string[] = [];
  const client = createAtlassianClient(threeVariables, async (input, init) => {
    const url = new URL(String(input));
    calls.push(`${url.origin}${url.pathname}`);
    const auth = new Headers(init?.headers).get("Authorization");
    expect(init?.redirect).toBe("error");
    if (url.pathname === "/_edge/tenant_info") {
      expect(auth).toBeNull();
      return Response.json({ cloudId: env.JARI_ATLASSIAN_CLOUD_ID });
    }
    expect(auth).toBe(expectedAuth);
    expect(url.searchParams.get("type")).toBe("scrum");
    if (url.origin === "https://example.atlassian.net") {
      return new Response(null, { status: 401 });
    }
    return Response.json({ values: [{ id: 7, name: "Finance" }], isLast: true });
  });
  await expect(client.boards()).resolves.toEqual([{ id: 7, name: "Finance" }]);
  await expect(client.boards()).resolves.toEqual([{ id: 7, name: "Finance" }]);
  expect(calls).toEqual([
    "https://example.atlassian.net/rest/agile/1.0/board",
    "https://example.atlassian.net/_edge/tenant_info",
    `https://api.atlassian.com/ex/jira/${env.JARI_ATLASSIAN_CLOUD_ID}/rest/agile/1.0/board`,
    `https://api.atlassian.com/ex/jira/${env.JARI_ATLASSIAN_CLOUD_ID}/rest/agile/1.0/board`,
  ]);
});

it("searches every visible active sprint for the authenticated user's assigned issues", async () => {
  const cursors: (string | null)[] = [];
  const client = createAtlassianClient(threeVariables, async (input, init) => {
    const url = new URL(String(input));
    expect(url.pathname).toBe("/rest/api/3/search/jql");
    expect(new Headers(init?.headers).get("Authorization")).toBe(expectedAuth);
    expect(url.searchParams.get("jql")).toBe(
      "assignee = currentUser() AND sprint IN openSprints() ORDER BY updated DESC",
    );
    expect(url.searchParams.get("fields")).toBe("summary,status");
    const cursor = url.searchParams.get("nextPageToken");
    cursors.push(cursor);
    return Response.json({
      issues: [
        {
          key: cursor ? "OPS-2" : "FIN-1",
          fields: { summary: "Work item", status: { name: "Open" } },
        },
      ],
      nextPageToken: cursor ? undefined : "next",
    });
  });
  expect((await client.assignedSprintIssues()).map(({ key }) => key)).toEqual(["FIN-1", "OPS-2"]);
  expect(cursors).toEqual([null, "next"]);
});

it("uses the enhanced Jira endpoint and collects token-paginated sprint issues", async () => {
  const cursors: (string | null)[] = [];
  const client = createAtlassianClient(env, async (input, init) => {
    const url = new URL(String(input));
    expect(url.origin).toBe("https://api.atlassian.com");
    expect(url.pathname).toBe(
      `/ex/jira/${env.JARI_ATLASSIAN_CLOUD_ID}/rest/software/1.0/board/1/sprint/2/issue`,
    );
    expect(init?.redirect).toBe("error");
    const cursor = url.searchParams.get("nextPageToken");
    cursors.push(cursor);
    return Response.json({
      issues: [
        {
          key: cursor ? "FIN-2" : "FIN-1",
          fields: { summary: "Work item", status: { name: "Open" } },
        },
      ],
      nextPageToken: cursor ? undefined : "next",
    });
  });
  expect((await client.sprintIssues(1, 2)).map(({ key }) => key)).toEqual(["FIN-1", "FIN-2"]);
  expect(cursors).toEqual([null, "next"]);
});

it("loads Jira descriptions and comments plus same-site Confluence references", async () => {
  const link = `${env.JARI_ATLASSIAN_SITE}/wiki/spaces/FIN/pages/42/Requirements`;
  const doc = (text: string) => ({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  });
  const client = createAtlassianClient(threeVariables, async (input, init) => {
    const { origin, pathname: path } = new URL(String(input));
    expect(origin).toBe("https://example.atlassian.net");
    expect(new Headers(init?.headers).get("Authorization")).toBe(expectedAuth);
    if (path.endsWith("/remotelink"))
      return Response.json([{ object: { url: link, title: "Specs" } }]);
    if (path.endsWith("/comment"))
      return Response.json({
        total: 1,
        comments: [{ author: { displayName: "Reviewer" }, body: doc("Keep the permissions.") }],
      });
    if (path.endsWith("/pages/42"))
      return Response.json({
        title: "Requirements",
        body: { atlas_doc_format: { value: JSON.stringify(doc("Confluence source")) } },
      });
    return Response.json({
      key: "FIN-1",
      fields: { summary: "Payment state", description: doc("Jira requirement") },
    });
  });
  const result = await client.issue("FIN-1");
  expect(result.description).toBe("Jira requirement");
  expect(result.descriptionDocument).toEqual(doc("Jira requirement"));
  expect(result.comments).toEqual([
    {
      author: "Reviewer",
      body: "Keep the permissions.",
      document: doc("Keep the permissions."),
    },
  ]);
  expect(result.references).toEqual([
    {
      title: "Requirements",
      url: link,
      text: "Confluence source",
      document: doc("Confluence source"),
    },
  ]);
});

it("preserves Jira issue link directions and includes same-site issue references", async () => {
  const blocks = { inward: "is blocked by", outward: "blocks" };
  const calls: string[] = [];
  const client = createAtlassianClient(threeVariables, async (input) => {
    const url = new URL(String(input));
    calls.push(url.pathname);
    if (url.pathname.endsWith("/remotelink")) {
      return Response.json([{ object: { url: "/browse/FIN-2" } }]);
    }
    if (url.pathname.endsWith("/comment")) {
      return Response.json({ total: 0, comments: [] });
    }
    expect(url.searchParams.get("fields")?.split(",")).toContain("issuelinks");
    return Response.json({
      key: "FIN-1",
      fields: {
        summary: "Payment display",
        issuelinks: [
          {
            type: blocks,
            inwardIssue: {
              key: "FIN-2",
              fields: {
                summary: "Update ledger",
                status: { name: "Open", statusCategory: { key: "new" } },
              },
            },
          },
          { type: blocks, outwardIssue: { key: "FIN-3" } },
        ],
        description: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "inlineCard",
                  attrs: { url: "https://example.atlassian.net/browse/FIN-4" },
                },
              ],
            },
          ],
        },
      },
    });
  });
  const result = await client.issue("FIN-1");
  expect(result.linkedIssues).toEqual([
    {
      key: "FIN-2",
      relationship: "is blocked by",
      title: "Update ledger",
      status: "Open",
      statusCategory: "new",
      isBlocker: true,
    },
    { key: "FIN-3", relationship: "blocks" },
    { key: "FIN-4", relationship: "References" },
  ]);
  expect(result.references).toEqual([]);
  expect(calls).toHaveLength(3);
});

it("verifies inbound blockers before planning and permits downstream and completed links", async () => {
  let category: string | undefined = "indeterminate";
  const client = createAtlassianClient(threeVariables, async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/FIN-2")) {
      expect(url.searchParams.get("fields")).toBe("status");
      if (!category) return new Response(null, { status: 404 });
      return Response.json({
        key: "FIN-2",
        fields: {
          status: {
            name: category === "done" ? "Shipped" : "Working",
            statusCategory: { key: category },
          },
        },
      });
    }
    expect(url.pathname).toBe("/rest/api/3/issue/FIN-1");
    expect(url.searchParams.get("fields")).toBe("issuelinks");
    return Response.json({
      key: "FIN-1",
      fields: {
        issuelinks: [
          {
            type: { name: "Blocks", inward: "is blocked by", outward: "blocks" },
            inwardIssue: { key: "FIN-2" },
          },
          {
            type: { name: "Blocks", inward: "is blocked by", outward: "blocks" },
            outwardIssue: {
              key: "FIN-3",
              fields: { status: { name: "Open", statusCategory: { key: "new" } } },
            },
          },
        ],
      },
    });
  });
  const source = {
    key: "FIN-1",
    title: "Show settlements",
    status: "Open",
    url: "https://example.atlassian.net/browse/FIN-1",
    description: "Original Jira snapshot.",
    comments: [],
    references: [],
  };
  await expect(client.verifyPlanningIssue(source)).rejects.toThrow(
    /Planning is blocked by FIN-2 \(Working\)/,
  );
  category = undefined;
  await expect(client.verifyPlanningIssue(source)).rejects.toThrow(/FIN-2 \(status unverified\)/);
  category = "done";
  await expect(client.verifyPlanningIssue(source)).resolves.toMatchObject({
    description: source.description,
    linkedIssues: [
      { key: "FIN-2", status: "Shipped", statusCategory: "done", isBlocker: true },
      { key: "FIN-3", status: "Open", relationship: "blocks" },
    ],
  });
});
