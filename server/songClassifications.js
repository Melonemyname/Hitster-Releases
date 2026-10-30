// Persistente „Solo vs. Gruppe"-Klassifikation pro Song-Link.
// Wird für den Bingo-Modus (Kategorie „Solo oder Gruppe?") vom Host manuell
// vergeben und dauerhaft in server/song-classifications.json abgelegt. Beim
// nächsten Auftreten desselben Tracks entfällt die Nachfrage.
//
// Die Datei liegt wie alle Laufzeitdaten im DATA_DIR (siehe dataDir.js).

const fs = require('fs')
const { dataPath } = require('./dataDir')
const { spotifyTrackId } = require('./validate')

const STORE_FILE = dataPath('song-classifications.json')

// Kanonisiert Spotify-Links (entfernt Query-String, Intl-Prefix) damit
// derselbe Track unter verschiedenen URL-Varianten gleich behandelt wird.
function normalizeLink (link) {
  if (!link || typeof link !== 'string') return ''
  try {
    const base = link.split('?')[0].split('#')[0].trim()
    return base.replace(/\/intl-[a-z]{2,5}\//i, '/')
  } catch {
    return link
  }
}

function readStore () {
  try {
    if (!fs.existsSync(STORE_FILE)) return {}
    const parsed = JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8'))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeStore (store) {
  try {
    fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2))
  } catch (err) {
    console.error('[songClassifications] Schreibfehler:', err)
  }
}

let cache = null
function ensureCache () {
  if (cache === null) cache = readStore()
  return cache
}

// Schlüssel im Speicher: immer die kanonische Form
// https://open.spotify.com/track/<id>. Nur gültige Spotify-Track-Links (siehe
// validate.js) ergeben einen Schlüssel, alles andere wird ignoriert. Sonst
// könnte ein Host beliebige Texte als Schlüssel ablegen und die Datei aufblähen.
function storeKey (link) {
  const id = spotifyTrackId(link)
  return id ? `https://open.spotify.com/track/${id}` : ''
}

// Obergrenze für die Anzahl gespeicherter Einordnungen. Weit mehr als alle
// mitgelieferten und üblichen eigenen Versionen zusammen.
const MAX_EINTRAEGE = 50000

function getClassification (link) {
  const key = storeKey(link)
  if (!key) return null
  const store = ensureCache()
  // Ältere Einträge stehen unter der früheren Normalisierung, die für
  // Web-Links dieselbe Form ergibt; für URIs wird zusätzlich dort gesucht.
  const val = Object.prototype.hasOwnProperty.call(store, key)
    ? store[key]
    : store[normalizeLink(link)]
  return val === 'solo' || val === 'group' ? val : null
}

function setClassification (link, classification) {
  const key = storeKey(link)
  if (!key) return null
  if (classification !== 'solo' && classification !== 'group') return null
  const store = ensureCache()
  const neu = !Object.prototype.hasOwnProperty.call(store, key)
  if (neu && Object.keys(store).length >= MAX_EINTRAEGE) {
    console.warn('[songClassifications] Speicher voll, Einordnung nicht gespeichert')
    return null
  }
  store[key] = classification
  writeStore(store)
  return classification
}

function getAllClassifications () {
  return { ...ensureCache() }
}

module.exports = {
  getClassification,
  setClassification,
  getAllClassifications,
  normalizeLink,
}
