const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const crypto = require('crypto')
const fs = require('fs')
const customVersions = require('./customVersions')
const { dataPath } = require('./dataDir')

const USERS_FILE = dataPath('users.json')
const JWT_SECRET_FILE = dataPath('.jwt-secret')

// ── JWT-Signier-Secret ─────────────────────────────────────────────────────
// Öffentlicher Betrieb MUSS `JWT_SECRET` als ENV setzen (mind. 32 Zeichen).
// Ohne Secret liesse sich mit Kenntnis eines vorgegebenen Fallbacks jedes
// Token faelschen -> hart abbrechen statt still unsicher weiterlaufen.
//
// Fuer lokale Entwicklung wird beim ersten Start automatisch ein zufaelliges
// Secret erzeugt und in `.jwt-secret` (gitignored) persistiert, damit
// ausgestellte Tokens einen Server-Neustart ueberleben und niemand die App
// nur wegen fehlender ENV nicht ausprobieren kann.
function resolveJwtSecret () {
  const fromEnv = (process.env.JWT_SECRET || '').trim()
  if (fromEnv) {
    if (fromEnv.length < 32) {
      console.warn('[auth] JWT_SECRET ist kuerzer als 32 Zeichen – bitte laengeres Secret verwenden.')
    }
    return fromEnv
  }
  if (process.env.NODE_ENV === 'production') {
    console.error('[auth] JWT_SECRET fehlt. In Produktion ist ein starkes Secret Pflicht.')
    console.error('       Beispiel: JWT_SECRET=$(openssl rand -hex 32) npm start')
    process.exit(1)
  }
  try {
    if (fs.existsSync(JWT_SECRET_FILE)) {
      const s = fs.readFileSync(JWT_SECRET_FILE, 'utf8').trim()
      if (s) return s
    }
    const generated = crypto.randomBytes(48).toString('hex')
    fs.writeFileSync(JWT_SECRET_FILE, generated, { mode: 0o600 })
    console.log('[auth] Kein JWT_SECRET gesetzt – dev-Secret erzeugt in .jwt-secret')
    return generated
  } catch (err) {
    // Als Notnagel im Dev-Modus: einmaliges In-Memory-Secret. Tokens werden
    // beim naechsten Neustart ungueltig – bewusst, damit Ausfall sichtbar ist.
    console.warn('[auth] Konnte .jwt-secret nicht schreiben:', err?.message || err)
    return crypto.randomBytes(48).toString('hex')
  }
}

const JWT_SECRET = resolveJwtSecret()
// 24 Stunden waren zu kurz: Wer die App ein Wochenende nicht oeffnet, stand
// beim naechsten Spieleabend vor der Anmeldung. Die Laufzeit ist jetzt lang,
// und /api/verify stellt zusaetzlich rechtzeitig ein frisches Token aus (siehe
// tokenBaldFaellig), solange die App regelmaessig benutzt wird.
const JWT_EXPIRES_IN = '30d'
// Ab wann beim Sitzungscheck ein neues Token ausgegeben wird: wenn weniger als
// ein Drittel der Laufzeit uebrig ist.
const JWT_ERNEUERN_AB_SEK = 20 * 24 * 60 * 60

// ── users.json bootstrappen ────────────────────────────────────────────────
// Aktuell (Vor-Public-Release) wird die Datei bewusst mit ins Repo gepusht,
// damit dieselben Nutzer auf jedem Geraet verfuegbar sind, auf dem der Server
// gestartet wird (Mac/Linux/Windows) – der Server ist ein Privatrechner, der
// nicht dauerhaft laeuft. Ist die Datei beim ersten Start trotzdem nicht da
// (frischer Klon vor dem ersten Commit oder ausgetauschter Datenordner), wird
// eine leere Nutzerliste angelegt, damit der Server hochfahren kann.
// Sobald das Projekt oeffentlich wird, wandert die Datei aus dem Repo (siehe
// BACKLOG.md, Abschnitt "Server / Hosting").
function ensureUsersFile () {
  if (fs.existsSync(USERS_FILE)) return
  try {
    fs.writeFileSync(USERS_FILE, '[]\n', { mode: 0o600 })
    console.log('[auth] users.json angelegt (leer). Registrierung ueber die App moeglich.')
  } catch (err) {
    console.warn('[auth] Konnte users.json nicht anlegen:', err?.message || err)
  }
}
ensureUsersFile()

