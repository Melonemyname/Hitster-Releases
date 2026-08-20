#!/usr/bin/env bash
# Startet das Hitster-BACKEND (API + Multiplayer/Socket) auf Port 3000.
# Nötig für Login, Räume und Konto-Abgleich. Doppelklick zum Starten.
set -e
cd "$(dirname "$0")/server"

if ! command -v node >/dev/null 2>&1; then
  echo "FEHLER: Node.js ist nicht installiert."
  echo "Bitte zuerst die LTS-Version von https://nodejs.org installieren,"
  echo "danach dieses Fenster schliessen und das Skript erneut starten."
  read -r -p "Mit Enter beenden..."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Installiere Backend-Abhängigkeiten (einmalig)..."
  npm install
fi

echo "──────────────────────────────────────────────"
echo " Hitster-Backend startet auf Port 3000"
echo " Beenden mit Strg+C"
echo "──────────────────────────────────────────────"
node index.js
