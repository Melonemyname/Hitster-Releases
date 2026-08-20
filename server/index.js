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
  adminSetUserHidden
} = require('./auth')
const {
  createRoom,
  getRoom,
  addPlayerToSlot,
  removePlayerFromRoom,
  setSlotPool,
  getRoomPublicInfo,
  getRoomBroadcastState,
  initBingoState,
  ensureAllTeamsHaveCards,
  startBingoRound,
  openBingoAnswering,
  setBingoTeamAnswer,
  resolveBingoRound,
  classifyBingoSoloGroup,
  markBingoCell,
  useBingoBonus,
  skipBingoRound,
  nextBingoRound,
  resetBingoMarks,
  hostSetBingoCell,
  setBingoTimerMode,
  normalizeGameMode,
  normalizeBingoSettings,
} = require('./rooms')
const {
  getUserVersions,
  upsertUserVersion,
  deleteUserVersion
} = require('./customVersions')
const restrictedVersions = require('./restrictedVersions')
const { dataPath } = require('./dataDir')

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
// (z. B. "https://hitster.example.com,https://hitster.no-ip.org").
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
  message: { error: 'rate_limited', message: 'Zu viele Anfragen – bitte spaeter erneut versuchen.' }
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
app.put('/api/versions/:id', authMiddleware, (req, res) => {
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
app.delete('/api/versions/:id', authMiddleware, (req, res) => {
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
app.post('/api/my/restricted-versions', authMiddleware, (req, res) => {
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
app.put('/api/my/restricted-versions/:id', authMiddleware, (req, res) => {
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
app.patch('/api/my/restricted-versions/:id/access', authMiddleware, (req, res) => {
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
app.delete('/api/my/restricted-versions/:id', authMiddleware, (req, res) => {
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
  no_security_question: [404, 'Für diesen Account ist keine Sicherheitsfrage hinterlegt'],
  answer_wrong: [403, 'Antwort auf die Sicherheitsfrage ist falsch']
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
  res.json({ success: true })
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
      const room = createRoom(socket.username, settings || {})
      socketUserMap.set(socket.id, { username: socket.username, roomCode: room.code })
      hostSocketMap.set(room.code, socket.id)
      socket.join(room.code)
      socket.emit('roomCreated', { roomCode: room.code })
      console.log(`Raum ${room.code} von ${socket.username} erstellt`)
    } catch (err) {
      console.error('[createRoom] Fehler:', err)
      socket.emit('error', { message: 'Fehler beim Erstellen des Raums' })
    }
  })

  // ── Raum nachschlagen (ohne beizutreten) ────────────────────────────────────
  socket.on('lookupRoom', ({ roomCode } = {}, callback) => {
    const code = (roomCode || '').toUpperCase().trim()
    const info = getRoomPublicInfo(code)
    if (!info) {
      if (typeof callback === 'function') callback({ error: `Raum "${code}" nicht gefunden` })
      return
    }
    if (info.gameStarted) {
      if (typeof callback === 'function') callback({ error: 'Das Spiel in diesem Raum hat bereits begonnen' })
      return
    }
    if (typeof callback === 'function') callback(info)
  })

  // ── Raum beitreten ──────────────────────────────────────────────────────────
  socket.on('joinRoom', async ({ roomCode, slotId, slotName } = {}, callback) => {
    try {
      const code = (roomCode || '').toUpperCase().trim()
      const room = getRoom(code)
      if (!room) {
        const msg = `Raum "${code}" nicht gefunden`
        socket.emit('error', { message: msg })
        if (typeof callback === 'function') callback({ error: msg })
        return
      }
      // Ausstehende Entfernung abbrechen falls Spieler reconnectet
      const removalKey = `${socket.username}:${code}`
      if (pendingRemovals.has(removalKey)) {
        clearTimeout(pendingRemovals.get(removalKey))
        pendingRemovals.delete(removalKey)
      }
      // Der Aufrufer hat einen Slot explizit angegeben (slotId=<num> für
      // vorhandenes Team, slotId=null für neuen eigenen Slot). In beiden
      // Fällen soll die Wahl gelten – also aus einem eventuell noch
      // existierenden alten Slot entfernen (damit z.B. „Team verlassen und
      // als eigener Spieler joinen" tatsächlich funktioniert).
      const explicitSlotChoice = slotId !== undefined
      if (explicitSlotChoice) {
        const currentSlot = room.players.find((p) => p.members.includes(socket.username))
        const targetIsSame =
          typeof slotId === 'number' && currentSlot && currentSlot.slotId === slotId
        if (currentSlot && !targetIsSame) {
          removePlayerFromRoom(code, socket.username)
        }
      }
      // Ohne explizite Wahl: reiner Reconnect-Fall – wenn der Nutzer noch
      // in einem Slot ist, dort bleiben, sonst neuen Slot anlegen.
      const alreadyInSlot = room.players.some(p => p.members.includes(socket.username))
      if (!alreadyInSlot) {
        const added = addPlayerToSlot(code, socket.username, slotId ?? null, slotName || socket.username)
        if (!added) {
          const msg = `Beitritt zu Raum "${code}" nicht möglich`
          socket.emit('error', { message: msg })
          if (typeof callback === 'function') callback({ error: msg })
          return
        }
      }
      socketUserMap.set(socket.id, { username: socket.username, roomCode: code })
      await socket.join(code)
      // Host-Socket aktualisieren falls der Host beitritt
      if (room.hostUsername === socket.username) {
        hostSocketMap.set(code, socket.id)
      }
      io.to(code).emit('roomState', getRoomBroadcastState(code))
      if (typeof callback === 'function') callback({ success: true })
      console.log(`${socket.username} ist Raum ${code} beigetreten (Slot: ${alreadyInSlot ? 'reconnect' : (slotId ?? 'neu')})`)
    } catch (err) {
      console.error('[joinRoom] Fehler:', err)
      socket.emit('error', { message: 'Fehler beim Beitreten des Raums' })
      if (typeof callback === 'function') callback({ error: 'Interner Fehler' })
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
      // verbundenen Spieler analog zum disconnect-Handler.
      const room = getRoom(code)
      const wasHost = room?.hostUsername === socket.username
      removePlayerFromRoom(code, socket.username)
      const stillExists = getRoom(code)
      if (stillExists) {
        if (wasHost && stillExists.players.length > 0) {
          const newHostName = stillExists.players[0].members[0]
          if (newHostName) {
            for (const [sid, sInfo] of socketUserMap.entries()) {
              if (sInfo.roomCode === code && sInfo.username === newHostName) {
                stillExists.hostUsername = newHostName
                hostSocketMap.set(code, sid)
                io.to(sid).emit('hostAssigned', { roomCode: code })
                break
              }
            }
          }
        }
        io.to(code).emit('roomState', getRoomBroadcastState(code))
      }
      // Socket aus dem Room entfernen und Mapping aufräumen.
      try {
        socket.leave(code)
      } catch (err) {
        // Bereits verlassen / kein aktives Room-Mitglied -> ignorieren.
        void err
      }
      if (info?.roomCode === code) {
        socketUserMap.set(socket.id, { username: socket.username, roomCode: '' })
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
      // Für Statistiken: Ergebnis-Guard für dieses Spiel zurücksetzen.
      room.resultRecorded = false
      // WICHTIG: broadcastState verwenden – enthält memberAvatars, damit
      // Game.vue die Profilbilder der Mitspieler beim Start hat. Der rohe
      // getRoom()-Payload hätte kein memberAvatars → Avatar-Fallback-Icon.
      io.to(info.roomCode).emit('gameStarted', {
        ...getRoomBroadcastState(info.roomCode),
        startingPlayer: room.startingPlayer,
        startingPlayerWasRandom: room.startingPlayerWasRandom
      })
      io.to(info.roomCode).emit('roomState', getRoomBroadcastState(info.roomCode))
      console.log(
        `Spiel in Raum ${info.roomCode} gestartet, Startspieler ${room.startingPlayer}` +
        `${room.startingPlayerWasRandom ? ' (ausgelost)' : ' (vom Host gewaehlt)'}`
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
      if (room.audioMode === 'all-clients') {
        // Ready-Tracking initialisieren
        room.pendingSongUrl = songUrl
        room.songReadySlots = new Set()
        io.to(info.roomCode).emit('cardDrawn', {
          songUrl,
          cardData,
          audioMode: room.audioMode,
          waitForReady: true,
          totalPlayers: room.players.length
        })
      } else {
        io.to(info.roomCode).emit('cardDrawn', {
          songUrl,
          cardData,
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

      const slotIndex = room.players.findIndex(p => p.members.includes(socket.username))
      if (slotIndex === -1) return

      room.songReadySlots.add(slotIndex)
      io.to(info.roomCode).emit('song:readyUpdate', {
        readyCount: room.songReadySlots.size,
        totalCount: room.players.length
      })

      if (room.songReadySlots.size >= room.players.length) {
        io.to(info.roomCode).emit('song:openNow', { songUrl: room.pendingSongUrl })
        room.pendingSongUrl = null
        room.songReadySlots = null
      }
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
      room.gameState = gameState
      socket.to(info.roomCode).emit('stateUpdate', { gameState })
    } catch (err) {
      console.error('[host:syncState] Fehler:', err)
    }
  })

  // ── Gast: aktuellen State vom Server anfordern ─────────────────────────
  socket.on('guest:requestSync', () => {
    try {
      const info = socketUserMap.get(socket.id)
      if (!info) return
      const room = getRoom(info.roomCode)
      if (!room?.gameState) return
      socket.emit('stateUpdate', { gameState: room.gameState })
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
      io.to(info.roomCode).emit('roomState', getRoomBroadcastState(info.roomCode))
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
      io.to(info.roomCode).emit('roomState', getRoomBroadcastState(info.roomCode))
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
      io.to(info.roomCode).emit('roomState', getRoomBroadcastState(info.roomCode))
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
      io.to(info.roomCode).emit('roomState', getRoomBroadcastState(info.roomCode))
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
      if (!Array.isArray(songPools) || songPools.length === 0) return
      // Metadaten (Label/Cover) eigener/eingeschraenkter Versionen mitteilen,
      // damit alle Clients sie anzeigen koennen.
      const meta = versionsMeta && typeof versionsMeta === 'object' ? versionsMeta : {}
      room.settings = {
        ...room.settings,
        songPools,
        customVersionsMeta: { ...(room.settings?.customVersionsMeta || {}), ...meta }
      }
      io.to(info.roomCode).emit('roomState', getRoomBroadcastState(info.roomCode))
      console.log(`Song-Pools in Raum ${info.roomCode} geändert: ${songPools.join(', ')}`)
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
      if (versionMeta && typeof versionMeta === 'object' && pool) {
        room.settings = {
          ...room.settings,
          customVersionsMeta: { ...(room.settings?.customVersionsMeta || {}), [pool]: versionMeta }
        }
      }
      io.to(info.roomCode).emit('roomState', getRoomBroadcastState(info.roomCode))
      console.log(`Battle-Pool in Raum ${info.roomCode} von ${socket.username} auf "${pool}" gesetzt`)
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
      const slot = room.players.find(p => p.slotId === slotId)
      if (slot) {
        slot.score = Math.max(0, (slot.score || 0) + Number(delta || 0))
        io.to(info.roomCode).emit('roomState', getRoomBroadcastState(info.roomCode))
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
        io.to(info.roomCode).emit('roomState', getRoomBroadcastState(info.roomCode))
      }
    } catch (err) {
      console.error('[host:addObjection] Fehler:', err)
    }
  })

  // Helper: Leitet ein Gast-Event an den Host weiter oder sendet Fehler an den Gast
  const forwardToHost = (eventName, socket, extraData = {}) => {
    const info = socketUserMap.get(socket.id)
    if (!info) return
    const room = getRoom(info.roomCode)
    if (!room || room.hostUsername === socket.username) return
    const hostSocketId = hostSocketMap.get(info.roomCode)
    if (hostSocketId) {
      io.to(hostSocketId).emit(eventName, { fromUsername: socket.username, ...extraData })
    } else {
      socket.emit('error', { message: 'Host ist nicht verbunden – Aktion fehlgeschlagen' })
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
  socket.on('guest:submitGuess', ({ title, artist, year } = {}) => {
    try {
      forwardToHost('guest:submitGuess', socket, { title, artist, year })
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
  socket.on('host:gameEnded', () => {
    try {
      const info = socketUserMap.get(socket.id)
      if (!info) return
      const room = getRoom(info.roomCode)
      if (!room || room.hostUsername !== socket.username) return
      room.gameStarted = false
      io.to(info.roomCode).emit('roomState', getRoomBroadcastState(info.roomCode))
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
      room.resultRecorded = true
      const mode = room.settings?.gameMode || 'normal'
      const roomVersions = (room.settings?.songPools || []).filter(Boolean)
      const winners = new Set(
        Array.isArray(winnerIndices) ? winnerIndices.map(Number) : []
      )
      const scoreArr = Array.isArray(scores) ? scores : []
      const entries = []
      room.players.forEach((slot, index) => {
        const isTeam = (slot.members || []).length > 1
        // Punkte defensiv klemmen (Client ist hier autoritativ, aber ein
        // manipulierter Client soll keine absurden Werte einbuchen können).
        const rawPoints = Math.floor(Number(scoreArr[index]) || 0)
        const points = Math.max(0, Math.min(10000, rawPoints))
        const isWinner = winners.has(index)
        // Battle: exakt die Version des Slots. Sonst: alle gewählten Raum-
        // Versionen (gemischter Pool zählt für jede gewählte Version).
        const versions = slot.pool ? [slot.pool] : roomVersions
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
      // Bingo-Modus: bingoState mit-entsorgen, sonst spielt die nächste
      // Runde mit den ALTEN Karten/Marks/Bingo-Counts weiter
      // (`initBingoState` greift early-return, wenn `bingoState` schon
      // existiert). Der Reset via Bingo-Header-Button geht über
      // `resetGameState` → `host:returnToLobby`; ohne diesen Cleanup
      // fühlt sich der Reset für den User „halb" an.
      delete room.bingoState
      socket.to(info.roomCode).emit('returnToLobby', { roomCode: info.roomCode })
      io.to(info.roomCode).emit('roomState', getRoomBroadcastState(info.roomCode))
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
      room.gameStarted = true
      socket.to(info.roomCode).emit('gameRestarted')
      io.to(info.roomCode).emit('roomState', getRoomBroadcastState(info.roomCode))
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
  const bingoBroadcast = (code) => {
    io.to(code).emit('roomState', getRoomBroadcastState(code))
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
  // verteilt (Audio-Modus wie in anderen MP-Modi).
  socket.on('host:bingoOpenAnswering', ({ songUrl, cardData } = {}) => {
    try {
      const ctx = bingoAssertHost()
      if (!ctx) return
      const opened = openBingoAnswering(ctx.room)
      if (!opened.ok) {
        socket.emit('error', { message: opened.reason || 'Antwortphase konnte nicht geöffnet werden' })
        return
      }
      // Song wie in anderen MP-Modi verteilen (Popup-Timing kommt vom Client).
      if (songUrl) {
        if (ctx.room.audioMode === 'all-clients') {
          ctx.room.pendingSongUrl = songUrl
          ctx.room.songReadySlots = new Set()
          io.to(ctx.code).emit('cardDrawn', {
            songUrl,
            cardData,
            audioMode: ctx.room.audioMode,
            waitForReady: true,
            totalPlayers: ctx.room.players.length
          })
        } else {
          io.to(ctx.code).emit('cardDrawn', {
            songUrl,
            cardData,
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
      skipBingoRound(ctx.room)
      // Song-Ready-Flow zurücksetzen, falls gerade offen.
      ctx.room.pendingSongUrl = null
      ctx.room.songReadySlots = null
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
  socket.on('host:bingoSetCell', ({ slotId, cellIndex, marked } = {}) => {
    try {
      const ctx = bingoAssertHost()
      if (!ctx) return
      const result = hostSetBingoCell(ctx.room, slotId, cellIndex, marked)
      if (!result.ok) {
        socket.emit('error', { message: result.reason || 'Feld konnte nicht geändert werden' })
        return
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
      const info = socketUserMap.get(socket.id)
      if (info?.roomCode) {
        const isHost = hostSocketMap.get(info.roomCode) === socket.id
        if (isHost) {
          hostSocketMap.delete(info.roomCode)
        }
        const room = getRoom(info.roomCode)
        if (room) {
          // ── Sofortiger Host-Failover ─────────────────────────────────
          // Wenn der Host geht (Lobby ODER laufendes Spiel), soll der
          // nächste bereits verbundene Spieler unmittelbar Host werden.
          // Sonst hängen alle Gäste in der Warteschleife bzw. das Spiel
          // ist steuerungslos. Reconnect kann später die Rolle wieder
          // korrekt zuordnen (siehe joinRoom -> hostUsername-Check).
          if (isHost && room.hostUsername === socket.username) {
            // Nächster in Slot-Reihenfolge, der aktuell verbunden ist.
            const candidateSlots = room.players || []
            let newHostName = null
            let newHostSid = null
            for (const slot of candidateSlots) {
              for (const member of slot.members || []) {
                if (member === socket.username) continue
                for (const [sid, sInfo] of socketUserMap.entries()) {
                  if (sid === socket.id) continue
                  if (sInfo.roomCode === info.roomCode && sInfo.username === member) {
                    newHostName = member
                    newHostSid = sid
                    break
                  }
                }
                if (newHostName) break
              }
              if (newHostName) break
            }
            if (newHostName && newHostSid) {
              room.hostUsername = newHostName
              hostSocketMap.set(info.roomCode, newHostSid)
              console.log(`[Failover] Sofortiger Host-Wechsel in Raum ${info.roomCode}: ${newHostName}`)
              // Neuen Host explizit informieren, damit er UI umschalten kann.
              io.to(newHostSid).emit('hostAssigned', { roomCode: info.roomCode })
            }
          }
          if (!room.gameStarted) {
            const removalKey = `${socket.username}:${info.roomCode}`
            const timerId = setTimeout(() => {
              try {
                pendingRemovals.delete(removalKey)
                const r = getRoom(info.roomCode)
                if (r && !r.gameStarted) {
                  removePlayerFromRoom(info.roomCode, socket.username)
                  console.log(`[Karenz] ${socket.username} aus Raum ${info.roomCode} entfernt (Timeout)`)

                  const upd = getRoomBroadcastState(info.roomCode)
                  if (upd) io.to(info.roomCode).emit('roomState', upd)
                }
              } catch (err) {
                console.error('[Karenz] Fehler beim verzögerten Entfernen:', err)
              }
            }, 20000)
            pendingRemovals.set(removalKey, timerId)
          }
          // In jedem Fall: aktualisierten roomState broadcasten, damit der
          // neue Host-Wechsel bei allen Clients sofort sichtbar ist.
          const updatedRoom = getRoomBroadcastState(info.roomCode)
          if (updatedRoom) {
            io.to(info.roomCode).emit('roomState', updatedRoom)
          }
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
