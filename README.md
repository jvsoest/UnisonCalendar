# Unison Calendar

Een offline-first desktopagenda voor Windows, macOS en Linux. De UI verenigt CalDAV-, Google Calendar- en Exchange ActiveSync-agenda's in dag-, week- en maandweergaven.

## Starten

```bash
npm install
npm run dev
```

Productiebundels maken:

```bash
npm run dist
```

Platformspecifiek bouwen:

```bash
npm run dist:mac
npm run dist:win
npm run dist:linux
```

De installers verschijnen in `release/`:

- macOS: universele `.dmg` voor Intel en Apple Silicon
- Windows: configureerbare x64 NSIS `.exe`
- Linux: x64 `.AppImage` en `.deb`

## GitHub Actions

`Desktop build` bouwt en bewaart installers voor macOS, Windows en Linux bij iedere pull request, push naar `main` of handmatige start.

`Desktop release` draait bij een versietag zoals `v0.1.0`, bouwt alle platformen en publiceert de installers in een GitHub Release:

```bash
git tag v0.1.0
git push origin v0.1.0
```

De macOS-build is voorlopig niet met een Apple Developer ID ondertekend en de Windows-build niet met een code-signingcertificaat. De installers zijn functioneel, maar Gatekeeper en SmartScreen kunnen daarom een waarschuwing tonen.

## Architectuur

- **Electron + React + TypeScript** voor één desktopcodebase.
- **IndexedDB** bewaart agenda's, afspraken en de sync-outbox duurzaam lokaal. De app start en blijft volledig bruikbaar zonder netwerk.
- **Provider-adapters** in `src/providers.ts` isoleren CalDAV, Google Calendar en Exchange ActiveSync van de interface.
- Elke lokale wijziging wordt direct opgeslagen en aan de **outbox** toegevoegd. Een volgende implementatiefase kan deze bij verbinding pushen, remote wijzigingen met cursors ophalen en conflicten tonen.

## Accounts verbinden

Open het tandwiel rechtsboven. De app ondersteunt:

- **CalDAV:** server-URL, gebruikersnaam en wachtwoord/app-wachtwoord. De app ontdekt agenda-collecties via WebDAV `PROPFIND`, haalt afspraken op met `calendar-query REPORT` en bewaart ze offline.
- **Google Calendar:** OAuth 2.0 Authorization Code met PKCE, agenda-discovery, eventdownload en remote create/update via de Google Calendar API.
- **Microsoft Exchange:** Microsoft identity platform OAuth 2.0 met PKCE en de `EAS.AccessAsUser.All` scope, gevolgd door EAS 14.1 Provision, FolderSync en Calendar Sync/Add/Change.

Google en Microsoft vereisen een eigen publieke desktopclient-id. Registreer een desktop/native app, activeer de Calendar API of EAS-permissie en sta een localhost loopback redirect toe. Unison kiest bij iedere login een vrije lokale poort (`http://localhost:<poort>/oauth/callback`). Er is geen client secret nodig of toegestaan voor deze publieke desktopflow.

Accountmetadata staat in het Electron user-data-profiel. OAuth refresh tokens en CalDAV-wachtwoorden worden apart versleuteld met Electron `safeStorage`, dat op macOS Keychain en op ondersteunde Windows/Linux-systemen de native OS-beveiliging gebruikt.

CalDAV, Google Calendar en Exchange ActiveSync ondersteunen lezen, een lokale offline cache en remote create/update. Wijzigingen die offline worden gemaakt blijven in de lokale outbox en worden bij de volgende verbinding verstuurd. ICS-abonnementen zijn per definitie alleen-lezen en worden daarom niet als doelagenda getoond bij het maken van afspraken.
