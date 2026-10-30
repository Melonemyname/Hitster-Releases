// In-Memory Raumverwaltung
const songClassifications = require('./songClassifications')
const { getAvatarMap } = require('./auth')
const {
  isValidSongUrl,
  isPoolId,
  sanitizePoolList,
  sanitizeVersionMeta,
  text
} = require('./validate')

// Sammelt alle Mitglieder-Usernamen eines Raums und liefert deren Avatar-Pfade
// als Map (für die Anzeige der Profilbilder in Lobby/Spiel).
function collectMemberAvatars (room) {
  const names = new Set()
  for (const slot of room.players || []) {
    for (const m of slot.members || []) names.add(m)
  }
  return getAvatarMap([...names])
}

const rooms = new Map()

// Ist ein Slot gerade mit mindestens einem Socket im Raum verbunden? Das weiß
// nur die Socket-Schicht (server/index.js), sie hängt ihre Prüfung über
// `setSlotConnectedCheck` ein. Ohne Prüfung gilt jeder Slot als verbunden.
let slotConnectedCheck = null
function setSlotConnectedCheck (fn) {
  slotConnectedCheck = typeof fn === 'function' ? fn : null
}
function isSlotConnected (room, slotId) {
  if (!slotConnectedCheck) return true
  try {
    return !!slotConnectedCheck(room, slotId)
  } catch {
    return true
  }
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const VALID_GAME_MODES = ['normal', 'film', 'battle', 'bingo']

const VALID_BINGO_DIFFICULTIES = ['easy', 'hard']
const VALID_BINGO_TIMER_MODES = ['timer', 'wait-all']
const BINGO_TIMER_SECONDS_DEFAULT = 30
const BINGOS_TO_WIN_MIN = 1
const BINGOS_TO_WIN_MAX = 12
const BINGOS_TO_WIN_DEFAULT = 3
const BINGO_TIMER_SECONDS_MIN = 5
const BINGO_TIMER_SECONDS_MAX = 3600

// Grenzen für das, was Host und Spieler in einen Raum schreiben dürfen. Ein
// Raum liegt im Speicher und geht mit jedem roomState an alle Mitglieder,
// deshalb ist nichts davon unbegrenzt.
const MAX_SONG_POOLS = 50
const MAX_VERSIONS_META = 60
const SLOT_NAME_MAX = 40
const SAVED_PLAYERS_MAX = 30

// Karten-Generierung: identisch zu `src/composables/useBingo.js`
// (`generateBingoCard`). Beide Seiten müssen synchron gehalten werden;
// autoritativ ist der Server.
const BINGO_CARD_SIZE = 5
const BINGO_CELL_COUNT = BINGO_CARD_SIZE * BINGO_CARD_SIZE
const BINGO_MIN_PER_COLOR = 3
const BINGO_MAX_PER_COLOR = 7
const BINGO_COLOR_KEYS = ['green', 'pink', 'yellow', 'purple', 'blue']

// Kategorien je Schwierigkeit. Reihenfolge und `id` müssen identisch zu
// `src/composables/useBingo.js` (`BINGO_CATEGORIES`) sein – die Client-UI
// blendet Label/Beschreibung anhand der `id` ein. `bonusYearRange` markiert
// die ±X-Jahre-Kategorien, bei denen bei exaktem Treffer die Bonus-Regel
// (Kreuz beim Gegner entfernen) greift.
const BINGO_CATEGORIES = {
  easy: [
    { id: 'solo-group', color: 'green', bonusYearRange: null },
    { id: 'before-2000', color: 'pink', bonusYearRange: null },
    { id: 'year-4', color: 'yellow', bonusYearRange: 4 },
    { id: 'decade', color: 'purple', bonusYearRange: null },
    { id: 'year-2', color: 'blue', bonusYearRange: 2 }
  ],
  hard: [
    { id: 'title', color: 'green', bonusYearRange: null },
    { id: 'exact-year', color: 'pink', bonusYearRange: null },
    { id: 'artist', color: 'yellow', bonusYearRange: null },
    { id: 'decade', color: 'purple', bonusYearRange: null },
    { id: 'year-3', color: 'blue', bonusYearRange: 3 }
  ]
}

// ─── Text-Matching (server-seitig, minimal) ──────────────────────────────
// Server evaluiert Titel/Künstler-Antworten autoritativ. Kein Fuzzy-Fallback
// wie im Client-`useGuessEngine.js` – zu viele Toleranzen könnten in
// Streit-Situationen unschöne Ergebnisse liefern. Wir gehen konservativ vor
// (normalisiertes Präfix-/Vorkommen-Matching mit einer kleinen Levenshtein-
// Toleranz) und der Host kann in Extremfällen per „Als richtig werten"
// nachhelfen (siehe host:bingoOverrideAnswer).

function normalizeText (value) {
  return (value || '')
    .toString()
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

function stripFeaturingFromTitle (value) {
  return (value || '')
    .toString()
    .replace(/\s*[([–—-]?\s*\b(feat\.?|ft\.?|featuring)\b.*$/i, '')
    .trim()
}

function stripVersionDescriptors (value) {
  // Klammern-Zusätze (rund/eckig) samt Inhalt entfernen, ebenso Suffixe
  // wie „- Remastered 2011". Sorgt dafür, dass Titel wie
  // „Main Titel Theme (From ...)" auch als „Main Titel Theme" richtig
  // gewertet werden. Muss synchron zu `stripVersionDescriptors` in
  // src/composables/useGuessEngine.js gehalten werden.
  return (value || '')
    .toString()
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\s*\[[^\]]*\]/g, '')
    // Spotify haengt Fassungs-Hinweise mit " - " an ("Song - 2011 Remaster",
    // "Shine - Acoustic", "Theme - From \"Platoon\""). Die Leerzeichen um den
    // Bindestrich sind Pflicht, sonst wuerde "Played-A-Live" zu "Played-A".
    .replace(/\s+[-–—]\s+.*\b(remaster(?:ed)?|reimagin(?:ed)?|re-?recorded|live|acoustic|unplugged|instrumental|demo|mono|stereo|radio\s+edit|single\s+version|album\s+version|extended\s+(?:version|mix)|edit|mix|from\b.*)\b.*$/gi, '')
    .replace(/\s+\b(remaster(?:ed)?|reimagin(?:ed)?)\b.*$/gi, '')
    .trim()
}

function splitArtistCandidates (value) {
  return (value || '')
    .toString()
    // Semikolon ist in den Song-Daten der haeufigste Trenner zwischen
    // mehreren Kuenstlern ("Luis Fonsi;Demi Lovato"). Ohne ihn galt der
    // Name eines einzelnen Beteiligten als falsche Antwort.
    .split(/,|;|&| feat\.?| ft\.?| featuring | x | und /i)
    .map((part) => part.trim())
    .filter(Boolean)
}

function levenshtein (a, b) {
  const rows = a.length + 1
  const cols = b.length + 1
  const dp = Array.from({ length: rows }, () => new Array(cols).fill(0))
  for (let i = 0; i < rows; i += 1) dp[i][0] = i
  for (let j = 0; j < cols; j += 1) dp[0][j] = j
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
    }
  }
  return dp[a.length][b.length]
}

