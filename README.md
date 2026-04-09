# ProjectX — Remote Development Platform

Mobile-first remote dev environment: Fastify backend on desktop, Flutter Android app via Tailscale.

## Quick Start

### 1. Server (on your desktop PC)

```bash
# One command does everything:
./setup.sh
```

This will:
- Check prerequisites (Node.js 20+, git, python3)
- Install npm dependencies
- Ask for workspace path, username, password
- Generate JWT secret
- Start the server

**Or manually:**

```bash
cd server
npm install
cp .env.example .env
npm run setup              # Generate password hash
# Edit .env with your settings
npm run dev                # Start dev server
```

### 2. Flutter App (on your Android phone)

Build the APK on any machine with Flutter:

```bash
cd flutter_app
flutter pub get
flutter build apk --release
```

The APK will be at `flutter_app/build/app/outputs/flutter-apk/app-release.apk`.

Install it on your phone, open it, and enter:
- **Server URL**: `http://<your-tailscale-ip>:3000`
- **Username/Password**: what you set during setup

## Architecture

```
Android Phone (Flutter)  ──Tailscale──>  Desktop PC (Fastify)
     │                                        │
     ├── REST API ─────────────────────> File CRUD, Git, Auth, Locks
     └── WebSocket (multiplexed) ─────> Terminal, Claude, File Watch
```

## .env Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `WORKSPACE_ROOT` | `/github` | Root directory for all file operations |
| `PORT` | `3000` | Server port |
| `JWT_SECRET` | - | Random secret for JWT signing |
| `AUTH_USERNAME` | `admin` | Login username |
| `AUTH_PASSWORD_HASH` | - | bcrypt hash (use `npm run setup`) |
| `ANTHROPIC_API_KEY` | - | Optional: Claude API fallback |
| `JWT_EXPIRES_IN` | `24h` | JWT token expiry |
| `REFRESH_TOKEN_EXPIRES_IN` | `7d` | Refresh token expiry |

## Features

- **File Manager**: Full CRUD, rename, move, copy, upload, download, zip/unzip
- **Code Editor**: Syntax-aware, search, unsaved tracking, lock awareness
- **Terminal**: Persistent sessions (survive disconnects), multiple tabs
- **Claude**: CLI mode + API fallback, streaming chat
- **Git**: Status, add, commit, push, pull, checkout, diff, discard
- **Locks**: File-level + project-level, Syncthing conflict prevention
- **Auth**: JWT + refresh tokens, rate limiting, audit logging

## Project Structure

```
ProjectX/
├── server/               # Fastify backend (TypeScript)
│   ├── src/
│   │   ├── index.ts          # Entry point
│   │   ├── config.ts         # Environment config
│   │   ├── plugins/auth.ts   # JWT + WS ticket auth
│   │   ├── routes/           # REST endpoints
│   │   ├── services/         # Business logic
│   │   ├── ws/               # WebSocket handlers
│   │   ├── db/               # SQLite schema
│   │   └── utils/            # Path guard, types
│   └── data/                 # SQLite DB (auto-created)
├── flutter_app/          # Flutter Android app (Dart)
│   └── lib/
│       ├── main.dart
│       ├── config/           # API endpoints, theme
│       ├── models/           # Data models
│       ├── services/         # API/WS clients
│       ├── providers/        # Riverpod state
│       └── screens/          # UI screens
├── setup.sh              # One-click setup & start
└── docs/plans/           # Design documents
```
