const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const cors = require('cors')
const rateLimit = require('express-rate-limit')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')

const {
  login,
  verifyToken,
  issueToken,
  tokenBaldFaellig,
  resolveTokenUser,
  findUserById,
  getUserTheme,
  setUserTheme,
  registerUser,
  getProfile,
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
  isAdmin,
  setOwner,
  listUsersForAdmin,
  listUsersBasic,
  adminCreateUser,
  adminDeleteUser,
  adminSetUserHidden,
  MAX_POINTS_PER_GAME,
  MAX_VERSIONS_PER_GAME
} = require('./auth')
const {
  createRoom,
  getRoom,
  deleteRoom,
  addPlayerToSlot,
  removePlayerFromRoom,
  setSlotPool,
  getRoomPublicInfo,
  getRoomBroadcastState,
  roomStateNeedsViewer,
  roomStateForViewer,
  sanitizeGameStateForGuests,
  initBingoState,
  ensureAllTeamsHaveCards,
  startBingoRound,
  openBingoAnswering,
  setBingoTeamAnswer,
  confirmBingoTeamAnswer,
  resolveBingoRound,
  classifyBingoSoloGroup,
  markBingoCell,
  useBingoBonus,
  skipBingoRound,
  nextBingoRound,
  resetBingoMarks,
  hostSetBingoCell,
  advanceStalledBingoRound,
  setSlotConnectedCheck,
  setBingoTimerMode,
  normalizeGameMode,
  normalizeBingoSettings,
  getAllRooms,
  mergeVersionsMeta,
  MAX_SONG_POOLS,
} = require('./rooms')
const {
  getUserVersions,
  upsertUserVersion,
  deleteUserVersion
} = require('./customVersions')
const restrictedVersions = require('./restrictedVersions')
const { dataPath } = require('./dataDir')
const musicbrainz = require('./musicbrainz')
const {
  isValidSongUrl,
  isPoolId,
  sanitizePoolList,
  sanitizeCardData,
  scrubSongUrls,
  text
} = require('./validate')

const app = express()
const server = http.createServer(app)
const PORT = process.env.PORT || 3000

// Hinter einem Reverse-Proxy (Caddy/nginx) MUSS `TRUST_PROXY` gesetzt werden,
// sonst keyt express-rate-limit alle Requests auf die Proxy-IP. Zahl = Anzahl
// vertrauenswürdiger Hops (üblich: 1); alternativ ein Preset wie "loopback".
if (process.env.TRUST_PROXY) {
  const tp = process.env.TRUST_PROXY.trim()
  app.set('trust proxy', /^\d+$/.test(tp) ? Number(tp) : tp)
}

// ─── Middleware ────────────────────────────────────────────────────────────────

// CORS-Whitelist: `ALLOWED_ORIGINS` als komma-getrennte Liste
// (z. B. "https://hitster.example.com,https://spiel.example.org").
// Ohne Setzen: Requests ohne Origin-Header (curl, Electron-Renderer, same-origin
// vom mitgelieferten statischen Frontend) sind erlaubt, fremde Browser-Origins
// werden abgelehnt. In Dev via `NODE_ENV != production` alles erlaubt, damit
// `quasar dev` (Port 8080) den Server (Port 3000) ansprechen kann.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
const IS_PRODUCTION = process.env.NODE_ENV === 'production'
// Gemeinsame Origin-Prüfung für REST (cors) UND Socket.io: ohne Origin (curl,
// Electron-Renderer, same-origin) erlaubt; in Dev alles; in Prod nur die
// Whitelist.
function corsOriginCheck (origin, cb) {
  if (!origin) return cb(null, true)
  if (!IS_PRODUCTION) return cb(null, true)
  // Die Desktop-App (Electron) laedt per file:// und sendet daher den Origin
  // "null" bzw. file://… . Das ist KEIN fremder Browser-Origin, sondern unser
  // eigener Client – auch unter production erlauben, sonst blockt die
  // CORS-Whitelist die Desktop-App. Die eigentliche Absicherung ist das JWT.
  if (origin === 'null' || origin.startsWith('file://')) return cb(null, true)
  if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true)
  return cb(new Error(`Origin nicht erlaubt: ${origin}`))
}
app.use(cors({ origin: corsOriginCheck }))

// Standard-Body-Limit klein halten (100 KB reichen fuer normale API-Aufrufe).
// Ein paar Endpunkte bekommen von Natur aus groessere Nutzlasten: Avatare als
// Data-URI und komplette Versionen samt Songliste (rund 190 Byte pro Karte, ein
// Deck mit 1000 Karten sind also schon knapp 200 KB).
//
// WICHTIG: Ein zweiter express.json() direkt an der Route bringt hier nichts.
// Der globale Parser laeuft zuerst und wirft bereits 413, bevor die Route
// ueberhaupt erreicht wird. Deshalb wird das Limit hier zentral nach Pfad
// entschieden, damit jede Route garantiert genau einen Parser durchlaeuft.
const GROSSE_NUTZLAST = [
  /^\/api\/profile\/avatar$/,
  /^\/api\/versions\/[^/]+$/,
  /^\/api\/my\/restricted-versions$/,
  /^\/api\/my\/restricted-versions\/[^/]+$/,
  /^\/api\/admin\/restricted-versions\/[^/]+$/
]
const standardJsonParser = express.json({ limit: '100kb' })
const grosserJsonParser = express.json({ limit: '8mb' })
app.use((req, res, next) => {
  const grosszuegig = GROSSE_NUTZLAST.some((muster) => muster.test(req.path))
  return (grosszuegig ? grosserJsonParser : standardJsonParser)(req, res, next)
})

// Rate-Limits fuer sicherheitsrelevante Endpunkte: 20 Requests / 15 Min / IP.
// Verhindert Online-Bruteforce auf Login/Recover und Massen-Registrierung.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  // `error` bleibt der Code fuer die App, `message` ist der Text fuer Menschen.
  // Beim Login geht es um Anmeldeversuche, bei Registrierung und
  // Wiederherstellung allgemein um Anfragen.
  handler: (req, res, _next, options) => {
    const message = req.path === '/api/login'
      ? 'Zu viele Anmeldeversuche. Bitte warte kurz und versuche es dann erneut.'
      : 'Zu viele Anfragen. Bitte warte kurz und versuche es dann erneut.'
    res.status(options.statusCode).json({ error: 'rate_limited', message })
  }
})

// Schreibzugriffe auf Versionen (eigene und geteilte): pro Konto, nicht pro
// IP, weil mehrere Spieler hinter einem Router sitzen können. Großzügig genug
// für das Hochladen aller vorgemerkten Änderungen nach dem Anmelden, aber kein
// Dauerfeuer. Muss hinter authMiddleware stehen (braucht req.userId).
const versionsWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `user:${req.userId}`,
  handler: (_req, res, _next, options) => {
    res.status(options.statusCode).json({
      error: 'rate_limited',
      message: 'Zu viele Änderungen an Versionen. Bitte warte kurz und versuche es dann erneut.'
    })
  }
})

// Verzeichnis für hochgeladene Profilbilder (statisch ausgeliefert).
// Liegt – wie users.json & Co. – unter DATA_DIR (Default: server/), damit ein
// dauerhaft laufender Homeserver die Uploads außerhalb des Repos halten kann.
const uploadsDir = dataPath('uploads')
const avatarsDir = path.join(uploadsDir, 'avatars')
fs.mkdirSync(avatarsDir, { recursive: true })
// Nutzer-Uploads: Content-Type-Sniffing unterbinden, damit eine als Bild
// getarnte Datei nicht doch als HTML/Script interpretiert wird (Stored-XSS-
// Schutz zusätzlich zur Signaturprüfung beim Upload).
app.use('/uploads', express.static(uploadsDir, {
  setHeaders (res) {
    res.setHeader('X-Content-Type-Options', 'nosniff')
  }
}))

// Statisches Frontend (nach `npm run build` in dist/spa)
const frontendDist = path.join(__dirname, '..', 'dist', 'spa')
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist))
}

// ─── REST ──────────────────────────────────────────────────────────────────────

// POST /api/login
app.post('/api/login', authLimiter, async (req, res) => {
  const { username, password } = req.body || {}
  if (!username || !password) {
    return res.status(400).json({ error: 'Username und Passwort erforderlich' })
  }
  try {
    const result = await login(username, password)
    if (!result) {
      return res.status(401).json({ error: 'Ungültige Anmeldedaten' })
    }
    res.json({
      token: result.token,
      id: result.id,
      username: result.username,
      isAdmin: isAdmin(result.id)
    })
  } catch {
    res.status(500).json({ error: 'Server-Fehler beim Login' })
  }
})

// Auth-Middleware: prüft Bearer-Token und setzt req.userId + req.username.
// Identität ist die stabile id; der Username kommt frisch aus dem Datensatz
// (nicht aus dem Token), damit er nach einer Umbenennung aktuell ist.
function authMiddleware (req, res, next) {
  const auth = req.headers.authorization
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Kein Token' })
  }
  const payload = verifyToken(auth.slice(7))
  if (!payload) {
    return res.status(401).json({ error: 'Token ungültig oder abgelaufen' })
  }
  const user = resolveTokenUser(payload)
  if (!user) {
    return res.status(401).json({ error: 'Nutzer nicht gefunden' })
  }
  req.userId = user.id
  req.username = user.username
  req.tokenPayload = payload
  req.tokenUser = user
  next()
}

// GET /api/verify  – prüft ob ein Token noch gültig ist
app.get('/api/verify', authMiddleware, (req, res) => {
  // Sitzung stillschweigend verlaengern: Laeuft das Token demnaechst ab, kommt
  // hier ein frisches mit zurueck. Wer die App regelmaessig oeffnet, wird damit
  // nie abgemeldet, ohne dass das einzelne Token ewig gilt.
  const antwort = { id: req.userId, username: req.username, isAdmin: isAdmin(req.userId) }
  if (tokenBaldFaellig(req.tokenPayload)) {
    antwort.token = issueToken(req.tokenUser)
  }
  res.json(antwort)
})

// GET /api/theme  – gespeichertes UI-Theme des Nutzers laden
app.get('/api/theme', authMiddleware, (req, res) => {
  res.json({ theme: getUserTheme(req.username) })
})

// PUT /api/theme  – UI-Theme des Nutzers speichern
app.put('/api/theme', authMiddleware, (req, res) => {
  const { theme } = req.body || {}
  if (!theme || typeof theme !== 'object') {
    return res.status(400).json({ error: 'Theme fehlt oder ungültig' })
  }
  const ok = setUserTheme(req.username, theme)
  if (!ok) {
    return res.status(404).json({ error: 'Nutzer nicht gefunden' })
  }
  res.json({ success: true })
})

// ─── Eigene Versionen (account-gebundener Speicher) ──────────────────────────

// GET /api/versions  – account-synchronisierte Versionen des Nutzers
app.get('/api/versions', authMiddleware, (req, res) => {
  res.json({ versions: getUserVersions(req.userId) })
})

// PUT /api/versions/:id  – synchronisierte Version anlegen/aktualisieren
app.put('/api/versions/:id', authMiddleware, versionsWriteLimiter, (req, res) => {
  try {
    const { version } = req.body || {}
    if (!version || typeof version !== 'object') {
      return res.status(400).json({ error: 'Version fehlt' })
    }
    const versions = upsertUserVersion(req.userId, {
      ...version,
      id: req.params.id
    })
    res.json({ success: true, versions })
  } catch (err) {
    res.status(400).json({ error: err.message || 'Speichern fehlgeschlagen' })
  }
})

// DELETE /api/versions/:id  – synchronisierte Version entfernen
app.delete('/api/versions/:id', authMiddleware, versionsWriteLimiter, (req, res) => {
  const versions = deleteUserVersion(req.userId, req.params.id)
  res.json({ success: true, versions })
})

// GET /api/restricted-versions – für diesen Nutzer freigegebene, eingeschränkte
// Versionen (z. B. Hitster 1 & 2), inkl. Tracks zum Spielen.
app.get('/api/restricted-versions', authMiddleware, (req, res) => {
  res.json({ versions: restrictedVersions.listForUser(req.userId, isAdmin(req.userId)) })
})

// GET /api/users/basic – schlanke Nutzerliste (id + Name) für eingeloggte Nutzer,
// damit man beim Freigeben einer Version die Accounts auswählen kann.
app.get('/api/users/basic', authMiddleware, (_req, res) => {
  res.json({ users: listUsersBasic() })
})

// ─── Eigene, geteilte (eingeschränkte) Versionen: Ersteller-Selbstverwaltung ──
// Diese Endpoints darf jeder eingeloggte Nutzer für SEINE eigenen geteilten
// Versionen nutzen (Ersteller), zusätzlich der Admin für alle. Die
// Rechteprüfung macht `restrictedVersions.canManage`.

// POST – eigene Version teilen (aus einer Custom-Version). Legt eine neue
// eingeschränkte Version mit dem aktuellen Nutzer als Ersteller an.
app.post('/api/my/restricted-versions', authMiddleware, versionsWriteLimiter, (req, res) => {
  try {
    const { version } = req.body || {}
    if (!version || typeof version !== 'object') {
      return res.status(400).json({ error: 'bad_request', message: 'Version fehlt' })
    }
    const saved = restrictedVersions.create(version, req.userId)
    res.json({ success: true, version: { id: saved.id, value: saved.value, label: saved.label } })
  } catch (err) {
    res.status(400).json({ error: 'save_failed', message: err.message || 'Speichern fehlgeschlagen' })
  }
})

// PUT – eigene geteilte Version bearbeiten (nur Ersteller oder Admin).
app.put('/api/my/restricted-versions/:id', authMiddleware, versionsWriteLimiter, (req, res) => {
  const existing = restrictedVersions.getById(req.params.id)
  if (!existing) return res.status(404).json({ error: 'not_found', message: 'Version nicht gefunden' })
  if (!restrictedVersions.canManage(existing, req.userId, isAdmin(req.userId))) {
    return res.status(403).json({ error: 'forbidden', message: 'Keine Berechtigung' })
  }
  try {
    const { version } = req.body || {}
    if (!version || typeof version !== 'object') {
      return res.status(400).json({ error: 'bad_request', message: 'Version fehlt' })
    }
    // Ersteller/Freigaben nicht über diesen Weg verändern (nur Inhalt/Meta).
    const saved = restrictedVersions.upsert({
      ...version,
      id: req.params.id,
      creatorId: existing.creatorId,
      allowedUserIds: existing.allowedUserIds
    })
    res.json({ success: true, version: { id: saved.id, value: saved.value, label: saved.label } })
  } catch (err) {
    res.status(400).json({ error: 'save_failed', message: err.message || 'Speichern fehlgeschlagen' })
  }
})

// PATCH .../access – Freigaben der eigenen Version setzen (nur Ersteller/Admin).
app.patch('/api/my/restricted-versions/:id/access', authMiddleware, versionsWriteLimiter, (req, res) => {
  const existing = restrictedVersions.getById(req.params.id)
  if (!existing) return res.status(404).json({ error: 'not_found', message: 'Version nicht gefunden' })
  if (!restrictedVersions.canManage(existing, req.userId, isAdmin(req.userId))) {
    return res.status(403).json({ error: 'forbidden', message: 'Keine Berechtigung' })
  }
  const { userIds } = req.body || {}
  const result = restrictedVersions.setAllowedUsers(req.params.id, Array.isArray(userIds) ? userIds : [])
  res.json({ success: true, id: result.id, allowedUserIds: result.allowedUserIds })
})

