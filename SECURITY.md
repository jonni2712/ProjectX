# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do NOT open a public issue.**
2. Open a private report via **GitHub Security Advisories**:
   <https://github.com/jonni2712/ProjectX/security/advisories/new>
3. Include affected version, impact, and steps to reproduce.

We aim to acknowledge within 48 hours and to ship a fix (and a coordinated
disclosure) as quickly as the severity warrants.

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | Yes       |

## Security Measures

ProjectX is a multi-user remote-development server that may be exposed to the
internet via a tunnel, so it is hardened across several layers:

### Authentication & sessions
- Passwords hashed with **bcrypt** (cost 12); login uses a constant-time dummy
  compare for unknown users to resist username enumeration via timing.
- **JWT pinned to HS256** on both sign and verify to block algorithm-confusion
  (`none`/asymmetric) attacks; the signing secret is entropy-validated at boot.
- **`token_version` revocation**: logout, password change, role change, and
  deactivation immediately invalidate all of a user's JWTs and refresh tokens.
- **WebSockets are re-validated after the handshake** against `token_version`
  (proactively on revocation + on a periodic timer), so a revoked user's live
  socket is closed rather than surviving until the JWT would expire.
- Refresh tokens are rotated on every use and the refresh path is audited.
- Per-route rate limiting on authentication endpoints; minimum 12-char passwords.
- A last-admin / self-lockout guard prevents bricking all admin access.

### Filesystem & workspace isolation
- Every path flows through a path guard that blocks traversal (`..`), drive
  letters, UNC paths, NUL bytes, protected segments (`.git`/`.ssh`/`.env`), and
  **symlink escapes** (realpath check); the file-watcher does not follow symlinks.
- Rename/move/copy refuse to silently overwrite an existing destination.
- File serve/download/zip are **streamed** (never fully buffered) to avoid
  memory exhaustion; archive extraction has zip-bomb limits.
- Collaborative locks are enforced (canonicalized keys; HTTP 409 on conflict).

### Process & subprocess safety
- Terminal (PTY) and Claude sessions are **owned per user** and can only be
  controlled by their owner; both are capped per user to prevent fork bombs.
- Server secrets (`JWT_SECRET`, `AUTH_PASSWORD*`, `ANTHROPIC_API_KEY`) are
  stripped from the environment of every spawned subprocess.
- Git operations reject option-like (`-`/`--`) arguments to prevent argument
  injection, and translate failures into typed 4xx responses (no stderr leak).

### Transport & exposure
- Origin is verified on WebSocket upgrades (CORS does not protect WS).
- 5xx responses return a generic message; internal detail is logged server-side.
- Downloaded `cloudflared` binaries are checksum-verified before execution.
- All tunnel traffic is encrypted via Cloudflare Tunnel (HTTPS/WSS).
