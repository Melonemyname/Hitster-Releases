/**
 * Gerätelokaler Cache eigener (importierter) Versionen.
 *
 * Enthält BEIDE Arten:
 *  - gerätespezifische Versionen (synced:false) – existieren nur hier
 *  - einen Spiegel der account-synchronisierten Versionen (synced:true) – damit
 *    das Spiel Songs/Metadaten immer synchron aus localStorage lesen kann
 *
 * Eine Version:
 * { id, value:'custom-<id>', label, cover:{kind:'preset'|'upload', ref},
 *   custom:true, synced:boolean, tracks:[{trackId,title,artist,year,url}],
 *   createdAt, updatedAt }
 *
 * Nur lokal (gehen nie an den Server, siehe useVersions):
 *   pendingPush   Änderung noch nicht hochgeladen
 *   pendingCreate noch nie auf dem Server angekommen (offline angelegt)
 *   ownerId       Konto, dem eine synchronisierte Version gehört
 */

const KEY = "hitster-custom-versions-v1";

export function readCustomVersions() {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeCustomVersions(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list || []));
  } catch {
    /* Speicher nicht verfügbar / voll – ignorieren */
  }
}

// Alle account-synchronisierten Versionen vom Gerät entfernen (beim Abmelden
// oder Kontowechsel). Gerätespezifische Versionen (synced:false) bleiben.
export function removeSyncedCustomVersions() {
  const list = readCustomVersions();
  const rest = list.filter((v) => !v.synced);
  if (rest.length !== list.length) writeCustomVersions(rest);
}

export function getCustomVersion(value) {
  return readCustomVersions().find((v) => v.value === value) || null;
}

// Alle Track-Metadaten über alle eigenen Versionen (für den Metadaten-Index).
export function getAllCustomTracks() {
  const out = [];
  for (const v of readCustomVersions()) {
    for (const t of v.tracks || []) out.push(t);
  }
  return out;
}

// Song-Links (Spotify-URLs) einer eigenen Version.
export function getCustomVersionLinks(value) {
  const v = getCustomVersion(value);
  if (!v) return [];
  return (v.tracks || []).map((t) => t.url).filter(Boolean);
}
