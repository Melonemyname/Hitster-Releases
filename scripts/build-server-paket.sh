#!/usr/bin/env bash
#
# Baut das herunterladbare Server-Paket (ZIP): Startskripte sichtbar oben,
# alles was sie brauchen in programm/. Wer damit spielen will, braucht kein
# Git und kein Repo - nur Node.js und diese ZIP.
#
#   scripts/build-server-paket.sh [ausgabeordner]
#
# Voraussetzung: `npm run build` ist gelaufen (dist/spa existiert). Der Server
# liefert dieses gebaute Frontend selbst aus, deshalb genuegt im Paket EIN
# Startskript pro Plattform - das Spiel laeuft dann auf http://localhost:3000.
#
set -euo pipefail

WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AUSGABE="${1:-$WURZEL/dist}"
VERSION="$(node -p "require('$WURZEL/package.json').version")"
ZIP="Hitster-Server-$VERSION.zip"

if [ ! -f "$WURZEL/dist/spa/index.html" ]; then
    echo "FEHLER: dist/spa fehlt. Zuerst 'npm run build' ausfuehren." >&2
    exit 1
fi

BAU="$(mktemp -d)/Hitster-Server"
trap 'rm -rf "$(dirname "$BAU")"' EXIT
mkdir -p "$BAU/programm/dist"

# ── Inhalt: Server-Code (nur versionierte Dateien) + gebautes Frontend ──────
git -C "$WURZEL" ls-files server | while read -r f; do
    mkdir -p "$BAU/programm/$(dirname "$f")"
    cp "$WURZEL/$f" "$BAU/programm/$f"
done
cp -R "$WURZEL/dist/spa" "$BAU/programm/dist/spa"

# ── Startskripte: sichtbar auf der obersten Ebene ───────────────────────────
NODE_HINWEIS_SH='if ! command -v node >/dev/null 2>&1; then
  echo "FEHLER: Node.js ist nicht installiert."
  echo "Bitte zuerst die LTS-Version von https://nodejs.org installieren,"
  echo "danach dieses Fenster schliessen und das Skript erneut starten."
  read -r -p "Mit Enter beenden..."
  exit 1
fi'

for plattform in "Linux:sh:Strg+C" "macOS:command:Control-C"; do
    name="${plattform%%:*}"; rest="${plattform#*:}"
    endung="${rest%%:*}"; abbruch="${rest#*:}"
    cat > "$BAU/Server starten ($name).$endung" <<SKRIPT
#!/usr/bin/env bash
# Startet den Hitster-Server samt Spiel. Danach im Browser oeffnen:
#   auf diesem Rechner:  http://localhost:3000
#   andere im WLAN:      http://<IP-dieses-Rechners>:3000
set -e
cd "\$(dirname "\$0")/programm/server"

$NODE_HINWEIS_SH

if [ ! -d node_modules ]; then
  echo "Erster Start: installiere Abhaengigkeiten (dauert kurz)..."
  npm install --omit=dev
fi

echo "──────────────────────────────────────────────"
echo " Hitster laeuft gleich auf  http://localhost:3000"
echo " Andere im WLAN nutzen die IP dieses Rechners."
echo " Beenden mit $abbruch"
echo "──────────────────────────────────────────────"
node index.js
SKRIPT
    chmod +x "$BAU/Server starten ($name).$endung"
done

cat > "$BAU/Server starten (Windows).bat" <<'SKRIPT'
@echo off
REM Startet den Hitster-Server samt Spiel. Danach im Browser oeffnen:
REM   auf diesem Rechner:  http://localhost:3000
REM   andere im WLAN:      http://<IP-dieses-Rechners>:3000
cd /d "%~dp0programm\server"

where node >nul 2>nul
if errorlevel 1 (
  echo FEHLER: Node.js ist nicht installiert.
  echo Bitte zuerst die LTS-Version von https://nodejs.org installieren,
  echo danach dieses Fenster schliessen und das Skript erneut starten.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Erster Start: installiere Abhaengigkeiten ^(dauert kurz^)...
  call npm install --omit=dev
)

echo --------------------------------------------------
echo  Hitster laeuft gleich auf  http://localhost:3000
echo  Andere im WLAN nutzen die IP dieses Rechners.
echo  Beenden mit Strg+C, Fenster schliessen zum Stoppen
echo --------------------------------------------------
node index.js
pause
SKRIPT

# ── LIESMICH ────────────────────────────────────────────────────────────────
cat > "$BAU/LIESMICH.txt" <<'TEXT'
HITSTER-SERVER (inoffizielles Fan-Projekt, nur auf Deutsch)
===========================================================

Dieses Paket startet einen eigenen Hitster-Server samt Spiel im Browser.
Kein Git, kein Bauen - nur Node.js wird gebraucht.

VORAUSSETZUNG
  Node.js, Version 20 oder neuer, von https://nodejs.org (LTS waehlen).
  Das Startskript sagt Bescheid, falls es fehlt.

STARTEN
  Windows:  Doppelklick auf "Server starten (Windows).bat"
  macOS:    Rechtsklick auf "Server starten (macOS).command" -> "Oeffnen"
            (nur beim ersten Mal noetig, unbekannter Entwickler)
  Linux:    "Server starten (Linux).sh" ausfuehren
            (falls noetig vorher:  chmod +x "Server starten (Linux).sh")

  Beim ersten Start werden einmalig Abhaengigkeiten installiert.
  Danach laeuft das Spiel auf  http://localhost:3000

MITSPIELEN (gleiches WLAN)
  Die anderen oeffnen im Browser die IP dieses Rechners mit Port 3000,
  zum Beispiel  http://192.168.178.42:3000
  Die eigene IP herausfinden:
    Windows:  ipconfig            ("IPv4-Adresse")
    macOS:    ipconfig getifaddr en0
    Linux:    hostname -I

  Der erste Account, der sich registriert, wird automatisch
  Server-Verwalter (Owner).

DATEN
  Konten, Profilbilder und Spielstaende landen im Ordner
  programm/server/. Beim Aktualisieren auf eine neue Paket-Version
  diesen Ordner also nicht einfach loeschen, sondern die Dateien
  users.json, server-owner.json, *.json und uploads/ mitnehmen.

OEFFENTLICH INS INTERNET?
  Dafuer braucht es HTTPS, eine Domain und eine Portfreigabe - so wie es
  hier laeuft, gehoert es NUR ins eigene WLAN. Die vollstaendige Anleitung:
  https://github.com/Melonemyname/Hitster-Releases
  (Ordner deploy/, Datei OEFFENTLICH-HOSTEN.md)

RECHTLICHES
  Privates Fan-Projekt ohne Verbindung zu Jumbo Diset oder Sit Down!.
  Enthaelt keine Musik und keine Spielkarten; zum Abspielen ist ein
  eigenes Spotify-Konto noetig. Der Code ist vibe-coded (vollstaendig
  mit einer KI entwickelt) und MIT-lizenziert.
TEXT

# ── ZIP bauen ───────────────────────────────────────────────────────────────
mkdir -p "$AUSGABE"
AUSGABE="$(cd "$AUSGABE" && pwd)"   # absolut, sonst bricht der cd fuers Zippen den Pfad
rm -f "$AUSGABE/$ZIP"
( cd "$(dirname "$BAU")" && zip -qr "$AUSGABE/$ZIP" "Hitster-Server" )

echo "Gebaut: $AUSGABE/$ZIP ($(du -h "$AUSGABE/$ZIP" | cut -f1 | tr -d ' '))"