// Kleiner mtime-basierter Cache: vermeidet den Datei-Read bei jedem Aufruf
// (z. B. `getAvatarMap` pro Room-Broadcast). Es werden immer frisch geparste
// Objekte zurückgegeben, damit Aufrufer die Liste gefahrlos mutieren können.
let _usersCache = { mtimeMs: -1, raw: null }

function loadUsers () {
  try {
    const st = fs.statSync(USERS_FILE)
    if (_usersCache.raw !== null && st.mtimeMs === _usersCache.mtimeMs) {
      return JSON.parse(_usersCache.raw)
    }
    const raw = fs.readFileSync(USERS_FILE, 'utf8')
    _usersCache = { mtimeMs: st.mtimeMs, raw }
    return JSON.parse(raw)
  } catch {
    return []
  }
}

// Atomar schreiben (temp + rename), damit ein Absturz mitten im Schreiben die
// bestehende Datei nicht zerstört. Restriktive Rechte (0600) beibehalten.
function saveUsers (users) {
  const raw = JSON.stringify(users, null, 2)
  const tmp = `${USERS_FILE}.tmp`
  fs.writeFileSync(tmp, raw, { encoding: 'utf8', mode: 0o600 })
  fs.renameSync(tmp, USERS_FILE)
  try {
    _usersCache = { mtimeMs: fs.statSync(USERS_FILE).mtimeMs, raw }
  } catch {
    _usersCache = { mtimeMs: -1, raw: null }
  }
}

// Migration: jedem Nutzer eine stabile UUID (id) geben und die account-gebundenen
// Custom-Versionen von username- auf id-Keys umziehen. Idempotent, läuft bei jedem
// Start (tut nur etwas, solange noch alte Datensätze ohne id existieren).
// WICHTIG: erst NACH loadUsers/saveUsers + _usersCache aufrufen (sonst liefert
// loadUsers wegen der Temporal-Dead-Zone auf _usersCache eine leere Liste).
function migrateUserIdentities () {
  const users = loadUsers()
  let changed = false
  for (const u of users) {
    if (!u.id) {
      u.id = crypto.randomUUID()
      changed = true
    }
  }
  if (changed) saveUsers(users)
  try {
    const usernameToId = {}
    for (const u of users) if (u.id) usernameToId[u.username] = u.id
    customVersions.migrateKeys(usernameToId)
  } catch (err) {
    console.warn('[auth] Versions-Key-Migration fehlgeschlagen:', err?.message || err)
  }
}
migrateUserIdentities()

// ── Username-Normalisierung ─────────────────────────────────────────────
// Trim + Unicode-NFC. Der Vergleich für Eindeutigkeit/Identität ist zusätzlich
// case-insensitiv. Verhindert, dass sich zwei „gleiche" Namen in
// unterschiedlicher Normalisierungs-/Schreibform anlegen lassen – insbesondere
// die Übernahme des Admin-Namens über eine dekomponierte Unicode-Form.
function normalizeUsername (name) {
  return String(name ?? '').trim().normalize('NFC')
}

function usernameKey (name) {
  return normalizeUsername(name).toLowerCase()
}

// Liefert das gespeicherte UI-Theme eines Nutzers (oder null).
function getUserTheme (username) {
  const user = loadUsers().find(u => u.username === username)
  return user && user.theme ? user.theme : null
}

