// Zentraler Ablageort für Laufzeitdaten (users.json, uploads/, Klassifikationen,
// synchronisierte Versionen, dev-.jwt-secret).
//
// Standard: alles liegt neben dem Server-Code (server/). Das reicht zum
// Ausprobieren auf dem eigenen Rechner.
//
// Auf einem dauerhaft laufenden Server setzt man stattdessen `DATA_DIR` auf
// einen Ordner AUSSERHALB des Repos. Dann schreibt der Server seine
// Laufzeitdaten dorthin, ein täglicher `git pull` berührt nur Code und kann die
// Daten weder überschreiben noch Merge-Konflikte auslösen. Siehe
// deploy/OEFFENTLICH-HOSTEN.md.

const path = require('path')
const fs = require('fs')

// Ohne gesetztes `DATA_DIR` = das server/-Verzeichnis (bisheriges Verhalten).
const DATA_DIR = (process.env.DATA_DIR || '').trim() || __dirname

// Zielordner einmalig sicherstellen, damit die Schreibzugriffe der Module nicht
// an einem fehlenden externen Verzeichnis scheitern.
try {
  fs.mkdirSync(DATA_DIR, { recursive: true })
} catch (err) {
  console.warn('[dataDir] Konnte DATA_DIR nicht anlegen:', err?.message || err)
}

// Baut einen Pfad innerhalb von DATA_DIR (analog zu path.join(__dirname, ...)).
function dataPath (...segments) {
  return path.join(DATA_DIR, ...segments)
}

module.exports = { DATA_DIR, dataPath }