function fuzzyMatch (input, expected) {
  const a = normalizeText(input)
  const b = normalizeText(expected)
  if (!a || !b) return false
  if (a === b) return true
  const maxLen = Math.max(a.length, b.length)
  const allowed = maxLen <= 4 ? 1 : maxLen <= 8 ? 2 : 3
  return levenshtein(a, b) <= allowed
}

// Mehrere Einträge pro Feld mit `;` (Titel, Jahr, Film; `|` aus älteren
// Daten). Gleiche Regeln wie im Client (src/utils/songVariants.js).
function splitVariants (value) {
  return String(value ?? '').split(/[;|]/).map((v) => v.trim()).filter(Boolean)
}

// Alle Jahre der Songdaten, Hauptjahr zuerst. `years` schickt der Host mit,
// sonst aus `year` (Zahl oder „1975;2011").
function yearsOfSong (songData) {
  const list = Array.isArray(songData?.years) && songData.years.length
    ? songData.years
    : splitVariants(songData?.year)
  return list
    .map((v) => {
      const m = String(v).match(/(\d{4})/)
      return m ? Number.parseInt(m[1], 10) : 0
    })
    .filter((y) => y > 0)
}

function matchesTitle (input, expected) {
  // Reihenfolge ist wichtig: ERST die Klammern-Zusaetze, DANN das Featuring.
  // Andersherum schneidet `stripFeaturingFromTitle` bei einem Titel wie
  // „Sucker for Pain (with … feat. X Ambassadors)" ab dem „feat." alles ab,
  // samt schliessender Klammer. `stripVersionDescriptors` findet danach kein
  // vollstaendiges Klammerpaar mehr, und der halbe Zusatz bleibt stehen -
  // der Titel galt dann nur mit mitgetippter Gaesteliste als richtig.
  const a = stripFeaturingFromTitle(stripVersionDescriptors(input))
  // Jede Titel-Variante (`;`) zählt.
  return splitVariants(expected).some((t) =>
    fuzzyMatch(a, stripFeaturingFromTitle(stripVersionDescriptors(t))))
}

function matchesArtist (input, expected) {
  const guessed = splitArtistCandidates(input)
  const expectedArtists = splitArtistCandidates(expected)
  if (guessed.length === 0 || expectedArtists.length === 0) return false
  return guessed.some((g) => expectedArtists.some((e) => fuzzyMatch(g, e)))
}

// Kategorie-Auswahl: pro Runde eine zufällige Kategorie aus dem aktuellen
// Schwierigkeitspool.
// Gezogen wird nur aus Kategorien, deren Farbe noch mindestens ein Team
// markieren kann. Eine Farbe, die bei allen voll ist, fällt aus dem Pool und
// kommt von selbst zurück, sobald wieder irgendwo ein Feld frei wird (etwa
// durch ein per Bonus entferntes Kreuz), denn geprüft wird bei jedem Zug neu.
// Ist keine Farbe mehr frei, bleibt zur Sicherheit die ganze Liste.
function pickBingoCategory (difficulty, room) {
  const list = BINGO_CATEGORIES[difficulty] || BINGO_CATEGORIES.easy
  const offen = room?.bingoState
    ? list.filter((cat) => room.players.some((p) => hasFreeCellOfColor(room, p.slotId, cat.color)))
    : list
  const pool = offen.length ? offen : list
  return pool[Math.floor(Math.random() * pool.length)]
}

// Bewertung der Team-Antwort. `classification` ist die serverseitig
// gespeicherte Solo/Gruppe-Klassifikation (nur relevant für solo-group).
// Rückgabe: { correct, exactYear } – `exactYear` löst die Bonus-Regel aus.
// Mehrere Jahre: jede Variante zählt (bei ±X das nächstgelegene).
function evaluateBingoAnswer (category, songData, answer, classification) {
  const years = yearsOfSong(songData)
  const year = years[0] || 0
  const result = { correct: false, exactYear: false }
  if (!category || !songData) return result

  switch (category.id) {
    case 'solo-group': {
      if (!classification) return result
      const val = String(answer || '').toLowerCase()
      if (val !== 'solo' && val !== 'group') return result
      result.correct = val === classification
      return result
    }
    case 'before-2000': {
      const val = String(answer || '').toLowerCase()
      if (val !== 'before' && val !== 'after') return result
      // 2000 zählt zu „ab 2000"
      result.correct = years.some((y) => (y < 2000 ? 'before' : 'after') === val)
      return result
    }
    case 'title': {
      result.correct = matchesTitle(answer, songData.title || '')
      return result
    }
    case 'artist': {
      result.correct = matchesArtist(answer, songData.artist || '')
      return result
    }
    case 'exact-year': {
      const guess = Number(answer)
      if (!Number.isFinite(guess)) return result
      result.correct = years.includes(guess)
      result.exactYear = result.correct
      return result
    }
    case 'decade': {
      const guess = Number(answer)
      if (!Number.isFinite(guess)) return result
      result.correct = years.some((y) => Math.floor(y / 10) * 10 === guess)
      return result
    }
    case 'year-2':
    case 'year-3':
    case 'year-4': {
      const range = category.bonusYearRange || 0
      const guess = Number(answer)
      if (!Number.isFinite(guess) || !year) return result
      const diff = Math.min(...years.map((y) => Math.abs(guess - y)))
      result.correct = diff <= range
      result.exactYear = diff === 0
      return result
    }
    default:
      return result
  }
}

// ─── Bingo-Karten-Helpers ────────────────────────────────────────────────

function getBingoLines () {
  const lines = []
  for (let r = 0; r < BINGO_CARD_SIZE; r += 1) {
    const row = []
    for (let c = 0; c < BINGO_CARD_SIZE; c += 1) row.push(r * BINGO_CARD_SIZE + c)
    lines.push(row)
  }
  for (let c = 0; c < BINGO_CARD_SIZE; c += 1) {
    const col = []
    for (let r = 0; r < BINGO_CARD_SIZE; r += 1) col.push(r * BINGO_CARD_SIZE + c)
    lines.push(col)
  }
  const diag1 = []
  const diag2 = []
  for (let i = 0; i < BINGO_CARD_SIZE; i += 1) {
    diag1.push(i * BINGO_CARD_SIZE + i)
    diag2.push(i * BINGO_CARD_SIZE + (BINGO_CARD_SIZE - 1 - i))
  }
  lines.push(diag1)
  lines.push(diag2)
  return lines
}

const BINGO_LINES = getBingoLines()

// Anzahl der abgeschlossenen 5er-Reihen für einen Marks-Array.
function countCompletedLines (marks) {
  if (!Array.isArray(marks)) return 0
  let count = 0
  for (const line of BINGO_LINES) {
    if (line.every((idx) => marks[idx])) count += 1
  }
  return count
}

// Gibt Zell-Indizes zurück, die Teil einer bereits vollen 5er-Reihe sind.
// Diese Kreuze dürfen durch die Bonus-Regel NICHT entfernt werden.
function getLockedMarkIndices (marks) {
  const locked = new Set()
  for (const line of BINGO_LINES) {
    if (line.every((idx) => marks[idx])) {
      for (const idx of line) locked.add(idx)
    }
  }
  return locked
}

