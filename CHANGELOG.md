# Changelog

All notable changes to ProjectX are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.9] - 2026-06-01 (server) / Desktop 1.1.12 — security hardening (code)

Code-level hardening from the security audit (the network-exposed surface):

### Security
- **Symlink sandbox escape (server)** — `path-guard` now resolves the real path
  of the deepest existing component and asserts it stays within the (real)
  workspace root. A workspace symlink to `/etc` or `~/.ssh` (creatable via the
  terminal) can no longer be read/copied/zipped. Verified: listing through such
  a symlink returns 403, normal paths still work.
- **File-watcher symlink escape + crash** — chokidar now runs with
  `followSymlinks:false` and an `error` handler, so an escaping symlink can no
  longer make the watcher recurse out of the workspace **or crash the server**
  on `EACCES` (was a one-line DoS). Verified the server survives a `-> /etc`
  symlink in the workspace.
- **Git argument injection (C2)** — reject any branch/remote/file value starting
  with `-` (option injection), and pass `--` before file args in diff; on top of
  the `simple-git` upgrade.
- **Claude CLI env leak (M1)** — strip `JWT_SECRET`/`AUTH_PASSWORD_HASH`/
  `AUTH_PASSWORD`/`ANTHROPIC_API_KEY` from the Claude subprocess env (matching
  the terminal), so a prompt can't exfiltrate server secrets.
- **Rate limiting (H2)** — key the limiter on Cloudflare's `CF-Connecting-IP`
  when tunneled (never trusting `X-Forwarded-For`), and add limits to
  `PATCH /auth/password` and `POST /auth/users`.
- **First-run setup lockdown (H1)** — when setup is exposed on a non-loopback
  interface, an out-of-band **setup token** (printed to the console) is required
  in the `/setup` body; password floor aligned to 12 chars.
- **Login username-enumeration timing (M6)** — run a dummy bcrypt compare for
  unknown users so response time doesn't reveal account existence.
- **CORS (M5)** — match `localhost`/`127.0.0.1` by exact host (any port) instead
  of `startsWith` (which accepted `localhost.attacker.com`); dropped the wildcard
  `Access-Control-Allow-Origin: *` on `/files/serve`.
- **Error disclosure (L2)** — 5xx responses now return a generic message (detail
  logged server-side only); 4xx validation messages still pass through.
- **Audit-log authz (L3)** — `/projects/audit` is now admin-only.
- **Electron `open-external` (L7)** — only `http(s)` URLs are handed to the OS;
  `file://`/custom-protocol URLs from the renderer are ignored.

### Deferred (documented)
- Electron major upgrade (H4) — risks the native-module ABI we pinned; the
  renderer only loads our own app, so lower exposure. Revisit with a coordinated
  better-sqlite3 upgrade.
- WS message schema/clamps (M2) and `/config/update`→config.json repoint (M3).

## [1.1.8] - 2026-06-01 (server) — security: dependency CVEs

### Security
- **Upgraded `@fastify/jwt` to ^10** (pulls the fixed `fast-jwt` line), closing
  **critical** auth CVEs: algorithm-confusion, `crit`-header acceptance,
  cache-confusion (claims from a different token), ReDoS, and empty-HMAC bypass.
  Auth underpins the whole product. Also **pinned the JWT algorithm to HS256**
  on both sign and verify (no asymmetric/`none` confusion possible).
- **Upgraded `simple-git` to ^3.36** — fixes the **CVSS 9.8 RCE** (GHSA-hffm-xvc3-vprc)
  reachable from the authenticated git endpoints.
- **Cleared the dependency backlog** via `npm audit fix`: fastify (Content-Type
  validation bypass), fast-uri (path traversal), lodash (code injection /
  prototype pollution), `ws`, and bumped `uuid` to ^11. Verified auth end-to-end
  (login → verify → tampered-token reject) still works.
