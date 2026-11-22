# Architecture

| Boundary                    | Responsibility                                                                                        |
| --------------------------- | ----------------------------------------------------------------------------------------------------- |
| `apps/desktop/src/main`     | Owns Electron lifecycle, native windows, permission policy and workflow storage.                      |
| `apps/desktop/src/preload`  | Exposes application metadata and a narrow workflow API through a typed bridge.                        |
| `apps/desktop/src/renderer` | Renders the React Flow canvas, workflow history, request form and node details.                       |
| `packages/shared`           | Defines workflow and bridge contracts and validates stable release tags.                              |
| `packages/ui`               | Owns reusable components, the Once UI theme and base styles, Tailwind tokens and shadcn/ui utilities. |
| `packages/config`           | Owns the common strict TypeScript options consumed through the root config.                           |

The desktop app consumes shared source packages. The renderer build bundles UI and React, and the preload build embeds metadata from the desktop manifest. Installers ship the generated bundles and project icon. Shared packages have no dependency on the app or Electron.

## Security model

Every renderer runs with Chromium sandboxing and context isolation enabled and Node integration disabled. Main denies renderer-initiated navigation, redirects, new windows, embedded webviews, downloads and permission requests. The preload exposes read-only metadata and specific methods to read Jira, list or start workflows, and open a native directory picker. Main checks the sending frame and saves only a directory previously selected through that window’s picker. The packaged renderer loads its local HTML and constrains scripts and styles to local assets with CSP. During development the loopback server at `127.0.0.1:5173` supplies a CSP that allows the React refresh preamble, injected styles and the HMR socket. Preload rebuilds can reload the exact loopback page. Packaged builds ignore the development server URL.

## Workflow records

Electron main owns a SQLite database named `workflows.sqlite` in the application user-data directory. A record stores the original request, selected provider, canonical workspace path and creation time. The renderer derives the graph from the record and keeps selection, expansion and viewport in view state. A separate intake table stores the Jira issue snapshot and planning state, preserving earlier standalone requests. Main runs the selected provider’s plan mode and projects its status into the graph. Build remains gated on plan approval.

The planner prepares request context and dispatches through a shared provider contract. Each adapter in `apps/desktop/src/main/providers` owns its native command, protocol, and response mapping. The contract currently exposes planning.

## Future integration

Future privileged integrations belong on the main-process side or in a dedicated local process managed by main. Provider adapters can translate structured Claude Code and Codex events into shared contracts once their real APIs shape those contracts. Main can own session lifecycle, approvals, coordination and local persistence. The renderer can visualize activity through narrowly scoped, validated IPC that exchanges serializable data. These integration points are design guidance for later work.