// Speichert das UI-Theme eines Nutzers. Gibt false zurück, wenn der Nutzer
// nicht existiert.
function setUserTheme (username, theme) {
  const users = loadUsers()
  const user = users.find(u => u.username === username)
  if (!user) return false
  user.theme = theme
  saveUsers(users)
  return true
}

// JWT-Subject ist die stabile Nutzer-UUID (id). Der Username wandert nur zur
// Anzeige/Kompatibilität mit ins Token. Identität = id, damit Umbenennungen die
// Anmeldung nicht brechen und Tokens nicht an einen mutablen Namen hängen.
function issueToken (user) {
  return jwt.sign(
    { id: user.id, username: user.username },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  )
}

// Nutzer über die stabile id finden.
function findUserById (id) {
  if (!id) return null
  return loadUsers().find(u => u.id === id) || null
}

// Middleware-Helfer: Nutzer aus dem Token-Payload auflösen. `id` wird bevorzugt;
// für noch gültige Alt-Tokens (nur `username`) dient der Username als Fallback.
function resolveTokenUser (payload) {
  if (!payload) return null
  const users = loadUsers()
  if (payload.id) {
    const byId = users.find(u => u.id === payload.id)
    if (byId) return byId
  }
  if (payload.username) {
    return users.find(u => u.username === payload.username) || null
  }
  return null
}

async function login (username, password) {
  if (!username || !password) return null
  const users = loadUsers()
  const user = users.find(u => u.username === username)
  if (!user || !user.passwordHash) return null
  const match = await bcrypt.compare(password, user.passwordHash)
  if (!match) return null
  return { token: issueToken(user), id: user.id, username: user.username }
}

// Prueft, ob ein noch gueltiges Token demnaechst ablaeuft. `exp` ist in
// Sekunden seit Epoche, wie im JWT-Standard.
function tokenBaldFaellig (payload) {
  if (!payload || !payload.exp) return false
  const restSekunden = payload.exp - Math.floor(Date.now() / 1000)
  return restSekunden < JWT_ERNEUERN_AB_SEK
}

function verifyToken (token) {
  try {
    return jwt.verify(token, JWT_SECRET)
  } catch {
    return null
  }
}

// ─── Validierung ────────────────────────────────────────────────────────
const USERNAME_MIN = 2
const PASSWORD_MIN = 6

function validateUsername (name) {
  if (typeof name !== 'string') return 'username_invalid'
  const trimmed = name.trim()
  if (trimmed.length < USERNAME_MIN) return 'username_too_short'
  if (trimmed.length > 40) return 'username_too_long'
  return null
}

function validatePassword (pw) {
  if (typeof pw !== 'string' || pw.length < PASSWORD_MIN) return 'password_too_short'
  return null
}

function validateSecurityQuestion (q) {
  if (typeof q !== 'string' || q.trim().length < 5) return 'security_question_invalid'
  return null
}

function validateSecurityAnswer (a) {
  if (typeof a !== 'string' || a.trim().length < 1) return 'security_answer_invalid'
  return null
}

// Antwort normalisieren, damit „Berlin" = „berlin " matcht.
function normalizeAnswer (a) {
  return String(a).trim().toLowerCase()
}

function usernameTaken (users, name, exceptName = null) {
  const key = usernameKey(name)
  const exceptKey = exceptName == null ? null : usernameKey(exceptName)
  return users.some(u => {
    const uKey = usernameKey(u.username)
    return uKey === key && uKey !== exceptKey
  })
}

// Öffentliches Profil eines Nutzers (ohne passwordHash / Sicherheitsantwort).
function publicProfile (user) {
  if (!user) return null
  return {
    id: user.id || null,
    username: user.username,
    avatar: user.avatar || null,
    securityQuestion: (user.security && user.security.question) || null
  }
}

function getProfile (username) {
  return publicProfile(loadUsers().find(u => u.username === username))
}

