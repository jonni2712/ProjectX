# Contributing to ProjectX

Thank you for your interest in contributing! Here's how to get started.

## Development Setup

### Prerequisites
- Node.js 20+
- Flutter SDK 3.10+
- Git

### Server
```bash
cd server
npm install
cp .env.example .env
# Edit .env with your settings
npm run dev
```

### Desktop App
```bash
cd desktop
npm install
npm run dev          # React UI in browser
npm run electron:dev # Full Electron app
```

### Mobile App
```bash
cd flutter_app
flutter pub get
flutter run
```

## Project Structure
```
ProjectX/
├── server/          # Fastify backend (TypeScript)
├── desktop/         # Electron dashboard (React + Tailwind)
├── flutter_app/     # Mobile client (Flutter/Dart)
└── docs/            # Documentation
```

## Guidelines

- Follow existing code style
- Write meaningful commit messages
- Test your changes before submitting
- One PR per feature/fix
- Update documentation if needed

## Reporting Issues

Use GitHub Issues with the provided templates for:
- Bug reports
- Feature requests

## License

By contributing, you agree that your contributions will be licensed under the Apache License 2.0.
