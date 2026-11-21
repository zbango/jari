# Agent Desktop

Agent Desktop is the foundation for a local-first visual workspace for observing and coordinating coding agents such as Claude Code and OpenAI Codex. The initial desktop shell shows its startup status and application version.

## Get started

Install Node.js **24.20.0** and enable the pnpm shim. Corepack selects **pnpm 12.21.0** from the root package manifest.

```sh
npm install --global corepack@0.36.0
corepack enable pnpm
pnpm install
pnpm dev
```

The workspace uses Turborepo, Electron, electron-vite, Vite, React, strict TypeScript, Tailwind CSS and a shared shadcn/ui configuration. Oxlint, Oxfmt and Vitest provide the quality checks. electron-builder creates installers and GitHub Actions builds them on native runners.

| Command                             | Runs                                                           |
| ----------------------------------- | -------------------------------------------------------------- |
| `pnpm build`                        | Compile the production main, preload and renderer bundles      |
| `pnpm lint` / `pnpm lint:fix`       | Run Oxlint or apply supported fixes                            |
| `pnpm format` / `pnpm format:check` | Format source or verify formatting with Oxfmt                  |
| `pnpm typecheck`                    | Check the strict TypeScript projects                           |
| `pnpm test`                         | Run the Vitest suites                                          |
| `pnpm check`                        | Run formatting, lint, type checking and tests                  |
| `pnpm package`                      | Build a local installer for the host platform and architecture |

Installer output is written to `apps/desktop/dist/`. The GitHub release workflow builds macOS DMGs for arm64 and x64, a Windows x64 NSIS installer, and Linux x64 AppImage and Debian packages.

- [Architecture](docs/architecture.md)
- [Local development](docs/development.md)
- [Distribution and signing](docs/distribution.md)