// Avatar-Pfade mehrerer Nutzer als Map (username -> avatar|null). Für die
// Anzeige der Profilbilder anderer Spieler in Lobby/Spiel.
function getAvatarMap (usernames = []) {
  const want = new Set(usernames)
  const map = {}
  for (const u of loadUsers()) {
    if (want.has(u.username)) map[u.username] = u.avatar || null
  }
  return map
}

// ─── Spiel-Statistiken (nur Online-Spiele) ──────────────────────────────
// Aggregat-Zähler pro Nutzer in users.json. Siehe BACKLOG.md.
function emptyStats () {
  return {
    totalPoints: 0,
    pointsSolo: 0,
    pointsTeam: 0,
    wins: 0,
    winsSolo: 0,
    winsTeam: 0,
    gamesPlayed: 0,
    byMode: {},
    byVersion: {}
  }
}

// Bestehende Stats mit Defaults auffüllen (tolerant für Alt-Accounts ohne stats).
function normalizeStats (raw) {
  const s = { ...emptyStats(), ...(raw || {}) }
  s.byMode = { ...(raw?.byMode || {}) }
  s.byVersion = { ...(raw?.byVersion || {}) }
  return s
}

function bumpBucket (container, key, field, amount) {
  if (!key) return
  if (!container[key]) container[key] = { points: 0, wins: 0, games: 0 }
  container[key][field] += amount
}

/**
 * Verbucht ein abgeschlossenes Online-Spiel für mehrere Nutzer in EINEM
 * File-Rewrite. `entries`: Array von
 *   { username, mode, versions, points, isWinner, isTeam }
 * `versions` = Liste der gespielten Versionen (Battle: genau eine; Normal/Film:
 * alle gewählten Pool-Versionen). Gesamt/Modus zählen einmal pro Spiel,
 * byVersion für JEDE gespielte Version.
 */
function recordGameResults (entries = []) {
  if (!Array.isArray(entries) || entries.length === 0) return
  const users = loadUsers()
  let changed = false
  for (const e of entries) {
    const user = users.find((u) => u.username === e.username)
    if (!user) continue
    const s = normalizeStats(user.stats)
    const pts = Number(e.points) || 0
    const isTeam = !!e.isTeam
    const isWinner = !!e.isWinner
    const mode = e.mode || 'normal'
    const versions = Array.isArray(e.versions)
      ? [...new Set(e.versions.filter(Boolean))]
      : (e.version ? [e.version] : [])
    s.totalPoints += pts
    s.gamesPlayed += 1
    if (isTeam) s.pointsTeam += pts
    else s.pointsSolo += pts
    if (isWinner) {
      s.wins += 1
      if (isTeam) s.winsTeam += 1
      else s.winsSolo += 1
    }
    bumpBucket(s.byMode, mode, 'points', pts)
    bumpBucket(s.byMode, mode, 'games', 1)
    if (isWinner) bumpBucket(s.byMode, mode, 'wins', 1)
    // byVersion: jede gespielte Version zählt (Normal/Film-Mischpool → alle).
    for (const version of versions) {
      bumpBucket(s.byVersion, version, 'points', pts)
      bumpBucket(s.byVersion, version, 'games', 1)
      if (isWinner) bumpBucket(s.byVersion, version, 'wins', 1)
    }
    user.stats = s
    changed = true
  }
  if (changed) saveUsers(users)
}

// Rangliste des Servers (nach Gesamtpunkten, dann Siegen sortiert). Vom Admin
// ausgeblendete Nutzer (hidden) erscheinen nicht.
function getLeaderboard () {
  return loadUsers()
    .filter((u) => !u.hidden)
    .map((u) => ({
      username: u.username,
      avatar: u.avatar || null,
      totalPoints: u.stats?.totalPoints || 0,
      wins: u.stats?.wins || 0,
      gamesPlayed: u.stats?.gamesPlayed || 0
    }))
    .sort(
      (a, b) => b.totalPoints - a.totalPoints || b.wins - a.wins ||
        a.username.localeCompare(b.username)
    )
}

