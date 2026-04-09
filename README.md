<p align="center">
  <img src="https://img.shields.io/badge/ProjectX-Remote%20Dev%20Platform-6C9EFF?style=for-the-badge&labelColor=0F0F1A" alt="ProjectX" />
</p>

<h1 align="center">ProjectX</h1>

<p align="center">
  <strong>Your desktop, in your pocket.</strong><br>
  Open-source remote development platform — code, terminal, Git, and AI from anywhere.
</p>

<p align="center">
  <a href="https://github.com/jonni2712/ProjectX/releases"><img src="https://img.shields.io/github/v/release/jonni2712/ProjectX?color=4ECDC4&style=flat-square" alt="Release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue?style=flat-square" alt="License" /></a>
  <a href="https://github.com/jonni2712/ProjectX/stargazers"><img src="https://img.shields.io/github/stars/jonni2712/ProjectX?color=FFE66D&style=flat-square" alt="Stars" /></a>
  <a href="https://github.com/jonni2712/ProjectX/actions"><img src="https://img.shields.io/github/actions/workflow/status/jonni2712/ProjectX/release.yml?style=flat-square&label=CI" alt="CI" /></a>
</p>

<p align="center">
  <a href="#-quick-start">Quick Start</a> &bull;
  <a href="#-features">Features</a> &bull;
  <a href="#-architecture">Architecture</a> &bull;
  <a href="#-downloads">Downloads</a> &bull;
  <a href="#-contributing">Contributing</a>
</p>

---

## What is ProjectX?

ProjectX turns your desktop PC into a full remote development server that you control from your phone or any device. No cloud hosting, no subscriptions — your code stays on your machine, accessible from anywhere through an encrypted tunnel.

**Three apps, one platform:**

- **Server** — Fastify backend that runs on your PC, managing your files, terminals, and Git repos
- **Desktop App** — Electron dashboard to configure the server, manage users, and monitor activity
- **Mobile App** — Flutter client for Android with file browser, code editor, terminal, Git, and Claude AI

---

## Downloads

