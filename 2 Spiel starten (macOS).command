#!/usr/bin/env bash
# Startet den Hitster-FRONTEND-Dev-Server (Web-Oberfläche) auf Port 9000.
# Andere spielen dann über  http://<deine-adresse>:9000  mit.
# Das Server-Skript (1) muss parallel laufen. Doppelklick zum Starten.
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "FEHLER: Node.js ist nicht installiert."
  echo "Bitte zuerst die LTS-Version von https://nodejs.org installieren,"
  echo "danach dieses Fenster schliessen und das Skript erneut starten."
  read -r -p "Mit Enter beenden..."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Installiere Frontend-Abhängigkeiten (einmalig, kann etwas dauern)..."
  npm install
fi

echo "──────────────────────────────────────────────"
echo " Hitster-Frontend startet auf Port 9000"
echo " Web-Adresse: http://localhost:9000"
echo " Beenden mit Control-C"
echo "──────────────────────────────────────────────"
npm run dev