function generateBingoCard () {
  const counts = {}
  BINGO_COLOR_KEYS.forEach((c) => { counts[c] = BINGO_MIN_PER_COLOR })
  let remaining = BINGO_CELL_COUNT - BINGO_COLOR_KEYS.length * BINGO_MIN_PER_COLOR
  while (remaining > 0) {
    const available = BINGO_COLOR_KEYS.filter((c) => counts[c] < BINGO_MAX_PER_COLOR)
    if (available.length === 0) break
    const pick = available[Math.floor(Math.random() * available.length)]
    counts[pick] += 1
    remaining -= 1
  }
  const cells = []
  BINGO_COLOR_KEYS.forEach((c) => {
    for (let i = 0; i < counts[c]; i += 1) cells.push(c)
  })
  for (let i = cells.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[cells[i], cells[j]] = [cells[j], cells[i]]
  }
  return cells
}

/**
 * Initialisiert den Bingo-Runden-State für einen Raum (Karten + leere
 * Kreuze pro Team-Slot + Runden-Objekt). Wird beim Spielstart aufgerufen.
 * Idempotent: bereits gesetzter State wird nicht überschrieben.
 */
function initBingoState (room) {
  if (!room) return
  if (room.bingoState) return
  const teamCards = {}
  const teamMarks = {}
  for (const slot of room.players) {
    teamCards[slot.slotId] = generateBingoCard()
    teamMarks[slot.slotId] = new Array(BINGO_CELL_COUNT).fill(false)
  }
  room.bingoState = {
    teamCards,
    teamMarks,
    bingoCounts: {}, // slotId -> Anzahl gewonnener 5er-Reihen (kumulativ)
    round: makeIdleRound(),
    winners: null // slotIds bei Spielende (geteilter Sieg möglich)
  }
}

function makeIdleRound () {
  return {
    phase: 'idle',
    roundNumber: 0,
    category: null,
    songLink: null,
    songData: null, // wird erst nach Antwortphase enthüllt
    teamAnswers: {}, // slotId -> string
    teamConfirmed: {}, // slotId -> true, sobald das Team abgegeben hat
    answersRevealed: false,
    deadlineTimestamp: null,
    correctSlots: [], // slotIds mit korrekter Antwort (dürfen markieren)
    markedThisRound: {}, // slotId -> boolean
    bonusPending: [], // slotIds mit exaktem Jahres-Treffer
    bonusResolved: {}, // slotId -> true wenn Bonus abgeschlossen/abgelehnt
    evalPerTeam: {} // slotId -> { correct, exactYear } (nach Auflösung)
  }
}

// Alias, damit die Server-Handler dieselbe Nomenklatur nutzen können.
function resetBingoRound (room) {
  if (!room?.bingoState) return
  room.bingoState.round = makeIdleRound()
}

/**
 * Sicherstellen, dass jeder aktuelle Slot eine Karte hat. Falls in der
 * Lobby-Phase noch Teams beitreten (nach `initBingoState`), bekommen sie
 * beim Spielstart eine leere Karte nachträglich.
 */
function ensureAllTeamsHaveCards (room) {
  if (!room?.bingoState) return
  const { teamCards, teamMarks, bingoCounts } = room.bingoState
  for (const slot of room.players) {
    if (!teamCards[slot.slotId]) {
      teamCards[slot.slotId] = generateBingoCard()
      teamMarks[slot.slotId] = new Array(BINGO_CELL_COUNT).fill(false)
    }
    if (bingoCounts[slot.slotId] === undefined) {
      bingoCounts[slot.slotId] = countCompletedLines(teamMarks[slot.slotId])
    }
  }
}

/**
 * Neue Bingo-Runde starten. Vom Host mit den Songdaten aufgerufen (Host
 * hat gerade eine Karte gezogen). Server wählt die Kategorie zufällig,
 * setzt die Phase auf 'reveal' und liefert die Kategorie an alle. Die
 * Songdaten bleiben server-seitig, werden aber erst nach Ablauf der
 * Antwortphase verteilt.
 */
function startBingoRound (room, { songLink, songData }) {
  if (!room?.bingoState) return { ok: false, reason: 'In diesem Raum läuft kein Bingo.' }
  if (room.bingoState.winners) return { ok: false, reason: 'Das Spiel ist schon vorbei.' }
  // Nur aus einer ruhenden Runde starten. Ein zweiter Klick auf „Runde
  // starten" würde sonst die laufende Runde samt Kategorie und Songdaten
  // überschreiben. `busy` markiert diesen harmlosen Fall für den Handler.
  const phase = room.bingoState.round?.phase || 'idle'
  if (phase !== 'idle' && phase !== 'round-done') {
    return { ok: false, busy: true, reason: 'Die Runde läuft bereits.' }
  }
  const difficulty = room.settings?.bingoDifficulty || 'easy'
  const category = pickBingoCategory(difficulty, room)
  const prevRoundNumber = Number(room.bingoState.round?.roundNumber || 0)
  room.bingoState.round = {
    ...makeIdleRound(),
    phase: 'reveal',
    roundNumber: prevRoundNumber + 1,
    category,
    // Nur gültige Song-Links, der Link geht mit dem roomState an alle.
    songLink: isValidSongUrl(songLink) ? songLink : null,
    songData: sanitizeBingoSongData(songData) // intern, wird beim Auflösen freigegeben
  }
  return { ok: true, category }
}

// Songdaten einer Bingo-Runde auf die Felder begrenzen, die die Auswertung
// braucht. Sie gehen nach der Auflösung an alle.
function sanitizeBingoSongData (songData) {
  if (!songData || typeof songData !== 'object') return null
  const years = Array.isArray(songData.years)
    ? songData.years.slice(0, 10).map((y) => text(y, 20)).filter(Boolean)
    : []
  return {
    title: text(songData.title, 300),
    artist: text(songData.artist, 300),
    year: typeof songData.year === 'number' && Number.isFinite(songData.year)
      ? songData.year
      : text(songData.year, 40),
    years,
    ensemble: text(songData.ensemble, 20)
  }
}

/**
 * Nach der Kategorie-Reveal-Animation vom Host aufgerufen. Öffnet die
 * Antwortphase (Timer oder wait-all).
 */
function openBingoAnswering (room) {
  if (!room?.bingoState?.round) return { ok: false }
  const r = room.bingoState.round
  if (r.phase !== 'reveal') return { ok: false, reason: 'Die Antwortrunde ist schon offen oder vorbei.' }
  const timerMode = room.settings?.bingoTimerMode || 'timer'
  const timerSeconds = Number(room.settings?.bingoTimerSeconds) || BINGO_TIMER_SECONDS_DEFAULT
  r.phase = 'answering'
  r.deadlineTimestamp = timerMode === 'timer' ? Date.now() + timerSeconds * 1000 : null
  return { ok: true, deadline: r.deadlineTimestamp }
}

/**
 * Team-Antwort setzen. Jedes Team-Mitglied darf die Antwort ändern; sie
 * wird pro Slot gespeichert und beim Broadcast an das eigene Team live
 * gespiegelt.
 */
