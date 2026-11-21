# Architecture

| Boundary                    | Responsibility                                                                                |
| --------------------------- | --------------------------------------------------------------------------------------------- |
| `apps/desktop/src/main`     | Owns the Electron lifecycle, native windows, navigation and permission policy.                |
| `apps/desktop/src/preload`  | Exposes immutable application name and version through a typed context bridge.                |
| `apps/desktop/src/renderer` | Renders the React shell and consumes shared UI, browser APIs and the narrow preload contract. |
| `packages/shared`           | Defines the bridge metadata shape and validates stable release tags for distribution tooling. |
| `packages/ui`               | Owns reusable components, Tailwind theme tokens and shadcn/ui utilities.                      |
| `packages/config`           | Owns the common strict TypeScript options consumed through the root config.                   |

The desktop app consumes shared source packages. The renderer build bundles UI and React, and the preload build embeds metadata from the desktop manifest. Installers ship the generated bundles and project icon. Shared packages have no dependency on the app or Electron.

## Security model

Every renderer runs with Chromium sandboxing and context isolation enabled and Node integration disabled. Main denies renderer-initiated navigation, redirects, new windows, embedded webviews, downloads and permission requests. The preload exposes two read-only strings. The packaged renderer loads its local HTML and constrains scripts and styles to local assets with CSP. During development the loopback server at `127.0.0.1:5173` supplies a CSP that allows the React refresh preamble, injected styles and the HMR socket. Packaged builds ignore the development server URL.

## Future integration

Future privileged integrations belong on the main-process side or in a dedicated local process managed by main. Provider adapters can translate structured Claude Code and Codex events into shared contracts once their real APIs shape those contracts. Main can own session lifecycle, approvals, coordination and local persistence. The renderer can visualize activity through narrowly scoped, validated IPC that exchanges serializable data. These integration points are design guidance for later work.