// DELETE – eigene geteilte Version entfernen (nur Ersteller/Admin).
app.delete('/api/my/restricted-versions/:id', authMiddleware, versionsWriteLimiter, (req, res) => {
  const existing = restrictedVersions.getById(req.params.id)
  if (!existing) return res.status(404).json({ error: 'not_found', message: 'Version nicht gefunden' })
  if (!restrictedVersions.canManage(existing, req.userId, isAdmin(req.userId))) {
    return res.status(403).json({ error: 'forbidden', message: 'Keine Berechtigung' })
  }
  restrictedVersions.remove(req.params.id)
  res.json({ success: true, id: req.params.id })
})

// ─── Registrierung & Profil ──────────────────────────────────────────────────

// Fehlercode → HTTP-Status + lesbare Meldung
const ERROR_INFO = {
  username_invalid: [400, 'Ungültiger Benutzername'],
  username_too_short: [400, 'Benutzername ist zu kurz (min. 2 Zeichen)'],
  username_too_long: [400, 'Benutzername ist zu lang (max. 40 Zeichen)'],
  username_taken: [409, 'Benutzername ist bereits vergeben'],
  password_too_short: [400, 'Passwort ist zu kurz (min. 6 Zeichen)'],
  old_password_wrong: [403, 'Aktuelles Passwort ist falsch'],
  user_not_found: [404, 'Nutzer nicht gefunden'],
  image_invalid: [400, 'Ungültiges Bild'],
  security_question_invalid: [400, 'Bitte eine Sicherheitsfrage angeben (min. 5 Zeichen)'],
  security_answer_invalid: [400, 'Bitte eine Antwort auf die Sicherheitsfrage angeben'],
  // Bewusst ein Fehler für „Account gibt es nicht" und „keine Frage
  // hinterlegt", damit sich darüber keine Accounts abfragen lassen.
  recovery_unavailable: [404, 'Für diesen Benutzernamen ist keine Wiederherstellung per Sicherheitsfrage möglich'],
  answer_wrong: [403, 'Antwort auf die Sicherheitsfrage ist falsch'],
  username_in_room: [409, 'Den Namen kannst du nicht ändern, solange du in einem Raum bist. Verlasse zuerst den Raum.']
}

function fail (res, error) {
  const [status, message] = ERROR_INFO[error] || [400, 'Anfrage fehlgeschlagen']
  return res.status(status).json({ error, message })
}

// POST /api/register  – neuen Account anlegen (offen, Sicherheitsfrage Pflicht)
app.post('/api/register', authLimiter, async (req, res) => {
  try {
    const { username, password, securityQuestion, securityAnswer } = req.body || {}
    const result = await registerUser({ username, password, securityQuestion, securityAnswer })
    if (!result.ok) return fail(res, result.error)
    res.status(201).json({ token: result.token, id: result.id, username: result.username })
  } catch (err) {
    console.error('[register] Fehler:', err)
    res.status(500).json({ error: 'server_error', message: 'Server-Fehler bei der Registrierung' })
  }
})

// ─── Passwort-Wiederherstellung per Sicherheitsfrage (öffentlich) ─────────────

// GET /api/recover/question?username=…  – hinterlegte Frage abrufen
app.get('/api/recover/question', authLimiter, (req, res) => {
  const username = (req.query.username || '').toString()
  const result = getSecurityQuestion(username)
  if (!result.ok) return fail(res, result.error)
  res.json({ question: result.question })
})

// POST /api/recover/reset  – Passwort neu setzen wenn Antwort stimmt
app.post('/api/recover/reset', authLimiter, async (req, res) => {
  try {
    const { username, answer, newPassword } = req.body || {}
    const result = await resetPasswordWithAnswer(username, answer, newPassword)
    if (result.error === 'recovery_locked') {
      const minuten = Math.max(1, Math.ceil(result.retryAfterSec / 60))
      res.set('Retry-After', String(result.retryAfterSec))
      return res.status(429).json({
        error: 'recovery_locked',
        message: `Zu viele falsche Antworten. Bitte versuche es in ${minuten} ${minuten === 1 ? 'Minute' : 'Minuten'} erneut.`
      })
    }
    if (!result.ok) return fail(res, result.error)
    res.json({ token: result.token, id: result.id, username: result.username })
  } catch (err) {
    console.error('[recover] Fehler:', err)
    res.status(500).json({ error: 'server_error', message: 'Server-Fehler bei der Wiederherstellung' })
  }
})

// GET /api/me  – eigenes Profil
app.get('/api/me', authMiddleware, (req, res) => {
  const profile = getProfile(req.username)
  if (!profile) return fail(res, 'user_not_found')
  res.json({ ...profile, isAdmin: isAdmin(req.userId) })
})

// GET /api/leaderboard – Rangliste der Server-Nutzer (nach Punkten/Siegen)
app.get('/api/leaderboard', authMiddleware, (_req, res) => {
  res.json({ leaderboard: getLeaderboard() })
})

// GET /api/users/:username/public – öffentliche Profil-/Statistikansicht
app.get('/api/users/:username/public', authMiddleware, (req, res) => {
  const data = getPublicStats(req.params.username)
  if (!data) return fail(res, 'user_not_found')
  res.json(data)
})

// ─── Admin-Endpoints (nur der Server-Owner) ────────────────────────────────
// Zugriffsprüfung: JWT gültig UND req.username === ADMIN_USERNAME. Alle
// anderen Anfragen antworten mit 403 (ohne zu leaken, dass der Endpoint
// überhaupt existiert – der Path ist zwar öffentlich bekannt, aber ohne
// Admin-Login funktioniert er nicht).
function requireAdmin (req, res, next) {
  if (!isAdmin(req.userId)) {
    return res.status(403).json({ error: 'forbidden', message: 'Nur Admin' })
  }
  next()
}

// GET /api/admin/users – Nutzerliste (ohne sensible Felder)
app.get('/api/admin/users', authMiddleware, requireAdmin, (_req, res) => {
  res.json({ users: listUsersForAdmin() })
})

// POST /api/admin/users – neuen Nutzer anlegen. Sicherheitsfrage optional.
app.post('/api/admin/users', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { username, password, securityQuestion, securityAnswer } = req.body || {}
    const result = await adminCreateUser({
      username, password, securityQuestion, securityAnswer
    })
    if (!result.ok) return fail(res, result.error)
    res.status(201).json({ username: result.username })
  } catch (err) {
    console.error('[admin:create] Fehler:', err)
    res.status(500).json({ error: 'server_error', message: 'Anlegen fehlgeschlagen' })
  }
})

// DELETE /api/admin/users/:username – Nutzer löschen. Admin kann sich nicht
// selbst löschen (verhindert Aussperren). Avatar-Datei wird best-effort
// mitgelöscht, damit der Uploads-Ordner sauber bleibt.
app.delete('/api/admin/users/:id', authMiddleware, requireAdmin, (req, res) => {
  const targetId = req.params.id
  const target = findUserById(targetId)
  if (!target) return fail(res, 'user_not_found')
  if (isAdmin(target.id)) {
    return res.status(400).json({
      error: 'cannot_delete_self',
      message: 'Der Owner-/Admin-Account kann nicht gelöscht werden.'
    })
  }
  const result = adminDeleteUser(targetId)
  if (!result.ok) return fail(res, result.error)
  if (result.avatar) deleteAvatarFile(result.avatar)
  // Freigaben für eingeschränkte Versionen des gelöschten Nutzers entfernen.
  try { restrictedVersions.removeUserAccess(targetId) } catch { /* best effort */ }
  res.json({ success: true, id: targetId })
})

// PATCH /api/admin/users/:id – Nutzer-Einstellungen (aktuell: Sichtbarkeit in
// Bestenliste/Statistik). Body: { hidden: boolean }.
app.patch('/api/admin/users/:id', authMiddleware, requireAdmin, (req, res) => {
  const { hidden } = req.body || {}
  if (typeof hidden !== 'boolean') {
    return res.status(400).json({ error: 'bad_request', message: 'hidden (boolean) erforderlich' })
  }
  const result = adminSetUserHidden(req.params.id, hidden)
  if (!result.ok) return fail(res, result.error)
  res.json({ success: true, id: result.id, hidden: result.hidden })
})

// PATCH /api/admin/owner – Ownership (= Admin) auf einen anderen Account
// übertragen. Nur der aktuelle Owner darf das.
app.patch('/api/admin/owner', authMiddleware, requireAdmin, (req, res) => {
  const { userId } = req.body || {}
  const result = setOwner((userId || '').toString())
  if (!result.ok) return fail(res, result.error)
  res.json({ success: true, ownerId: result.ownerId, username: result.username })
})

// ─── Admin: eingeschränkte Versionen ────────────────────────────────────────
// GET – alle Versionen inkl. Freigaben (ohne Track-Listen, nur trackCount).
app.get('/api/admin/restricted-versions', authMiddleware, requireAdmin, (_req, res) => {
  res.json({ versions: restrictedVersions.listAllForAdmin() })
})

// PUT – Version anlegen/aktualisieren (Body: { version }).
app.put('/api/admin/restricted-versions/:id', authMiddleware, requireAdmin, (req, res) => {
  try {
    const { version } = req.body || {}
    if (!version || typeof version !== 'object') {
      return res.status(400).json({ error: 'bad_request', message: 'Version fehlt' })
    }
    const saved = restrictedVersions.upsert({ ...version, id: req.params.id })
    res.json({ success: true, version: { id: saved.id, value: saved.value, label: saved.label } })
  } catch (err) {
    res.status(400).json({ error: 'save_failed', message: err.message || 'Speichern fehlgeschlagen' })
  }
})

// DELETE – Version entfernen.
app.delete('/api/admin/restricted-versions/:id', authMiddleware, requireAdmin, (req, res) => {
  const ok = restrictedVersions.remove(req.params.id)
  if (!ok) return res.status(404).json({ error: 'not_found', message: 'Version nicht gefunden' })
  res.json({ success: true, id: req.params.id })
})

// PATCH .../access – freigegebene Accounts setzen (Body: { userIds: [id, …] }).
app.patch('/api/admin/restricted-versions/:id/access', authMiddleware, requireAdmin, (req, res) => {
  const { userIds } = req.body || {}
  const result = restrictedVersions.setAllowedUsers(req.params.id, Array.isArray(userIds) ? userIds : [])
  if (!result.ok) return res.status(404).json({ error: 'not_found', message: 'Version nicht gefunden' })
  res.json({ success: true, id: result.id, allowedUserIds: result.allowedUserIds })
})

// PATCH /api/profile/username
app.patch('/api/profile/username', authMiddleware, async (req, res) => {
  const { username } = req.body || {}
  // Räume führen Mitglieder und Host über den Namen. Eine Umbenennung mitten
  // im Raum ließe den alten Platz verwaisen, und ein neu registrierter Account
  // mit dem frei gewordenen Namen könnte ihn übernehmen. Deshalb erst nach dem
  // Verlassen aller Räume.
  if (userIsInAnyRoom(req.username)) return fail(res, 'username_in_room')
  const result = await changeUsername(req.username, username)
  if (!result.ok) return fail(res, result.error)
  // Neues Token zurückgeben (enthält den aktuellen Anzeigenamen; Identität = id)
  res.json({ token: result.token, id: result.id, username: result.username })
})

// PATCH /api/profile/password  – Bestätigung über aktuelles Passwort
app.patch('/api/profile/password', authMiddleware, async (req, res) => {
  const { oldPassword, newPassword } = req.body || {}
  const result = await changePassword(req.username, oldPassword, newPassword)
  if (!result.ok) return fail(res, result.error)
  // Die Änderung macht alle bisherigen Tokens ungültig, auch das gerade
  // benutzte. Der Client muss das neue Token übernehmen.
  res.json({ success: true, token: result.token, id: req.userId, username: req.username })
})

// PATCH /api/profile/security  – Sicherheitsfrage + Antwort setzen/ändern
app.patch('/api/profile/security', authMiddleware, async (req, res) => {
  const { question, answer } = req.body || {}
  const result = await setSecurity(req.username, question, answer)
  if (!result.ok) return fail(res, result.error)
  res.json(result.profile)
})

// Prüft, ob die tatsächlichen Bytes zum deklarierten Bildtyp passen (Magic
// Bytes). Verhindert, dass beliebige Inhalte mit Bild-Endung abgelegt werden.
function imageSignatureOk (buffer, ext) {
  if (!buffer || buffer.length < 12) return false
  if (ext === 'png') {
    return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e &&
      buffer[3] === 0x47 && buffer[4] === 0x0d && buffer[5] === 0x0a &&
      buffer[6] === 0x1a && buffer[7] === 0x0a
  }
  if (ext === 'jpeg') {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
  }
  if (ext === 'webp') {
    // "RIFF" .... "WEBP"
    return buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 &&
      buffer[3] === 0x46 && buffer[8] === 0x57 && buffer[9] === 0x45 &&
      buffer[10] === 0x42 && buffer[11] === 0x50
  }
  return false
}

// Speichert eine Data-URI als Bilddatei und liefert den öffentlichen Pfad.
function saveAvatarDataUri (dataUri, username) {
  const match = /^data:image\/(png|jpe?g|webp);base64,(.+)$/i.exec(dataUri || '')
  if (!match) return null
  const ext = match[1].toLowerCase() === 'jpg' ? 'jpeg' : match[1].toLowerCase()
  const buffer = Buffer.from(match[2], 'base64')
  // Inhalt muss wirklich das deklarierte Bild sein (nicht nur die Endung).
  if (!imageSignatureOk(buffer, ext)) return null
  const safe = username.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 20)
  const filename = `${safe}-${crypto.randomBytes(6).toString('hex')}.${ext}`
  fs.writeFileSync(path.join(avatarsDir, filename), buffer)
  return `/uploads/avatars/${filename}`
}

// Löscht die zu einem öffentlichen Pfad gehörende Avatar-Datei (best effort).
function deleteAvatarFile (publicPath) {
  if (!publicPath || !publicPath.startsWith('/uploads/avatars/')) return
  const file = path.join(uploadsDir, publicPath.replace('/uploads/', ''))
  fs.rm(file, { force: true }, () => {})
}

// POST /api/profile/avatar  – { image: dataURI } (clientseitig vorab verkleinert)
app.post('/api/profile/avatar', authMiddleware, (req, res) => {
  try {
    const { image } = req.body || {}
    const newPath = saveAvatarDataUri(image, req.username)
    if (!newPath) return fail(res, 'image_invalid')
    const previous = getProfile(req.username)
    const result = setAvatar(req.username, newPath)
    if (!result.ok) {
      deleteAvatarFile(newPath)
      return fail(res, result.error)
    }
    if (previous && previous.avatar) deleteAvatarFile(previous.avatar)
    res.json(result.profile)
  } catch (err) {
    console.error('[avatar] Fehler:', err)
    res.status(500).json({ error: 'server_error', message: 'Server-Fehler beim Bild-Upload' })
  }
})

// DELETE /api/profile/avatar
app.delete('/api/profile/avatar', authMiddleware, (req, res) => {
  const result = removeAvatar(req.username)
  if (!result.ok) return fail(res, result.error)
  if (result.removed) deleteAvatarFile(result.removed)
  res.json(result.profile)
})

