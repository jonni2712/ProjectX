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
| `server/src/setup.ts` | Riscrivere come wizard cross-platform (inquirer/prompts) | L |
| `server/src/config-store.ts` | **NUOVO** - Config JSON (`data/config.json`) al posto di .env | M |
| `server/src/routes/setup.ts` | **NUOVO** - Web UI per setup al primo avvio | L |
| `server/src/services/cloudflare.service.ts` | **NUOVO** - Auto-install cloudflared, crea tunnel via API | L |
| `setup.sh` / `setup.bat` / `setup.ps1` | Script cross-platform che lancia il wizard | M |

### Cloudflare Integration
- Detect/install cloudflared
- Creare tunnel via API con token utente
- Configurare DNS record automaticamente
- Avviare cloudflared come child process del server

---

## Fase 3: App per Release Pubblica (2-3 settimane)

| File | Modifica | Complessità |
|------|----------|-------------|
| `flutter_app/lib/screens/onboarding_screen.dart` | **NUOVO** - Guida primo avvio | M |
| `flutter_app/lib/screens/server_list_screen.dart` | **NUOVO** - Lista server salvati, QR scanner | L |
| `flutter_app/lib/screens/setup_guide_screen.dart` | **NUOVO** - Guida in-app configurazione server | M |
| `flutter_app/lib/config/api_config.dart` | Multi-server support | M |
| `flutter_app/lib/services/api_service.dart` | Error handling, retry, offline mode | M |
| `flutter_app/pubspec.yaml` | Aggiungere mobile_scanner, connectivity_plus, flutter_markdown | S |
| AndroidManifest.xml | Label "ProjectX", nuovo applicationId | S |
| `flutter_app/assets/icon/` | **NUOVO** - App icon | M |
| `flutter create --platforms ios .` | Generare progetto iOS | L |

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
| `server/Dockerfile` + `docker-compose.yml` | Docker support | M |
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