| Platform | Download | Description |
|:--------:|:--------:|-------------|
| **Windows** | [**ProjectX Server Setup.exe**](https://github.com/jonni2712/ProjectX/releases/latest) | Desktop app with embedded server |
| **macOS** | [**ProjectX Server.dmg**](https://github.com/jonni2712/ProjectX/releases/latest) | Desktop app with embedded server |
| **Android** | [**ProjectX.apk**](https://github.com/jonni2712/ProjectX/releases/latest) | Mobile client |

> The desktop app includes everything — install it and you're ready to go. No Node.js or terminal required.

---

## Quick Start

### 1. Install the Desktop App

Download the installer for your OS from [Releases](https://github.com/jonni2712/ProjectX/releases/latest). Run it — the server starts automatically.

### 2. Create an Account

On first launch, the setup wizard guides you through:
- Choosing your workspace directory
- Creating an admin account
- Optionally configuring a Cloudflare Tunnel for remote access

### 3. Connect from Your Phone

Install the APK on your Android device. Enter the server URL shown in the dashboard (or scan the QR code) and log in.

That's it. You're now coding remotely.

---

## Features

### File Manager
Full CRUD operations — create, rename, move, copy, delete files and folders. Upload and download files. Zip/unzip directories. Breadcrumb navigation. File search.

### Code Editor
Syntax-aware text editor with line numbers, search & replace, and unsaved change tracking. Opens all text-based files. Previews images and binary files. Lock awareness prevents edit conflicts.

### Terminal
Persistent terminal sessions powered by node-pty. Sessions survive disconnects — close the app and come back to where you left off. Multiple tabs. Special key toolbar (Ctrl, Tab, Esc, arrows) designed for mobile. Dynamic sizing based on screen dimensions.

### Claude AI Integration
Built-in chat with Claude. Uses Claude CLI when available, falls back to the Anthropic API. Streaming responses with code block rendering, markdown formatting, and copy-to-clipboard. Context-aware — knows your current working directory.

### Git Management
Automatic repository discovery across your workspace. View status, stage changes, commit, push, pull, checkout branches. Commit history with author info. Branch management. Diff viewer.

### User Management
Multi-user system with roles (admin/user). JWT authentication with refresh tokens. Password management. Biometric unlock on mobile. Rate limiting and audit logging.

### Cloudflare Tunnel
Access your server from anywhere without exposing ports. Built-in tunnel management — start, stop, and configure directly from the dashboard. HTTPS and WSS encryption. No static IP or port forwarding required.

### Auto-Updates
The desktop app checks GitHub Releases for updates and installs them automatically. Ship a new version with a single `git tag`.

---

## Architecture

```
                        ┌─────────────────────────────────┐
                        │         Your Desktop PC          │
                        │                                  │
 ┌───────────┐   HTTPS  │  ┌───────────┐   ┌───────────┐  │
 │  Mobile   │◄────────►│  │  Fastify   │   │ Electron  │  │
 │   App     │   WSS    │  │  Server    │◄─►│ Dashboard │  │
 │ (Flutter) │          │  │            │   │  (React)  │  │
 └───────────┘          │  └─────┬──────┘   └───────────┘  │
                        │        │                          │
      ┌─────────┐       │  ┌─────┴──────┐                  │
      │Cloudflare│◄─────│  │ Workspace  │                  │
      │ Tunnel   │      │  │ Files, Git │                  │
      └─────────┘       │  │ Terminals  │                  │
                        │  └────────────┘                  │
                        └─────────────────────────────────┘
```

**Communication:**
- **REST API** — File CRUD, Git operations, authentication, user management
- **WebSocket** — Terminal I/O, Claude AI streaming, real-time file change notifications
- **Cloudflare Tunnel** — Encrypted HTTPS/WSS tunnel for remote access

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Server** | Fastify 5, TypeScript, SQLite | API, auth, business logic |
| **Terminal** | node-pty | Persistent PTY sessions |
| **Git** | simple-git | Repository operations |
| **AI** | Claude CLI / Anthropic SDK | Code assistant |
| **Desktop** | Electron, React 19, Tailwind CSS 4 | Server management UI |
| **Mobile** | Flutter 3, Dart, Riverpod | Remote client |
| **Auth** | JWT, bcrypt, WebSocket tickets | Security |
| **Tunnel** | cloudflared | Remote connectivity |
| **Database** | better-sqlite3 | Users, sessions, locks, audit |
| **CI/CD** | GitHub Actions, electron-builder | Automated builds & releases |

---

## Project Structure

```
ProjectX/
├── server/              # Fastify backend (TypeScript)
│   ├── src/
│   │   ├── routes/      # REST API endpoints
│   │   ├── services/    # Business logic (filesystem, git, terminal, claude, tunnel)
│   │   ├── ws/          # WebSocket handlers
│   │   ├── plugins/     # Auth plugin (JWT + WS tickets)
│   │   ├── db/          # SQLite schema and helpers
│   │   └── utils/       # Path guard, types
│   └── package.json
│
├── desktop/             # Electron dashboard (React + Tailwind)
│   ├── electron/        # Main process, preload, auto-updater
│   ├── src/
│   │   ├── pages/       # Dashboard, Users, Files, Tunnel, Logs, Settings
│   │   ├── api.ts       # Server API client
│   │   └── App.tsx      # Layout with sidebar navigation
│   └── package.json
│
├── flutter_app/         # Mobile client (Flutter/Dart)
│   └── lib/
│       ├── screens/     # Files, Editor, Terminal, Claude, Git, Profile
│       ├── providers/   # Riverpod state management
│       ├── services/    # API, WebSocket, auth clients
│       └── models/      # Data models
│
├── .github/workflows/   # CI/CD pipeline
└── docs/                # Design documents and roadmap
```

---

## Development Setup

### Prerequisites
- Node.js 20+
- Flutter SDK 3.10+
- Git

### Server
```bash
cd server
npm install
cp .env.example .env    # Edit with your settings
npm run dev             # http://localhost:3000
```

### Desktop App
```bash
cd desktop
npm install
npm run dev             # React UI at http://localhost:5173
npm run electron:dev    # Full Electron app
```

### Mobile App
```bash
cd flutter_app
flutter pub get
flutter run
```

### Build Installers
```bash
cd desktop
npm run build           # Builds .exe (Windows) or .dmg (macOS)
```

---

## Release Process

Tag a new version to trigger automated builds:

```bash
git tag v1.1.0
git push origin v1.1.0
```

GitHub Actions builds Windows (.exe), macOS (.dmg), and Android (.apk) automatically and publishes them to the GitHub Release. The desktop app's auto-updater picks up new versions within 4 hours.

---

## Security

- All passwords hashed with bcrypt (12 rounds)
- JWT tokens with configurable expiry and refresh rotation
- WebSocket authentication via single-use tickets (30s TTL)
- Path traversal protection on all file operations
- Rate limiting on authentication endpoints
- Audit logging for all sensitive operations
- Traffic encrypted via Cloudflare Tunnel (HTTPS/WSS)

Found a vulnerability? Please read our [Security Policy](SECURITY.md).

---

## Contributing

We welcome contributions! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions and guidelines.

---

## License

Apache License 2.0 — see [LICENSE](LICENSE) for details.

---

<p align="center">
  Built with Fastify, Electron, Flutter, and lots of coffee.
</p>
