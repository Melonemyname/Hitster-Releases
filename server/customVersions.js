// Account-gebundener Speicher für eigene (importierte) Song-Versionen.
//
// Das Parsen der Exportify-CSV passiert clientseitig (Upload im Browser). Hier
// werden nur die account-synchronisierten Versionen pro Nutzer abgelegt
// (server/user-versions.json). Gerätespezifische Versionen speichert der Client
// selbst (localStorage).

const fs = require('fs')
const { dataPath } = require('./dataDir')

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

// Version anlegen/aktualisieren (Upsert per id).
function upsertUserVersion (username, version) {
  if (!version || !version.id) throw new Error('Version ohne id')
  const store = readStore()
  const list = Array.isArray(store[username]) ? store[username] : []
  const next = list.filter((v) => v.id !== version.id)
  next.push({ ...version, synced: true })
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
