# ProjectX

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![GitHub release](https://img.shields.io/github/v/release/nicobailon/projectx)](https://github.com/nicobailon/projectx/releases)
[![GitHub stars](https://img.shields.io/github/stars/nicobailon/projectx)](https://github.com/nicobailon/projectx/stargazers)

> A remote development platform with a desktop dashboard, mobile client, and self-hosted server.

## What is ProjectX?

ProjectX lets you manage files, run terminals, interact with Git, and chat with Claude AI on a self-hosted server -- all from a desktop Electron app or an Android phone. The server runs on your machine and clients connect securely via Cloudflare Tunnel or Tailscale.

## Screenshots

*Coming soon.*

## Architecture

```
┌──────────────────┐         ┌──────────────────┐         ┌──────────────────┐
│   Desktop App    │         │      Server      │         │   Mobile App     │
│  Electron/React  │◄──────►│  Fastify + SQLite │◄──────►│     Flutter      │
│   Tailwind CSS   │  HTTPS  │   TypeScript     │  HTTPS  │   Android/iOS   │
└──────────────────┘  WSS    └──────────────────┘  WSS    └──────────────────┘
                                     │
                              ┌──────┴──────┐
                              │  Your Files │
                              │  Git Repos  │
                              │  Terminals  │
                              └─────────────┘
```

## Quick Start

### Option 1: Desktop App (Recommended)

Download the latest release from the [Releases](https://github.com/nicobailon/projectx/releases) page. The desktop app bundles the server -- install, configure, and start coding.

### Option 2: Mobile App

Build or download the APK, install it on your Android device, and connect to your running server.

```bash
cd flutter_app
flutter pub get
flutter build apk --release
```

The APK will be at `flutter_app/build/app/outputs/flutter-apk/app-release.apk`.

### Option 3: Manual Server Setup

```bash
cd server
npm install
cp .env.example .env
npm run setup        # Generate password hash
# Edit .env with your settings
npm run dev          # Start the server
```

Or use the one-command setup script:

```bash
./setup.sh
```

## Features

| Feature | Description |
|---------|-------------|
| File Manager | Full CRUD, rename, move, copy, upload, download, zip/unzip |
| Code Editor | Syntax highlighting, search, unsaved tracking, lock awareness |
| Terminal | Persistent sessions that survive disconnects, multiple tabs |
| Claude AI | CLI mode + API fallback, streaming chat |
| Git Integration | Status, add, commit, push, pull, checkout, diff, discard |
| File Locks | File-level + project-level locks, Syncthing conflict prevention |
| Authentication | JWT + refresh tokens, rate limiting, audit logging |
| Secure Tunnels | Cloudflare Tunnel (HTTPS/WSS) or Tailscale for connectivity |

## Tech Stack

| Component | Technology |
|-----------|------------|
| Server | Fastify, TypeScript, SQLite, node-pty |
| Desktop App | Electron, React, Tailwind CSS, Vite |
| Mobile App | Flutter, Dart, Riverpod |
| Auth | JWT, bcrypt, WebSocket ticket auth |
| Connectivity | Cloudflare Tunnel, Tailscale |

## Project Structure

```
ProjectX/
├── server/           # Fastify backend (TypeScript)
├── desktop/          # Electron dashboard (React + Tailwind)
├── flutter_app/      # Flutter mobile client (Dart)
├── docs/             # Documentation and design plans
├── setup.sh          # One-command setup script
└── .github/          # CI workflows, issue & PR templates
```

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## License

This project is licensed under the Apache License 2.0. See [LICENSE](LICENSE) for details.
