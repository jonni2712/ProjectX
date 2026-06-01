# ProjectX Open Source Roadmap

**Data**: 2026-04-09
**Stato**: Draft

## Obiettivo
Trasformare ProjectX da tool personale a piattaforma open source pubblicata su Play Store e App Store, con server auto-configurabile.

---

## Fase 1: Sistema Multi-Utente (2-3 settimane)

### Server
| File | Modifica | Complessità |
|------|----------|-------------|
| `server/src/db/database.ts` | Aggiungere tabella `users` con ruoli (admin/user) | M |
| `server/src/routes/auth.ts` | Riscrivere login da .env a DB, aggiungere register/password-change/user-management | M |
| `server/src/plugins/auth.ts` | Aggiungere decorator `requireAdmin` | S |
| `server/src/utils/types.ts` | Aggiungere `role` a `JwtPayload` | S |
| `server/src/config.ts` | Rimuovere auth credentials da env, leggere da DB | S |
| `server/src/utils/path-guard.ts` | Supporto workspace per-utente | M |

### App Flutter
| File | Modifica | Complessità |
|------|----------|-------------|
| `flutter_app/lib/providers/auth_provider.dart` | Aggiungere username/role allo state | M |
| `flutter_app/lib/screens/profile_screen.dart` | Username dinamico, cambio password | S |
| `flutter_app/lib/screens/admin_screen.dart` | **NUOVO** - Pannello admin gestione utenti | L |
| `flutter_app/lib/services/user_service.dart` | **NUOVO** - API client per gestione utenti | M |

---

## Fase 2: Setup Wizard (2-3 settimane)

| File | Modifica | Complessità |
|------|----------|-------------|
| `server/src/setup.ts` | ✅ FATTO (v1.1.2) - Wizard CLI interattivo: workspace/rete/admin/JWT, input password nascosto, scrive config.json + seed admin nel DB, reconfigure preserva il JWT secret | L |
| `server/src/config-store.ts` | ✅ FATTO (v1.1.1) - Config JSON (`data/config.json`), precedenza env > json > default, migrazione automatica al primo avvio | M |
| `server/src/setup-server.ts` (+ `index.ts` bootstrap, `app.ts`) | ✅ FATTO (v1.1.5) - Web UI setup al primo avvio: boota in setup-mode se manca config, scrive config.json + seed admin, handoff al server reale sulla stessa porta | L |
| `server/src/services/cloudflare.service.ts` | ✅ FATTO (v1.1.4) - Auto-install cloudflared + quick tunnel (zero-config) + named tunnel via API (+ rotte `routes/cloudflare.ts`) | L |
| `setup.sh` | ✅ FATTO (v1.1.2) - delega a `npm run setup`, legge i valori da config.json. `setup.bat`/`setup.ps1` (Windows) ancora TODO | M |

### Cloudflare Integration — ✅ FATTO (v1.1.4)
- ✅ Detect/install cloudflared (download binario per OS/arch in `~/.projectx/bin`)
- ✅ Creare tunnel via API con token utente (`POST /cloudflare/named-start`)
- ✅ Configurare DNS record automaticamente (CNAME → `<id>.cfargotunnel.com`, create/update)
- ✅ Avviare cloudflared come child process (PID file + orphan cleanup + resume su restart)
- ✅ Quick tunnel zero-config (`*.trycloudflare.com`) per accesso istantaneo senza account
- ✅ UI desktop (Electron): pagina "Remote Access" pilota gli endpoint + first-run SetupWizard + QR pairing (desktop app 1.1.1). UI Flutter ⏳ TODO

---

## Fase 3: App per Release Pubblica (2-3 settimane)

| File | Modifica | Complessità |
|------|----------|-------------|
| `flutter_app/lib/screens/onboarding_screen.dart` | ✅ FATTO (app 1.0.1) - Guida primo avvio (mostrata una volta) | M |
| `flutter_app/lib/screens/server_list_screen.dart` | ✅ FATTO (app 1.0.1) - Lista server salvati + add manuale + QR scanner (`qr_scan_screen.dart`) | L |
| `flutter_app/lib/screens/setup_guide_screen.dart` | ⏳ coperto da onboarding + server_list per ora | M |
| `flutter_app/lib/config/api_config.dart` | ✅ FATTO (app 1.0.1) - Multi-server via `ServerStore` + `ServerProfile` (migra legacy `server_url`) | M |
| `flutter_app/lib/services/api_service.dart` | ⏳ Error handling/retry/offline — TODO (serve `connectivity_plus`) | M |
| `flutter_app/pubspec.yaml` | ✅ mobile_scanner aggiunto. connectivity_plus/flutter_markdown ⏳ TODO | S |
| AndroidManifest.xml | ✅ FATTO - Label "ProjectX" + permesso CAMERA (applicationId invariato) | S |
| `flutter_app/assets/icon/` | ⏳ TODO - serve asset PNG + flutter_launcher_icons | M |
| `flutter create --platforms ios .` | ⏳ TODO - progetto iOS | L |

---

## Fase 4: Pubblicazione Store (1-2 settimane)

| Item | Dettagli | Complessità |
|------|----------|-------------|
| Android signing | Keystore release, build.gradle.kts config | M |
| Play Store listing | Descrizione, screenshot, feature graphic, privacy policy | M |
| iOS build | Xcode setup, signing, TestFlight | M |
| App Store listing | Screenshots, review guidelines compliance | M |
| `docs/PRIVACY_POLICY.md` | **NUOVO** | S |
| `docs/TERMS_OF_SERVICE.md` | **NUOVO** | S |

---

## Fase 5: Open Source (ongoing)

| File | Modifica | Complessità |
|------|----------|-------------|
| `LICENSE` | Apache 2.0 | S |
| `CONTRIBUTING.md` | Linee guida contribuzione | S |
| `.github/` | Issue templates, PR template, CI workflows | M |
| `server/Dockerfile` + `docker-compose.yml` | ✅ FATTO (v1.1.3) - multi-stage + entrypoint che lancia setup non-interattivo al primo avvio; setup.ts supporta modalità `--non-interactive` (env-driven) | M |
| `install.sh` / `install.ps1` | One-click install | M |
| `.github/workflows/ci.yml` | Build + test + lint | M |
| `.github/workflows/release.yml` | Auto-release APK + Docker image | M |
| `docs/site/` | Sito documentazione (Docusaurus/VitePress) | M (nice-to-have) |

---

## Ordine Esecuzione Consigliato

1. Fase 1 (Multi-utente) - fondazione
2. Fase 2.4 (Config file JSON) - decoupling da .env
3. Fase 2.1 (CLI wizard) - usabilità
4. Fase 3.5 (Branding) - quick win
5. Fase 3.2 (Multi-server) - UX essenziale
6. Fase 5.1 (Repo structure + license) - go public
7. Fase 3.6 (iOS) - App Store
8. Fase 2.3 (Cloudflare integration)
9. Fase 4 (Store publishing)
10. Fase 5.2-5.5 (Docker, CI, docs)

**Timeline stimata**: 8-12 settimane per must-have

---

## Rischi

- **node-pty in Docker**: compilazione nativa su architetture diverse
- **Apple App Store**: terminal apps possono essere flaggate, preparare demo video
- **Isolamento multi-utente**: terminal/claude sessions devono essere scoped per utente
- **Windows server**: testare wizard e path handling