function setBingoTeamAnswer (room, username, value) {
  if (!room?.bingoState?.round) return { ok: false, reason: 'Gerade läuft keine Runde.' }
  const r = room.bingoState.round
  if (r.phase !== 'answering') return { ok: false, reason: 'Die Antwortzeit ist schon vorbei.' }
  const slot = room.players.find((p) => p.members.includes(username))
  if (!slot) return { ok: false, reason: 'Du spielst in dieser Runde in keinem Team mit.' }
  const neu = String(value ?? '').slice(0, 120)
  // Geänderte Antwort nach der Abgabe: Team gilt wieder als offen. Gleicher
  // Wert (verspäteter Live-Sync eines Mitspielers) lässt die Abgabe stehen.
  if (r.teamAnswers[slot.slotId] !== neu) delete r.teamConfirmed[slot.slotId]
  r.teamAnswers[slot.slotId] = neu
  return { ok: true, slotId: slot.slotId }
}

/**
 * Team gibt seine Antwort ab (`confirmed`) oder nimmt die Abgabe zurück, um
 * sie zu ändern. Die Antwort kommt beim Abgeben mit, damit ein noch nicht
 * gesendeter Live-Sync (Debounce) nicht verloren geht.
 */
function confirmBingoTeamAnswer (room, username, confirmed, value) {
  if (!room?.bingoState?.round) return { ok: false, reason: 'Gerade läuft keine Runde.' }
  const r = room.bingoState.round
  if (r.phase !== 'answering') return { ok: false, reason: 'Die Antwortzeit ist schon vorbei.' }
  const slot = room.players.find((p) => p.members.includes(username))
  if (!slot) return { ok: false, reason: 'Du spielst in dieser Runde in keinem Team mit.' }
  if (!r.teamConfirmed) r.teamConfirmed = {}
  if (!confirmed) {
    delete r.teamConfirmed[slot.slotId]
    return { ok: true }
  }
  const antwort = value !== undefined && value !== null
    ? String(value).slice(0, 120)
    : String(r.teamAnswers[slot.slotId] ?? '')
  if (antwort.trim() === '') {
    return { ok: false, reason: 'Gib zuerst eine Antwort ein.' }
  }
  r.teamAnswers[slot.slotId] = antwort
  r.teamConfirmed[slot.slotId] = true
  return { ok: true }
}

/**
 * Prüft ob alle Teams eine (nicht-leere) Antwort abgegeben haben.
 */
// Fertig ist ein Team erst mit abgegebener Antwort, ein bloß ausgefülltes
// Feld zählt nicht (bis 1.0.7 zählte jedes nicht leere Feld als fertig).
function allBingoTeamsAnswered (room) {
  if (!room?.bingoState?.round) return false
  const { teamAnswers, teamConfirmed = {} } = room.bingoState.round
  return room.players.every((p) => {
    const v = teamAnswers[p.slotId]
    return teamConfirmed[p.slotId] && v !== undefined && String(v).trim() !== ''
  })
}

/**
 * Antwortphase auflösen: alle Antworten auswerten, korrekte Teams
 * markieren, Bonus-Kandidaten sammeln, Songdaten für alle freigeben.
 * Bei Solo/Gruppe: wenn keine Klassifikation vorhanden → phase =
 * 'awaiting-solo-group', Host muss klassifizieren.
 */
// Band/Solo aus den Metadaten (`ensemble`) auf die Bingo-Klassifikation mappen.
// „Band" (inkl. Features/Duette) = Gruppe.
function ensembleToClassification (ensemble) {
  const e = String(ensemble || '').trim().toLowerCase()
  if (e === 'band' || e === 'group' || e === 'gruppe') return 'group'
  if (e === 'solo') return 'solo'
  return null
}

function resolveBingoRound (room) {
  if (!room?.bingoState?.round) return { ok: false }
  const r = room.bingoState.round
  if (r.phase !== 'answering') return { ok: false, reason: 'Die Runde ist schon aufgelöst.' }

  // Solo/Gruppe: Reihenfolge (1) Band/Solo aus den Metadaten der Karte
  // (ensemble), (2) gespeicherte Klassifikation, sonst auf den Host warten.
  // Die Metadaten gehen vor, weil sie pro Version gepflegt und korrigiert
  // werden. Eine einmal gespeicherte Klassifikation würde eine spätere
  // Korrektur sonst für immer überdecken. Aus demselben Grund wird nur die
  // Entscheidung des Hosts gespeichert, nie ein aus den Metadaten gelesener Wert.
  if (r.category?.id === 'solo-group') {
    const cls = ensembleToClassification(r.songData?.ensemble) ||
      songClassifications.getClassification(r.songLink)
    if (!cls) {
      r.phase = 'awaiting-solo-group'
      r.deadlineTimestamp = null
      return { ok: true, needsSoloGroup: true }
    }
    return finalizeBingoAnswerEvaluation(room, cls)
  }

  return finalizeBingoAnswerEvaluation(room, null)
}

/**
 * Führt die eigentliche Auswertung durch (nach ggf. vorheriger
 * Solo/Gruppe-Klassifikation).
 */
function finalizeBingoAnswerEvaluation (room, soloGroupClassification) {
  const r = room.bingoState.round
  const correctSlots = []
  const bonusPending = []
  const perTeam = {}
  for (const slot of room.players) {
    const answer = r.teamAnswers[slot.slotId]
    const evalResult = evaluateBingoAnswer(r.category, r.songData, answer, soloGroupClassification)
    perTeam[slot.slotId] = evalResult
    if (evalResult.correct) {
      correctSlots.push(slot.slotId)
      if (evalResult.exactYear && r.category?.bonusYearRange) {
        bonusPending.push(slot.slotId)
      }
    }
  }
  r.correctSlots = correctSlots
  r.bonusPending = bonusPending
  r.evalPerTeam = perTeam
  r.answersRevealed = true
  r.phase = correctSlots.length > 0 ? 'marking' : 'bonus-check'
  r.markedThisRound = {}
  r.bonusResolved = {}
  // Teams ohne freies Feld der Kategorie-Farbe können nichts markieren. Sie
  // gelten gleich als erledigt, sonst wartet die Runde ewig auf ihr Kreuz.
  for (const sid of correctSlots) {
    if (!hasFreeCellOfColor(room, sid, r.category?.color)) r.markedThisRound[sid] = true
  }
  if (r.phase === 'marking') {
    maybeAdvanceBingoPhaseAfterMarking(room)
  } else {
    // Wenn niemand korrekt geraten hat, gibt es nichts zu markieren –
    // Bonus-Phase wird direkt geprüft (führt zu round-done, weil dann auch
    // niemand einen Bonus hat).
    maybeAdvanceBingoPhaseAfterBonus(room)
  }
  return { ok: true, correctSlots, bonusPending, perTeam }
}

/**
 * Host klassifiziert die aktuelle Solo/Gruppe-Runde. Persistiert die
 * Klassifikation, danach wird die Runde regulär ausgewertet.
 */
function classifyBingoSoloGroup (room, classification) {
  if (!room?.bingoState?.round) return { ok: false }
  const r = room.bingoState.round
  if (r.phase !== 'awaiting-solo-group') return { ok: false, reason: 'Gerade ist keine Einordnung nötig.' }
  if (classification !== 'solo' && classification !== 'group') {
    return { ok: false, reason: 'Bitte wähle Solo oder Gruppe.' }
  }
  songClassifications.setClassification(r.songLink, classification)
  return finalizeBingoAnswerEvaluation(room, classification)
}

/**
 * Team markiert ein freies Feld der Kategorie-Farbe. Nur erlaubt für Teams
 * in `correctSlots` und nur einmal pro Runde.
 */