// Öffentliche Statistik-Ansicht eines Nutzers (für die Profilseite). Ausgeblendete
// Nutzer haben keine öffentliche Statistik (wie „nicht gefunden").
function getPublicStats (username) {
  const u = loadUsers().find((x) => x.username === username)
  if (!u || u.hidden) return null
  return {
    username: u.username,
    avatar: u.avatar || null,
    stats: normalizeStats(u.stats)
  }
}

// ── Owner / Admin ─────────────────────────────────────────────────────
// Der Server-Owner IST der Admin. Seine stabile Nutzer-id liegt im DATA_DIR
// (server-owner.json), also ausserhalb des Repos, damit sie Updates/Umzüge
// übersteht. Für Self-Hosting: der erste registrierte Account wird automatisch
// Owner; der Owner kann später übertragen werden. Auf einem bereits laufenden
// Server ohne server-owner.json wird der zuerst registrierte Account übernommen.
const OWNER_FILE = dataPath('server-owner.json')
let _ownerId

function readOwnerId () {
  try {
    if (fs.existsSync(OWNER_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(OWNER_FILE, 'utf8'))
      if (parsed && typeof parsed.ownerId === 'string' && parsed.ownerId) {
        return parsed.ownerId
      }
    }
  } catch { /* keine/kaputte Datei -> kein Owner */ }
  return null
}

function persistOwnerId (id) {
  try {
    fs.writeFileSync(OWNER_FILE, JSON.stringify({ ownerId: id }, null, 2), { mode: 0o600 })
    _ownerId = id
    return true
  } catch (err) {
    console.error('[owner] Konnte Owner nicht speichern:', err?.message || err)
    return false
  }
}

function getOwnerId () {
  if (_ownerId === undefined) _ownerId = readOwnerId()
  return _ownerId
}

function isOwner (userId) {
  const oid = getOwnerId()
  return !!oid && !!userId && userId === oid
}

// Admin == Owner. Nimmt die stabile Nutzer-id (nicht mehr den Username).
function isAdmin (userId) {
  return isOwner(userId)
}

// Owner (Admin) übertragen – nur auf einen existierenden Account.
function setOwner (newOwnerId) {
  const u = findUserById(newOwnerId)
  if (!u) return { ok: false, error: 'user_not_found' }
  persistOwnerId(u.id)
  return { ok: true, ownerId: u.id, username: u.username }
}

// Erster Nutzer auf einem frischen Server wird automatisch Owner.
function claimOwnerIfUnset (userId) {
  if (!getOwnerId() && userId) persistOwnerId(userId)
}

// Einmal beim Start: Owner bestimmen, falls noch keiner gesetzt ist.
// Reihenfolge: (1) ENV OWNER_ID/OWNER_USERNAME (Override), (2) bestehender
// Legacy-Admin-Account. Sonst wird der erste künftige Registrant Owner.
function initOwner () {
  if (getOwnerId()) return
  const users = loadUsers()
  if (users.length === 0) return
  const envId = (process.env.OWNER_ID || '').trim()
  if (envId) {
    const u = users.find(x => x.id === envId)
    if (u) { persistOwnerId(u.id); return }
    console.warn('[owner] OWNER_ID nicht gefunden:', envId)
  }
  const envName = (process.env.OWNER_USERNAME || '').trim()
  if (envName) {
    const u = users.find(x => usernameKey(x.username) === usernameKey(envName))
    if (u) { persistOwnerId(u.id); return }
    console.warn('[owner] OWNER_USERNAME nicht gefunden:', envName)
  }
  // Bestehender Server ohne server-owner.json: den zuerst registrierten Account
  // uebernehmen. Die Nutzerliste steht in Registrierungsreihenfolge, users[0]
  // ist also der aelteste. Hier stand frueher ein fest verdrahteter Username,
  // der auf jedem fremden Server wirkungslos war.
  const erster = users[0]
  if (erster) {
    persistOwnerId(erster.id)
    console.log('[owner] Owner automatisch auf den zuerst registrierten Account gesetzt:', erster.username)
    return
  }
  console.warn('[owner] Noch kein Owner gesetzt. OWNER_USERNAME in server/.env setzen oder ersten Account registrieren.')
}
initOwner()

