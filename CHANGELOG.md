# Changelog

All notable changes to ProjectX are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.1.3]: https://github.com/jonni2712/ProjectX/releases/tag/v1.1.3
[1.1.2]: https://github.com/jonni2712/ProjectX/releases/tag/v1.1.2
[1.1.1]: https://github.com/jonni2712/ProjectX/releases/tag/v1.1.1
[1.1.0]: https://github.com/jonni2712/ProjectX/releases/tag/v1.1.0
