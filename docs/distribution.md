# Distribution

Run `pnpm package` on a native target machine after installing dependencies. Find installers in `apps/desktop/dist/`. A local Windows or macOS build without signing credentials is a validation build. Gatekeeper and SmartScreen may restrict it.

| Target      | GitHub runner    | Example artifact                                                                   |
| ----------- | ---------------- | ---------------------------------------------------------------------------------- |
| Windows x64 | `windows-2025`   | `agent-desktop-0.1.0-windows-x64.exe`                                              |
| macOS arm64 | `macos-15`       | `agent-desktop-0.1.0-macos-arm64.dmg`                                              |
| macOS x64   | `macos-15-intel` | `agent-desktop-0.1.0-macos-x64.dmg`                                                |
| Linux x64   | `ubuntu-24.04`   | `agent-desktop-0.1.0-linux-x86_64.AppImage`, `agent-desktop-0.1.0-linux-amd64.deb` |

The working application ID is `app.agentdesktop.desktop`. Local Debian builds use the reserved `.invalid` homepage and maintainer address while the project has no published identity. GitHub Actions sets the Debian homepage to the source repository. Update the maintainer contact in `electron-builder.yml` when one is available.

## CI and releases

CI runs on pull requests to `main`, pushes to `main` and manual dispatch. It installs from the frozen lockfile, runs the quality gates and compiles the app, then packages, checks metadata and starts the unpacked application on all four native runners. Linux starts the Debian payload and the AppImage under Xvfb. The AppImage requires usable Chromium sandbox support on the host. The validation workflow uploads the installers under `validation-unsigned-*`. Manual Release runs use the same validation path.

For a production release, set the desktop manifest version, run the checks, and commit the version bump. Push an exact matching tag such as `v0.1.0` to GitHub. The release workflow validates the tag and reruns the quality gates and native matrix. The Windows and macOS jobs fail if signing prerequisites are missing or signature checks fail. Once all matrix jobs pass, the publish job verifies all five assets, creates `SHA256SUMS` and publishes the installers on GitHub Releases with generated notes. Runs are serialized per ref and the publisher requires an existing tag. An existing release for that tag is preserved.

## Signing secrets

Set these repository Actions secrets for a tagged production release:

| Secret                        | Value                                                                                           |
| ----------------------------- | ----------------------------------------------------------------------------------------------- |
| `MAC_CSC_LINK`                | Base64 PKCS#12 export containing the Apple Developer ID Application certificate and private key |
| `MAC_CSC_KEY_PASSWORD`        | Password for the macOS PKCS#12 export                                                           |
| `APPLE_ID`                    | Apple Account email enrolled on the developer team                                              |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password for Apple's notarization service                                          |
| `APPLE_TEAM_ID`               | Apple Developer Team ID                                                                         |
| `WIN_CSC_LINK`                | Base64 PKCS#12 bundle containing an Authenticode certificate and usable private key             |
| `WIN_CSC_KEY_PASSWORD`        | Password for the Windows PKCS#12 bundle                                                         |

The macOS gate checks the hardened-runtime app signature and notarization ticket, and separately signs, notarizes and staples the DMG. The Windows gate verifies valid Authenticode signatures on the NSIS installer and application executable. The Windows job expects a certificate usable in the hosted runner with electron-builder's PKCS#12 signing path. A hardware-bound or cloud-held key requires configuring the corresponding signing provider in electron-builder before using it. Linux assets are checksummed and published through GitHub Releases. [electron-builder signing](https://www.electron.build/v26/docs/features/code-signing/) · [electron-builder notarization](https://www.electron.build/v26/docs/features/code-signing/notarization/)

## Verify downloads

Download an installer and `SHA256SUMS` from the same GitHub Release. On Linux run `sha256sum -c SHA256SUMS --ignore-missing`. On macOS use `shasum -a 256 <installer>` and compare the matching line in the sums file. On Windows use `Get-FileHash <installer> -Algorithm SHA256` and compare the same way. Check macOS trust with `codesign --verify --strict <installer.dmg>` and `xcrun stapler validate <installer.dmg>`. On Windows use `Get-AuthenticodeSignature <installer.exe>` and require `Valid`.

A future update client could reuse GitHub Releases as the provider. At that point, configure electron-builder's GitHub publishing metadata, add signed per-platform update manifests and an update client, and validate upgrades across supported architectures.
