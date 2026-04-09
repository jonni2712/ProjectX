# ProjectX - Remote Development Platform

## Overview
Mobile-first remote development environment: Fastify backend on desktop PC, Flutter Android app connecting via Tailscale tunnel. REST API for CRUD, single multiplexed WebSocket for streaming.

## Architecture
- **REST API**: Auth, file CRUD (full ops), Git, locks
- **WebSocket**: Terminal, Claude, file-watch events (single multiplexed connection)
- **Storage**: SQLite for sessions, locks, logs, recent projects
- **Auth**: JWT + refresh tokens, bcrypt passwords, rate limiting
- **Workspace**: Configurable via WORKSPACE_ROOT env var, path traversal protection

## Backend (Fastify + TypeScript)
- node-pty for persistent terminal sessions (survive disconnects)
- simple-git for expanded Git operations (status, add, commit, push, pull, checkout, diff, discard)
- Claude: CLI subprocess primary + Anthropic API fallback
- chokidar for scoped file watching with debounce
- File locks (file-level + project-level) with TTL
- Full file ops: CRUD, rename, move, copy, upload, download, zip/unzip
- Audit logging, rate limiting on auth endpoints

## Flutter Android App
- Bottom navigation: Files | Editor | Terminal | Claude | Git
- xterm.dart for terminal, syntax-highlighted editor
- Breadcrumb nav, recent projects, favorites, file search
- Lock awareness, unsaved state tracking
- Dark theme, one-hand friendly layout
- Biometric unlock option, secure JWT storage

## Deployment
Desktop PC (always-on) → Tailscale → Android phone
Backend colocated with workspace, Syncthing, Git, Claude Code
