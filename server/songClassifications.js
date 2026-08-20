// Persistente „Solo vs. Gruppe"-Klassifikation pro Song-Link.
// Wird für den Bingo-Modus (Kategorie „Solo oder Gruppe?") vom Host manuell
// vergeben und dauerhaft in server/song-classifications.json abgelegt. Beim
// nächsten Auftreten desselben Tracks entfällt die Nachfrage.
//
// Analog zu server/users.json wird die Datei absichtlich mit ins Repo
// commited, damit ein zweiter Server-Rechner die gleiche Klassifikation
// hat. Beim späteren Umzug auf einen dauerhaft laufenden Homeserver kann
// sie – wie users.json – aus dem Repo entfernt werden.

const fs = require('fs')
const { dataPath } = require('./dataDir')

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

function getClassification (link) {
  const key = normalizeLink(link)
  if (!key) return null
  const store = ensureCache()
  const val = store[key]
  return val === 'solo' || val === 'group' ? val : null
}

function setClassification (link, classification) {
  const key = normalizeLink(link)
  if (!key) return null
  if (classification !== 'solo' && classification !== 'group') return null
  const store = ensureCache()
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
