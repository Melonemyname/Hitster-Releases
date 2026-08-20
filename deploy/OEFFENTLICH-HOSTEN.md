# Eigenen Hitster-Server oeffentlich hosten

Diese Anleitung richtet einen **eigenen Hitster-Server** ein, den andere per
Internet-Adresse erreichen und dem sie beitreten koennen. Sie ist bewusst
allgemein gehalten (Linux-Server mit Node + Caddy); die persoenliche Surface-
Variante mit Samba/Syncthing steht in [`README.md`](README.md).

**Ergebnis:**
- **Website (Handy/Browser):** `https://<deine-domain>` – der Server liefert das
  gebaute Web-Frontend selbst aus, keine Installation noetig.
- **Desktop-App:** im Server-Dialog dieselbe HTTPS-Domain eintragen.

## Zuerst: Brauchst du ueberhaupt eine Portfreigabe?

Es gibt drei Wege, und nur der letzte ist aufwendig.

### A) Alle sitzen im selben WLAN

Der einfachste Fall, und fuer einen Spieleabend meist der richtige. Es wird
**keine** Portfreigabe und **keine** Domain gebraucht, nur die lokale IP des
Rechners, auf dem der Server laeuft:

```bash
hostname -I | awk '{print $1}'      # Linux
ipconfig getifaddr en0              # macOS (WLAN)
ipconfig                            # Windows, "IPv4-Adresse"
```

Das ergibt etwas wie `192.168.178.42`. In `server/.env` dann:

```
HOST=0.0.0.0
ALLOWED_ORIGINS=http://192.168.178.42:3000
```

`HOST=0.0.0.0` ist hier noetig, sonst lauscht der Server nur auf dem eigenen
Rechner. Die anderen oeffnen `http://192.168.178.42:3000` im Browser. In der
Desktop-App wird dieselbe Adresse unter „Server-Verbindung" eingetragen.

Zwei Einschraenkungen: Die lokale IP kann sich nach einem Neustart aendern (im
Router eine feste Adresse zuweisen), und es laeuft ohne HTTPS. Im eigenen WLAN
ist das vertretbar, ins Internet gehoert es so **nicht**.

### B) Ueber ein privates Netz (Tailscale, WireGuard)

Wer von unterwegs mitspielen will, aber keine Portfreigabe einrichten kann oder
mag: Ein Mesh-VPN wie Tailscale verbindet die Geraete direkt, ohne dass am
Router etwas geoeffnet wird. Der Server bekommt eine feste Adresse im
VPN-Netz, alle Teilnehmer installieren den Client. Funktioniert auch hinter
CGNAT.

### C) Oeffentlich aus dem Internet erreichbar

Der Weg fuer einen dauerhaft offenen Server, siehe der Rest dieser Anleitung.
Dafuer wird gebraucht:

1. **Eine Domain**, die auf deine IP zeigt. Zu Hause aendert sich die IP
   regelmaessig, deshalb ein DDNS-Dienst (No-IP, DuckDNS, dynv6). Der traegt
   die aktuelle IP automatisch nach, entweder per Router-Einstellung
   („DynDNS" im Router) oder per Update-Client auf dem Server.
2. **Portfreigabe im Router** fuer **`80/tcp`** und **`443/tcp`** auf die lokale
   IP des Servers. Der Menuepunkt heisst je nach Hersteller „Portfreigabe",
   „Port-Weiterleitung", „Virtual Server" oder „NAT". Port 80 wird fuer die
   Zertifikatsausstellung gebraucht, 443 fuer den eigentlichen Betrieb.
   **Den Node-Port 3000 niemals freigeben**, davor gehoert der Reverse-Proxy.
3. **Eine feste lokale IP fuer den Server**, sonst zeigt die Freigabe nach einem
   Neustart auf das falsche Geraet. Im Router unter DHCP zuweisen.

**CGNAT pruefen, bevor du anfaengst.** Vergleiche die WAN-IP im Router mit dem,
was `wieistmeineip.de` anzeigt. Weichen sie ab, oder liegt die WAN-IP im Bereich
`100.64.x.x` bis `100.127.x.x`, teilst du dir die IP mit anderen Kunden und
**keine Portfreigabe der Welt wird funktionieren**. Dann hilft nur eine echte
IPv4 beim Provider anfragen (oft kostenpflichtig), ein VPS, oder Weg B.

**Testen** laesst sich die Erreichbarkeit von aussen nur von aussen, also nicht
aus dem eigenen WLAN heraus (viele Router leiten das nicht zurueck). Mobilfunk
statt WLAN am Handy benutzen, oder einen Port-Checker im Netz.

## Ueberblick

Das Node-Backend lauscht nur lokal (`127.0.0.1:3000`). Davor sitzt **Caddy** als
HTTPS-Reverse-Proxy (holt automatisch ein Let's-Encrypt-Zertifikat). Die
Laufzeitdaten (Accounts, Freigaben, Owner) liegen in einem `DATA_DIR` **ausserhalb**
des Repos, damit Updates sie nie anfassen.

## 0. Voraussetzungen

- Ein **Linux-Rechner**, der durchlaeuft (eigener Server, Homeserver, VPS/Root-Server).
- Eine **Domain**, die auf die IP des Rechners zeigt. Zu Hause: dynamische IP per
  **DDNS** (z. B. No-IP/DuckDNS) + **Router-Portfreigabe** von `443/tcp` und `80/tcp`
  auf den Server. **CGNAT pruefen:** ist die WAN-IP im Router eine `100.64.x.x`–
  `100.127.x.x`-Adresse oder weicht sie von `wieistmeineip.de` ab, funktioniert die
  Portfreigabe nicht (beim Provider echte IPv4 anfragen). Auf einem VPS entfaellt das.

## 1. Node 20, git und Caddy installieren

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git
# Caddy (offizielles Repo)
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update && sudo apt-get install -y caddy
```

## 2. Repo klonen und `DATA_DIR` anlegen

```bash
git clone <repo-url> ~/Hitster
mkdir -p ~/hitster-data     # Laufzeitdaten AUSSERHALB des Repos
```

## 3. `server/.env` anlegen

```bash
cp ~/Hitster/server/.env.example ~/Hitster/server/.env
openssl rand -hex 32        # Ausgabe als JWT_SECRET eintragen
nano ~/Hitster/server/.env
```

Setzen (Domain anpassen):

```
PORT=3000
HOST=127.0.0.1
NODE_ENV=production
JWT_SECRET=<die-erzeugte-Zeichenkette>
DATA_DIR=/home/<user>/hitster-data
ALLOWED_ORIGINS=https://<deine-domain>
TRUST_PROXY=1
```

**Owner (= Admin):** Der **erste registrierte Account** wird auf einem frischen
Server automatisch Owner. Willst du ihn vorab festlegen, `OWNER_USERNAME=<Name>`
setzen (der Account muss dann existieren/registriert werden). Uebertragen laesst
sich die Ownership spaeter in der App unter **Nutzerverwaltung**.

## 4. Abhaengigkeiten installieren und Frontend bauen

```bash
cd ~/Hitster
( cd server && npm install --omit=dev )
npm install
npm run build     # erzeugt dist/spa (auf schwacher Hardware: NODE_OPTIONS=--max-old-space-size=2048)
```

## 5. Caddy (HTTPS) konfigurieren

```bash
sudo cp ~/Hitster/deploy/Caddyfile /etc/caddy/Caddyfile
sudo nano /etc/caddy/Caddyfile     # <deine-domain> eintragen
sudo systemctl enable --now caddy
sudo systemctl reload caddy
```

Caddy holt beim ersten Aufruf automatisch das Zertifikat (dafuer muessen 80/443
erreichbar und die Domain gesetzt sein).

## 6. Backend als Dienst starten

```bash
mkdir -p ~/.config/systemd/user
cp ~/Hitster/deploy/hitster-backend.service ~/.config/systemd/user/
cp ~/Hitster/deploy/hitster-update.service  ~/.config/systemd/user/
cp ~/Hitster/deploy/hitster-update.timer    ~/.config/systemd/user/
loginctl enable-linger "$USER"       # Dienste laufen ohne Login/beim Boot
systemctl --user daemon-reload
systemctl --user enable --now hitster-backend
systemctl --user enable --now hitster-update.timer   # taegliches Update 04:00
```

> Falls `which node` nicht `/usr/bin/node` ist (z. B. nvm), in
> `~/.config/systemd/user/hitster-backend.service` die `ExecStart=`-Zeile auf den
> echten node-Pfad setzen und `systemctl --user daemon-reload && restart`.

## 7. Pruefen

```bash
systemctl --user status hitster-backend    # active (running)
sudo systemctl status caddy                 # active (running)
curl -I https://<deine-domain>              # gueltiges Zertifikat, HTTP 200/302
```

Dann `https://<deine-domain>` im Browser oeffnen, registrieren (der erste Account
wird Owner/Admin), und in der Desktop-App dieselbe Domain als Server-Adresse
eintragen.

## Sicherheit (Kurzueberblick)

- HTTPS erzwungen (Caddy leitet `http`→`https`), gueltiges Let's-Encrypt-Zertifikat.
- Nur 80/443 nach aussen; das Node-Backend ist nur lokal (`127.0.0.1:3000`).
- `NODE_ENV=production` schaltet die CORS-Whitelist (`ALLOWED_ORIGINS`) scharf.
- Login/Registrierung rate-limitiert; Passwoerter nur als bcrypt-Hash; Identitaet
  per JWT auf stabile Nutzer-UUID.
- Die Laufzeitdaten in `DATA_DIR` regelmaessig sichern (mind. `users.json`,
  `restricted-versions.json`, `server-owner.json`, `uploads/`, `.env`).