// POST /api/musicbrainz/check
// Songdaten (Jahr, Live/Cover/Neuaufnahme, Band/Solo) gegen MusicBrainz
// prüfen. Läuft über den Server statt direkt aus dem Client, weil MusicBrainz
// nur eine Anfrage pro Sekunde und IP erlaubt: Hier gibt es eine gemeinsame
// Warteschlange und einen Cache für alle Nutzer. Höchstens 10 Songs pro
// Anfrage, damit eine Anfrage nicht minutenlang hängt (mit dem Ratenlimit
// dauert sie trotzdem bis zu rund 20 s; das ist so gewollt).
const MB_MAX_TRACKS = 10
app.post('/api/musicbrainz/check', authMiddleware, async (req, res) => {
  const { tracks, artistsOnly } = req.body || {}
  if (!Array.isArray(tracks) || tracks.length === 0) {
    return res.status(400).json({ error: 'invalid_tracks', message: 'tracks fehlt oder ist leer' })
  }
  if (tracks.length > MB_MAX_TRACKS) {
    return res.status(400).json({
      error: 'too_many_tracks',
      message: `Höchstens ${MB_MAX_TRACKS} Songs pro Anfrage`
    })
  }
  const text = (wert) => (typeof wert === 'string' || typeof wert === 'number'
    ? String(wert).trim().slice(0, 300)
    : '')
  const eintraege = []
  for (const t of tracks) {
    const key = t && text(t.key)
    if (!key) {
      return res.status(400).json({ error: 'invalid_track', message: 'Jeder Song braucht einen key' })
    }
    eintraege.push({
      key,
      isrc: text(t.isrc),
      spotifyId: musicbrainz.spotifyIdAus(text(t.trackId)),
      title: text(t.title),
      artist: text(t.artist),
      year: text(t.year)
    })
  }

  // Bricht der Client ab (Dialog geschlossen), keine weiteren Anfragen mehr
  // an MusicBrainz stellen; die Plätze in der Warteschlange braucht sonst
  // jemand anderes.
  let abgebrochen = false
  res.on('close', () => { if (!res.writableEnded) abgebrochen = true })

  const results = {}
  if (!artistsOnly) {
    // Alle Spotify-Links eines Blocks mit einer einzigen Anfrage auflösen.
    try {
      await musicbrainz.prefetchSpotify(eintraege.map((e) => e.spotifyId))
    } catch (err) {
      console.warn('[musicbrainz] Spotify-Vorabfrage fehlgeschlagen:', err?.message || err)
    }
  }
  for (const e of eintraege) {
    if (abgebrochen) break
    try {
      if (artistsOnly) {
        const a = await musicbrainz.lookupArtist(e.artist)
        results[e.key] = {
          matchedBy: a && a.mbid ? 'artist' : null,
          mbid: null,
          title: null,
          artist: a ? a.name : null,
          firstYear: null,
          flags: [],
          artistMbid: a ? a.mbid : null,
          artistType: a ? a.type : null,
          ensemble: a ? a.ensemble : null,
          yearDiffers: false,
          originalYear: null,
          originalMbid: null,
          originalTitle: null,
          originalDiffers: false
        }
      } else {
        const r = await musicbrainz.lookupTrack(e)
        const unserJahr = musicbrainz.hauptjahr(e.year)
        // yearDiffers vergleicht mit der gefundenen Aufnahme, originalDiffers
        // mit der ursprünglichen Studioaufnahme (nur gesetzt, wenn die
        // gefundene ein Remaster, eine Neuaufnahme o. ä. ist).
        results[e.key] = {
          ...r,
          yearDiffers: !!(unserJahr && r.firstYear && unserJahr !== r.firstYear),
          originalDiffers: !!(unserJahr && r.originalYear && unserJahr !== r.originalYear)
        }
      }
    } catch (err) {
      // Ein einzelner Fehler (Timeout, MusicBrainz überlastet) soll nicht die
      // ganze Anfrage scheitern lassen.
      console.warn('[musicbrainz] Abfrage fehlgeschlagen:', err?.message || err)
      results[e.key] = null
    }
  }
  if (abgebrochen) return
  res.json({ results })
})

// SPA-Fallback (muss nach allen API-Routen stehen)
if (fs.existsSync(frontendDist)) {
  app.get('*', (_req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'))
  })
}

// ─── Socket.io ─────────────────────────────────────────────────────────────────
const io = new Server(server, {
  // Gleiche Origin-Politik wie REST (Dev: alles, Prod: Whitelist). Sockets
  // verlangen zusätzlich ein gültiges JWT (siehe io.use unten).
  cors: { origin: corsOriginCheck, methods: ['GET', 'POST'] },
  pingTimeout: 60000
})

// socketId → { username, roomCode }
const socketUserMap = new Map()
// roomCode → hostSocketId (für direkte Host-Nachrichten)
const hostSocketMap = new Map()
// `username:roomCode` → timeoutId  (Karenzzeit vor Lobby-Entfernung)
const pendingRemovals = new Map()
// roomCode → timeoutId  (Aufräumen eines laufenden Spiels ohne Verbindungen)
const roomCleanupTimers = new Map()
// Karenz, bevor ein laufendes Spiel ohne verbundene Sockets gelöscht wird.
// Lang genug für ein Neuladen oder einen kurzen Netzausfall aller Beteiligten.
const ROOM_CLEANUP_MS = 10 * 60 * 1000
// roomCode → Map(username → { sid, slotName })  (offene Rückkehr-Anfragen in
// ein laufendes Spiel). Wer die App geschlossen hat und per Raumcode
// zurückkommt, braucht die Freigabe des Hosts. Der anfragende Socket steht
// bis dahin nicht im Raum, deshalb wird er hier statt in socketUserMap geführt.
const pendingRejoins = new Map()

// Alle offenen Rückkehr-Anfragen eines Raums an den aktuellen Host-Socket
// schicken. Nach einem Host-Wechsel oder Neuladen des Hosts kennt dessen
// Oberfläche die Anfragen sonst nicht, und die Anfragenden warten ewig.
function sendPendingRejoinsToHost (roomCode) {
  const anfragen = pendingRejoins.get(roomCode)
  if (!anfragen || anfragen.size === 0) return
  const hostSid = hostSocketMap.get(roomCode)
  if (!hostSid) return
  for (const [username, { slotName }] of anfragen.entries()) {
    io.to(hostSid).emit('rejoinRequest', { roomCode, username, slotName })
  }
}

// Offene Rückkehr-Anfrage entfernen. Liefert den Eintrag oder null, wenn es
// keine (mehr) gab. Mit `notifyHost` erfährt der Host, dass er sie aus seiner
// Liste nehmen kann.
function closePendingRejoin (roomCode, username, { notifyHost = false } = {}) {
  const anfragen = pendingRejoins.get(roomCode)
  const eintrag = anfragen?.get(username)
  if (!eintrag) return null
  anfragen.delete(username)
  if (anfragen.size === 0) pendingRejoins.delete(roomCode)
  if (notifyHost) {
    const hostSid = hostSocketMap.get(roomCode)
    if (hostSid) io.to(hostSid).emit('rejoinRequestClosed', { roomCode, username })
  }
  return eintrag
}

// Ein anderer Socket desselben Nutzers im selben Raum (zweiter Tab oder
// bereits wiederverbundener Client), oder null.
function otherSocketOfUser (username, roomCode, exceptSid) {
  for (const [sid, sInfo] of socketUserMap.entries()) {
    if (sid === exceptSid) continue
    if (sInfo.roomCode === roomCode && sInfo.username === username) return sid
  }
  return null
}

// Ist noch irgendein Socket (außer `exceptSid`) im Raum?
function roomHasSockets (roomCode, exceptSid) {
  for (const [sid, sInfo] of socketUserMap.entries()) {
    if (sid === exceptSid) continue
    if (sInfo.roomCode === roomCode) return true
  }
  return false
}

// Hat der Raum einen verbundenen Host? Der gemerkte Host-Socket muss noch
// existieren und im Raum stehen.
function roomHasConnectedHost (roomCode) {
  const sid = hostSocketMap.get(roomCode)
  if (!sid || !io.sockets.sockets.has(sid)) return false
  return socketUserMap.get(sid)?.roomCode === roomCode
}

// Ist der Slot gerade verbunden, also mindestens ein Mitglied mit einem Socket
// im Raum? `exceptSid` nimmt einen Socket aus, der gerade geht.
function slotHasConnectedMember (slot, roomCode, exceptSid = null) {
  return (slot?.members || []).some((m) => !!otherSocketOfUser(m, roomCode, exceptSid))
}

// Die Bingo-Runde fragt über diesen Haken, ob ein Team gerade bedient werden
// kann (siehe rooms.js, `setSlotConnectedCheck`).
setSlotConnectedCheck((room, slotId) => {
  const slot = (room?.players || []).find((p) => p.slotId === slotId)
  return !!slot && slotHasConnectedMember(slot, room.code)
})

// Läuft der Slot-Bestand gerade wie im laufenden Spiel? Gilt auch für die
// Siegerehrung nach Spielende (`gameOver`): Bis der Host eine neue Runde
// startet oder zur Lobby wechselt, muss die Slot-Liste stehen bleiben, sonst
// passen die Slot-Indizes im Spielstand des Hosts (Weiterleitungen an den
// Host, Verbuchen des Ergebnisses) nicht mehr zu room.players.
function slotsFrozen (room) {
  return !!(room?.gameStarted || room?.gameOver)
}

// ── Bereit-Ablauf „Alle Geräte“ (all-clients) ─────────────────────────────
// Gezählt werden nur Slots mit verbundenem Mitglied. Ein Slot, dessen
// Mitglieder gegangen sind oder die Verbindung verloren haben, hält sonst
// alle anderen auf. `songReadySlots` enthält slotIds (stabil, auch wenn
// sich die Reihenfolge ändert) und entdoppelt wiederholte Meldungen, etwa
// nach einem Reconnect.
function songReadyCounts (room, roomCode, exceptSid = null) {
  const verbunden = (room.players || []).filter((slot) => slotHasConnectedMember(slot, roomCode, exceptSid))
  const bereit = verbunden.filter((slot) => room.songReadySlots?.has(slot.slotId)).length
  return { readyCount: bereit, totalCount: verbunden.length }
}

function clearSongReady (room) {
  if (!room) return
  room.pendingSongUrl = null
  room.songReadySlots = null
}

// Zähler an alle schicken und, wenn alle verbundenen Slots bereit sind, den
// Song freigeben. Aufgerufen nach jeder Bereit-Meldung und immer dann, wenn
// ein Socket den Raum verlässt oder dazukommt.
function updateSongReady (room, roomCode, exceptSid = null) {
  if (!room?.pendingSongUrl || !room.songReadySlots) return
  const { readyCount, totalCount } = songReadyCounts(room, roomCode, exceptSid)
  io.to(roomCode).emit('song:readyUpdate', { readyCount, totalCount })
  if (readyCount >= totalCount) {
    io.to(roomCode).emit('song:openNow', { songUrl: room.pendingSongUrl })
    clearSongReady(room)
  }
}

// ── Rückkehr nach bewusstem Verlassen ─────────────────────────────────────
// Wer ein laufendes Spiel über „Raum verlassen“ verlässt, steht in
// `room.leftMembers` und kommt nur mit einer einmaligen Freigabe
// (`room.rejoinGrants`) zurück: vom Host über host:answerRejoin, oder
// automatisch, wenn gerade kein Host da ist, der freigeben könnte. Ein
// Reconnect nach Netzabbruch oder Neuladen steht nicht in der Liste und
// braucht deshalb keine Freigabe.
function markMemberLeft (room, username) {
  if (!room.leftMembers) room.leftMembers = new Set()
  room.leftMembers.add(username)
}

function grantRejoin (room, username) {
  if (!room.rejoinGrants) room.rejoinGrants = new Set()
  room.rejoinGrants.add(username)
}

function clearRejoinState (room) {
  room.leftMembers = new Set()
  room.rejoinGrants = new Set()
}

// Kein Host mehr da und kein Nachfolger: Niemand kann offene Anfragen
// beantworten. Statt die Anfragenden ewig warten zu lassen, werden alle
// freigegeben; der erste, der beitritt, übernimmt die Host-Rolle (joinRoom).
function autoApproveRejoins (room, roomCode) {
  const anfragen = pendingRejoins.get(roomCode)
  if (!anfragen || anfragen.size === 0) return
  for (const [username, eintrag] of [...anfragen.entries()]) {
    grantRejoin(room, username)
    io.to(eintrag.sid).emit('rejoinAnswer', { roomCode, accepted: true })
    console.log(`Rückkehr von ${username} in Raum ${roomCode} automatisch freigegeben (kein Host verbunden)`)
  }
  pendingRejoins.delete(roomCode)
}

// Nachfolger für die Host-Rolle: erstes Mitglied in Slot-Reihenfolge (alle
// Slots, alle Mitglieder), das gerade verbunden ist. `excludeUsername` und
// `excludeSid` nehmen den scheidenden Host aus. Liefert { username, sid }
// oder null.
function findHostCandidate (room, roomCode, { excludeUsername = null, excludeSid = null } = {}) {
  for (const slot of room.players || []) {
    for (const member of slot.members || []) {
      if (member === excludeUsername) continue
      for (const [sid, sInfo] of socketUserMap.entries()) {
        if (sid === excludeSid) continue
        if (sInfo.roomCode === roomCode && sInfo.username === member) {
          return { username: member, sid }
        }
      }
    }
  }
  return null
}

// Host-Rolle übergeben und den neuen Host direkt informieren, damit er seine
// Oberfläche umschalten kann.
function assignHost (room, roomCode, username, sid) {
  room.hostUsername = username
  room.hostUserId = io.sockets.sockets.get(sid)?.userId || null
  hostSocketMap.set(roomCode, sid)
  io.to(sid).emit('hostAssigned', { roomCode })
  sendPendingRejoinsToHost(roomCode)
}

// roomState an alle Sockets eines Raums. Solange im Bingo Antworten geheim
// sind, bekommt jeder Empfänger seinen eigenen Zuschnitt (nur die Antwort
// des eigenen Teams), sonst geht derselbe Payload an alle. Synchron über den
// Adapter, damit die Reihenfolge zu anderen Events (z. B. cardDrawn) bleibt.
function emitRoomState (roomCode) {
  const state = getRoomBroadcastState(roomCode)
  if (!state) return
  if (!roomStateNeedsViewer(roomCode)) {
    io.to(roomCode).emit('roomState', state)
    return
  }
  const sids = io.sockets.adapter.rooms.get(roomCode)
  if (!sids) return
  for (const sid of sids) {
    const s = io.sockets.sockets.get(sid)
    if (!s) continue
    s.emit('roomState', roomStateForViewer(state, roomCode, s.username))
  }
}

// Raum samt aller zugehörigen Timer und Zuordnungen abräumen.
function cleanupRoom (roomCode) {
  deleteRoom(roomCode)
  hostSocketMap.delete(roomCode)
  pendingRejoins.delete(roomCode)
  const timer = roomCleanupTimers.get(roomCode)
  if (timer) clearTimeout(timer)
  roomCleanupTimers.delete(roomCode)
  for (const [key, timerId] of pendingRemovals.entries()) {
    if (key.endsWith(`:${roomCode}`)) {
      clearTimeout(timerId)
      pendingRemovals.delete(key)
    }
  }
}

// Lobby: Ein getrenntes Mitglied nach 20 Sekunden Karenz aus seinem Slot
// nehmen, wenn es bis dahin nicht zurück ist. Ein noch laufender Timer
// (zweiter Tab, der vorher ging) wird ersetzt, nicht verwaist liegen gelassen.
// Im laufenden Spiel und in der Siegerehrung bleibt der Slot (slotsFrozen).
function scheduleLobbyRemoval (roomCode, username) {
  const removalKey = `${username}:${roomCode}`
  if (pendingRemovals.has(removalKey)) {
    clearTimeout(pendingRemovals.get(removalKey))
  }
  const timerId = setTimeout(() => {
    try {
      pendingRemovals.delete(removalKey)
      const r = getRoom(roomCode)
      if (!r || slotsFrozen(r)) return
      // Inzwischen wieder verbunden (ohne joinRoom, oder joinRoom lief vor
      // diesem disconnect): nicht entfernen.
      if (otherSocketOfUser(username, roomCode, null)) return
      removePlayerFromRoom(roomCode, username)
      console.log(`[Karenz] ${username} aus Raum ${roomCode} entfernt (Timeout)`)
      if (getRoom(roomCode)) {
        emitRoomState(roomCode)
      } else {
        cleanupRoom(roomCode)
      }
    } catch (err) {
      console.error('[Karenz] Fehler beim verzögerten Entfernen:', err)
    }
  }, 20000)
  pendingRemovals.set(removalKey, timerId)
}