- Residual: `tar` (high) only via `@mapbox/node-pre-gyp`, used at native-module
  **install time** (trusted prebuilt sources), not reachable at server runtime —
  accepted/documented to avoid breaking the native-module ABI.

## Desktop app 1.1.11 - 2026-06-01

### Added
- Show the **app version** in the sidebar footer (`v1.1.11`), via a new
  `get-app-version` IPC. Also serves as a visual confirmation that an
  auto-update was applied (the label changes after restarting into the update).

## Desktop app 1.1.10 - 2026-06-01

### Fixed
- **Windows installer froze on the "install for all users / just me" page**,
  especially when launched with *Run as administrator*. The NSIS installer ran
  in assisted mode (`oneClick:false`, no `perMachine`), so it showed the
  per-machine/per-user choice and tried to manage UAC elevation — which
  deadlocks when the process is already elevated. Pinned the install scope to
  **current user only** (`perMachine:false`, `allowElevation:false`): no scope
  page, no UAC prompt, no freeze. Installs under the user's `%LOCALAPPDATA%`.

## Desktop app 1.1.2 - 2026-06-01

### Fixed
- **Release build was broken**: the committed `desktop/package-lock.json` was out
  of sync with `package.json` (missing electron-builder Windows-signing deps),
  so the CI `npm ci` step would fail before building. Regenerated the lockfile.
  Verified locally that `npm ci`, `vite build` and the electron `tsc` all pass.

## Desktop app 1.1.1 - 2026-06-01

### Added
- **First-run setup in the dashboard**: when the bundled server is unconfigured,
  the desktop app now shows a functional SetupWizard (workspace, admin account,
  optional public origins / Anthropic key) that posts to `/setup` and waits for
  the server to come up — no terminal or `.env` editing.
- **Remote Access page** rebuilt around the automated Cloudflare endpoints:
  one-click **quick tunnel**, a **named-tunnel** form (API token + hostname),
  live status and a stop button.
- **Device pairing QR**: the page renders a QR encoding `{name,url}` (the live
  tunnel URL when on, otherwise a LAN address) that the mobile app scans to add
  the server.

### Changed
- The desktop app no longer writes a default `.env`; the server boots into
  first-run setup mode instead. Added a `get-server-info` IPC exposing LAN URLs
  for the pairing QR. Sidebar "Tunnel" entry renamed to "Remote".

## Desktop app 1.1.9 - 2026-06-01

### Fixed
- **"Failed to fetch" / wrong-server bug**: the app used to connect to *any*
  server already answering on :3000 (including a stale/dead one from a previous
  crash or a manually-started instance), which caused "Failed to fetch" and the
  earlier ABI confusion. The app now **always runs its own bundled server** and
  **kills a stale server** left by a crashed previous run (tracked via a
  `server.pid` file in userData), with a short pause before rebinding.

### CI
- The `build-mobile` job now also attaches the built APK to the GitHub release
  for the tag (best-effort), so it's downloadable directly.

## Mobile app 1.0.3 - 2026-06-01

### Changed (UI)
- **New IDE-dark theme** (GitHub/VS Code inspired): centralized design tokens
  (`AppColors`) — near-black neutral canvas `#0D1117`, layered surfaces, a single
  blue accent `#4C8DFF`, semantic green/amber/red, crisp `#30363D` borders.
  Refined typography (Inter UI + JetBrains Mono for code/paths), input/button/
  card/nav/snackbar/chip component themes, consistent radii and elevation.
  Migrated the whole app off the old blue/teal/yellow palette; language and
  terminal-ANSI colors kept intentionally.
- Cleaned up all analyzer lints (`withOpacity`→`withValues`, unused imports,
  async-context guard) — `flutter analyze` is now clean (0 issues).

## Mobile app 1.0.2 - 2026-06-01

