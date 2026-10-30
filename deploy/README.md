# deploy/ – Vorlagen für einen eigenen Server

Vorlagen, um Hitster dauerhaft auf einem eigenen Linux-Rechner laufen zu lassen,
öffentlich erreichbar über eine eigene Domain mit HTTPS (Reverse-Proxy
**Caddy**). Die Schritt-für-Schritt-Anleitung samt Portfreigabe, DDNS und
CGNAT-Prüfung steht in [`OEFFENTLICH-HOSTEN.md`](OEFFENTLICH-HOSTEN.md).

- **Website/Handy/Browser:** `https://<deine-domain>`, der Server liefert das
  gebaute Web-Frontend (SPA) selbst aus.
- **Desktop-App:** zeigt auf dieselbe HTTPS-Domain (Server-Adresse unter
  Optionen → Server-Verbindung).

## Dateien

| Datei | Zweck |
|---|---|
| `Caddyfile` | Reverse-Proxy mit automatischem Let's-Encrypt-HTTPS auf `127.0.0.1:3000`. |
| `hitster-backend.service` | systemd **--user** Unit: startet `node index.js`, Auto-Restart, Start beim Boot (mit linger), in einer Sandbox mit Schreibrecht nur fürs `DATA_DIR`. |
| `hitster-update.sh` | Update-Skript: `git pull --ff-only`, bei Bedarf `npm`-Install, `quasar build` (Frontend) und Backend-Neustart. Manuell ausführbar. |
| `hitster-update.service` | systemd **--user** oneshot, das `hitster-update.sh` startet. |
| `hitster-update.timer` | Löst den Update-Service täglich um 04:00 aus. |

## Kurzfassung Installation

```bash
# 1. Konfiguration
mkdir -p ~/hitster-data                 # DATA_DIR, die Dienst-Sandbox erwartet genau diesen Ordner
cp server/.env.example server/.env      # JWT_SECRET, DATA_DIR, ALLOWED_ORIGINS eintragen

# 2. Abhängigkeiten + erster Frontend-Build
( cd server && npm install --omit=dev )
npm install && npm run build            # baut dist/spa

# 3. HTTPS-Reverse-Proxy (Caddy, als root)
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile   # Domain darin eintragen
sudo systemctl reload caddy

# 4. systemd --user Units (als der Nutzer, nicht root)
mkdir -p ~/.config/systemd/user
cp deploy/hitster-backend.service deploy/hitster-update.service deploy/hitster-update.timer ~/.config/systemd/user/
loginctl enable-linger "$USER"
systemctl --user daemon-reload
systemctl --user enable --now hitster-backend
systemctl --user enable --now hitster-update.timer
```

## Server-Owner (= Admin) festlegen

Der **Server-Owner ist der Admin** (Nutzerverwaltung, eingeschränkte Versionen,
Sichtbarkeit in der Bestenliste). Die Owner-Zugehörigkeit steht als stabile
Nutzer-UUID in `DATA_DIR/server-owner.json` (außerhalb des Repos, übersteht
`git pull` und Umzüge).

- **Frischer Server:** der **erste registrierte Account** wird automatisch Owner.
- **Explizit setzen/ändern:** entweder `OWNER_USERNAME=<Name>` (oder `OWNER_ID=<uuid>`)
  in `server/.env` eintragen und das Backend neu starten
  (`systemctl --user restart hitster-backend`), oder später in der App unter
  **Nutzerverwaltung → Ownership übertragen**.

Eingeschränkte Versionen sind **nicht** im App-Bundle, sondern liegen auf dem
Server und werden nur an **freigegebene** Accounts ausgeliefert. Angelegt werden
sie in der App, indem man eine eigene Version an Accounts freigibt.

## Nicht im Repo (auf dem Server anlegen bzw. beim Umzug mitnehmen)

- `server/.env`: Konfiguration inkl. `JWT_SECRET`, `DATA_DIR`, `ALLOWED_ORIGINS`,
  optional `OWNER_USERNAME`.
- Der komplette `DATA_DIR`-Ordner mit den Laufzeitdaten (Accounts, Avatare,
  Klassifikationen, `server-owner.json`, `restricted-versions.json`,
  `musicbrainz-cache.json`). Beim Umzug auf einen anderen Rechner **diesen
  Ordner und die `.env` kopieren**; `node_modules`/`dist` werden per Install und
  Build neu erzeugt.
