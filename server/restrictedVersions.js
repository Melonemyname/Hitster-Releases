// Eingeschränkte, account-gebundene Versionen (z. B. Hitster 1 & 2).
//
// Datenmodell wie bei Custom-Versionen (eingebettete Track-Liste + Cover), aber
// admin-verwaltet und pro Account freigegeben. Der Server hostet die Daten und
// liefert einem Nutzer nur die für ihn freigegebenen Versionen. So sind diese
// Versionen NICHT im App-Bundle und erscheinen nur für berechtigte Accounts.
//
// Speicher liegt im DATA_DIR (restricted-versions.json). Beim ersten Start wird
// er aus dem mitgelieferten Seed (server/restricted-versions.seed.json) befüllt,
// analog zu users.json.

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { dataPath } = require('./dataDir')

const STORE_FILE = dataPath('restricted-versions.json')
const SEED_FILE = path.join(__dirname, 'restricted-versions.seed.json')

function readStore () {
  try {
    if (!fs.existsSync(STORE_FILE)) return []
    const parsed = JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8'))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeStore (list) {
  const tmp = `${STORE_FILE}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(list, null, 2))
  fs.renameSync(tmp, STORE_FILE)
}

// Beim ersten Start aus dem Seed befüllen (idempotent: nur wenn Store fehlt).
function seedIfMissing () {
  try {
    if (fs.existsSync(STORE_FILE)) return
    if (!fs.existsSync(SEED_FILE)) return
    const seed = JSON.parse(fs.readFileSync(SEED_FILE, 'utf-8'))
    if (Array.isArray(seed)) {
      writeStore(seed)
      console.log('[restricted] Store aus Seed angelegt:', seed.map(v => v.value).join(', '))
    }
  } catch (err) {
    console.warn('[restricted] Seeding fehlgeschlagen:', err?.message || err)
  }
}
seedIfMissing()

// Backfill: fehlende `ensemble`-Angaben (Band/Solo) an den gespeicherten
// Restricted-Tracks aus dem Seed nachtragen (per trackId). So bekommen bereits
// geseedete Stores (z. B. der laufende Server) die später im Seed ergänzten
// Band/Solo-Daten, ohne den Store neu anzulegen. Es werden NUR leere
// ensemble-Felder gefüllt – Editor-Änderungen bleiben unangetastet. Idempotent.
function backfillEnsembleFromSeed () {
  try {
    if (!fs.existsSync(SEED_FILE)) return
    const seed = JSON.parse(fs.readFileSync(SEED_FILE, 'utf-8'))
    if (!Array.isArray(seed)) return
    const seedEnsembleById = {}
    for (const v of seed) {
      for (const t of v.tracks || []) {
        if (t && t.trackId && String(t.ensemble || '').trim()) {
          seedEnsembleById[t.trackId] = t.ensemble
        }
      }
    }
    if (Object.keys(seedEnsembleById).length === 0) return
    const store = readStore()
    let changed = false
    for (const v of store) {
      for (const t of v.tracks || []) {
        if (
          t &&
          t.trackId &&
          !String(t.ensemble || '').trim() &&
          seedEnsembleById[t.trackId]
        ) {
          t.ensemble = seedEnsembleById[t.trackId]
          changed = true
        }
      }
    }
    if (changed) {
      writeStore(store)
      console.log('[restricted] ensemble (Band/Solo) aus Seed nachgetragen')
    }
  } catch (err) {
    console.warn('[restricted] ensemble-Backfill fehlgeschlagen:', err?.message || err)
  }
}
backfillEnsembleFromSeed()

// Eine gespeicherte Version anhand ihrer id.
function getById (id) {
  return readStore().find(v => v.id === id) || null
}

// Darf ein Nutzer diese Version verwalten (bearbeiten, Freigaben ändern,
// löschen)? Erlaubt für den Admin sowie den Ersteller (creatorId). Seeds ohne
// creatorId (Hitster 1 & 2) sind nur für den Admin verwaltbar.
function canManage (version, userId, isAdmin) {
  if (!version || !userId) return false
  if (isAdmin) return true
  return !!version.creatorId && version.creatorId === userId
}

// Admin-Sicht: alle Versionen inkl. Freigaben. Ohne die (grosse) Track-Liste,
// damit die Admin-Liste schlank bleibt; trackCount als Ersatz.
function listAllForAdmin () {
  return readStore().map(v => ({
    id: v.id,
    value: v.value,
    label: v.label,
    cover: v.cover || null,
    film: !!v.film,
    creatorId: v.creatorId || null,
    trackCount: Array.isArray(v.tracks) ? v.tracks.length : 0,
    allowedUserIds: Array.isArray(v.allowedUserIds) ? v.allowedUserIds : []
  }))
}

// Client-Sicht: nur die für diesen Nutzer freigegebenen Versionen, MIT Tracks
// (zum Spielen). Die Freigabeliste (allowedUserIds) wird nur mitgeliefert, wenn
// der Nutzer die Version verwalten darf (Ersteller oder Admin) – dann kann die
// App den Editor/die Freigabe-Oberfläche anbieten.
function listForUser (userId, isAdmin = false) {
  if (!userId) return []
  return readStore()
    .filter(v => Array.isArray(v.allowedUserIds) && v.allowedUserIds.includes(userId))
    .map(v => {
      const manage = canManage(v, userId, isAdmin)
      return {
        id: v.id,
        value: v.value,
        label: v.label,
        cover: v.cover || { kind: 'preset', ref: 'custom' },
        restricted: true,
        film: !!v.film,
        tracks: Array.isArray(v.tracks) ? v.tracks : [],
        canManage: manage,
        // Nur für Verwalter: Freigabeliste (für die Account-Auswahl im Client).
        allowedUserIds: manage
          ? (Array.isArray(v.allowedUserIds) ? v.allowedUserIds : [])
          : undefined
      }
    })
}

// Version anlegen/aktualisieren (Upsert per id). Freigaben, Ersteller und das
// Film-Flag bleiben erhalten, wenn nicht mitgegeben.
function upsert (version) {
  if (!version || !version.id) throw new Error('Version ohne id')
  const list = readStore()
  const existing = list.find(v => v.id === version.id)
  const next = {
    id: version.id,
    value: version.value || existing?.value || version.id,
    label: version.label || 'Version',
    cover: version.cover || { kind: 'preset', ref: 'custom' },
    restricted: true,
    film: version.film !== undefined ? !!version.film : !!existing?.film,
    creatorId: version.creatorId !== undefined
      ? (version.creatorId || null)
      : (existing?.creatorId || null),
    tracks: Array.isArray(version.tracks) ? version.tracks : (existing?.tracks || []),
    allowedUserIds: Array.isArray(version.allowedUserIds)
      ? version.allowedUserIds
      : (existing?.allowedUserIds || [])
  }
  const filtered = list.filter(v => v.id !== version.id)
  filtered.push(next)
  writeStore(filtered)
  return next
}

// Eine neue (vom Nutzer geteilte) Version anlegen. Setzt den Ersteller und nimmt
// ihn automatisch mit in die Freigabeliste auf (Ersteller hat seine Version
// selbst). Erzeugt bei Bedarf eine eindeutige id.
function create (version, creatorId) {
  const id = version && version.id ? version.id : `shared-${crypto.randomUUID()}`
  const allowed = Array.isArray(version?.allowedUserIds) ? version.allowedUserIds : []
  const withCreator = creatorId ? [...new Set([...allowed, creatorId])] : allowed
  return upsert({
    ...version,
    id,
    creatorId: creatorId || null,
    allowedUserIds: withCreator
  })
}

function remove (id) {
  const list = readStore()
  const next = list.filter(v => v.id !== id)
  if (next.length === list.length) return false
  writeStore(next)
  return true
}

// Freigegebene Accounts einer Version setzen (Liste stabiler Nutzer-ids). Der
// Ersteller bleibt immer freigegeben, damit er seine eigene Version behält und
// weiter verwalten kann.
function setAllowedUsers (id, userIds) {
  const list = readStore()
  const v = list.find(x => x.id === id)
  if (!v) return { ok: false, error: 'not_found' }
  const ids = Array.isArray(userIds) ? userIds.filter(Boolean) : []
  if (v.creatorId) ids.push(v.creatorId)
  v.allowedUserIds = [...new Set(ids)]
  writeStore(list)
  return { ok: true, id, allowedUserIds: v.allowedUserIds }
}

// Bei Nutzerlöschung dessen Freigaben mitentfernen (sonst verwaiste ids).
function removeUserAccess (userId) {
  const list = readStore()
  let changed = false
  for (const v of list) {
    if (Array.isArray(v.allowedUserIds) && v.allowedUserIds.includes(userId)) {
      v.allowedUserIds = v.allowedUserIds.filter(x => x !== userId)
      changed = true
    }
  }
  if (changed) writeStore(list)
}

module.exports = {
  listAllForAdmin,
  listForUser,
  getById,
  canManage,
  upsert,
  create,
  remove,
  setAllowedUsers,
  removeUserAccess
}