### Fixed
- **APK build was broken**: `pubspec.yaml` pinned `sdk: ^3.10.0` (Dart 3.10),
  which no available Flutter provides, so `flutter pub get` failed — the CI
  build-mobile job couldn't even resolve dependencies. Lowered to `^3.6.0` and
  `flutter_lints` to `^5.0.0`. Verified locally: `pub get` + `flutter analyze`
  (0 errors) + `flutter build apk` succeed.
- Pinned Android `ndkVersion = "27.0.12077973"` (required by mobile_scanner /
  file_picker / secure_storage / etc.) to silence the NDK-mismatch warning.

## Desktop app 1.1.8 - 2026-06-01

### Fixed / UI
- **macOS window controls**: the traffic-light buttons (close/zoom/minimize)
  overlapped the "ProjectX" logo in the sidebar header. Padded the header to the
  right of the lights on macOS and set `trafficLightPosition` for clean placement.
- **Workspace display**: the dashboard "Workspace" card rendered the full path as
  a huge bold string and overflowed. Now it shows the **folder name** prominently
  with the **full path** as a truncated subtitle + tooltip; all stat cards
  truncate cleanly (`min-w-0`).

## Desktop app 1.1.7 - 2026-06-01

### Added
- **In-app update banner**: a thin bar shown on top of every screen (including
  first-run setup and login) when the auto-updater detects a new version —
  "Update X available — downloading…", then "Update X ready · Restart & update"
  for a one-click apply. Wired the `update-available`/`update-downloaded` events
  through the preload bridge + a `quit-and-install` IPC.
- **CI auto-publishes the release** once BOTH desktop builds succeed (a
  `publish-release` job flips the electron-builder draft to published + latest),
  so `electron-updater` can see it (it ignores drafts). Windows auto-update works
  out of the box; macOS auto-update still needs Developer ID signing/notarization.

## Desktop app 1.1.6 - 2026-06-01

### Fixed
- **Native modules failed to compile against Electron 41's V8** (better-sqlite3
  source uses V8 APIs removed in the very new V8 → 6 compile errors, the
  @electron/rebuild step failed). Pinned **Electron to 31.7.7** (Node 20 / V8
  12.6), which the current native module versions (better-sqlite3 11, node-pty 1,
  bcrypt 5) compile cleanly against — verified locally with `@electron/rebuild
  --version 31.7.7` (bcrypt, better-sqlite3, node-pty all rebuilt OK). The app
  is a management dashboard, so the older Chromium is irrelevant.

## Desktop app 1.1.5 - 2026-06-01