function markBingoCell (room, username, cellIndex) {
  if (!room?.bingoState?.round) return { ok: false, reason: 'Gerade läuft keine Runde.' }
  const r = room.bingoState.round
  if (r.phase !== 'marking') return { ok: false, reason: 'Gerade darf niemand ein Feld ankreuzen.' }
  const slot = room.players.find((p) => p.members.includes(username))
  if (!slot) return { ok: false, reason: 'Du spielst in dieser Runde in keinem Team mit.' }
  if (!r.correctSlots.includes(slot.slotId)) return { ok: false, reason: 'Ankreuzen dürfen nur Teams, die richtig lagen.' }
  if (r.markedThisRound[slot.slotId]) return { ok: false, reason: 'Ihr habt in dieser Runde schon angekreuzt.' }
  const idx = Number(cellIndex)
  if (!Number.isInteger(idx) || idx < 0 || idx >= BINGO_CELL_COUNT) {
    return { ok: false, reason: 'Dieses Feld gibt es nicht.' }
  }
  const cells = room.bingoState.teamCards[slot.slotId] || []
  const marks = room.bingoState.teamMarks[slot.slotId] || []
  if (cells[idx] !== r.category.color) return { ok: false, reason: 'Das Feld hat nicht die Farbe dieser Runde.' }
  if (marks[idx]) return { ok: false, reason: 'Das Feld ist schon angekreuzt.' }
  marks[idx] = true
  r.markedThisRound[slot.slotId] = true
  room.bingoState.bingoCounts[slot.slotId] = countCompletedLines(marks)
  maybeAdvanceBingoPhaseAfterMarking(room)
  return { ok: true }
}

// Teams ohne verbundenes Mitglied kann niemand ankreuzen lassen. Auf sie wird
// nicht gewartet, sonst hängt die Runde, bis sie zurückkommen.
function maybeAdvanceBingoPhaseAfterMarking (room) {
  const r = room.bingoState.round
  const allMarked = r.correctSlots.every((sid) => r.markedThisRound[sid] || !isSlotConnected(room, sid))
  if (!allMarked) return
  r.phase = 'bonus-check'
  maybeAdvanceBingoPhaseAfterBonus(room)
}

// Hat das Team noch ein freies (unmarkiertes) Feld in `color`?
function hasFreeCellOfColor (room, slotId, color) {
  const cells = room.bingoState.teamCards[slotId] || []
  const marks = room.bingoState.teamMarks[slotId] || []
  return cells.some((c, idx) => c === color && !marks[idx])
}

// Hat irgendein Gegner von `slotId` ein Kreuz, das der Bonus entfernen darf
// (gesetzt und nicht Teil einer vollen 5er-Reihe)?
function hasRemovableOpponentMark (room, slotId) {
  return room.players.some((p) => {
    if (p.slotId === slotId) return false
    const marks = room.bingoState.teamMarks[p.slotId] || []
    const locked = getLockedMarkIndices(marks)
    return marks.some((m, idx) => m && !locked.has(idx))
  })
}

// Aufgerufen beim Eintritt in die Bonus-Prüfung UND nach jedem eingesetzten
// oder übersprungenen Bonus, deshalb sind 'bonus-check' und 'bonus' erlaubt.
// Bis 1.0.6 ließ die Prüfung nur 'bonus-check' durch: Nach dem Einsetzen
// steht die Phase aber schon auf 'bonus', die Runde ging nie weiter.
function maybeAdvanceBingoPhaseAfterBonus (room) {
  const r = room.bingoState.round
  if (r.phase !== 'bonus-check' && r.phase !== 'bonus') return
  // Ohne entfernbares Kreuz beim Gegner gibt es nichts zu wählen: Bonus
  // verfällt, statt die Runde mit einem leeren Dialog aufzuhalten.
  // Dasselbe gilt für ein Team, das gerade niemand bedienen kann.
  for (const sid of r.bonusPending) {
    if (!r.bonusResolved[sid] && (!hasRemovableOpponentMark(room, sid) || !isSlotConnected(room, sid))) {
      r.bonusResolved[sid] = true
    }
  }
  const stillPending = r.bonusPending.some((sid) => !r.bonusResolved[sid])
  if (stillPending) {
    r.phase = 'bonus'
    return
  }
  // Nach Bonus: Sieg-Check
  checkBingoVictory(room)
}

/**
 * Team mit exaktem Treffer entfernt (optional) ein Kreuz eines Gegners.
 * Kreuze in bereits vollen 5er-Reihen sind gesperrt.
 * `targetSlotId === null` bzw. `cellIndex === null` überspringt den Bonus.
 */
function useBingoBonus (room, username, targetSlotId, cellIndex) {
  if (!room?.bingoState?.round) return { ok: false }
  const r = room.bingoState.round
  if (r.phase !== 'bonus') return { ok: false, reason: 'Gerade gibt es keinen Bonus.' }
  const slot = room.players.find((p) => p.members.includes(username))
  if (!slot) return { ok: false, reason: 'Du spielst in dieser Runde in keinem Team mit.' }
  if (!r.bonusPending.includes(slot.slotId)) return { ok: false, reason: 'Euer Team hat in dieser Runde keinen Bonus.' }
  if (r.bonusResolved[slot.slotId]) return { ok: false, reason: 'Ihr habt euren Bonus schon eingesetzt.' }

  // Skip
  if (targetSlotId === null || targetSlotId === undefined || cellIndex === null || cellIndex === undefined) {
    r.bonusResolved[slot.slotId] = true
    maybeAdvanceBingoPhaseAfterBonus(room)
    return { ok: true, skipped: true }
  }

  const target = room.players.find((p) => p.slotId === targetSlotId)
  if (!target) return { ok: false, reason: 'Dieses Team gibt es nicht mehr.' }
  if (target.slotId === slot.slotId) return { ok: false, reason: 'Den Bonus könnt ihr nicht beim eigenen Team einsetzen.' }
  const marks = room.bingoState.teamMarks[target.slotId] || []
  const idx = Number(cellIndex)
  if (!Number.isInteger(idx) || idx < 0 || idx >= BINGO_CELL_COUNT) {
    return { ok: false, reason: 'Dieses Feld gibt es nicht.' }
  }
  if (!marks[idx]) return { ok: false, reason: 'Auf diesem Feld ist kein Kreuz.' }
  const locked = getLockedMarkIndices(marks)
  if (locked.has(idx)) return { ok: false, reason: 'Das Kreuz gehört zu einer fertigen Reihe und bleibt stehen.' }
  marks[idx] = false
  room.bingoState.bingoCounts[target.slotId] = countCompletedLines(marks)
  r.bonusResolved[slot.slotId] = true
  maybeAdvanceBingoPhaseAfterBonus(room)
  return { ok: true }
}

// Siegziel des Raums (Anzahl voller 5er-Reihen).
function getBingosToWin (room) {
  return Number(room.settings?.bingosToWin) || BINGOS_TO_WIN_DEFAULT
}

/**
 * Prüft nach jeder Runde, ob ein oder mehrere Teams das Bingo-Ziel
 * erreicht haben. Bei mehreren zeitgleich → geteilter Sieg.
 * Mit `onlyOnWin` (Host-Korrektur mitten in einer Runde) bleibt die Phase
 * ohne Sieger unverändert, statt die Runde als abgeschlossen zu markieren.
 */
