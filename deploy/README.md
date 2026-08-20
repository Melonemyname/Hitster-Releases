# deploy/ – Hitster als Homeserver (No-IP + HTTPS)

Vorlagen, um Hitster dauerhaft auf einem eigenen Rechner laufen zu lassen
(aktuell Surface Go 2 mit Tuxedo OS, spaeter Raspberry Pi). Der Server ist
oeffentlich ueber eine **No-IP-Domain mit HTTPS** erreichbar (Reverse-Proxy
**Caddy**). Clients brauchen **kein Tailscale**:

- **Website/Handy/Browser:** `https://<deine-no-ip-domain>` – der Server liefert
  das gebaute Web-Frontend (SPA) selbst aus.
- **Desktop-App:** zeigt auf dieselbe HTTPS-Domain (Server-Adresse im App-Dialog).

## Dateien

| Datei | Zweck |
|---|---|
| `Caddyfile` | Reverse-Proxy mit automatischem Let's-Encrypt-HTTPS auf `127.0.0.1:3000`. |
| `hitster-backend.service` | systemd **--user** Unit: startet `node index.js`, Auto-Restart, Start beim Boot (mit linger). |
| `hitster-update.sh` | Update-Skript: `git pull --ff-only`, bei Bedarf `npm`-Install, `quasar build` (Frontend) und Backend-Neustart. Manuell ausfuehrbar. |
| `hitster-update.service` | systemd **--user** oneshot, das `hitster-update.sh` startet. |
| `hitster-update.timer` | Loest den Update-Service taeglich 04:00 aus. |

## Kurzfassung Installation

```bash
# 1. Konfiguration
cp server/.env.example server/.env      # JWT_SECRET, DATA_DIR, ALLOWED_ORIGINS eintragen

# 2. Abhaengigkeiten + erster Frontend-Build
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

Die ausfuehrliche Schritt-fuer-Schritt-Anleitung (No-IP-Update-Client, Router-
Portfreigabe 443/80, CGNAT-Check, Node/Caddy installieren, `DATA_DIR` seeden,
BorgBackup, Umzug auf den Raspberry Pi) steht im persoenlichen
Surface-Homeserver-Dokument.

## Server-Owner (= Admin) festlegen

Der **Server-Owner ist der Admin** (Nutzerverwaltung, eingeschraenkte Versionen,
Sichtbarkeit in der Bestenliste). Die Owner-Zugehoerigkeit steht als stabile
Nutzer-UUID in `DATA_DIR/server-owner.json` (ausserhalb des Repos, uebersteht
`git pull` und Umzuege).

- **Frischer Server:** der **erste registrierte Account** wird automatisch Owner.
- **Bestehender Server (dieser hier):** beim ersten Start nach dem Update wird
  automatisch der vorhandene Admin-Account uebernommen – **nichts zu tun**.
- **Explizit setzen/aendern:** entweder `OWNER_USERNAME=<Name>` (oder `OWNER_ID=<uuid>`)
  in `server/.env` eintragen und das Backend neu starten
  (`systemctl --user restart hitster-backend`), oder spaeter in der App unter
  **Nutzerverwaltung → Eingeschraenkte Versionen bzw. Ownership uebertragen**.
  `server/.env` liegt ausserhalb des Repos, die Aenderung uebersteht den Update-Timer.

Eingeschraenkte Versionen (z. B. Hitster 1 & 2) sind **nicht** im App-Bundle,
sondern werden vom Server nur an **freigegebene** Accounts ausgeliefert. Die
Freigabe erfolgt in der App unter **Nutzerverwaltung → Eingeschraenkte Versionen**.
Der mitgelieferte Seed (`server/restricted-versions.seed.json`) fuellt beim ersten
Start `DATA_DIR/restricted-versions.json`; die Freigaben (welche Accounts) setzt
der Owner selbst.

## Nicht im Repo (manuell auf dem Server anlegen / mitnehmen)

- `server/.env` – Konfiguration inkl. `JWT_SECRET`, `DATA_DIR`, `ALLOWED_ORIGINS`,
  optional `OWNER_USERNAME`.
- Der komplette `DATA_DIR`-Ordner – die echten Laufzeitdaten (Accounts, Avatare,
  Klassifikationen, `server-owner.json`, `restricted-versions.json`). Beim Umzug
  auf einen anderen Rechner **diesen Ordner + die `.env` kopieren**;
  `node_modules`/`dist` werden per Install+Build neu erzeugt.

Eine allgemeine Anleitung fuer **fremde Self-Hoster** (ohne Surface-/Samba-/
Syncthing-Spezifika) steht in [`OEFFENTLICH-HOSTEN.md`](OEFFENTLICH-HOSTEN.md).
