# Jira work intake

Start Agent Desktop with a Jira Cloud API token from your Atlassian account. This connection is for a locally configured app. For distributed sign-in, Atlassian recommends a registered OAuth 2.0 integration. [Atlassian authentication guidance](https://developer.atlassian.com/cloud/jira/software/basic-auth-for-rest-apis/)

| Environment variable                 | Value                                                                                                                      |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `ATLASSIAN_INSTANCE_URL`             | Site origin, such as `https://example.atlassian.net`                                                                       |
| `ATLASSIAN_USER_EMAIL`               | Atlassian account email                                                                                                    |
| `ATLASSIAN_API_TOKEN`                | Scoped Jira API token                                                                                                      |
| `JARI_CODEX_BIN` / `JARI_CLAUDE_BIN` | Optional path to the installed provider executable when it is unavailable on `PATH`. On Windows, select the native `.exe`. |

The three Atlassian variables are sufficient. Agent Desktop uses the site’s REST API for a site token. If the site denies authentication, it discovers the Cloud ID and tries Atlassian’s scoped API gateway. Linked Confluence pages use the same token when it has access. [Atlassian Cloud ID discovery](https://support.atlassian.com/jira/kb/retrieve-my-atlassian-sites-cloud-id/)

Grant board, project, sprint, JQL, issue, comment and remote-link read scopes for the Jira endpoints. For Confluence, grant `read:page:confluence`. The account also needs permission to see the specific boards, issues and pages. [Scoped API tokens](https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/) · [Jira board REST API](https://developer.atlassian.com/cloud/jira/software/rest/api-group-board/) · [Confluence page REST API](https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-page/)

For local development, copy [`.env.example`](../.env.example) to `.env` at the repository root, fill in the values and run `pnpm dev`. Agent Desktop loads only the listed application keys from this file. Variables already set in the launch environment take precedence. Packaged builds use the launch environment.

For troubleshooting, set `JARI_DEBUG_ENV=1` and restart development. The console and `desktop.log` show values and sources for `ATLASSIAN_INSTANCE_URL` and `ATLASSIAN_USER_EMAIL`. The `diagnosticValueKeys` array in [`environment.ts`](../apps/desktop/src/main/environment.ts) controls which values are shown. Other values, including API tokens, are redacted. Set `JARI_DEBUG_ENV=0` after testing.

**Assigned to me** shows issues assigned to the authenticated Atlassian account across active sprints. **Browse by board** lists the Scrum boards the account can view and lets you choose a sprint. If a scoped token can browse boards but cannot search assigned issues, check the granular scopes for enhanced issue search. [Jira issue search REST API](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/)

Choose an issue, inspect the description, comments and references, then pick a workspace and provider and select **Start plan**. Linked Confluence pages on the configured site appear when the token can read them. The selected issue snapshot and the resulting plan are saved in the app’s local workflow database.

Install and sign in to the selected provider independently. Agent Desktop starts **Codex App Server Plan mode** or **Claude Code’s headless Plan permission mode** using the selected workspace. It passes the selected work item context over stdin and displays the returned draft or questions. The Atlassian tokens stay in the desktop backend and are removed from the provider process environment. The issue context is sent to the provider when starting a plan. [Codex App Server](https://learn.chatgpt.com/docs/app-server) · [Claude Code CLI](https://code.claude.com/docs/en/cli-reference)