function checkBingoVictory (room, { onlyOnWin = false } = {}) {
  if (!room?.bingoState) return
  const target = getBingosToWin(room)
  const winners = []
  for (const slot of room.players) {
    const marks = room.bingoState.teamMarks[slot.slotId] || []
    const count = countCompletedLines(marks)
    room.bingoState.bingoCounts[slot.slotId] = count
    if (count >= target) winners.push(slot.slotId)
  }
  if (winners.length > 0) {
    room.bingoState.winners = winners
    room.bingoState.round.phase = 'finished'
    return { winners }
  }
  // Keine Sieger → Runde abschließen, auf nächste warten.
  if (!onlyOnWin) room.bingoState.round.phase = 'round-done'
  return { winners: [] }
}

/**
 * Host beendet die Runde ohne Auflösung (Skip). Setzt zurück ohne Marks
 * zu ändern. Vorher läuft die Sieg-Prüfung wie bei einer regulären
 * Auflösung: Hat ein Team in dieser Runde schon sein letztes Kreuz gesetzt
 * (etwa vor dem Überspringen des Bonus), gewinnt es, statt dass der Sieg mit
 * dem Überspringen verloren geht.
 */
function skipBingoRound (room) {
  if (!room?.bingoState) return { ok: false }
  if (room.bingoState.winners) return { ok: true, winners: room.bingoState.winners }
  const victory = checkBingoVictory(room, { onlyOnWin: true })
  if (victory?.winners?.length) return { ok: true, winners: victory.winners }
  resetBingoRound(room)
  return { ok: true, winners: [] }
}

/**
 * Nach einem Verbindungsverlust: Wartet die Runde nur noch auf Teams, die
 * gerade niemand bedienen kann (Ankreuzen oder Bonus), geht sie weiter.
 * Liefert true, wenn sich die Phase geändert hat.
 */
function advanceStalledBingoRound (room) {
  const r = room?.bingoState?.round
  if (!r || room.bingoState.winners) return false
  const vorher = r.phase
  if (r.phase === 'marking') maybeAdvanceBingoPhaseAfterMarking(room)
  else if (r.phase === 'bonus') maybeAdvanceBingoPhaseAfterBonus(room)
  return r.phase !== vorher
}

/**
 * Host beginnt neue Runde nach Runden-Abschluss.
 */
function nextBingoRound (room) {
  if (!room?.bingoState) return
  if (room.bingoState.winners) return
  resetBingoRound(room)
}

/**
 * Host-Korrektur: alle Kreuze auf allen Feldern zurücksetzen. Die gezogenen
 * Karten (und damit die bereits gespielten Songs) bleiben erhalten – es werden
 * nur die Markierungen, der Sieg-Status und die laufende Runde geleert.
 */
function resetBingoMarks (room) {
  if (!room?.bingoState) return { ok: false }
  const { teamMarks, bingoCounts } = room.bingoState
  for (const slot of room.players) {
    teamMarks[slot.slotId] = new Array(BINGO_CELL_COUNT).fill(false)
    bingoCounts[slot.slotId] = 0
  }
  room.bingoState.winners = null
  room.bingoState.round = makeIdleRound()
  // Das Spiel ist wieder offen. Ohne Reset würde `host:recordGameResult` das
  // Ergebnis des korrigierten Spiels als Doppelbuchung verwerfen.
  room.resultRecorded = false
  return { ok: true }
}

/**
 * Host-Korrektur: ein einzelnes Kreuz eines Teams setzen bzw. entfernen –
 * phasenunabhängig, ohne Farb-/Reihenfolge-Prüfung (Werkzeug für Fehlklicks).
 * Der Bingo-Zähler des Teams wird neu berechnet. Erreicht ein Team durch ein
 * gesetztes Kreuz das Siegziel, endet das Spiel sofort wie bei einem
 * regulären Sieg. Entfernen löst nie einen Sieg aus, kann aber einen falschen
 * Sieg zurücknehmen: Die Sieger werden dann neu bestimmt, und ohne Sieger ist
 * die Runde abgeschlossen (`round-done`), das Spiel läuft weiter
 * (`winnersCleared`).
 */
function hostSetBingoCell (room, slotId, cellIndex, marked) {
  if (!room?.bingoState) return { ok: false }
  const slot = room.players.find((p) => p.slotId === Number(slotId))
  if (!slot) return { ok: false, reason: 'Dieses Team gibt es nicht mehr.' }
  const idx = Number(cellIndex)
  if (!Number.isInteger(idx) || idx < 0 || idx >= BINGO_CELL_COUNT) {
    return { ok: false, reason: 'Dieses Feld gibt es nicht.' }
  }
  const marks = room.bingoState.teamMarks[slot.slotId]
  if (!Array.isArray(marks)) return { ok: false, reason: 'Dieses Team hat noch keine Karte.' }
  marks[idx] = !!marked
  const count = countCompletedLines(marks)
  room.bingoState.bingoCounts[slot.slotId] = count
  // Sieg-Check nur beim Setzen, nur wenn das korrigierte Team damit am Ziel
  // ist, und nur, solange das Spiel noch läuft (kein zweites Spielende).
  // Andere Teams am Ziel teilen sich den Sieg wie bei der regulären Prüfung.
  if (marked && !room.bingoState.winners && count >= getBingosToWin(room)) {
    const victory = checkBingoVictory(room, { onlyOnWin: true })
    if (victory?.winners?.length) return { ok: true, winners: victory.winners }
  }
  if (!marked && room.bingoState.winners) {
    const target = getBingosToWin(room)
    const winners = room.players
      .filter((p) => countCompletedLines(room.bingoState.teamMarks[p.slotId]) >= target)
      .map((p) => p.slotId)
    if (winners.length > 0) {
      room.bingoState.winners = winners
      return { ok: true, winners }
    }
    room.bingoState.winners = null
    room.bingoState.round.phase = 'round-done'
    // Wie beim Zurücksetzen aller Kreuze: Das echte Ergebnis soll später noch
    // verbucht werden können.
    room.resultRecorded = false
    return { ok: true, winnersCleared: true }
  }
  return { ok: true }
}

/**
 * Host schaltet Timer-Modus während des Spiels um.
 */
function setBingoTimerMode (room, timerMode) {
  if (!room?.settings) return { ok: false }
  if (!VALID_BINGO_TIMER_MODES.includes(timerMode)) return { ok: false, reason: 'Diesen Zeitmodus gibt es nicht.' }
  room.settings.bingoTimerMode = timerMode
  // Läuft gerade eine Antwortphase → Deadline anpassen
  const r = room.bingoState?.round
  if (r && r.phase === 'answering') {
    const secs = Number(room.settings.bingoTimerSeconds) || BINGO_TIMER_SECONDS_DEFAULT
    r.deadlineTimestamp = timerMode === 'timer' ? Date.now() + secs * 1000 : null
  }
  return { ok: true }
}

function generateCode () {
  let code
  do {
    code = Array.from({ length: 6 }, () =>
      CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
    ).join('')
  } while (rooms.has(code))
  return code
}

function normalizeGameMode (mode) {
  return VALID_GAME_MODES.includes(mode) ? mode : 'normal'
}