// Nutzerliste für die Admin-Seite (ohne sensible Felder). Sortiert nach
// Nutzername (case-insensitive, admin oben).
// Schlanke Nutzerliste (nur id + Anzeigename) für eingeloggte Nutzer, damit man
// beim Freigeben einer Version Accounts auswählen kann. Bewusst ohne
// Statistik/Sicherheitsdaten, damit hier keine sensiblen Infos rausgehen.
function listUsersBasic () {
  return loadUsers()
    .map(u => ({ id: u.id, username: u.username }))
    .sort((a, b) => a.username.localeCompare(b.username, 'de'))
}

function listUsersForAdmin () {
  return loadUsers()
    .map(u => ({
      id: u.id,
      username: u.username,
      avatar: u.avatar || null,
      isAdmin: isAdmin(u.id),
      hidden: !!u.hidden,
      hasSecurityQuestion: !!(u.security && u.security.question),
      gamesPlayed: u.stats?.gamesPlayed || 0,
      wins: u.stats?.wins || 0
    }))
    .sort((a, b) => {
      if (a.isAdmin !== b.isAdmin) return a.isAdmin ? -1 : 1
      return a.username.localeCompare(b.username, 'de')
    })
}

// Admin-Anlage eines Nutzers. Sicherheitsfrage/Antwort sind hier OPTIONAL
// (im Gegensatz zur Self-Registrierung) – der neue Nutzer kann sie beim
// ersten Login im Profil selbst hinterlegen. Passwort ist Pflicht.
async function adminCreateUser ({ username, password, securityQuestion, securityAnswer }) {
  const uErr = validateUsername(username)
  if (uErr) return { ok: false, error: uErr }
  const pErr = validatePassword(password)
  if (pErr) return { ok: false, error: pErr }
  const name = normalizeUsername(username)
  let security = null
  if (securityQuestion || securityAnswer) {
    const qErr = validateSecurityQuestion(securityQuestion)
    if (qErr) return { ok: false, error: qErr }
    const aErr = validateSecurityAnswer(securityAnswer)
    if (aErr) return { ok: false, error: aErr }
  }
  if (usernameTaken(loadUsers(), name)) return { ok: false, error: 'username_taken' }
  const passwordHash = await bcrypt.hash(password, 10)
  if (securityQuestion || securityAnswer) {
    security = {
      question: securityQuestion.trim(),
      answerHash: await bcrypt.hash(normalizeAnswer(securityAnswer), 10)
    }
  }
  // Autoritativer Schreib-Abschnitt ohne await dazwischen.
  const users = loadUsers()
  if (usernameTaken(users, name)) return { ok: false, error: 'username_taken' }
  const user = { id: crypto.randomUUID(), username: name, passwordHash }
  if (security) user.security = security
  users.push(user)
  saveUsers(users)
  return { ok: true, id: user.id, username: name }
}

// Admin-Löschung eines Nutzers. Gibt den vorherigen Avatar-Pfad zurück, damit
// die aufrufende Route die Datei sauber wegräumen kann. Der aufrufende Admin
// kann sich nicht selbst löschen (Guard oben in der Route).
function adminDeleteUser (id) {
  const users = loadUsers()
  const idx = users.findIndex(u => u.id === id)
  if (idx === -1) return { ok: false, error: 'user_not_found' }
  const [removed] = users.splice(idx, 1)
  saveUsers(users)
  // Account-gebundene Custom-Versionen mit aufräumen (sonst verwaist).
  try { customVersions.deleteUser(removed.id) } catch { /* best effort */ }
  return { ok: true, avatar: removed.avatar || null }
}