// Zurück in der Lobby nach einem Spiel: Seit leaveRoom im laufenden Spiel
// den Slot stehen lässt, bleiben Slots übrig, deren Mitglieder längst weg
// sind. Slots ohne verbundenes Mitglied fallen deshalb sofort heraus.
// Unverbundene Mitglieder eines verbliebenen Teams bekommen die übliche
// Karenz wie bei einem Abbruch in der Lobby. Ist danach weder ein Slot noch
// ein Socket übrig, wird der Raum abgeräumt.
function pruneDisconnectedSlots (room, roomCode) {
  const vorher = room.players || []
  const gewaehlt = room.settings?.startingPlayer
  const gewaehlterSlot = Number.isInteger(gewaehlt) ? vorher[gewaehlt]?.slotId : undefined
  room.players = vorher.filter((slot) => slotHasConnectedMember(slot, roomCode))
  // Der gewählte Startspieler ist ein Index in room.players. Er soll auf
  // denselben Slot zeigen, und ohne ihn wird beim Start ausgelost.
  if (room.players.length !== vorher.length && Number.isInteger(gewaehlt)) {
    const idx = room.players.findIndex((p) => p.slotId === gewaehlterSlot)
    room.settings.startingPlayer = idx >= 0 ? idx : null
  }
  for (const slot of room.players) {
    for (const member of slot.members || []) {
      if (!otherSocketOfUser(member, roomCode, null)) scheduleLobbyRemoval(roomCode, member)
    }
  }
  if (room.players.length === 0 && !roomHasSockets(roomCode, null)) {
    cleanupRoom(roomCode)
  }
}

// Laufendes Spiel ohne verbundene Sockets nach der Karenz löschen. Kommt
// vorher jemand zurück (joinRoom), wird der Timer abgebrochen. Ergebnisse
// sind zu diesem Zeitpunkt schon verbucht (oder nie gemeldet worden), außerhalb
// des Raums geht also nichts verloren.
function scheduleRoomCleanup (roomCode) {
  const alt = roomCleanupTimers.get(roomCode)
  if (alt) clearTimeout(alt)
  const timerId = setTimeout(() => {
    try {
      roomCleanupTimers.delete(roomCode)
      if (!getRoom(roomCode)) return
      if (roomHasSockets(roomCode, null)) return
      cleanupRoom(roomCode)
      console.log(`[Aufräumen] Raum ${roomCode} ohne Verbindungen gelöscht`)
    } catch (err) {
      console.error('[Aufräumen] Fehler beim Löschen des Raums:', err)
    }
  }, ROOM_CLEANUP_MS)
  roomCleanupTimers.set(roomCode, timerId)
}

// Versionen eines Raums fürs Log. Eigene und freigegebene Versionen tragen
// intern nur eine Kennung (custom-…, shared-…), deshalb mit Namen aus
// customVersionsMeta. Im Battle-Modus wählt jeder Slot selbst, dann pro Slot.
function describeVersions (room) {
  const meta = room?.settings?.customVersionsMeta || {}
  const name = (pool) => {
    const label = meta[pool]?.label
    return label ? `${label} (${pool})` : pool
  }
  if (room?.settings?.gameMode === 'battle') {
    const proSlot = (room.players || []).map((p) => `${p.slotName}: ${p.pool ? name(p.pool) : '-'}`)
    return proSlot.length ? proSlot.join(', ') : 'keine'
  }
  const pools = Array.isArray(room?.settings?.songPools) ? room.settings.songPools : []
  return pools.length ? pools.map(name).join(', ') : 'keine'
}

function cancelRoomCleanup (roomCode) {
  const timerId = roomCleanupTimers.get(roomCode)
  if (!timerId) return
  clearTimeout(timerId)
  roomCleanupTimers.delete(roomCode)
}

// ── Grenzen und Aufräumen ─────────────────────────────────────────────────
// Höchstzahl gleichzeitiger Räume auf dem Server (Schutz vor Speicherfluten).
const MAX_ROOMS = 1000

// Räume ohne jede Verbindung: Neben dem Aufräumen laufender Spiele (siehe
// scheduleRoomCleanup) prüft ein Intervall jede Minute alle Räume. Ein Raum,
// in dem seit ROOM_CLEANUP_MS kein Socket mehr steht, wird gelöscht, egal ob
// Lobby oder Spiel. Vorher blieben etwa Lobbys liegen, deren Host gleich
// einen zweiten Raum angelegt hatte, bis zum nächsten Neustart.
const ROOM_SWEEP_MS = 60 * 1000
function sweepEmptyRooms () {
  const jetzt = Date.now()
  for (const room of getAllRooms()) {
    try {
      if (roomHasSockets(room.code, null)) {
        room.emptySince = null
        continue
      }
      if (!room.emptySince) {
        room.emptySince = jetzt
        continue
      }
      if (jetzt - room.emptySince >= ROOM_CLEANUP_MS) {
        cleanupRoom(room.code)
        console.log(`[Aufräumen] Raum ${room.code} seit ${Math.round(ROOM_CLEANUP_MS / 60000)} Minuten ohne Verbindung gelöscht`)
      }
    } catch (err) {
      console.error('[Aufräumen] Fehler beim Prüfen eines Raums:', err)
    }
  }
}
setInterval(sweepEmptyRooms, ROOM_SWEEP_MS).unref()

// Legt ein Nutzer einen neuen Raum an, wird sein vorheriger Raum entfernt,
// wenn dort kein Spiel läuft und außer ihm niemand drin ist. Sonst sammelt
// jeder Klick auf „Raum erstellen" einen verwaisten Raum an. Räume mit
// anderen Mitgliedern oder laufendem Spiel bleiben unangetastet (Rückkehr,
// Failover), die erledigt das Aufräumen ohne Verbindung.
function cleanupOwnIdleRooms (socket) {
  for (const room of getAllRooms()) {
    if (room.createdByUserId !== socket.userId) continue
    if (slotsFrozen(room)) continue
    const fremde = (room.players || []).some((slot) =>
      (slot.members || []).some((m) => m !== socket.username))
    if (fremde) continue
    // Ein anderer Socket desselben Nutzers (zweiter Tab) ist noch dort.
    if (otherSocketOfUser(socket.username, room.code, socket.id)) continue
    try { socket.leave(room.code) } catch { /* war nicht im Raum */ }
    cleanupRoom(room.code)
    console.log(`[Aufräumen] Alten Raum ${room.code} von ${socket.username} entfernt (neuer Raum angelegt)`)
  }
}

// Steht der Nutzer (per Name) noch in einem Raum: in einem Slot, als
// Gegangener eines laufenden Spiels oder mit offener Rückkehr-Anfrage? Die
// Host-Rolle allein zählt nicht, sie ist zusätzlich über die id abgesichert
// (hostUserId, siehe joinRoom).
function userIsInAnyRoom (username) {
  for (const room of getAllRooms()) {
    if ((room.players || []).some((slot) => (slot.members || []).includes(username))) return true
    if (room.leftMembers?.has(username)) return true
    if (pendingRejoins.get(room.code)?.has(username)) return true
  }
  return false
}

// Mitgliedschaft über den Namen, abgesichert über die stabile Nutzer-id: Hat
// der Raum für diesen Namen schon eine id vermerkt, muss sie zum Socket
// passen. Sonst übernähme ein neuer Account mit einem frei gewordenen Namen
// (Umbenennung, gelöschter Account) den Platz eines anderen.
function memberIdentityOk (room, socket) {
  const ids = room?.memberUserIds
  if (!ids || !Object.prototype.hasOwnProperty.call(ids, socket.username)) return true
  // Steht der Name in keinem Slot mehr, ist der Platz frei, und der Vermerk
  // wird beim nächsten Beitritt überschrieben.
  const imSlot = (room.players || []).some((p) => (p.members || []).includes(socket.username))
  if (!imSlot) return true
  return ids[socket.username] === socket.userId
}

function rememberMemberId (room, socket) {
  if (!room.memberUserIds) room.memberUserIds = Object.create(null)
  room.memberUserIds[socket.username] = socket.userId
}

// Slot des Sockets im Raum (per Name, mit Identitätsprüfung) oder undefined.
function mySlotIn (room, socket) {
  if (!memberIdentityOk(room, socket)) return undefined
  return (room?.players || []).find((p) => (p.members || []).includes(socket.username))
}

// ── Spielergebnis: Schutz vor Mehrfach- und Fantasiebuchungen ────────────
// Verbucht wird höchstens einmal pro echtem Spiel. Ein Spiel beginnt mit
// host:startGame oder (nach einem beendeten Spiel) mit host:gameRestarted
// und muss mindestens MIN_GAME_MS gelaufen sein. Damit lässt sich die
// Statistik nicht mehr per Skript im Sekundentakt hochtreiben.
const MIN_GAME_MS = 60 * 1000
// Punkte pro Spieler und Spiel. Herleitung aus den Spielregeln (Client,
// useGameState.js): pro Karte höchstens 4 Punkte (Film-Modus, Titel +
// Künstler + Film + Jahr), am Ende 3 Bonuspunkte für 10 Karten, dazu Punkte,
// die der Host von Hand vergibt. Gedeckelt wird deshalb auf 4 Punkte je
// gezogener Karte plus 3 Bonus plus 20 Punkte Spielraum für Handvergabe,
// insgesamt höchstens MAX_POINTS_PER_GAME (500, siehe auth.js). Ein echtes
// Spiel bis 10 Karten liegt weit darunter.
const POINTS_PER_CARD_MAX = 4
const POINTS_BONUS_MAX = 3
const POINTS_MANUAL_ALLOWANCE = 20
// Handvergabe über host:givePoints: höchstens so viel auf einmal.
const GIVE_POINTS_MAX = 100

function markGameStart (room) {
  room.gameStartedAt = Date.now()
  room.cardsDrawn = 0
  room.resultRecorded = false
}

// Token-Validierung beim Verbindungsaufbau
io.use((socket, next) => {
  const token = socket.handshake.auth?.token
  if (!token) return next(new Error('Kein Token angegeben'))
  const payload = verifyToken(token)
  if (!payload) return next(new Error('Token ungültig oder abgelaufen'))
  const user = resolveTokenUser(payload)
  if (!user) return next(new Error('Nutzer nicht gefunden'))
  // Rooms nutzen den Anzeigenamen als Session-Identität; die stabile id steht
  // zusätzlich bereit (z. B. für account-bezogene Prüfungen).
  socket.userId = user.id
  socket.username = user.username
  next()
})