### Fixed
- **Native-module ABI mismatch** ("better_sqlite3.node compiled against a
  different Node.js version", NODE_MODULE_VERSION 115 vs 137). The packaged app
  no longer runs the server with the user's system Node. Instead it runs the
  **pre-compiled server (`dist/`) with Electron's own Node** via
  `ELECTRON_RUN_AS_NODE`, and the CI **rebuilds the server's native modules
  (better-sqlite3, node-pty, bcrypt) against Electron's ABI** (`@electron/rebuild`).
  This removes the dependency on a system Node entirely and makes the runtime ABI
  deterministic — fixing both "Server Offline" (node not found) and the ABI error.
- Bundle `server/dist` (+ keep `package.json` for ESM `type:module` + rebuilt
  `node_modules`); dropped `server/src`/tsconfig/.env.example from the package.

## Desktop app 1.1.4 - 2026-06-01

### Fixed
- Launch the bundled server via an **interactive** login shell (`$SHELL -ilc`)
  instead of `-lc`, so `nvm`/`fnm` Node installs (defined in `.zshrc`/`.bashrc`,
  not the login profile) are found too. Without this, users with nvm-managed
  Node still got "Server Offline".

## [1.1.7] - 2026-06-01 (server) / Desktop app 1.1.3 — packaging fix

### Fixed
- **Desktop app couldn't start the bundled server** on macOS: GUI apps don't
  inherit the user's shell PATH, so `node` (nvm/Homebrew/fnm) wasn't found and
  the server never came up ("Server Offline"). The app now launches the server
  through a **login shell** (`$SHELL -lc`) on macOS/Linux so PATH is complete.
- **Data was being written inside the app bundle** (read-only & signed in
  /Applications). The server now honours **`PROJECTX_DATA_DIR`**, and the desktop
  app points it at `app.getPath('userData')`, so `config.json` + the SQLite DB
  live in `~/Library/Application Support/ProjectX Server/data` — writable and
  preserved across updates.

### Notes
- Release tag is now `v1.1.3` to match the desktop app version that
  electron-builder embeds (avoids the earlier tag/release mismatch).

## [1.1.6] - 2026-06-01

### Added
- Public `GET /setup/status` on the configured server (returns
  `{ configured: true }`) and a matching `GET /health` + `/setup/status` on the
  first-run setup server (`{ configured: false }`). Clients (desktop/mobile) can
  now detect whether the server is in setup mode or ready, without auth — used
  by the desktop app's first-run flow.

## [1.1.5] - 2026-06-01

### Added
- **First-run web setup** (`server/src/setup-server.ts`): when the server has no
  `data/config.json` and no `JWT_SECRET` in the environment, it now boots a
  minimal browser-based setup page instead of refusing to start. The user fills
  in workspace root, admin account (and optional public origins / Anthropic
  key); the server generates a strong JWT secret, writes `config.json`, seeds
  the admin user, and **hands off to the real server on the same port** — no
  terminal required. This is the "install and go" path for the desktop app.

### Changed
- `index.ts` is now a thin bootstrap that picks setup mode vs normal boot; the
  full server moved to `app.ts` (imported dynamically only once configured, so
  config.ts validation never blocks the setup UI).

## [1.1.4] - 2026-06-01

### Added
- **Automated Cloudflare tunnels** (`server/src/services/cloudflare.service.ts`
  + `routes/cloudflare.ts`) — the remote-access gap closer:
  - **Auto-install**: downloads the correct `cloudflared` binary for the host
    OS/arch into `~/.projectx/bin` when it isn't already on PATH (macOS `.tgz`
    extracted via `tar`).
  - **Quick tunnel** (`POST /cloudflare/quick-start`): zero-config
    `*.trycloudflare.com` URL — no Cloudflare account needed.
  - **Named tunnel** (`POST /cloudflare/named-start`): creates a tunnel via the
    Cloudflare API, pushes the ingress config, creates/updates the DNS CNAME,
    and runs the connector with `--token` — a persistent custom-domain URL.
  - Status (`GET /cloudflare/status`), stop, and explicit install endpoints
    (admin-only); PID tracking with orphan cleanup and named-tunnel resume on
    restart. Honours the existing `cloudflaredExpectedHashes` supply-chain pin.

### Notes
- Pure helpers (asset selection, URL parsing) are tested; a live public tunnel
  was not opened from the build host. Verify with `POST /cloudflare/quick-start`.

## Mobile app 1.0.1 - 2026-06-01

### Added
- **Multi-server support**: the app now stores a list of servers (`ServerProfile`
  + `ServerStore`, encrypted at rest) instead of a single URL. A legacy
  `server_url` is migrated automatically on first launch.
- **QR pairing**: scan a server's QR code (a plain http(s) URL or a
  `{"name","url"}` payload) to add it — from the login screen or the server list
  (`qr_scan_screen.dart`, via `mobile_scanner`). Added the `CAMERA` permission.
- **Server list screen**: add manually, scan QR, select, and delete saved servers.
- **Onboarding screen**: a one-time first-run intro shown when no servers exist.

### Changed
- Login screen shows the current server, a "Manage servers" entry and an inline
  QR-scan button; the entered server is remembered for next time.
- Android app label is now "ProjectX"; app version bumped to 1.0.1+2.

