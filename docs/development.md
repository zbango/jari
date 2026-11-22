# Development

Use Node.js **24.20.0**, pinned in `.node-version`, and pnpm **12.21.0**, pinned in `package.json`. Use the Corepack bundled with Node.js to enable the pnpm shim. If your Node distribution omits it, follow the [Corepack installation instructions](https://github.com/nodejs/corepack#how-to-install).

```sh
corepack enable pnpm
pnpm install --frozen-lockfile
pnpm dev
```

When changing dependencies, use `pnpm install` to update the lockfile and commit that change with the manifests. The Electron binary downloads on first launch. Initial installs and packaging require access to npm and the Electron and electron-builder GitHub release assets.

Renderer changes use React Fast Refresh. Electron Vite restarts Electron for main process changes and reloads the renderer for preload changes. Port 5173 is reserved for the loopback-only development server. Free the port if another project already uses it.

## Checks and debugging

- Run `pnpm check` for formatting, lint, type checking and unit tests. Use `pnpm lint:fix` and `pnpm format` for supported fixes.
- The Oxc VS Code extension supplies linting and format-on-save from the repository configuration. Use `pnpm format:check` to verify the repository-wide formatting check.
- Open DevTools using the platform menu shortcut for renderer debugging. To attach a Node inspector to main, run `pnpm dev -- --inspect` and connect to port 5858.
- On Linux, Electron needs a desktop session or virtual X display plus GTK, NSS and ALSA runtime libraries. Debian packaging also requires the `libcrypt.so.1` compatibility library. On Ubuntu 24.04 the workflow installs Xvfb and the supporting libraries. Its ephemeral runner allows unprivileged user namespaces so Chromium can sandbox the renderer.
- Build and run a packaged smoke check on Linux with `xvfb-run -a node scripts/smoke.mjs apps/desktop/dist/linux-unpacked/agent-desktop`. On Windows and macOS, run the same script directly against the native executable. The smoke test reads the rendered heading, bridge metadata, Tailwind layout and absence of renderer Node globals before exiting.

## Desktop logs

Agent Desktop writes main and renderer console messages from debug through error to `logs/desktop.log` under Electron’s per-user application data directory. This location is writable for installed builds, including AppImage and installations in system directories.

| Platform | Default log file                                                         |
| -------- | ------------------------------------------------------------------------ |
| Linux    | `~/.config/Agent Desktop/logs/desktop.log` (or under `$XDG_CONFIG_HOME`) |
| macOS    | `~/Library/Application Support/Agent Desktop/logs/desktop.log`           |
| Windows  | `%APPDATA%\Agent Desktop\logs\desktop.log`                               |

The logger rotates at about 1 MiB and keeps the previous file as `desktop.old.log`. The console still receives logs during development. Environment diagnostics run during development only and can show [selected configuration values](jira-intake.md). API tokens stay redacted in those diagnostics.

## Shared UI

The shared stylesheet loads Once UI Core's tokens and styles, and `packages/ui/src/theme.ts` defines the theme used by the renderer. The renderer bundles Geist and Geist Mono and uses the system color scheme until a theme is selected in Settings. Import Once UI components from their public entry points, such as `@once-ui-system/core/components/StatusIndicator`. [Once UI configuration guide](https://docs.once-ui.com/config)

The desktop and UI package each have a `components.json`. The UI package owns the shared CSS tokens and exports component and utility paths. The pinned CLI can add a component from the desktop workspace when the application needs one:

```sh
pnpm --dir apps/desktop dlx shadcn@4.23.0 add button
```

Review generated source and dependency changes before committing. [shadcn/ui monorepo documentation](https://ui.shadcn.com/docs/monorepo)