function normalizeBingoSettings (settings = {}) {
  const difficulty = VALID_BINGO_DIFFICULTIES.includes(settings.bingoDifficulty)
    ? settings.bingoDifficulty
    : 'easy'
  const timerMode = VALID_BINGO_TIMER_MODES.includes(settings.bingoTimerMode)
    ? settings.bingoTimerMode
    : 'timer'
  const rawTimerSeconds = Number(settings.bingoTimerSeconds)
  const timerSeconds = Number.isFinite(rawTimerSeconds) && rawTimerSeconds > 0
    ? Math.max(BINGO_TIMER_SECONDS_MIN, Math.min(BINGO_TIMER_SECONDS_MAX, Math.floor(rawTimerSeconds)))
    : BINGO_TIMER_SECONDS_DEFAULT
  const rawToWin = Number(settings.bingosToWin)
  const bingosToWin = Number.isFinite(rawToWin)
    ? Math.max(BINGOS_TO_WIN_MIN, Math.min(BINGOS_TO_WIN_MAX, Math.floor(rawToWin)))
    : BINGOS_TO_WIN_DEFAULT
  return { bingoDifficulty: difficulty, bingoTimerMode: timerMode, bingoTimerSeconds: timerSeconds, bingosToWin }
}

// Versions-Metadaten des Raums neu zusammenstellen: Behalten werden nur
// Einträge für Versionen, die gerade gewählt sind (Raum-Pools oder Battle-Pool
// eines Slots), dazu kommen die neu gemeldeten für `neueKeys`. So wächst die
// Liste nicht mit jeder Auswahl weiter.
function mergeVersionsMeta (room, incoming, neueKeys = []) {
  const alt = room?.settings?.customVersionsMeta || {}
  const aktiv = new Set([
    ...(Array.isArray(room?.settings?.songPools) ? room.settings.songPools : []),
    ...(room?.players || []).map((p) => p.pool).filter(Boolean)
  ])
  const out = {}
  const hat = (obj, key) => !!obj && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, key)
  for (const key of aktiv) {
    if (Object.keys(out).length >= MAX_VERSIONS_META) break
    if (isPoolId(key) && hat(alt, key)) out[key] = alt[key]
  }
  for (const key of neueKeys) {
    if (!isPoolId(key) || !hat(incoming, key)) continue
    if (!hat(out, key) && Object.keys(out).length >= MAX_VERSIONS_META) break
    const meta = sanitizeVersionMeta(key, incoming[key])
    if (meta) out[key] = meta
  }
  return out
}

// Raum-Einstellungen beim Anlegen: nur bekannte Schlüssel mit geprüften
// Werten. Früher wurde alles vom Client übernommen und mit jedem roomState
// wieder verteilt.
function sanitizeRoomSettings (settings) {
  const s = settings && typeof settings === 'object' ? settings : {}
  const gameMode = normalizeGameMode(s.gameMode)
  const songPools = sanitizePoolList(s.songPools, MAX_SONG_POOLS)
  const out = {
    gameMode,
    songPools,
    customVersionsMeta: mergeVersionsMeta(
      { settings: { songPools }, players: [] },
      s.customVersionsMeta,
      songPools
    )
  }
  if (['host-only', 'all-clients'].includes(s.audioMode)) out.audioMode = s.audioMode
  // Spielernamen aus einem geladenen Spielstand (Vorschläge beim Beitritt).
  if (Array.isArray(s.savedPlayers)) {
    out.savedPlayers = s.savedPlayers
      .filter((n) => typeof n === 'string' && n.trim())
      .slice(0, SAVED_PLAYERS_MAX)
      .map((n) => n.trim().slice(0, SLOT_NAME_MAX))
  }
  if (gameMode === 'bingo') Object.assign(out, normalizeBingoSettings(s))
  return out
}

// Anzeigename eines Slots: Text, gekürzt, sonst der Standardname.
function normalizeSlotName (slotName, fallback) {
  const name = typeof slotName === 'string' ? slotName.trim().slice(0, SLOT_NAME_MAX) : ''
  return name || fallback
}

function createRoom (hostUsername, settings = {}, hostUserId = null) {
  if (!hostUsername || typeof hostUsername !== 'string') {
    throw new Error('Ungültiger Host-Username')
  }
  const code = generateCode()
  const mergedSettings = sanitizeRoomSettings(settings)
  const room = {
    code,
    hostUsername,
    // Stabile id des Hosts und des Erstellers (siehe index.js: Aufräumen
    // alter Räume, Namensgleichheit nach Umbenennung).
    hostUserId,
    createdByUserId: hostUserId,
    audioMode: mergedSettings.audioMode || 'host-only',
    settings: mergedSettings,
    players: [],
    gameState: null,
    gameStarted: false,
    createdAt: Date.now()
  }
  rooms.set(code, room)
  return room
}

function getRoom (code) {
  return rooms.get(code) || null
}

function deleteRoom (code) {
  rooms.delete(code)
}

// Alle Räume (für das Aufräumen in index.js).
function getAllRooms () {
  return [...rooms.values()]
}

/**
 * Spieler einem Slot hinzufügen.
 * slotId === null → neuen Slot anlegen
 * slotId === Number → vorhandenem Slot (Team) beitreten
 */
function addPlayerToSlot (code, username, slotId, slotName) {
  const room = rooms.get(code)
  if (!room) return null

  if (slotId === null || slotId === undefined) {
    const nextId = room.players.length > 0
      ? Math.max(...room.players.map(p => p.slotId)) + 1
      : 1
    room.players.push({
      slotId: nextId,
      slotName: normalizeSlotName(slotName, `Spieler ${nextId}`),
      members: [username],
      score: 0,
      objections: 3,
      cards: [],
      pool: null
    })
  } else {
    const slot = room.players.find(p => p.slotId === slotId)
    if (!slot) return null
    if (!slot.members.includes(username)) {
      slot.members.push(username)
    }
  }
  return room
}

/**
 * Setzt den Pool (Song-Version) eines Slots. Nur ein Mitglied des Slots
 * darf ihn setzen. Im Battle-Modus koennen keine zwei Slots denselben Pool
 * haben; sonst wird das Setzen abgelehnt.
 * Rueckgabe: { ok: true, room } oder { ok: false, reason }.
 */
function setSlotPool (code, username, pool) {
  const room = rooms.get(code)
  if (!room) return { ok: false, reason: 'Den Raum gibt es nicht mehr.' }
  const slot = room.players.find(p => p.members.includes(username))
  if (!slot) return { ok: false, reason: 'Du hast in diesem Raum noch keinen Platz.' }
  if (typeof pool !== 'string' || !pool.trim()) {
    return { ok: false, reason: 'Diese Version gibt es nicht.' }
  }
  const normalizedPool = pool.trim()
  if (!isPoolId(normalizedPool)) {
    return { ok: false, reason: 'Diese Version gibt es nicht.' }
  }
  const isBattle = room.settings?.gameMode === 'battle'
  if (isBattle) {
    const duplicate = room.players.some(p => p.slotId !== slot.slotId && p.pool === normalizedPool)
    if (duplicate) {
      return { ok: false, reason: 'Diese Version hat schon jemand anderes gewählt.' }
    }
  }
  slot.pool = normalizedPool
  return { ok: true, room }
}