io.on('connection', (socket) => {
  console.log(`[+] ${socket.username} verbunden (${socket.id})`)

  // ── Raum erstellen ──────────────────────────────────────────────────────────
  socket.on('createRoom', ({ settings } = {}) => {
    try {
      // Vorherigen leeren Raum desselben Nutzers abräumen, dann erst prüfen,
      // ob der Server noch Platz hat.
      cleanupOwnIdleRooms(socket)
      if (getAllRooms().length >= MAX_ROOMS) {
        socket.emit('error', { message: 'Auf dem Server sind gerade zu viele Räume offen. Bitte versuche es später erneut.' })
        return
      }
      const room = createRoom(socket.username, settings || {}, socket.userId)
      socketUserMap.set(socket.id, { username: socket.username, roomCode: room.code })
      hostSocketMap.set(room.code, socket.id)
      socket.join(room.code)
      socket.emit('roomCreated', { roomCode: room.code })
      console.log(
        `Raum ${room.code} von ${socket.username} erstellt` +
        ` (Modus ${room.settings?.gameMode || 'normal'}, Versionen: ${describeVersions(room)})`
      )
    } catch (err) {
      console.error('[createRoom] Fehler:', err)
      socket.emit('error', { message: 'Fehler beim Erstellen des Raums' })
    }
  })

  // ── Raum nachschlagen (ohne beizutreten) ────────────────────────────────────
  socket.on('lookupRoom', ({ roomCode } = {}, callback) => {
    try {
      const code = (roomCode || '').toUpperCase().trim()
      const info = getRoomPublicInfo(code)
      if (!info) {
        if (typeof callback === 'function') callback({ error: `Raum "${code}" nicht gefunden` })
        return
      }
      if (slotsFrozen(getRoom(code))) {
        // Wer im laufenden Spiel noch einen Platz hat (App geschlossen, Tab
        // zu), darf zurück, braucht dafür aber die Freigabe des Hosts
        // (requestRejoin). Alle anderen bleiben draußen. Während der
        // Siegerehrung gilt dasselbe, bis der Host zur Lobby wechselt.
        const meinSlot = mySlotIn(getRoom(code), socket)
        if (!meinSlot) {
          const msg = info.gameStarted
            ? 'Das Spiel in diesem Raum hat bereits begonnen'
            : 'In diesem Raum läuft gerade noch die Siegerehrung. Versuch es gleich noch einmal.'
          if (typeof callback === 'function') callback({ error: msg })
          return
        }
        if (typeof callback === 'function') {
          callback({ ...info, rejoin: true, mySlotId: meinSlot.slotId, mySlotName: meinSlot.slotName })
        }
        return
      }
      if (typeof callback === 'function') callback(info)
    } catch (err) {
      console.error('[lookupRoom] Fehler:', err)
      if (typeof callback === 'function') callback({ error: 'Interner Fehler' })
    }
  })

  // ── Rückkehr in ein laufendes Spiel anfragen ────────────────────────────────
  // Nur für Mitglieder eines Slots. Ist ein Host verbunden, entscheidet er.
  // Ist keiner verbunden (auch wenn der Anfragende selbst der gemerkte Host
  // ist), gibt es niemanden, der freigeben könnte: Die Rückkehr wird dann
  // sofort erlaubt, und der Beitretende übernimmt die Host-Rolle (joinRoom).
  // Den Spielstand holt er sich aus room.gameState im roomState.
  socket.on('requestRejoin', ({ roomCode } = {}, callback) => {
    const antworte = (payload) => { if (typeof callback === 'function') callback(payload) }
    try {
      const code = (roomCode || '').toUpperCase().trim()
      const room = getRoom(code)
      if (!room) return antworte({ error: `Raum "${code}" nicht gefunden` })
      if (!slotsFrozen(room)) return antworte({ error: 'Das Spiel in diesem Raum läuft nicht mehr' })
      const meinSlot = mySlotIn(room, socket)
      if (!meinSlot) return antworte({ error: 'Du hast in diesem Spiel keinen Platz' })
      // Derselbe Nutzer ist schon im Raum (anderer Tab, oder dieser Socket
      // selbst): nichts freizugeben, der Beitritt ist ein normaler Reconnect.
      if (socketUserMap.get(socket.id)?.roomCode === code || otherSocketOfUser(socket.username, code, socket.id)) {
        return antworte({ approved: true })
      }
      if (!roomHasConnectedHost(code)) {
        grantRejoin(room, socket.username)
        closePendingRejoin(code, socket.username)
        console.log(`Rückkehr von ${socket.username} in Raum ${code} automatisch freigegeben (kein Host verbunden)`)
        return antworte({ approved: true })
      }
      let anfragen = pendingRejoins.get(code)
      if (!anfragen) {
        anfragen = new Map()
        pendingRejoins.set(code, anfragen)
      }
      // Eine ältere Anfrage desselben Nutzers (anderer Tab, neu verbunden)
      // wird ersetzt, damit die Antwort an den Socket geht, der wartet.
      anfragen.set(socket.username, { sid: socket.id, slotName: meinSlot.slotName })
      io.to(hostSocketMap.get(code)).emit('rejoinRequest', {
        roomCode: code,
        username: socket.username,
        slotName: meinSlot.slotName
      })
      antworte({ pending: true })
      console.log(`${socket.username} bittet um Rückkehr in Raum ${code}`)
    } catch (err) {
      console.error('[requestRejoin] Fehler:', err)
      antworte({ error: 'Interner Fehler' })
    }
  })

  // ── Rückkehr-Anfrage zurückziehen ───────────────────────────────────────────
  socket.on('cancelRejoin', ({ roomCode } = {}, callback) => {
    try {
      const code = (roomCode || '').toUpperCase().trim()
      closePendingRejoin(code, socket.username, { notifyHost: true })
      if (typeof callback === 'function') callback({ success: true })
    } catch (err) {
      console.error('[cancelRejoin] Fehler:', err)
      if (typeof callback === 'function') callback({ error: 'Interner Fehler' })
    }
  })

  // ── Host: Rückkehr-Anfrage beantworten ──────────────────────────────────────
  // Nur der aktuelle Host-Socket darf antworten. Der Raum kommt aus der
  // Zuordnung des Sockets, nicht aus dem Payload.
  socket.on('host:answerRejoin', ({ username, accept } = {}, callback) => {
    const antworte = (payload) => { if (typeof callback === 'function') callback(payload) }
    try {
      const code = socketUserMap.get(socket.id)?.roomCode
      if (!code || hostSocketMap.get(code) !== socket.id) {
        return antworte({ error: 'Nur der Host kann Anfragen beantworten' })
      }
      const eintrag = closePendingRejoin(code, username)
      if (!eintrag) return antworte({ error: 'Anfrage nicht mehr offen' })
      // Die Freigabe gilt genau einen Beitritt (joinRoom verbraucht sie).
      const room = getRoom(code)
      if (accept && room) grantRejoin(room, username)
      io.to(eintrag.sid).emit('rejoinAnswer', { roomCode: code, accepted: !!accept })
      antworte({ success: true })
      console.log(`Rückkehr von ${username} in Raum ${code} ${accept ? 'freigegeben' : 'abgelehnt'}`)
    } catch (err) {
      console.error('[host:answerRejoin] Fehler:', err)
      antworte({ error: 'Interner Fehler' })
    }
  })

  // ── Raum beitreten ──────────────────────────────────────────────────────────
  // Fehler gehen an den Callback, wenn es einen gibt, sonst als 'error'-Event.
  // Beides zugleich zeigte die Meldung in der App doppelt an.
  socket.on('joinRoom', async ({ roomCode, slotId, slotName } = {}, callback) => {
    const fehler = (msg) => {
      if (typeof callback === 'function') callback({ error: msg })
      else socket.emit('error', { message: msg })
    }
    try {
      const code = (roomCode || '').toUpperCase().trim()
      const room = getRoom(code)
      if (!room) return fehler(`Raum "${code}" nicht gefunden`)
      // Steht der Name im Raum, gehört er aber zu einem anderen Konto (frei
      // gewordener Name), bekommt dieser Socket den Platz nicht.
      if (!memberIdentityOk(room, socket)) {
        return fehler('In diesem Raum ist dein Name schon für ein anderes Konto vergeben.')
      }
      // Laufendes Spiel (oder Siegerehrung): nur wer schon einen Slot hat,
      // kommt hinein (Reconnect nach Neuladen oder Netzabbruch, oder Rückkehr
      // nach Freigabe). Neue Slots kennt der Spielstand des Hosts nicht,
      // deshalb hier abweisen.
      const frozen = slotsFrozen(room)
      const isMember = room.players.some((p) => (p.members || []).includes(socket.username))
      if (frozen && !isMember) {
        return fehler(room.gameStarted
          ? 'Das Spiel in diesem Raum hat bereits begonnen'
          : 'In diesem Raum läuft gerade noch die Siegerehrung. Versuch es gleich noch einmal.')
      }
      // Wer bewusst gegangen ist, braucht für die Rückkehr eine Freigabe
      // (Host oder automatisch, siehe requestRejoin). Ein anderer Socket
      // desselben Nutzers im Raum zählt als „noch da“.
      const leftOnPurpose = frozen && room.leftMembers?.has(socket.username) &&
        !otherSocketOfUser(socket.username, code, socket.id)
      if (leftOnPurpose && !room.rejoinGrants?.has(socket.username)) {
        return fehler('Du hast den Raum verlassen. Tritt über „Zurück ins Spiel“ wieder bei, der Host muss zustimmen.')
      }
      // Die Freigabe gilt einmal. Auch eine ungenutzte (Reconnect ohne
      // vorheriges Verlassen) verfällt, sonst käme der Nutzer nach einem
      // späteren Verlassen ohne neue Zustimmung zurück.
      room.rejoinGrants?.delete(socket.username)
      room.leftMembers?.delete(socket.username)
      // Ausstehende Entfernung abbrechen falls Spieler reconnectet
      const removalKey = `${socket.username}:${code}`
      if (pendingRemovals.has(removalKey)) {
        clearTimeout(pendingRemovals.get(removalKey))
        pendingRemovals.delete(removalKey)
      }
      // Ebenso das Aufräumen eines verwaisten laufenden Spiels.
      cancelRoomCleanup(code)
      // Der Aufrufer hat einen Slot explizit angegeben (slotId=<num> für
      // vorhandenes Team, slotId=null für neuen eigenen Slot). In beiden
      // Fällen soll die Wahl gelten – also aus einem eventuell noch
      // existierenden alten Slot entfernen (damit z.B. „Team verlassen und
      // als eigener Spieler joinen" tatsächlich funktioniert).
      // Im laufenden Spiel gilt die Wahl nicht: Ein Slotwechsel würde den
      // Spieler aus seinem Slot nehmen, den der Spielstand des Hosts kennt.
      // Dort ist jeder Beitritt ein reiner Reconnect.
      const explicitSlotChoice = slotId !== undefined && !frozen
      if (explicitSlotChoice) {
        // Ziel-Team erst prüfen, bevor der alte Slot aufgelöst wird. Sonst
        // stünde der Spieler bei einem verschwundenen Team ohne Platz da.
        if (typeof slotId === 'number' && !room.players.some((p) => p.slotId === slotId)) {
          return fehler(`Beitritt zu Raum "${code}" nicht möglich`)
        }
        const currentSlot = room.players.find((p) => p.members.includes(socket.username))
        const targetIsSame =
          typeof slotId === 'number' && currentSlot && currentSlot.slotId === slotId
        if (currentSlot && !targetIsSame) {
          // `keepRoom`: Ist der Wechselnde das einzige Mitglied, wäre der
          // Raum sonst gelöscht, bevor er im neuen Slot steht.
          removePlayerFromRoom(code, socket.username, { keepRoom: true })
        }
      }
      // Ohne explizite Wahl: reiner Reconnect-Fall – wenn der Nutzer noch
      // in einem Slot ist, dort bleiben, sonst neuen Slot anlegen.
      const alreadyInSlot = room.players.some(p => p.members.includes(socket.username))
      if (!alreadyInSlot) {
        const wunschName = typeof slotName === 'string' && slotName.trim() ? slotName : socket.username
        const slotWahl = typeof slotId === 'number' ? slotId : null
        const added = addPlayerToSlot(code, socket.username, slotWahl, wunschName)
        if (!added) {
          // Nichts hinzugefügt und der Raum ist jetzt leer: wie beim
          // normalen Entfernen abräumen, wenn auch niemand verbunden ist.
          if (room.players.length === 0 && !roomHasSockets(code, null)) cleanupRoom(code)
          return fehler(`Beitritt zu Raum "${code}" nicht möglich`)
        }
      }
      rememberMemberId(room, socket)
      socketUserMap.set(socket.id, { username: socket.username, roomCode: code })
      await socket.join(code)
      // Host-Socket aktualisieren falls der Host beitritt. Hat der Raum gar
      // keinen verbundenen Host (Host hat verlassen, und beim Failover war
      // niemand verbunden), übernimmt der Beitretende die Rolle. Ein gleicher
      // Name mit anderer Nutzer-id ist nicht der Host.
      const istHost = room.hostUsername === socket.username &&
        (!room.hostUserId || room.hostUserId === socket.userId)
      if (istHost) {
        hostSocketMap.set(code, socket.id)
        sendPendingRejoinsToHost(code)
      } else if (!roomHasConnectedHost(code)) {
        assignHost(room, code, socket.username, socket.id)
        console.log(`[Failover] ${socket.username} übernimmt Host in Raum ${code} (kein Host verbunden)`)
      }
      // Ist der Nutzer jetzt drin (etwa per automatischem Reconnect eines
      // anderen Tabs), erübrigt sich eine noch offene Rückkehr-Anfrage.
      closePendingRejoin(code, socket.username, { notifyHost: true })
      emitRoomState(code)
      // Ein wieder verbundener Slot zählt im Bereit-Ablauf wieder mit.
      updateSongReady(room, code)
      if (typeof callback === 'function') callback({ success: true })
      console.log(`${socket.username} ist Raum ${code} beigetreten (Slot: ${alreadyInSlot ? 'reconnect' : (slotId ?? 'neu')})`)
    } catch (err) {
      console.error('[joinRoom] Fehler:', err)
      fehler('Fehler beim Beitreten des Raums')
    }
  })

  // ── Raum verlassen (explizit über den „Raum verlassen"-Button) ─────────
  // Wichtig: entfernt den Spieler SOFORT (nicht erst nach 20-Sek-Karenz),
  // damit ein anschließender Rejoin echte Slot-Wahl anbietet und nicht
  // automatisch wieder ins alte Team führt.
  socket.on('leaveRoom', ({ roomCode } = {}, callback) => {
    try {
      const info = socketUserMap.get(socket.id)
      const code = ((roomCode || info?.roomCode) || '').toUpperCase().trim()
      if (!code) {
        if (typeof callback === 'function') callback({ ok: false })
        return
      }
      // Ausstehende Karenz-Entfernung abbrechen (falls gerade noch aktiv).
      const removalKey = `${socket.username}:${code}`
      if (pendingRemovals.has(removalKey)) {
        clearTimeout(pendingRemovals.get(removalKey))
        pendingRemovals.delete(removalKey)
      }
      // War der Ausscheidende Host? Dann Failover auf den nächsten
      // verbundenen Spieler, mit derselben Suche wie im disconnect-Handler
      // (alle Slots, alle Mitglieder). Ist keiner verbunden, bleibt der Raum
      // ohne Host-Socket, und der nächste Beitretende übernimmt (joinRoom).
      const room = getRoom(code)
      const wasHost = room?.hostUsername === socket.username
      const frozen = slotsFrozen(room)
      // Nur wer mit diesem Socket wirklich im Raum war, ist bewusst gegangen.
      // Ältere Apps schicken leaveRoom auch vorsorglich vor einem Beitritt.
      const warImRaum = info?.roomCode === code
      // Socket zuerst aus dem Raum nehmen, damit alle folgenden Prüfungen
      // (Host-Nachfolger, Bereit-Ablauf, Bingo) ihn nicht mehr mitzählen.
      try {
        socket.leave(code)
      } catch (err) {
        // Bereits verlassen / kein aktives Room-Mitglied -> ignorieren.
        void err
      }
      if (warImRaum) {
        socketUserMap.set(socket.id, { username: socket.username, roomCode: '' })
      }
      // Im laufenden Spiel bleibt der Slot stehen: Der Spielstand des Hosts
      // kennt ihn, und wer geht, soll per Raumcode zurückkommen können (mit
      // Freigabe des Hosts, siehe requestRejoin). Gelöscht hat ihn vorher
      // nicht nur der Knopf „Raum verlassen“, sondern auch der Beitritt einer
      // älteren App, die vor jedem Beitritt als neuer Spieler erst
      // leaveRoom schickt. Vor dem Spielstart wird der Slot wie bisher
      // sofort aufgelöst, damit ein neuer Beitritt echte Slot-Wahl hat.
      // Dasselbe gilt während der Siegerehrung (siehe slotsFrozen).
      if (!frozen) {
        removePlayerFromRoom(code, socket.username)
      } else if (room && warImRaum && !otherSocketOfUser(socket.username, code, socket.id)) {
        // Bewusst gegangen: Die Rückkehr braucht eine Freigabe (joinRoom).
        markMemberLeft(room, socket.username)
      }
      const stillExists = getRoom(code)
      if (stillExists) {
        // War der Ausscheidende Host? Dann Failover auf den nächsten
        // verbundenen Spieler, mit derselben Suche wie im disconnect-Handler
        // (alle Slots, alle Mitglieder). Ist keiner verbunden, bleibt der Raum
        // ohne Host-Socket, und der nächste Beitretende übernimmt (joinRoom).
        // Offene Rückkehr-Anfragen kann dann niemand beantworten, sie werden
        // freigegeben.
        if (wasHost) {
          const kandidat = findHostCandidate(stillExists, code, {
            excludeUsername: socket.username,
            excludeSid: socket.id
          })
          if (kandidat) {
            assignHost(stillExists, code, kandidat.username, kandidat.sid)
          } else {
            hostSocketMap.delete(code)
            autoApproveRejoins(stillExists, code)
          }
        }
        if (frozen) {
          // Auf diesen Slot wartet niemand mehr, wenn er jetzt unverbunden ist.
          updateSongReady(stillExists, code, socket.id)
          advanceStalledBingoRound(stillExists)
        }
        emitRoomState(code)
        // Letzter verbundener Spieler eines laufenden Spiels: aufräumen planen.
        if (frozen && !roomHasSockets(code, socket.id)) {
          scheduleRoomCleanup(code)
        }
      } else {
        cleanupRoom(code)
      }
      if (typeof callback === 'function') callback({ ok: true })
      console.log(`${socket.username} hat Raum ${code} verlassen (explizit)`)
    } catch (err) {
      console.error('[leaveRoom] Fehler:', err)
      if (typeof callback === 'function') callback({ ok: false })
    }
  })

  // ── Host: Spiel starten ────────────────────────────────────────────────────
  socket.on('host:startGame', () => {
    try {
      const info = socketUserMap.get(socket.id)
      if (!info) return
      const room = getRoom(info.roomCode)
      if (!room) return
      if (room.hostUsername !== socket.username) {
        socket.emit('error', { message: 'Nur der Host kann das Spiel starten' })
        return
      }
      // Doppelklick auf „Starten“: Der zweite Aufruf würde neu auslosen, und
      // die Clients sähen zwei verschiedene Startspieler.
      if (room.gameStarted) return
      // Im Battle-Modus: alle Slots muessen eine Version gewaehlt haben
      // und keine Version doppelt vorkommen.
      if (room.settings?.gameMode === 'battle') {
        const slotsWithoutPool = room.players.filter((p) => !p.pool)
        if (room.players.length === 0 || slotsWithoutPool.length > 0) {
          socket.emit('error', {
            message: 'Im Battle-Modus muss jeder Spieler seine Version gewählt haben, bevor das Spiel starten kann.'
          })
          return
        }
        const pools = room.players.map((p) => p.pool)
        if (new Set(pools).size !== pools.length) {
          socket.emit('error', {
            message: 'Zwei Spieler haben dieselbe Version gewählt. Bitte anpassen.'
          })
          return
        }
      }
      if (room.settings?.gameMode === 'bingo') {
        // Karten pro Team einmalig generieren, damit alle Clients dieselben
        // Karten kennen. Ab jetzt ist der Server autoritativ.
        initBingoState(room)
      }
      // Startspieler festlegen. Hat der Host keinen gewaehlt, wird hier
      // ausgelost – und zwar genau einmal auf dem Server, damit alle Clients
      // denselben Gewinner animieren und niemand ein anderes Ergebnis sieht.
      const anzahlSlots = room.players.length
      const gewaehlt = room.settings?.startingPlayer
      const istGueltig = Number.isInteger(gewaehlt) && gewaehlt >= 0 && gewaehlt < anzahlSlots
      const ausgelost = !istGueltig
      room.startingPlayer = istGueltig
        ? gewaehlt
        : (anzahlSlots > 0 ? Math.floor(Math.random() * anzahlSlots) : 0)
      room.startingPlayerWasRandom = ausgelost

      room.gameStarted = true
      room.gameOver = false
      // Neues Spiel: kein offener Bereit-Ablauf, keine Rückkehr-Vermerke aus
      // einer Vorrunde.
      clearSongReady(room)
      clearRejoinState(room)
      // Für Statistiken: Beginn dieses Spiels merken, Ergebnis-Guard und
      // Kartenzähler zurücksetzen (siehe host:recordGameResult).
      markGameStart(room)
      // Spielstand der Vorrunde verwerfen. Sonst übernähme ein neu geladener
      // Host oder ein Nachfolger beim Failover vor dem ersten Sync den alten.
      room.gameState = null
      // WICHTIG: broadcastState verwenden – enthält memberAvatars, damit
      // Game.vue die Profilbilder der Mitspieler beim Start hat. Der rohe
      // getRoom()-Payload hätte kein memberAvatars → Avatar-Fallback-Icon.
      io.to(info.roomCode).emit('gameStarted', {
        ...getRoomBroadcastState(info.roomCode),
        startingPlayer: room.startingPlayer,
        startingPlayerWasRandom: room.startingPlayerWasRandom
      })
      emitRoomState(info.roomCode)
      console.log(
        `Spiel in Raum ${info.roomCode} gestartet, Startspieler ${room.startingPlayer}` +
        `${room.startingPlayerWasRandom ? ' (ausgelost)' : ' (vom Host gewaehlt)'}` +
        `, Modus ${room.settings?.gameMode || 'normal'}, Versionen: ${describeVersions(room)}`
      )
    } catch (err) {
      console.error('[host:startGame] Fehler:', err)
    }
  })

  // ── Host: Karte gezogen – Song-URL an alle broadcasten ────────────────────
  socket.on('host:cardDrawn', ({ songUrl, cardData } = {}) => {
    try {
      const info = socketUserMap.get(socket.id)
      if (!info) return
      const room = getRoom(info.roomCode)
      if (!room || room.hostUsername !== socket.username) {
        socket.emit('error', { message: 'Nur der Host kann eine Karte ziehen' })
        return
      }
      // Der Link wird bei allen Gästen geöffnet. Nur gültige Spotify-Links
      // gehen weiter, alles andere (etwa javascript:) bleibt beim Host.
      if (!isValidSongUrl(songUrl)) {
        socket.emit('error', { message: 'Der Song-Link dieser Karte ist ungültig und wurde nicht an die Mitspieler geschickt.' })
        return
      }
      room.cardsDrawn = (room.cardsDrawn || 0) + 1
      const karte = sanitizeCardData(cardData)
      if (room.audioMode === 'all-clients') {
        // Ready-Tracking initialisieren. Gezählt werden nur verbundene Slots.
        room.pendingSongUrl = songUrl
        room.songReadySlots = new Set()
        io.to(info.roomCode).emit('cardDrawn', {
          songUrl,
          cardData: karte,
          audioMode: room.audioMode,
          waitForReady: true,
          totalPlayers: songReadyCounts(room, info.roomCode).totalCount
        })
      } else {
        // Ein Rest aus einer früheren Karte im Modus „Alle Geräte“ darf
        // nicht stehen bleiben, sonst meldet der roomState weiter einen
        // offenen Bereit-Ablauf.
        clearSongReady(room)
        io.to(info.roomCode).emit('cardDrawn', {
          songUrl,
          cardData: karte,
          audioMode: room.audioMode
        })
      }
    } catch (err) {
      console.error('[host:cardDrawn] Fehler:', err)
    }
  })

  // ── Spieler: Song-Bereitschaft bestätigen (all-clients) ───────────────────
  socket.on('player:songReady', () => {
    try {
      const info = socketUserMap.get(socket.id)
      if (!info) return
      const room = getRoom(info.roomCode)
      if (!room || !room.pendingSongUrl || !room.songReadySlots) return

      const slot = room.players.find(p => p.members.includes(socket.username))
      if (!slot) return

      // Set entdoppelt: Ein Client schickt seine Bestätigung nach einem
      // Reconnect erneut.
      room.songReadySlots.add(slot.slotId)
      updateSongReady(room, info.roomCode)
    } catch (err) {
      console.error('[player:songReady] Fehler:', err)
    }
  })

  // ── Host: Spielstand an alle Gäste senden ─────────────────────────────────
  socket.on('host:syncState', ({ gameState } = {}) => {
    try {
      const info = socketUserMap.get(socket.id)
      if (!info) return
      const room = getRoom(info.roomCode)
      if (!room || room.hostUsername !== socket.username) return
      if (!gameState || typeof gameState !== 'object') return
      // Song-Links im Spielstand gehen an alle Gäste, ungültige werden zu null.
      scrubSongUrls(gameState)
      room.gameState = gameState
      // Bingo: Titel/Künstler/Jahr der gezogenen Karte bis zur Auflösung
      // nicht an die Gäste geben (siehe sanitizeGameStateForGuests).
      socket.to(info.roomCode).emit('stateUpdate', {
        gameState: sanitizeGameStateForGuests(room, gameState)
      })
    } catch (err) {
      console.error('[host:syncState] Fehler:', err)
    }
  })

  // ── Gast: aktuellen State vom Server anfordern ─────────────────────────
  // Zusätzlich zum Spielstand bekommt der Anfragende den Stand des Bereit-
  // Ablaufs (all-clients), auch ohne Spielstand. Sonst hängt ein Gast, der
  // nach `cardDrawn` neu lädt, ohne Song und ohne Bereit-Knopf da.
  socket.on('guest:requestSync', () => {
    try {
      const info = socketUserMap.get(socket.id)
      if (!info) return
      const room = getRoom(info.roomCode)
      if (!room) return
      socket.emit('songReady:state', {
        pending: !!room.pendingSongUrl,
        songUrl: room.pendingSongUrl || null
      })
      if (!room.gameState) return
      socket.emit('stateUpdate', { gameState: sanitizeGameStateForGuests(room, room.gameState) })
    } catch (err) {
      console.error('[guest:requestSync] Fehler:', err)
    }
  })

  // ── Host: Audio-Modus ändern ───────────────────────────────────────────────
  socket.on('host:setAudioMode', ({ audioMode } = {}) => {
    try {
      const info = socketUserMap.get(socket.id)
      if (!info) return
      const room = getRoom(info.roomCode)
      if (!room || room.hostUsername !== socket.username) return
      if (!['host-only', 'all-clients'].includes(audioMode)) return
      room.audioMode = audioMode
      // Ein offener Bereit-Ablauf gehört zum alten Modus.
      clearSongReady(room)
      emitRoomState(info.roomCode)
      console.log(`Audio-Modus in Raum ${info.roomCode} auf "${audioMode}" geändert`)
    } catch (err) {
      console.error('[host:setAudioMode] Fehler:', err)
    }
  })

  // ── Host: Startspieler festlegen ─────────────────────────────────────────
  // `null` bedeutet ausdruecklich "beim Start auslosen". Ein Index zeigt auf
  // einen Slot in room.players.
  socket.on('host:setStartingPlayer', ({ startingPlayer } = {}) => {
    try {
      const info = socketUserMap.get(socket.id)
      if (!info) return
      const room = getRoom(info.roomCode)
      if (!room || room.hostUsername !== socket.username) return
      if (room.gameStarted) return
      if (startingPlayer === null || startingPlayer === undefined) {
        room.settings.startingPlayer = null
      } else {
        const idx = Number(startingPlayer)
        if (!Number.isInteger(idx) || idx < 0 || idx >= room.players.length) return
        room.settings.startingPlayer = idx
      }
      emitRoomState(info.roomCode)
    } catch (err) {
      console.error('[host:setStartingPlayer] Fehler:', err)
    }
  })

  // ── Host: Spielmodus in der Lobby wechseln ───────────────────────────────
  // Nur erlaubt bevor das Spiel startet; danach wäre ein Wechsel unsauber
  // (Timelines/Bingo-Karten sind nicht kompatibel). Beim Wechsel in den
  // Bingo-Modus werden die Bingo-Settings mit übernommen; beim Wechsel weg
  // von Bingo werden alte Bingo-Daten aus dem State entfernt.
  socket.on('host:setGameMode', ({ gameMode, bingoSettings } = {}) => {
    try {
      const info = socketUserMap.get(socket.id)
      if (!info) return
      const room = getRoom(info.roomCode)
      if (!room || room.hostUsername !== socket.username) return
      if (room.gameStarted) {
        socket.emit('error', { message: 'Der Spielmodus kann nach dem Start nicht mehr geändert werden.' })
        return
      }
      const normalized = normalizeGameMode(gameMode)
      const prev = room.settings?.gameMode || 'normal'
      room.settings = { ...room.settings, gameMode: normalized }
      // Bingo-Settings: entweder aus dem Payload übernehmen oder Defaults setzen.
      if (normalized === 'bingo') {
        Object.assign(
          room.settings,
          normalizeBingoSettings(bingoSettings || room.settings || {})
        )
      } else {
        // Bingo-Runtime-State bei Modus-Wechsel weg von Bingo verwerfen.
        delete room.bingoState
      }
      // Battle-Wechsel: bereits gewählte Pools bleiben ungültig (jeder Slot
      // hat einen eigenen Pool). Pool pro Slot bleibt erhalten – wird beim
      // erneuten Battle-Start ohnehin gebraucht. Wechsel weg von Battle:
      // slot.pool-Werte kommen im Spiel nicht mehr zum Tragen.
      if (normalized === 'film') {
        // Film: nur die Soundtracks-Edition ist zulässig – Auswahl fixieren.
        room.settings.songPools = ['deutschland-soundtracks-expansion']
      } else if (prev === 'film' && Array.isArray(room.settings.songPools)) {
        // Vom Film weg: gefilterte Auswahl behalten, keine Zwangsänderung.
      }
      // Defensiv: alle Gäste explizit zurück in die Lobby schieben, falls
      // sie aus einer vorherigen Runde noch in /game hängen (verpasstes
      // returnToLobby, Race Condition beim Route-Wechsel, …). Ohne das
      // konnten Gäste beim Neustart im ALTEN Modus bleiben, obwohl der
      // Host mittlerweile einen anderen ausgewählt hatte.
      socket.to(info.roomCode).emit('returnToLobby', { roomCode: info.roomCode })
      emitRoomState(info.roomCode)
      console.log(`Spielmodus in Raum ${info.roomCode} geändert: ${prev} → ${normalized}`)
    } catch (err) {
      console.error('[host:setGameMode] Fehler:', err)
    }
  })

  // ── Host: Bingo-Settings in der Lobby anpassen (Schwierigkeit, Timer,
  //         Anzahl zum Sieg). Nur relevant im Bingo-Modus und vor Spielstart.
  socket.on('host:setBingoSettings', ({ bingoDifficulty, bingoTimerMode, bingoTimerSeconds, bingosToWin } = {}) => {
    try {
      const info = socketUserMap.get(socket.id)
      if (!info) return
      const room = getRoom(info.roomCode)
      if (!room || room.hostUsername !== socket.username) return
      if (room.settings?.gameMode !== 'bingo') return
      if (room.gameStarted) return
      const merged = normalizeBingoSettings({
        bingoDifficulty: bingoDifficulty ?? room.settings.bingoDifficulty,
        bingoTimerMode: bingoTimerMode ?? room.settings.bingoTimerMode,
        bingoTimerSeconds: bingoTimerSeconds ?? room.settings.bingoTimerSeconds,
        bingosToWin: bingosToWin ?? room.settings.bingosToWin,
      })
      room.settings = { ...room.settings, ...merged }
      emitRoomState(info.roomCode)
    } catch (err) {
      console.error('[host:setBingoSettings] Fehler:', err)
    }
  })

  // ── Host: Song-Pools ändern ────────────────────────────────────────────────
  socket.on('host:setSongPools', ({ songPools, versionsMeta } = {}) => {
    try {
      const info = socketUserMap.get(socket.id)
      if (!info) return
      const room = getRoom(info.roomCode)
      if (!room || room.hostUsername !== socket.username) return
      // Im Battle-Modus waehlt jeder Spieler seine eigene Version -> geteilte
      // Pool-Liste nicht relevant.
      if (room.settings?.gameMode === 'battle') return
      // Nur gültige Kennungen, höchstens MAX_SONG_POOLS. Bleibt nichts übrig,
      // gilt die Anfrage als leer und wird ignoriert.
      const pools = sanitizePoolList(songPools, MAX_SONG_POOLS)
      if (pools.length === 0) return
      // Metadaten (Label/Cover) eigener/eingeschraenkter Versionen mitteilen,
      // damit alle Clients sie anzeigen koennen. Gemerkt werden nur Einträge
      // für gewählte Versionen, geprüft wie beim Anlegen des Raums.
      room.settings = { ...room.settings, songPools: pools }
      room.settings.customVersionsMeta = mergeVersionsMeta(room, versionsMeta, pools)
      emitRoomState(info.roomCode)
      console.log(`Song-Pools in Raum ${info.roomCode} geändert: ${describeVersions(room)}`)
    } catch (err) {
      console.error('[host:setSongPools] Fehler:', err)
    }
  })

  // ── Spieler: eigene Battle-Version waehlen ─────────────────────────────────
  socket.on('player:setSlotPool', ({ pool, versionMeta } = {}) => {
    try {
      const info = socketUserMap.get(socket.id)
      if (!info) return
      const room = getRoom(info.roomCode)
      if (!room) return
      if (room.settings?.gameMode !== 'battle') return
      const result = setSlotPool(info.roomCode, socket.username, pool)
      if (!result.ok) {
        socket.emit('error', { message: result.reason })
        return
      }
      // Metadaten der eigenen (custom/eingeschraenkten) Battle-Version teilen,
      // damit Host/Mitspieler Label/Cover anzeigen koennen.
      const gewaehlt = (room.players || []).find((p) => (p.members || []).includes(socket.username))?.pool
      room.settings = {
        ...room.settings,
        customVersionsMeta: mergeVersionsMeta(
          room,
          versionMeta && typeof versionMeta === 'object' && gewaehlt ? { [gewaehlt]: versionMeta } : null,
          gewaehlt ? [gewaehlt] : []
        )
      }
      emitRoomState(info.roomCode)
      console.log(`Battle-Pool in Raum ${info.roomCode} von ${socket.username} auf "${text(pool, 100)}" gesetzt`)
    } catch (err) {
      console.error('[player:setSlotPool] Fehler:', err)
    }
  })

  // ── Host: Punkte vergeben/entziehen ───────────────────────────────────────
  socket.on('host:givePoints', ({ slotId, delta } = {}) => {
    try {
      const info = socketUserMap.get(socket.id)
      if (!info) return
      const room = getRoom(info.roomCode)
      if (!room || room.hostUsername !== socket.username) return
      // Nur ganze Zahlen in einem vernünftigen Rahmen. NaN, Infinity oder
      // riesige Werte hätten den Punktestand dauerhaft unbrauchbar gemacht.
      const d = Number(delta)
      if (!Number.isInteger(d) || Math.abs(d) > GIVE_POINTS_MAX) return
      const slot = room.players.find(p => p.slotId === slotId)
      if (slot) {
        slot.score = Math.max(0, Math.min(100000, (slot.score || 0) + d))
        emitRoomState(info.roomCode)
      }
    } catch (err) {
      console.error('[host:givePoints] Fehler:', err)
    }
  })

  // ── Host: Einwand hinzufügen ───────────────────────────────────────────────
  socket.on('host:addObjection', ({ slotId } = {}) => {
    try {
      const info = socketUserMap.get(socket.id)
      if (!info) return
      const room = getRoom(info.roomCode)
      if (!room || room.hostUsername !== socket.username) return
      const slot = room.players.find(p => p.slotId === slotId)
      if (slot) {
        slot.objections = (slot.objections || 0) + 1
        emitRoomState(info.roomCode)
      }
    } catch (err) {
      console.error('[host:addObjection] Fehler:', err)
    }
  })

  // Helper: Leitet ein Gast-Event an den Host weiter oder sendet Fehler an den Gast.
  // `fromSlotIndex` ist der Slot des Absenders laut Server (nicht vom Client
  // behauptet). Wer in keinem Slot steht (Zuschauer, schon entfernt), darf
  // keine Spielaktionen auslösen. Ob der Slot gerade am Zug ist, prüft der Host.
  const forwardToHost = (eventName, socket, extraData = {}) => {
    const info = socketUserMap.get(socket.id)
    if (!info) return
    const room = getRoom(info.roomCode)
    if (!room || room.hostUsername === socket.username) return
    const fromSlotIndex = room.players.findIndex((p) => (p.members || []).includes(socket.username))
    if (fromSlotIndex === -1) return
    const hostSocketId = hostSocketMap.get(info.roomCode)
    if (hostSocketId) {
      io.to(hostSocketId).emit(eventName, { ...extraData, fromUsername: socket.username, fromSlotIndex })
    } else {
      socket.emit('error', { message: 'Der Host ist gerade nicht verbunden, die Aktion ging nicht durch.' })
    }
  }

  // ── Gast: Karte ziehen (leitet an Host weiter) ────────────────────────────
  socket.on('guest:drawCard', () => {
    try {
      forwardToHost('guest:drawCard', socket)
    } catch (err) {
      console.error('[guest:drawCard] Fehler:', err)
    }
  })

  // ── Gast: Karte platzieren (leitet an Host weiter) ────────────────────────
  socket.on('guest:placeCard', ({ playerIndex, position } = {}) => {
    try {
      forwardToHost('guest:placeCard', socket, { playerIndex, position })
    } catch (err) {
      console.error('[guest:placeCard] Fehler:', err)
    }
  })

  // ── Gast: Skip anfragen (leitet an Host weiter) ───────────────────────────
  socket.on('guest:skipRequest', () => {
    try {
      forwardToHost('guest:skipRequest', socket)
    } catch (err) {
      console.error('[guest:skipRequest] Fehler:', err)
    }
  })

  // ── Host: Skip bestätigt (broadcastet an alle Gäste) ─────────────────────
  socket.on('host:confirmSkip', () => {
    try {
      const info = socketUserMap.get(socket.id)
      if (!info) return
      const room = getRoom(info.roomCode)
      if (!room || room.hostUsername !== socket.username) return
      // Laufendes Song-Ready abbrechen
      room.pendingSongUrl = null
      room.songReadySlots = null
      socket.to(info.roomCode).emit('host:confirmSkip')
    } catch (err) {
      console.error('[host:confirmSkip] Fehler:', err)
    }
  })

  // ── Host: Live-Tipp-Sync (Rateeingabe in Echtzeit an Gäste) ──────────────
  socket.on('host:guessInputSync', ({ title, artist, year, movie } = {}) => {
    try {
      const info = socketUserMap.get(socket.id)
      if (!info) return
      const room = getRoom(info.roomCode)
      if (!room || room.hostUsername !== socket.username) return
      socket.to(info.roomCode).emit('host:guessInputSync', { title, artist, year, movie })
    } catch (err) {
      console.error('[host:guessInputSync] Fehler:', err)
    }
  })

  // ── Gast: Live-Tipp-Sync – an Host UND alle anderen Gäste broadcasten,
  //         damit z. B. im Film-Modus alle sehen, was der aktive Rater
  //         gerade eintippt (nicht nur der Host). Payload enthält den
  //         Absender, damit Clients Eigen-Echos ausfiltern können.
  socket.on('guest:guessInputSync', ({ title, artist, year, movie } = {}) => {
    try {
      const info = socketUserMap.get(socket.id)
      if (!info) return
      const room = getRoom(info.roomCode)
      if (!room) return
      // Gast darf nur senden, wenn er nicht der Host ist – Host nutzt
      // host:guessInputSync (siehe oben).
      if (room.hostUsername === socket.username) return
      socket.to(info.roomCode).emit('guest:guessInputSync', {
        fromUsername: socket.username,
        title,
        artist,
        year,
        movie,
      })
    } catch (err) {
      console.error('[guest:guessInputSync] Fehler:', err)
    }
  })

  // ── Gast: Rateeingabe an Host senden ─────────────────────────────────────
  // `movie` gehört dazu: Ohne ihn bekämen Gäste im Film-Modus nie Filmpunkte.
  socket.on('guest:submitGuess', ({ title, artist, year, movie } = {}) => {
    try {
      forwardToHost('guest:submitGuess', socket, { title, artist, year, movie })
    } catch (err) {
      console.error('[guest:submitGuess] Fehler:', err)
    }
  })

  // ── Gast: Einwand beginnen (leitet an Host weiter) ────────────────────────
  socket.on('guest:beginObjection', ({ playerIndex } = {}) => {
    try {
      forwardToHost('guest:beginObjection', socket, { playerIndex })
    } catch (err) {
      console.error('[guest:beginObjection] Fehler:', err)
    }
  })

  // ── Gast: Einwand-Opt-in umschalten (leitet an Host weiter) ───────────────
  socket.on('guest:toggleObjectionOptIn', ({ playerIndex } = {}) => {
    try {
      forwardToHost('guest:toggleObjectionOptIn', socket, { playerIndex })
    } catch (err) {
      console.error('[guest:toggleObjectionOptIn] Fehler:', err)
    }
  })

  // ── Gast: Neu einordnen (cancelGuessAndReplace) ───────────────────────────
  socket.on('guest:cancelGuessAndReplace', () => {
    try {
      forwardToHost('guest:cancelGuessAndReplace', socket)
    } catch (err) {
      console.error('[guest:cancelGuessAndReplace] Fehler:', err)
    }
  })

  // ── Host: Spiel beendet – gameStarted zurücksetzen ────────────────────────
  // Auf dem Siegerbildschirm ist das Spiel nicht mehr „gestartet“, die Slots
  // bleiben aber fest (`gameOver`, siehe slotsFrozen): Beitritte, Verlassen
  // und Verbindungsabbrüche verändern die Slot-Liste nicht, bis der Host zur
  // Lobby wechselt oder eine neue Runde startet. Sonst verschöbe sich die
  // Liste, und eine neue Runde mit demselben Spielstand passte nicht mehr.
  socket.on('host:gameEnded', () => {
    try {
      const info = socketUserMap.get(socket.id)
      if (!info) return
      const room = getRoom(info.roomCode)
      if (!room || room.hostUsername !== socket.username) return
      room.gameStarted = false
      room.gameOver = true
      clearSongReady(room)
      emitRoomState(info.roomCode)
    } catch (err) {
      console.error('[host:gameEnded] Fehler:', err)
    }
  })

  // ── Host: Spielergebnis für die Statistik verbuchen (nur Online) ──────────
  // Der Host schickt die End-Punktzahlen pro Slot (Index = Slot-Reihenfolge)
  // und die Sieger-Indizes. Der Server mappt Slot → Mitglieder und erhöht
  // deren Aggregat-Stats. `resultRecorded` verhindert Doppelverbuchung.
  socket.on('host:recordGameResult', ({ scores, winnerIndices } = {}) => {
    try {
      const info = socketUserMap.get(socket.id)
      if (!info) return
      const room = getRoom(info.roomCode)
      if (!room || room.hostUsername !== socket.username) return
      if (room.resultRecorded) return
      // Nur nach einem echten Spielstart, solange das Spiel läuft oder die
      // Siegerehrung steht, und frühestens MIN_GAME_MS nach dem Start bzw.
      // der letzten Verbuchung (Bingo-Korrekturen setzen den Guard zurück).
      if (!room.gameStartedAt || !slotsFrozen(room)) return
      const seit = Math.max(room.gameStartedAt, room.lastResultAt || 0)
      if (Date.now() - seit < MIN_GAME_MS) {
        console.log(`[Statistik] Ergebnis in Raum ${info.roomCode} verworfen (Spiel zu kurz)`)
        return
      }
      const mode = room.settings?.gameMode || 'normal'
      // Bingo: Die Sieger kennt der Server selbst. Ohne Sieger kein Ergebnis.
      const bingoSieger = mode === 'bingo' ? room.bingoState?.winners : null
      if (mode === 'bingo' && !(Array.isArray(bingoSieger) && bingoSieger.length)) return
      room.resultRecorded = true
      room.lastResultAt = Date.now()
      const roomVersions = sanitizePoolList(room.settings?.songPools, MAX_VERSIONS_PER_GAME)
      const winners = new Set(
        mode === 'bingo'
          ? room.players.map((p, i) => (bingoSieger.includes(p.slotId) ? i : -1)).filter((i) => i >= 0)
          : (Array.isArray(winnerIndices) ? winnerIndices.slice(0, room.players.length).map(Number) : [])
      )
      const scoreArr = Array.isArray(scores) ? scores : []
      // Höchstpunktzahl dieses Spiels (Herleitung siehe POINTS_PER_CARD_MAX).
      const punkteGrenze = mode === 'bingo'
        ? 0
        : Math.min(
          MAX_POINTS_PER_GAME,
          (room.cardsDrawn || 0) * POINTS_PER_CARD_MAX + POINTS_BONUS_MAX + POINTS_MANUAL_ALLOWANCE
        )
      const entries = []
      room.players.forEach((slot, index) => {
        const isTeam = (slot.members || []).length > 1
        // Punkte defensiv klemmen (Client ist hier autoritativ, aber ein
        // manipulierter Client soll keine absurden Werte einbuchen können).
        const rawPoints = Math.floor(Number(scoreArr[index]) || 0)
        const points = Math.max(0, Math.min(punkteGrenze, rawPoints))
        const isWinner = winners.has(index)
        // Battle: exakt die Version des Slots. Sonst: alle gewählten Raum-
        // Versionen (gemischter Pool zählt für jede gewählte Version).
        const versions = slot.pool && isPoolId(slot.pool) ? [slot.pool] : roomVersions
        for (const username of slot.members || []) {
          entries.push({ username, mode, versions, points, isWinner, isTeam })
        }
      })
      recordGameResults(entries)
    } catch (err) {
      console.error('[host:recordGameResult] Fehler:', err)
    }
  })

  // ── Host: Alle zur Lobby zurückschicken ───────────────────────────────────
  socket.on('host:returnToLobby', () => {
    try {
      const info = socketUserMap.get(socket.id)
      if (!info) return
      const room = getRoom(info.roomCode)
      if (!room || room.hostUsername !== socket.username) return
      room.gameStarted = false
      room.gameOver = false
      // Zurück in der Lobby gibt es kein laufendes Spiel mehr, das verbucht
      // werden könnte. Erst der nächste Start zählt wieder.
      room.gameStartedAt = null
      clearSongReady(room)
      clearRejoinState(room)
      // Offene Rückkehr-Anfragen haben sich mit dem Spiel erledigt; wer will,
      // tritt der Lobby normal bei.
      for (const username of [...(pendingRejoins.get(info.roomCode)?.keys() || [])]) {
        const eintrag = closePendingRejoin(info.roomCode, username)
        if (eintrag) io.to(eintrag.sid).emit('rejoinAnswer', { roomCode: info.roomCode, accepted: true })
      }
      // Bingo-Modus: bingoState mit-entsorgen, sonst spielt die nächste
      // Runde mit den ALTEN Karten/Marks/Bingo-Counts weiter
      // (`initBingoState` greift early-return, wenn `bingoState` schon
      // existiert). Der Reset via Bingo-Header-Button geht über
      // `resetGameState` → `host:returnToLobby`; ohne diesen Cleanup
      // fühlt sich der Reset für den User „halb" an.
      delete room.bingoState
      socket.to(info.roomCode).emit('returnToLobby', { roomCode: info.roomCode })
      // Slots, die im Spiel nur stehen geblieben sind (Mitglieder gegangen
      // oder getrennt), nicht in die nächste Runde mitnehmen.
      pruneDisconnectedSlots(room, info.roomCode)
      if (getRoom(info.roomCode)) emitRoomState(info.roomCode)
    } catch (err) {
      console.error('[host:returnToLobby] Fehler:', err)
    }
  })

  // ── Host: Spielsieg-Info an Gäste broadcasten ─────────────────────────────
  socket.on('host:syncGameOver', ({ winnerName, headline } = {}) => {
    try {
      const info = socketUserMap.get(socket.id)
      if (!info) return
      const room = getRoom(info.roomCode)
      if (!room || room.hostUsername !== socket.username) return
      socket.to(info.roomCode).emit('syncGameOver', { winnerName, headline })
    } catch (err) {
      console.error('[host:syncGameOver] Fehler:', err)
    }
  })

  // ── Host: Neue Runde gestartet – Gäste informieren ────────────────────────
  socket.on('host:gameRestarted', () => {
    try {
      const info = socketUserMap.get(socket.id)
      if (!info) return
      const room = getRoom(info.roomCode)
      if (!room || room.hostUsername !== socket.username) return
      // Neue Runde (Punkte behalten) ist ein neues Spiel für die Statistik,
      // aber nur nach einem echten Start und wenn die vorige Runde beendet
      // war (Siegerehrung). Ein Neustart mitten im Spiel macht aus derselben
      // Runde kein zweites Spiel. Die Mindestdauer (MIN_GAME_MS) gilt ab hier.
      if (room.gameStartedAt && room.gameOver) markGameStart(room)
      room.gameStarted = true
      room.gameOver = false
      clearSongReady(room)
      socket.to(info.roomCode).emit('gameRestarted')
      emitRoomState(info.roomCode)
    } catch (err) {
      console.error('[host:gameRestarted] Fehler:', err)
    }
  })

  // ─────────────────────────────────────────────────────────────────────────
  //  BINGO-MODUS: Runden-Flow (Host zieht → Kategorie-Reveal → Antwortphase
  //  → Auflösung → Marking → Bonus → Sieg-Check). Der Server ist
  //  autoritativ: alle Zustandsänderungen laufen hier durch und werden per
  //  `roomState` an alle Clients gespiegelt (kompakt, klein genug für die
  //  bestehende Socket-Pipeline).
  // ─────────────────────────────────────────────────────────────────────────

  // Kleine Helfer, um Bingo-Aktionen konsistent abzubinden.
  const bingoAssertHost = () => {
    const info = socketUserMap.get(socket.id)
    if (!info) return null
    const room = getRoom(info.roomCode)
    if (!room || room.settings?.gameMode !== 'bingo') return null
    if (room.hostUsername !== socket.username) {
      socket.emit('error', { message: 'Nur der Host kann diese Aktion ausführen' })
      return null
    }
    ensureAllTeamsHaveCards(room)
    return { room, code: info.roomCode }
  }
  const bingoAssertMember = () => {
    const info = socketUserMap.get(socket.id)
    if (!info) return null
    const room = getRoom(info.roomCode)
    if (!room || room.settings?.gameMode !== 'bingo') return null
    return { room, code: info.roomCode }
  }
  // Pro Empfänger zugeschnitten (Antworten anderer Teams bleiben bis zur
  // Auflösung verborgen), siehe emitRoomState.
  const bingoBroadcast = (code) => {
    emitRoomState(code)
  }

  // Host startet eine neue Bingo-Runde (nachdem er lokal die Karte gezogen
  // hat). Server wählt Kategorie zufällig und schickt sie an alle → Clients
  // spielen die Reveal-Animation ab.
  socket.on('host:bingoStartRound', ({ songLink, songData } = {}) => {
    try {
      const ctx = bingoAssertHost()
      if (!ctx) return
      const result = startBingoRound(ctx.room, { songLink, songData })
      if (!result.ok) {
        // Doppelklick auf „Runde starten": still ignorieren, die laufende
        // Runde bleibt gültig und ein Fehler-Toast würde nur verwirren.
        if (result.busy) return
        socket.emit('error', { message: result.reason || 'Bingo-Runde konnte nicht gestartet werden' })
        return
      }
      bingoBroadcast(ctx.code)
    } catch (err) {
      console.error('[host:bingoStartRound] Fehler:', err)
    }
  })

  // Host: Reveal-Animation abgeschlossen → Antwortphase öffnen und Song
  // starten. Der Song wird über den bestehenden `cardDrawn`-Kanal
  // verteilt (Audio-Modus wie in anderen MP-Modi). Anders als dort ohne
  // `cardData`: Titel/Künstler/Jahr wären die Lösung der laufenden Runde.
  // Die Songdaten kommen nach der Auflösung über `roomState`.
  socket.on('host:bingoOpenAnswering', ({ songUrl } = {}) => {
    try {
      const ctx = bingoAssertHost()
      if (!ctx) return
      const opened = openBingoAnswering(ctx.room)
      if (!opened.ok) {
        socket.emit('error', { message: opened.reason || 'Antwortphase konnte nicht geöffnet werden' })
        return
      }
      // Song wie in anderen MP-Modi verteilen (Popup-Timing kommt vom Client).
      // Ungültige Links gehen nicht an die Mitspieler, die Runde läuft ohne
      // Song weiter.
      if (songUrl && !isValidSongUrl(songUrl)) {
        socket.emit('error', { message: 'Der Song-Link dieser Karte ist ungültig und wurde nicht an die Mitspieler geschickt.' })
      } else if (songUrl) {
        ctx.room.cardsDrawn = (ctx.room.cardsDrawn || 0) + 1
        if (ctx.room.audioMode === 'all-clients') {
          ctx.room.pendingSongUrl = songUrl
          ctx.room.songReadySlots = new Set()
          io.to(ctx.code).emit('cardDrawn', {
            songUrl,
            audioMode: ctx.room.audioMode,
            waitForReady: true,
            totalPlayers: songReadyCounts(ctx.room, ctx.code).totalCount
          })
        } else {
          clearSongReady(ctx.room)
          io.to(ctx.code).emit('cardDrawn', {
            songUrl,
            audioMode: ctx.room.audioMode
          })
        }
      }
      bingoBroadcast(ctx.code)
    } catch (err) {
      console.error('[host:bingoOpenAnswering] Fehler:', err)
    }
  })

  // Team-Mitglied setzt die Antwort seines Teams (synced per Team).
  socket.on('team:bingoAnswer', ({ value } = {}) => {
    try {
      const ctx = bingoAssertMember()
      if (!ctx) return
      const result = setBingoTeamAnswer(ctx.room, socket.username, value)
      if (!result.ok) return
      bingoBroadcast(ctx.code)
      // Wait-all: sobald alle Teams geantwortet haben, wird die Runde nicht
      // automatisch aufgelöst – der Host entscheidet („Runde auflösen"). Das
      // vermeidet, dass ein Team nach dem Absenden nicht mehr korrigieren
      // kann, wenn ein anderes Team parallel gerade tippt.
    } catch (err) {
      console.error('[team:bingoAnswer] Fehler:', err)
    }
  })

  // Team gibt seine Antwort ab bzw. nimmt die Abgabe zum Ändern zurück.
  socket.on('team:bingoConfirmAnswer', ({ confirmed, value } = {}) => {
    try {
      const ctx = bingoAssertMember()
      if (!ctx) return
      const result = confirmBingoTeamAnswer(ctx.room, socket.username, !!confirmed, value)
      if (!result.ok) {
        socket.emit('error', { message: result.reason || 'Antwort konnte nicht abgegeben werden' })
        return
      }
      bingoBroadcast(ctx.code)
    } catch (err) {
      console.error('[team:bingoConfirmAnswer] Fehler:', err)
    }
  })

  // Host löst die Runde auf (wait-all) oder nach Ablauf des Timers (Timer-
  // Ende meldet der Host client-seitig, damit die Zeitmessung nicht zwischen
  // Client-Uhr und Server-Uhr divergiert).
  socket.on('host:bingoResolveRound', () => {
    try {
      const ctx = bingoAssertHost()
      if (!ctx) return
      const result = resolveBingoRound(ctx.room)
      if (!result.ok) {
        socket.emit('error', { message: result.reason || 'Runde konnte nicht aufgelöst werden' })
        return
      }
      bingoBroadcast(ctx.code)
    } catch (err) {
      console.error('[host:bingoResolveRound] Fehler:', err)
    }
  })

  // Host klassifiziert den aktuellen Song (Solo oder Gruppe). Nur relevant,
  // wenn die Runden-Kategorie „Solo/Gruppe" war und der Song noch nicht
  // klassifiziert ist.
  socket.on('host:bingoClassifySoloGroup', ({ classification } = {}) => {
    try {
      const ctx = bingoAssertHost()
      if (!ctx) return
      const result = classifyBingoSoloGroup(ctx.room, classification)
      if (!result.ok) {
        socket.emit('error', { message: result.reason || 'Klassifikation fehlgeschlagen' })
        return
      }
      bingoBroadcast(ctx.code)
    } catch (err) {
      console.error('[host:bingoClassifySoloGroup] Fehler:', err)
    }
  })

  // Team markiert ein freies Feld der Kategorie-Farbe.
  socket.on('team:bingoMarkCell', ({ cellIndex } = {}) => {
    try {
      const ctx = bingoAssertMember()
      if (!ctx) return
      const result = markBingoCell(ctx.room, socket.username, cellIndex)
      if (!result.ok) {
        socket.emit('error', { message: result.reason || 'Feld konnte nicht markiert werden' })
        return
      }
      bingoBroadcast(ctx.code)
    } catch (err) {
      console.error('[team:bingoMarkCell] Fehler:', err)
    }
  })

  // Team nutzt (oder überspringt) den ±X-Exakt-Bonus.
  socket.on('team:bingoUseBonus', ({ targetSlotId, cellIndex } = {}) => {
    try {
      const ctx = bingoAssertMember()
      if (!ctx) return
      const result = useBingoBonus(ctx.room, socket.username, targetSlotId, cellIndex)
      if (!result.ok) {
        socket.emit('error', { message: result.reason || 'Bonus konnte nicht angewendet werden' })
        return
      }
      bingoBroadcast(ctx.code)
    } catch (err) {
      console.error('[team:bingoUseBonus] Fehler:', err)
    }
  })

  // Host: Runde skippen (Song übersprungen, kein Auswerten).
  socket.on('host:bingoSkipRound', () => {
    try {
      const ctx = bingoAssertHost()
      if (!ctx) return
      // Mit Sieg-Prüfung: Wer in dieser Runde seine letzte Reihe voll
      // gemacht hat, gewinnt auch beim Überspringen (Phase 'finished').
      skipBingoRound(ctx.room)
      // Song-Ready-Flow zurücksetzen, falls gerade offen.
      clearSongReady(ctx.room)
      socket.to(ctx.code).emit('host:confirmSkip')
      bingoBroadcast(ctx.code)
    } catch (err) {
      console.error('[host:bingoSkipRound] Fehler:', err)
    }
  })

  // Host: nächste Runde vorbereiten (nach Runden-Abschluss).
  socket.on('host:bingoNextRound', () => {
    try {
      const ctx = bingoAssertHost()
      if (!ctx) return
      nextBingoRound(ctx.room)
      bingoBroadcast(ctx.code)
    } catch (err) {
      console.error('[host:bingoNextRound] Fehler:', err)
    }
  })

  // Host-Werkzeug: alle Kreuze zurücksetzen, gezogene Karten (gespielte Songs)
  // behalten.
  socket.on('host:bingoResetMarks', () => {
    try {
      const ctx = bingoAssertHost()
      if (!ctx) return
      const result = resetBingoMarks(ctx.room)
      if (!result.ok) {
        socket.emit('error', { message: result.reason || 'Kreuze konnten nicht zurückgesetzt werden' })
        return
      }
      bingoBroadcast(ctx.code)
    } catch (err) {
      console.error('[host:bingoResetMarks] Fehler:', err)
    }
  })

  // Host-Werkzeug: einzelnes Kreuz eines Teams setzen/entfernen (Korrektur).
  // Führt das gesetzte Kreuz zum Sieg, stehen `winners` und Phase 'finished'
  // schon im Raum; der Broadcast löst dann wie beim regulären Sieg die
  // Siegeinblendung und Verbuchung auf den Clients aus. Nimmt ein entferntes
  // Kreuz den Sieg zurück, ist `winners` wieder null und die Phase
  // 'round-done'.
  socket.on('host:bingoSetCell', ({ slotId, cellIndex, marked } = {}) => {
    try {
      const ctx = bingoAssertHost()
      if (!ctx) return
      const result = hostSetBingoCell(ctx.room, slotId, cellIndex, marked)
      if (!result.ok) {
        socket.emit('error', { message: result.reason || 'Feld konnte nicht geändert werden' })
        return
      }
      // Ein zurückgenommener Sieg: Das Spiel läuft weiter. Stand der Raum
      // schon in der Siegerehrung, gilt er wieder als laufendes Spiel.
      if (result.winnersCleared && ctx.room.gameOver) {
        ctx.room.gameOver = false
        ctx.room.gameStarted = true
      }
      bingoBroadcast(ctx.code)
    } catch (err) {
      console.error('[host:bingoSetCell] Fehler:', err)
    }
  })

  // Host schaltet Timer-Modus in-game um.
  socket.on('host:bingoSetTimerMode', ({ timerMode } = {}) => {
    try {
      const ctx = bingoAssertHost()
      if (!ctx) return
      const result = setBingoTimerMode(ctx.room, timerMode)
      if (!result.ok) {
        socket.emit('error', { message: result.reason || 'Timer-Modus ungültig' })
        return
      }
      bingoBroadcast(ctx.code)
    } catch (err) {
      console.error('[host:bingoSetTimerMode] Fehler:', err)
    }
  })

  // ── Verbindung getrennt ────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    console.log(`[-] ${socket.username} getrennt (${socket.id})`)
    try {
      // Offene Rückkehr-Anfragen dieses Sockets zurückziehen. Der anfragende
      // Socket steht noch nicht im Raum, die Suche über socketUserMap unten
      // findet ihn also nicht.
      for (const [rCode, anfragen] of [...pendingRejoins.entries()]) {
        for (const [username, eintrag] of [...anfragen.entries()]) {
          if (eintrag.sid === socket.id) {
            closePendingRejoin(rCode, username, { notifyHost: true })
          }
        }
      }
    } catch (err) {
      console.error('[disconnect] Fehler beim Zurückziehen von Rückkehr-Anfragen:', err)
    }
    try {
      const info = socketUserMap.get(socket.id)
      // Gleich austragen: Die Prüfungen unten (Bereit-Ablauf, Bingo-Runde)
      // fragen über socketUserMap, welche Slots noch verbunden sind.
      socketUserMap.delete(socket.id)
      if (info?.roomCode) {
        const code = info.roomCode
        // Derselbe Nutzer kann mit einem anderen Socket im Raum sein: zweiter
        // Tab, oder der Client hat sich schon neu verbunden, bevor der alte
        // Socket nach pingTimeout als getrennt gilt. Dann darf weder die Host-
        // Rolle wandern noch die Karenz-Entfernung laufen.
        const andererSocket = otherSocketOfUser(socket.username, code, socket.id)
        const isHost = hostSocketMap.get(code) === socket.id
        if (isHost) {
          hostSocketMap.delete(code)
        }
        const room = getRoom(code)
        if (room) {
          // ── Sofortiger Host-Failover ─────────────────────────────────
          // Wenn der Host geht (Lobby ODER laufendes Spiel), soll der
          // nächste bereits verbundene Spieler unmittelbar Host werden.
          // Sonst hängen alle Gäste in der Warteschleife bzw. das Spiel
          // ist steuerungslos. Reconnect kann später die Rolle wieder
          // korrekt zuordnen (siehe joinRoom -> hostUsername-Check).
          if (isHost && room.hostUsername === socket.username) {
            if (andererSocket) {
              // Host ist noch verbunden, nur über einen anderen Socket.
              hostSocketMap.set(code, andererSocket)
              sendPendingRejoinsToHost(code)
            } else {
              // Nächster in Slot-Reihenfolge, der aktuell verbunden ist.
              const kandidat = findHostCandidate(room, code, {
                excludeUsername: socket.username,
                excludeSid: socket.id
              })
              if (kandidat) {
                assignHost(room, code, kandidat.username, kandidat.sid)
                console.log(`[Failover] Sofortiger Host-Wechsel in Raum ${code}: ${kandidat.username}`)
              } else {
                // Niemand da, der offene Rückkehr-Anfragen beantworten könnte.
                autoApproveRejoins(room, code)
              }
            }
          }
          if (!slotsFrozen(room) && !andererSocket) {
            scheduleLobbyRemoval(code, socket.username)
          }
          if (slotsFrozen(room)) {
            // Auf einen jetzt unverbundenen Slot wartet niemand mehr.
            updateSongReady(room, code, socket.id)
            advanceStalledBingoRound(room)
          }
          // Laufendes Spiel (oder Siegerehrung), in dem jetzt niemand mehr
          // verbunden ist: nach einer Karenz abräumen, sonst bleibt der Raum
          // für immer im Speicher.
          if (slotsFrozen(room) && !roomHasSockets(code, socket.id)) {
            scheduleRoomCleanup(code)
          }
          // In jedem Fall: aktualisierten roomState broadcasten, damit der
          // neue Host-Wechsel bei allen Clients sofort sichtbar ist.
          emitRoomState(code)
        }
      }
      socketUserMap.delete(socket.id)
    } catch (err) {
      console.error('[disconnect] Fehler:', err)
      socketUserMap.delete(socket.id)
    }
  })
})

// ─── Start ─────────────────────────────────────────────────────────────────────
// Bind-Adresse konfigurierbar: hinter einem Reverse-Proxy (Caddy) auf demselben
// Rechner reicht 127.0.0.1, dann ist der rohe HTTP-Port gar nicht erst im LAN
// erreichbar. Ohne HOST: 0.0.0.0 (bisheriges Verhalten, z. B. lokale Netz-Tests).
const HOST = (process.env.HOST || '').trim() || '0.0.0.0'
server.listen(PORT, HOST, () => {
  console.log(`Hitster Multiplayer-Server läuft auf http://${HOST}:${PORT}`)
  console.log(`Drücke Ctrl+C zum Stoppen`)
})
