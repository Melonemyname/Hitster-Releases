#!/usr/bin/env bash
# Taegliches Update des Hitster-Servers: git pull (nur Fast-Forward) und, falls
# sich etwas geaendert hat, Abhaengigkeiten nachziehen, das Frontend neu bauen
# und das Backend neu starten. Manuell ausfuehrbar (`bash deploy/hitster-update.sh`)
# oder per systemd-Timer (hitster-update.timer).
#
# Voraussetzung: die Laufzeitdaten liegen ausserhalb des Repos (DATA_DIR in der
# server/.env). Dann bleibt der Arbeitsbaum sauber und der Pull ist konfliktfrei.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

log() { echo "[hitster-update] $*"; }

# 1. Arbeitsbaum muss sauber sein. Der Server schreibt in DATA_DIR, nie ins Repo –
#    ist hier trotzdem etwas veraendert, brechen wir ab, statt automatisch zu
#    mergen (kein Datenverlust, keine ueberraschenden Merges).
if [ -n "$(git status --porcelain)" ]; then
  log "Arbeitsbaum nicht sauber - Abbruch (kein automatisches Merge)."
  git status --short
  exit 1
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
BEFORE="$(git rev-parse HEAD)"

log "Hole Aenderungen (Branch: $BRANCH) ..."
git fetch --prune origin
if ! git pull --ff-only; then
  log "Fast-Forward nicht moeglich (Historie divergiert) - Abbruch."
  exit 1
fi

AFTER="$(git rev-parse HEAD)"
FIRST_RUN=false
[ -d server/node_modules ] || FIRST_RUN=true
[ -d dist/spa ] || FIRST_RUN=true

if [ "$BEFORE" = "$AFTER" ] && [ "$FIRST_RUN" = false ]; then
  log "Keine Aenderungen. Fertig."
  exit 0
fi
[ "$BEFORE" = "$AFTER" ] || log "Aktualisiert: $BEFORE -> $AFTER"

CHANGED="$(git diff --name-only "$BEFORE" "$AFTER" || true)"

# 2. Backend-Abhaengigkeiten (nur Prod) bei Bedarf.
if [ "$FIRST_RUN" = true ] || echo "$CHANGED" | grep -qE '^server/package(-lock)?\.json$'; then
  log "Installiere Backend-Abhaengigkeiten ..."
  if [ -f server/package-lock.json ]; then ( cd server && npm ci --omit=dev )
  else ( cd server && npm install --omit=dev ); fi
fi

# 3. Frontend neu bauen, wenn frontend-relevante Dateien geaendert wurden (oder
#    dist/spa noch fehlt). Dafuer werden die Root-Abhaengigkeiten inkl.
#    devDependencies (quasar/vite) gebraucht.
FRONTEND_CHANGED=false
if echo "$CHANGED" | grep -qE '^(src/|public/|index\.html|quasar\.config\.js|package(-lock)?\.json)'; then
  FRONTEND_CHANGED=true
fi
if [ "$FIRST_RUN" = true ] || [ "$FRONTEND_CHANGED" = true ]; then
  if [ "$FIRST_RUN" = true ] || [ ! -d node_modules ] || echo "$CHANGED" | grep -qE '^package(-lock)?\.json$'; then
    log "Installiere Root-Abhaengigkeiten (fuer den Build) ..."
    if [ -f package-lock.json ]; then npm ci; else npm install; fi
  fi
  log "Baue Frontend (quasar build) ..."
  npm run build
fi

# 4. Backend neu starten, wenn Backend-Code betroffen war (oder erster Lauf). Das
#    neue Frontend (statisch aus dist/spa) ist ohne Neustart sofort aktiv.
if [ "$FIRST_RUN" = true ] || echo "$CHANGED" | grep -qE '^server/'; then
  if command -v systemctl >/dev/null 2>&1; then
    log "Starte hitster-backend neu ..."
    systemctl --user restart hitster-backend
  else
    log "systemctl nicht gefunden - bitte das Backend manuell neu starten."
  fi
else
  log "Kein Backend-Code geaendert - Neustart uebersprungen."
fi

log "Fertig."
