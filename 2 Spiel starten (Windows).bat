@echo off
REM Startet den Hitster-FRONTEND-Dev-Server (Web-Oberflaeche) auf Port 9000.
REM Andere spielen dann ueber  http://<deine-adresse>:9000  mit.
REM Das Server-Skript (1) muss parallel laufen. Doppelklick zum Starten.
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo FEHLER: Node.js ist nicht installiert.
  echo Bitte zuerst die LTS-Version von https://nodejs.org installieren,
  echo danach dieses Fenster schliessen und das Skript erneut starten.
  pause
  exit /b 1
)


if not exist node_modules (
  echo Installiere Frontend-Abhaengigkeiten ^(einmalig, kann etwas dauern^)...
  call npm install
)

echo --------------------------------------------------
echo  Hitster-Frontend startet auf Port 9000
echo  Web-Adresse: http://localhost:9000
echo  Beenden mit Strg+C, Fenster schliessen zum Stoppen
echo --------------------------------------------------
REM Der npm-Dev-Skript nutzt Unix-Syntax fuer die Env-Variable; daher hier direkt:
set NODE_NO_WARNINGS=1
call npx quasar dev
pause
