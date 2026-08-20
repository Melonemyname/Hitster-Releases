@echo off
REM Startet das Hitster-BACKEND (API + Multiplayer/Socket) auf Port 3000.
REM Noetig fuer Login, Raeume und Konto-Abgleich. Doppelklick zum Starten.
cd /d "%~dp0server"

where node >nul 2>nul
if errorlevel 1 (
  echo FEHLER: Node.js ist nicht installiert.
  echo Bitte zuerst die LTS-Version von https://nodejs.org installieren,
  echo danach dieses Fenster schliessen und das Skript erneut starten.
  pause
  exit /b 1
)


if not exist node_modules (
  echo Installiere Backend-Abhaengigkeiten ^(einmalig^)...
  call npm install
)

echo --------------------------------------------------
echo  Hitster-Backend startet auf Port 3000
echo  Beenden mit Strg+C, Fenster schliessen zum Stoppen
echo --------------------------------------------------
node index.js
pause
