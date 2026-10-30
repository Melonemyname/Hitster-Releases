// Account-gebundener Speicher für eigene (importierte) Song-Versionen.
//
// Das Parsen der Exportify-CSV passiert clientseitig (Upload im Browser). Hier
// werden nur die account-synchronisierten Versionen pro Nutzer abgelegt
// (server/user-versions.json). Gerätespezifische Versionen speichert der Client
// selbst (localStorage).

const fs = require('fs')
const { dataPath } = require('./dataDir')
const { sanitizeCover, sanitizeTrack, isPoolId, isSafeKey, text } = require('./validate')

const STORE_FILE = dataPath('user-versions.json')

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
  // Atomar: erst in eine temporäre Datei schreiben, dann umbenennen. So kann
  // ein Absturz mitten im Schreiben die bestehende Datei nicht zerstören.
  const tmp = `${STORE_FILE}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2))
  fs.renameSync(tmp, STORE_FILE)
}

// Verschiebt die synchronisierten Versionen eines Nutzers auf einen neuen
// Namen (bei Username-Änderung), damit sie nicht verwaisen.
function renameUser (oldName, newName) {
  if (!oldName || !newName || oldName === newName) return
  const store = readStore()
  if (!Object.prototype.hasOwnProperty.call(store, oldName)) return
  store[newName] = store[oldName]
  delete store[oldName]
  writeStore(store)
}

// Entfernt den kompletten Versions-Eintrag eines Nutzers (bei Löschung).
function deleteUser (username) {
  const store = readStore()
  if (!Object.prototype.hasOwnProperty.call(store, username)) return
  delete store[username]
  writeStore(store)
}

// Einmalige Migration: Store-Keys von username auf die stabile Nutzer-id
// umstellen. `usernameToId` = { username: id }. Idempotent: migriert einen
// username-Key nur, wenn der id-Key noch nicht existiert.
function migrateKeys (usernameToId) {
  if (!usernameToId || typeof usernameToId !== 'object') return
  const store = readStore()
  let changed = false
  for (const [name, id] of Object.entries(usernameToId)) {
    if (!id || name === id) continue
    const hasName = Object.prototype.hasOwnProperty.call(store, name)
    const hasId = Object.prototype.hasOwnProperty.call(store, id)
    if (hasName && !hasId) {
      store[id] = store[name]
      delete store[name]
      changed = true
    }
  }
  if (changed) writeStore(store)
}

function getUserVersions (username) {
  const store = readStore()
  return Array.isArray(store[username]) ? store[username] : []
}

// ── Grenzen pro Nutzer ─────────────────────────────────────────────────────
// Bei offener Registrierung darf ein einzelner Account den gemeinsamen
// Speicher nicht beliebig füllen. Eine Karte wiegt rund 190 Byte, ein Account
// am Limit liegt also bei etwa 4 MB.
const MAX_VERSIONS_PER_USER = 50
const MAX_TRACKS_PER_VERSION = 3000
const MAX_TRACKS_PER_USER = 20000
const LABEL_MAX = 100
const VERSION_ID = /^[A-Za-z0-9_-]{1,100}$/
// Weitere Felder der Version (createdAt, custom, …) bleiben erhalten, solange
// es einfache Werte sind.
const EXTRA_KEY = /^[A-Za-z][A-Za-z0-9_]{0,40}$/
const EXTRA_MAX = 30

// Version auf das zulässige Format bringen. Wirft bei Verstößen gegen die
// Grenzen einen Fehler mit lesbarer Meldung (landet als 400 beim Client).
function sanitizeVersion (version) {
  if (!version || typeof version !== 'object') throw new Error('Version fehlt')
  const id = String(version.id || '')
  if (!VERSION_ID.test(id)) throw new Error('Ungültige Versions-Kennung')
  if (version.tracks !== undefined && !Array.isArray(version.tracks)) {
    throw new Error('Songliste ungültig')
  }
  const tracks = (version.tracks || []).map(sanitizeTrack).filter(Boolean)
  if (tracks.length > MAX_TRACKS_PER_VERSION) {
    throw new Error(`Eine Version darf höchstens ${MAX_TRACKS_PER_VERSION} Songs enthalten`)
  }
  const out = {}
  let extra = 0
  for (const [key, value] of Object.entries(version)) {
    if (['id', 'value', 'label', 'cover', 'tracks', 'synced'].includes(key)) continue
    if (extra >= EXTRA_MAX || !EXTRA_KEY.test(key) || !isSafeKey(key)) continue
    if (typeof value === 'string') out[key] = value.slice(0, 200)
    else if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) out[key] = value
    else continue
    extra += 1
  }
  out.id = id
  out.value = isPoolId(version.value) ? version.value : `custom-${id}`
  out.label = text(version.label, LABEL_MAX).trim() || 'Version'
  out.cover = sanitizeCover(version.cover)
  out.tracks = tracks
  return out
}

// Version anlegen/aktualisieren (Upsert per id).
function upsertUserVersion (username, version) {
  if (!version || !version.id) throw new Error('Version ohne id')
  const clean = sanitizeVersion(version)
  const store = readStore()
  const list = Array.isArray(store[username]) ? store[username] : []
  const vorher = list.find((v) => v.id === clean.id)
  const next = list.filter((v) => v.id !== clean.id)
  // Ein Konto, das schon über einer Grenze liegt (Bestand von vor ihrer
  // Einführung), darf seine Versionen weiter bearbeiten, nur nicht wachsen.
  if (!vorher && next.length >= MAX_VERSIONS_PER_USER) {
    throw new Error(`Höchstens ${MAX_VERSIONS_PER_USER} synchronisierte Versionen pro Konto`)
  }
  const anzahl = (v) => (Array.isArray(v?.tracks) ? v.tracks.length : 0)
  const tracksGesamt = next.reduce((n, v) => n + anzahl(v), 0)
  if (tracksGesamt + clean.tracks.length > MAX_TRACKS_PER_USER && clean.tracks.length > anzahl(vorher)) {
    throw new Error(`Höchstens ${MAX_TRACKS_PER_USER} Songs in synchronisierten Versionen pro Konto`)
  }
  next.push({ ...clean, synced: true })
  store[username] = next
  writeStore(store)
  return next
}

function deleteUserVersion (username, id) {
  const store = readStore()
  const list = Array.isArray(store[username]) ? store[username] : []
  store[username] = list.filter((v) => v.id !== id)
  writeStore(store)
  return store[username]
}

module.exports = {
  getUserVersions,
  upsertUserVersion,
  deleteUserVersion,
  renameUser,
  deleteUser,
  migrateKeys
}