### TODO (follow-ups)
- App icon assets + `flutter_launcher_icons`; offline/retry handling
  (`connectivity_plus`); iOS project (`flutter create --platforms ios`).
- Not compiled in this environment (no Flutter SDK) — run `flutter pub get`
  and build to verify.

## [1.1.3] - 2026-06-01

### Added
- **Docker support**: multi-stage `server/Dockerfile` (compiles the native
  modules — better-sqlite3, node-pty, bcrypt — then ships a slim runtime with
  `git` and `tini`), `docker-compose.yml`, `.env.docker.example` and a
  `docker-entrypoint.sh` that runs first-run setup automatically. `docker
  compose up` works out of the box once `PROJECTX_ADMIN_PASSWORD` is set.
- **Non-interactive setup mode** (`npm run setup --non-interactive`, or any run
  without a TTY): configures the server entirely from environment variables
  (workspace, host/port, admin account, JWT secret, Anthropic key). This is how
  the Docker entrypoint provisions a fresh container.

### Notes
- The Docker image follows the standard multi-stage native-build recipe; the
  server build and non-interactive setup are verified, but the image itself
  should be built/run on your machine with `docker compose up`.

## [1.1.2] - 2026-06-01

### Added
- **Interactive setup wizard** (`server/src/setup.ts`, `npm run setup`): a full
  cross-platform first-run wizard that collects workspace root, port/host, CORS
  origins and Anthropic API key, creates the admin account, and generates a
  strong JWT secret. It writes everything to `data/config.json` and seeds the
  admin user directly in the database. Password and API-key input are hidden,
  the password policy mirrors the server, and re-running it reconfigures safely
  (the existing JWT secret is preserved so live sessions survive).

### Changed
- `setup.sh` now delegates configuration to the wizard (`npm run setup`) and
  reads effective values back from `data/config.json`, instead of hand-writing
  a `.env` file in bash.
- README "Development Setup" recommends `npm run setup` over editing `.env`.

## [1.1.1] - 2026-06-01

### Added
- **Persistent config store** (`server/src/config-store.ts`): the server now reads
  and writes `server/data/config.json` (created with `0600` permissions because it
  holds secrets). This is the foundation for the upcoming setup wizard and web
  setup UI (roadmap Phase 2), which need a single read/write source of truth
  instead of hand-edited `.env` files.

### Changed
- **Configuration resolution** now follows the precedence
  `environment variable > data/config.json > built-in default`. On first run the
  server snapshots its validated, effective configuration into `data/config.json`,
  so subsequent runs no longer require a `.env` for any of these values. Existing
  `.env`-based deployments keep working unchanged — env vars still override the
  stored config at runtime.
- `server/.env.example` documents the new `config.json` store and precedence rules.

## [1.1.0] - 2026-05-12

### Added
- Multi-user support: `users` table with admin/user roles, full auth surface
  (login, refresh, logout, password change, admin user management) and JWT
  revocation via `token_version`.
- macOS desktop build signing & notarization in CI when Apple secrets are present.

### Security
- Multiple security-audit passes: blocked RCE paths and sandbox escapes, multi-user
  isolation hardening, optional SHA256 pin for the `cloudflared` binary, protection
  of Syncthing markers and system files from deletion.

[1.1.6]: https://github.com/jonni2712/ProjectX/releases/tag/v1.1.6
[1.1.5]: https://github.com/jonni2712/ProjectX/releases/tag/v1.1.5
[1.1.4]: https://github.com/jonni2712/ProjectX/releases/tag/v1.1.4
[1.1.3]: https://github.com/jonni2712/ProjectX/releases/tag/v1.1.3
[1.1.2]: https://github.com/jonni2712/ProjectX/releases/tag/v1.1.2
[1.1.1]: https://github.com/jonni2712/ProjectX/releases/tag/v1.1.1
[1.1.0]: https://github.com/jonni2712/ProjectX/releases/tag/v1.1.0