// Admin: Nutzer in Bestenliste/Statistik aus- bzw. einblenden.
function adminSetUserHidden (id, hidden) {
  const users = loadUsers()
  const user = users.find(u => u.id === id)
  if (!user) return { ok: false, error: 'user_not_found' }
  user.hidden = !!hidden
  saveUsers(users)
  return { ok: true, id: user.id, hidden: user.hidden }
}

// ─── Registrierung & Profil-Änderungen ─────────────────────────────────
// Rückgabeformat durchgängig: { ok: true, ... } oder { ok: false, error }

async function registerUser ({ username, password, securityQuestion, securityAnswer }) {
  const uErr = validateUsername(username)
  if (uErr) return { ok: false, error: uErr }
  const pErr = validatePassword(password)
  if (pErr) return { ok: false, error: pErr }
  const qErr = validateSecurityQuestion(securityQuestion)
  if (qErr) return { ok: false, error: qErr }
  const aErr = validateSecurityAnswer(securityAnswer)
  if (aErr) return { ok: false, error: aErr }
  const name = normalizeUsername(username)

  // Vorabprüfung (nicht autoritativ, spart bcrypt bei offensichtlicher Kollision)
  if (usernameTaken(loadUsers(), name)) return { ok: false, error: 'username_taken' }

  const passwordHash = await bcrypt.hash(password, 10)
  const answerHash = await bcrypt.hash(normalizeAnswer(securityAnswer), 10)
  // Autoritativer Schreib-Abschnitt: load → prüfen → push → save OHNE await
  // dazwischen, damit sich parallele Schreibvorgänge nicht überschreiben.
  const users = loadUsers()
  if (usernameTaken(users, name)) return { ok: false, error: 'username_taken' }
  const newUser = {
    id: crypto.randomUUID(),
    username: name,
    passwordHash,
    security: { question: securityQuestion.trim(), answerHash }
  }
  users.push(newUser)
  saveUsers(users)
  // Erster Account auf einem frischen Server wird automatisch Owner/Admin.
  claimOwnerIfUnset(newUser.id)
  return { ok: true, id: newUser.id, username: name, token: issueToken(newUser) }
}

async function changeUsername (currentName, newName) {
  const err = validateUsername(newName)
  if (err) return { ok: false, error: err }
  const name = normalizeUsername(newName)
  const users = loadUsers()
  const user = users.find(u => u.username === currentName)
  if (!user) return { ok: false, error: 'user_not_found' }
  if (name === user.username) return { ok: true, id: user.id, username: name, token: issueToken(user) }
  // Eigenen Eintrag von der Kollisionsprüfung ausnehmen (z. B. reine
  // Groß-/Kleinschreibungs-Änderung des eigenen Namens).
  if (usernameTaken(users, name, currentName)) return { ok: false, error: 'username_taken' }
  user.username = name
  saveUsers(users)
  // Custom-Versionen sind an die stabile id gebunden und ziehen automatisch mit,
  // eine separate Umbenennung im Store ist nicht mehr nötig.
  // Token neu ausstellen (enthält den aktuellen Anzeigenamen; Identität = id).
  return { ok: true, id: user.id, username: name, token: issueToken(user) }
}

async function changePassword (username, oldPassword, newPassword) {
  const pErr = validatePassword(newPassword)
  if (pErr) return { ok: false, error: pErr }
  const existing = loadUsers().find(u => u.username === username)
  if (!existing) return { ok: false, error: 'user_not_found' }
  const match = await bcrypt.compare(oldPassword || '', existing.passwordHash || '')
  if (!match) return { ok: false, error: 'old_password_wrong' }
  const newHash = await bcrypt.hash(newPassword, 10)
  // Schreib-Abschnitt ohne await dazwischen (Lost-Update-Schutz).
  const users = loadUsers()
  const user = users.find(u => u.username === username)
  if (!user) return { ok: false, error: 'user_not_found' }
  user.passwordHash = newHash
  saveUsers(users)
  return { ok: true }
}

