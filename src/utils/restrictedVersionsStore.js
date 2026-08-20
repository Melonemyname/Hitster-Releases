/**
 * Gerätelokaler Cache eingeschränkter (account-gebundener) Versionen, die der
 * Server dem aktuell eingeloggten Nutzer freigegeben hat (z. B. Hitster 1 & 2).
 *
 * Struktur wie Custom-Versionen, plus `restricted:true`:
 * { id, value, label, cover:{kind,ref}, restricted:true,
 *   tracks:[{trackId,title,artist,year,url}] }
 *
 * Wird beim Login vom Server befüllt und beim Logout geleert – so erscheinen
 * diese Versionen nur für berechtigte Accounts und verschwinden wieder.
 */

const KEY = "hitster-restricted-versions-v1";

export function readRestrictedVersions() {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeRestrictedVersions(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list || []));
  } catch {
    /* Speicher nicht verfügbar – ignorieren */
  }
}

export function clearRestrictedVersions() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignorieren */
  }
}

export function getRestrictedVersion(value) {
  return readRestrictedVersions().find((v) => v.value === value) || null;
}

// Alle Track-Metadaten über alle freigegebenen Versionen (für den Metadaten-Index).
export function getAllRestrictedTracks() {
  const out = [];
  for (const v of readRestrictedVersions()) {
    for (const t of v.tracks || []) out.push(t);
  }
  return out;
}

// Song-Links (Spotify-URLs) einer freigegebenen Version.
export function getRestrictedVersionLinks(value) {
  const v = getRestrictedVersion(value);
  if (!v) return [];
  return (v.tracks || []).map((t) => t.url).filter(Boolean);
}