/**
 * Spieler aus Raum entfernen.
 * Leere Slots werden gelöscht. Leerer Raum wird gelöscht, außer mit
 * `keepRoom`: Beim Slotwechsel ist der Spieler gleich wieder drin, der Raum
 * darf dazwischen nicht verschwinden.
 */
function removePlayerFromRoom (code, username, { keepRoom = false } = {}) {
  const room = rooms.get(code)
  if (!room) return

  room.players = room.players
    .map(slot => ({ ...slot, members: slot.members.filter(m => m !== username) }))
    .filter(slot => slot.members.length > 0)

  if (room.players.length === 0 && !keepRoom) {
    rooms.delete(code)
  }
}
/** Öffentliche Raum-Kurzinfo für Lookup (ohne Spielstand) */
function getRoomPublicInfo (code) {
  const room = rooms.get(code)
  if (!room) return null
  const gameMode = room.settings?.gameMode || 'normal'
  const info = {
    code: room.code,
    hostUsername: room.hostUsername,
    audioMode: room.audioMode,
    gameMode,
    gameStarted: room.gameStarted,
    // Siegerehrung nach Spielende: Slots sind wie im laufenden Spiel fest.
    gameOver: !!room.gameOver,
    players: room.players.map(p => ({
      slotId: p.slotId,
      slotName: p.slotName,
      members: p.members,
      pool: p.pool || null
    })),
    savedPlayers: room.settings?.savedPlayers || null,
    memberAvatars: collectMemberAvatars(room),
  }
  if (gameMode === 'bingo') {
    info.bingoDifficulty = room.settings?.bingoDifficulty || 'easy'
    info.bingoTimerMode = room.settings?.bingoTimerMode || 'timer'
    info.bingoTimerSeconds = room.settings?.bingoTimerSeconds || BINGO_TIMER_SECONDS_DEFAULT
    info.bingosToWin = room.settings?.bingosToWin || BINGOS_TO_WIN_DEFAULT
  }
  return info
}

// Bingo: Ist die Lösung der laufenden Runde noch geheim? Gilt im Bingo-Modus,
// bis die Antworten aufgelöst sind (auch in 'idle', dort schadet es nicht).
function bingoSolutionHidden (room) {
  if (room?.settings?.gameMode !== 'bingo') return false
  return !room.bingoState?.round?.answersRevealed
}

// Felder einer gezogenen Karte, die im Bingo die Antwort verraten.
const BINGO_LOESUNGS_FELDER = ['title', 'artist', 'year', 'years', 'movie', 'ensemble']

/**
 * Spielstand des Hosts (`host:syncState`) für Gäste aufbereiten. Im Bingo
 * steckt in `currentCard` die gezogene Karte samt Titel, Künstler und Jahr.
 * Solange die Runde nicht aufgelöst ist, bleiben davon nur die neutralen
 * Felder (Song-URL, Kartenfarbe) übrig. Die Songdaten kommen nach der
 * Auflösung über `bingoState.round.songData`.
 */
function sanitizeGameStateForGuests (room, gameState) {
  if (!gameState || typeof gameState !== 'object') return gameState
  if (!bingoSolutionHidden(room)) return gameState
  const card = gameState.currentCard
  if (!card || typeof card !== 'object') return gameState
  const neutral = { ...card }
  for (const feld of BINGO_LOESUNGS_FELDER) delete neutral[feld]
  return { ...gameState, currentCard: neutral }
}

/**
 * Für Broadcasts (roomState-Event). Analog zu getRoom, aber filtert
 * sensible Bingo-Runden-Daten heraus, solange die Antwortphase noch läuft:
 * `round.songData`, die Lösungsfelder der Karte im Host-Spielstand und die
 * Antworten der Teams. Verhindert, dass Team-Mitglieder die Antwort (oder
 * die Antwort eines anderen Teams) per Devtools sehen können, bevor die
 * Auflösung freigegeben wurde.
 *
 * Die Antworten fehlen in diesem Zustand für alle (`teamAnswers: {}`). Das
 * eigene Team bekommt seinen Eintrag erst über `roomStateForViewer` zurück,
 * damit gilt: Ohne bekannten Empfänger wird nichts verraten.
 */
function getRoomBroadcastState (code) {
  const room = rooms.get(code)
  if (!room) return null
  const clone = { ...room }
  // Interne Runtime-Objekte aus dem Payload entfernen. Ob gerade auf die
  // Bereitschaft aller gewartet wird, dürfen die Clients aber wissen (die
  // URL selbst nicht), damit ein nachträglich verbundener Client den Ablauf
  // wieder aufnehmen kann.
  clone.songReadyPending = !!room.pendingSongUrl
  delete clone.pendingSongUrl
  delete clone.songReadySlots
  // Rückkehr-Verwaltung (wer gegangen ist, wer zurück darf) ist intern.
  delete clone.leftMembers
  delete clone.rejoinGrants
  // Ebenso die Verwaltung für Statistik und Aufräumen.
  delete clone.memberUserIds
  delete clone.createdByUserId
  delete clone.emptySince
  delete clone.gameStartedAt
  delete clone.lastResultAt
  delete clone.cardsDrawn
  // Profilbilder der Mitglieder mitgeben (username -> avatar|null).
  clone.memberAvatars = collectMemberAvatars(room)
  if (bingoSolutionHidden(room)) {
    clone.gameState = sanitizeGameStateForGuests(room, room.gameState)
  }
  const bs = clone.bingoState
  if (bs && bs.round && !bs.round.answersRevealed) {
    clone.bingoState = {
      ...bs,
      round: { ...bs.round, songData: null, teamAnswers: {} }
    }
  }
  return clone
}

// Muss der roomState pro Empfänger zugeschnitten werden? Nur solange Bingo-
// Antworten noch geheim sind; sonst ist der Payload für alle gleich.
function roomStateNeedsViewer (code) {
  const room = rooms.get(code)
  const round = room?.bingoState?.round
  if (!round || round.answersRevealed) return false
  return Object.keys(round.teamAnswers || {}).length > 0
}

/**
 * Ergänzt einen mit `getRoomBroadcastState` gebauten Zustand um die Antwort
 * des eigenen Teams. Empfänger ohne Slot (Zuschauer) behalten `{}`.
 */
function roomStateForViewer (state, code, username) {
  const room = rooms.get(code)
  const round = room?.bingoState?.round
  if (!state || !round || round.answersRevealed) return state
  const slot = room.players.find((p) => (p.members || []).includes(username))
  if (!slot || !Object.prototype.hasOwnProperty.call(round.teamAnswers || {}, slot.slotId)) {
    return state
  }
  return {
    ...state,
    bingoState: {
      ...state.bingoState,
      round: {
        ...state.bingoState.round,
        teamAnswers: { [slot.slotId]: round.teamAnswers[slot.slotId] }
      }
    }
  }
}

module.exports = {
  createRoom,
  getRoom,
  deleteRoom,
  getAllRooms,
  mergeVersionsMeta,
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
  // Bingo-Runden-API
  startBingoRound,
  openBingoAnswering,
  setBingoTeamAnswer,
  confirmBingoTeamAnswer,
  allBingoTeamsAnswered,
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
  checkBingoVictory,
  countCompletedLines,
  getLockedMarkIndices,
  normalizeGameMode,
  normalizeBingoSettings,
  MAX_SONG_POOLS,
  BINGO_CATEGORIES,
  BINGO_CELL_COUNT,
}