function setAvatar (username, avatarPath) {
  const users = loadUsers()
  const user = users.find(u => u.username === username)
  if (!user) return { ok: false, error: 'user_not_found' }
  user.avatar = avatarPath
  saveUsers(users)
  return { ok: true, profile: publicProfile(user) }
}

function removeAvatar (username) {
  const users = loadUsers()
  const user = users.find(u => u.username === username)
  if (!user) return { ok: false, error: 'user_not_found' }
  const old = user.avatar || null
  user.avatar = null
  saveUsers(users)
  return { ok: true, profile: publicProfile(user), removed: old }
}

// ─── Sicherheitsfrage & Passwort-Wiederherstellung ─────────────────────

// Setzt/ändert Frage + Antwort (eingeloggt).
async function setSecurity (username, question, answer) {
  const qErr = validateSecurityQuestion(question)
  if (qErr) return { ok: false, error: qErr }
  const aErr = validateSecurityAnswer(answer)
  if (aErr) return { ok: false, error: aErr }
  const answerHash = await bcrypt.hash(normalizeAnswer(answer), 10)
  // Schreib-Abschnitt ohne await dazwischen (Lost-Update-Schutz).
  const users = loadUsers()
  const user = users.find(u => u.username === username)
  if (!user) return { ok: false, error: 'user_not_found' }
  user.security = { question: question.trim(), answerHash }
  saveUsers(users)
  return { ok: true, profile: publicProfile(user) }
}

// Liefert die hinterlegte Sicherheitsfrage (für den Recovery-Flow).
function getSecurityQuestion (username) {
  const user = loadUsers().find(u => u.username === username)
  if (!user) return { ok: false, error: 'user_not_found' }
  if (!user.security || !user.security.question) return { ok: false, error: 'no_security_question' }
  return { ok: true, question: user.security.question }
}

// Setzt das Passwort neu, wenn die Sicherheitsantwort stimmt.
async function resetPasswordWithAnswer (username, answer, newPassword) {
  const pErr = validatePassword(newPassword)
  if (pErr) return { ok: false, error: pErr }
  const existing = loadUsers().find(u => u.username === username)
  if (!existing || !existing.security || !existing.security.answerHash) {
    return { ok: false, error: 'no_security_question' }
  }
  const match = await bcrypt.compare(normalizeAnswer(answer || ''), existing.security.answerHash)
  if (!match) return { ok: false, error: 'answer_wrong' }
  const newHash = await bcrypt.hash(newPassword, 10)
  // Schreib-Abschnitt ohne await dazwischen (Lost-Update-Schutz).
  const users = loadUsers()
  const user = users.find(u => u.username === username)
  if (!user) return { ok: false, error: 'user_not_found' }
  user.passwordHash = newHash
  saveUsers(users)
  return { ok: true, id: user.id, username: user.username, token: issueToken(user) }
}

module.exports = {
  tokenBaldFaellig,
  login,
  verifyToken,
  issueToken,
  findUserById,
  resolveTokenUser,
  getUserTheme,
  setUserTheme,
  registerUser,
  getProfile,
  getAvatarMap,
  recordGameResults,
  getLeaderboard,
  getPublicStats,
  changeUsername,
  changePassword,
  setAvatar,
  removeAvatar,
  setSecurity,
  getSecurityQuestion,
  resetPasswordWithAnswer,
  // Admin / Owner
  isAdmin,
  isOwner,
  getOwnerId,
  setOwner,
  listUsersForAdmin,
  listUsersBasic,
  adminCreateUser,
  adminDeleteUser,
  adminSetUserHidden,
  JWT_SECRET
}
