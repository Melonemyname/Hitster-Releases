// In-Memory Raumverwaltung
const songClassifications = require('./songClassifications')
const { getAvatarMap } = require('./auth')

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

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const VALID_GAME_MODES = ['normal', 'film', 'battle', 'bingo']

const VALID_BINGO_DIFFICULTIES = ['easy', 'hard']
const VALID_BINGO_TIMER_MODES = ['timer', 'wait-all']
const BINGO_TIMER_SECONDS_DEFAULT = 30
const BINGOS_TO_WIN_MIN = 1
const BINGOS_TO_WIN_MAX = 12
const BINGOS_TO_WIN_DEFAULT = 3

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
    .replace(/\s*[([–—-]?\s*(feat\.?|ft\.?|featuring)\b.*$/i, '')
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
    .replace(/\s*[-–—]\s*\b(remaster(?:ed)?|reimagin(?:ed)?)\b.*$/gi, '')
    .replace(/\s+\b(remaster(?:ed)?|reimagin(?:ed)?)\b.*$/gi, '')
    .trim()
}

function splitArtistCandidates (value) {
  return (value || '')
    .toString()
    .split(/,|&| feat\.?| ft\.?| featuring | x | und /i)
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

function matchesTitle (input, expected) {
  const a = stripVersionDescriptors(stripFeaturingFromTitle(input))
  const b = stripVersionDescriptors(stripFeaturingFromTitle(expected))
  return fuzzyMatch(a, b)
}

function matchesArtist (input, expected) {
  const guessed = splitArtistCandidates(input)
  const expectedArtists = splitArtistCandidates(expected)
  if (guessed.length === 0 || expectedArtists.length === 0) return false
  return guessed.some((g) => expectedArtists.some((e) => fuzzyMatch(g, e)))
}

// Kategorie-Auswahl: pro Runde eine zufällige Kategorie aus dem aktuellen
// Schwierigkeitspool.
function pickBingoCategory (difficulty) {
  const list = BINGO_CATEGORIES[difficulty] || BINGO_CATEGORIES.easy
  return list[Math.floor(Math.random() * list.length)]
}

// Bewertung der Team-Antwort. `classification` ist die serverseitig
// gespeicherte Solo/Gruppe-Klassifikation (nur relevant für solo-group).
// Rückgabe: { correct, exactYear } – `exactYear` löst die Bonus-Regel aus.
function evaluateBingoAnswer (category, songData, answer, classification) {
  const year = Number(songData?.year || 0)
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
      const expected = year < 2000 ? 'before' : 'after'
      result.correct = val === expected
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
      result.correct = guess === year
      result.exactYear = result.correct
      return result
    }
    case 'decade': {
      const guess = Number(answer)
      if (!Number.isFinite(guess)) return result
      const decade = Math.floor(year / 10) * 10
      result.correct = guess === decade
      return result
    }
    case 'year-2':
    case 'year-3':
    case 'year-4': {
      const range = category.bonusYearRange || 0
      const guess = Number(answer)
      if (!Number.isFinite(guess) || !year) return result
      const diff = Math.abs(guess - year)
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
  if (!room?.bingoState) return { ok: false, reason: 'Kein Bingo-Raum' }
  if (room.bingoState.winners) return { ok: false, reason: 'Spiel bereits beendet' }
  const difficulty = room.settings?.bingoDifficulty || 'easy'
  const category = pickBingoCategory(difficulty)
  const prevRoundNumber = Number(room.bingoState.round?.roundNumber || 0)
  room.bingoState.round = {
    ...makeIdleRound(),
    phase: 'reveal',
    roundNumber: prevRoundNumber + 1,
    category,
    songLink: songLink || null,
    songData: songData || null // intern, wird beim Auflösen freigegeben
  }
  return { ok: true, category }
}

/**
 * Nach der Kategorie-Reveal-Animation vom Host aufgerufen. Öffnet die
 * Antwortphase (Timer oder wait-all).
 */
function openBingoAnswering (room) {
  if (!room?.bingoState?.round) return { ok: false }
  const r = room.bingoState.round
  if (r.phase !== 'reveal') return { ok: false, reason: 'Falsche Phase' }
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
  if (!room?.bingoState?.round) return { ok: false, reason: 'Keine Runde' }
  const r = room.bingoState.round
  if (r.phase !== 'answering') return { ok: false, reason: 'Antwortphase geschlossen' }
  const slot = room.players.find((p) => p.members.includes(username))
  if (!slot) return { ok: false, reason: 'Kein Team' }
  r.teamAnswers[slot.slotId] = String(value ?? '').slice(0, 120)
  return { ok: true, slotId: slot.slotId }
}

/**
 * Prüft ob alle Teams eine (nicht-leere) Antwort abgegeben haben.
 */
function allBingoTeamsAnswered (room) {
  if (!room?.bingoState?.round) return false
  const answers = room.bingoState.round.teamAnswers
  return room.players.every((p) => {
    const v = answers[p.slotId]
    return v !== undefined && String(v).trim() !== ''
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
  if (r.phase !== 'answering') return { ok: false, reason: 'Nicht in Antwortphase' }

  // Solo/Gruppe: Reihenfolge (1) gespeicherte Klassifikation, (2) Band/Solo aus
  // den Metadaten (ensemble), sonst auf den Host warten.
  if (r.category?.id === 'solo-group') {
    let cls = songClassifications.getClassification(r.songLink)
    if (!cls) {
      cls = ensembleToClassification(r.songData?.ensemble)
      // Aus den Metadaten gewonnene Klassifikation persistieren, damit sie auch
      // ohne Metadaten (z. B. Gastspiel) künftig sofort greift.
      if (cls) {
        try { songClassifications.setClassification(r.songLink, cls) } catch { /* best effort */ }
      }
    }
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
  // Wenn niemand korrekt geraten hat, gibt es nichts zu markieren –
  // Bonus-Phase wird direkt geprüft (führt zu round-done, weil dann auch
  // niemand einen Bonus hat).
  if (r.phase === 'bonus-check') maybeAdvanceBingoPhaseAfterBonus(room)
  return { ok: true, correctSlots, bonusPending, perTeam }
}

/**
 * Host klassifiziert die aktuelle Solo/Gruppe-Runde. Persistiert die
 * Klassifikation, danach wird die Runde regulär ausgewertet.
 */
function classifyBingoSoloGroup (room, classification) {
  if (!room?.bingoState?.round) return { ok: false }
  const r = room.bingoState.round
  if (r.phase !== 'awaiting-solo-group') return { ok: false, reason: 'Falsche Phase' }
  if (classification !== 'solo' && classification !== 'group') {
    return { ok: false, reason: 'Ungültige Klassifikation' }
  }
  songClassifications.setClassification(r.songLink, classification)
  return finalizeBingoAnswerEvaluation(room, classification)
}

/**
 * Team markiert ein freies Feld der Kategorie-Farbe. Nur erlaubt für Teams
 * in `correctSlots` und nur einmal pro Runde.
 */
function markBingoCell (room, username, cellIndex) {
  if (!room?.bingoState?.round) return { ok: false, reason: 'Keine Runde' }
  const r = room.bingoState.round
  if (r.phase !== 'marking') return { ok: false, reason: 'Nicht in Markier-Phase' }
  const slot = room.players.find((p) => p.members.includes(username))
  if (!slot) return { ok: false, reason: 'Kein Team' }
  if (!r.correctSlots.includes(slot.slotId)) return { ok: false, reason: 'Team hat nicht korrekt geraten' }
  if (r.markedThisRound[slot.slotId]) return { ok: false, reason: 'Bereits markiert' }
  const idx = Number(cellIndex)
  if (!Number.isInteger(idx) || idx < 0 || idx >= BINGO_CELL_COUNT) {
    return { ok: false, reason: 'Ungültiges Feld' }
  }
  const cells = room.bingoState.teamCards[slot.slotId] || []
  const marks = room.bingoState.teamMarks[slot.slotId] || []
  if (cells[idx] !== r.category.color) return { ok: false, reason: 'Falsche Farbe' }
  if (marks[idx]) return { ok: false, reason: 'Feld bereits markiert' }
  marks[idx] = true
  r.markedThisRound[slot.slotId] = true
  room.bingoState.bingoCounts[slot.slotId] = countCompletedLines(marks)
  maybeAdvanceBingoPhaseAfterMarking(room)
  return { ok: true }
}

function maybeAdvanceBingoPhaseAfterMarking (room) {
  const r = room.bingoState.round
  const allMarked = r.correctSlots.every((sid) => r.markedThisRound[sid])
  if (!allMarked) return
  r.phase = 'bonus-check'
  maybeAdvanceBingoPhaseAfterBonus(room)
}

function maybeAdvanceBingoPhaseAfterBonus (room) {
  const r = room.bingoState.round
  if (r.phase !== 'bonus-check') return
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
  if (r.phase !== 'bonus') return { ok: false, reason: 'Nicht in Bonus-Phase' }
  const slot = room.players.find((p) => p.members.includes(username))
  if (!slot) return { ok: false, reason: 'Kein Team' }
  if (!r.bonusPending.includes(slot.slotId)) return { ok: false, reason: 'Kein Bonus für dieses Team' }
  if (r.bonusResolved[slot.slotId]) return { ok: false, reason: 'Bonus bereits eingesetzt' }

  // Skip
  if (targetSlotId === null || targetSlotId === undefined || cellIndex === null || cellIndex === undefined) {
    r.bonusResolved[slot.slotId] = true
    maybeAdvanceBingoPhaseAfterBonus(room)
    return { ok: true, skipped: true }
  }

  const target = room.players.find((p) => p.slotId === targetSlotId)
  if (!target) return { ok: false, reason: 'Zielteam nicht gefunden' }
  if (target.slotId === slot.slotId) return { ok: false, reason: 'Kein Bonus auf eigenes Team' }
  const marks = room.bingoState.teamMarks[target.slotId] || []
  const idx = Number(cellIndex)
  if (!Number.isInteger(idx) || idx < 0 || idx >= BINGO_CELL_COUNT) {
    return { ok: false, reason: 'Ungültiges Feld' }
  }
  if (!marks[idx]) return { ok: false, reason: 'Feld ist nicht markiert' }
  const locked = getLockedMarkIndices(marks)
  if (locked.has(idx)) return { ok: false, reason: 'Feld ist Teil einer abgeschlossenen Reihe' }
  marks[idx] = false
  room.bingoState.bingoCounts[target.slotId] = countCompletedLines(marks)
  r.bonusResolved[slot.slotId] = true
  maybeAdvanceBingoPhaseAfterBonus(room)
  return { ok: true }
}

/**
 * Prüft nach jeder Runde, ob ein oder mehrere Teams das Bingo-Ziel
 * erreicht haben. Bei mehreren zeitgleich → geteilter Sieg.
 */
function checkBingoVictory (room) {
  if (!room?.bingoState) return
  const target = Number(room.settings?.bingosToWin) || BINGOS_TO_WIN_DEFAULT
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
  room.bingoState.round.phase = 'round-done'
  return { winners: [] }
}

/**
 * Host beendet die Runde ohne Auflösung (Skip). Setzt zurück ohne Marks
 * zu ändern.
 */
function skipBingoRound (room) {
  if (!room?.bingoState) return
  if (room.bingoState.winners) return
  resetBingoRound(room)
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
  return { ok: true }
}

/**
 * Host-Korrektur: ein einzelnes Kreuz eines Teams setzen bzw. entfernen –
 * phasenunabhängig, ohne Farb-/Reihenfolge-Prüfung (Werkzeug für Fehlklicks).
 * Der Bingo-Zähler des Teams wird neu berechnet.
 */
function hostSetBingoCell (room, slotId, cellIndex, marked) {
  if (!room?.bingoState) return { ok: false }
  const slot = room.players.find((p) => p.slotId === Number(slotId))
  if (!slot) return { ok: false, reason: 'Team nicht gefunden' }
  const idx = Number(cellIndex)
  if (!Number.isInteger(idx) || idx < 0 || idx >= BINGO_CELL_COUNT) {
    return { ok: false, reason: 'Ungültiges Feld' }
  }
  const marks = room.bingoState.teamMarks[slot.slotId]
  if (!Array.isArray(marks)) return { ok: false, reason: 'Kein Feld' }
  marks[idx] = !!marked
  room.bingoState.bingoCounts[slot.slotId] = countCompletedLines(marks)
  return { ok: true }
}

/**
 * Host schaltet Timer-Modus während des Spiels um.
 */
function setBingoTimerMode (room, timerMode) {
  if (!room?.settings) return { ok: false }
  if (!VALID_BINGO_TIMER_MODES.includes(timerMode)) return { ok: false, reason: 'Ungültig' }
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
    ? Math.floor(rawTimerSeconds)
    : BINGO_TIMER_SECONDS_DEFAULT
  const rawToWin = Number(settings.bingosToWin)
  const bingosToWin = Number.isFinite(rawToWin)
    ? Math.max(BINGOS_TO_WIN_MIN, Math.min(BINGOS_TO_WIN_MAX, Math.floor(rawToWin)))
    : BINGOS_TO_WIN_DEFAULT
  return { bingoDifficulty: difficulty, bingoTimerMode: timerMode, bingoTimerSeconds: timerSeconds, bingosToWin }
}

function createRoom (hostUsername, settings = {}) {
  if (!hostUsername || typeof hostUsername !== 'string') {
    throw new Error('Ungültiger Host-Username')
  }
  const code = generateCode()
  const gameMode = normalizeGameMode(settings.gameMode)
  const mergedSettings = { ...settings, gameMode }
  if (gameMode === 'bingo') {
    Object.assign(mergedSettings, normalizeBingoSettings(settings))
  }
  const room = {
    code,
    hostUsername,
    audioMode: ['host-only', 'all-clients'].includes(settings.audioMode) ? settings.audioMode : 'host-only',
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
      slotName: slotName || `Spieler ${nextId}`,
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
  if (!room) return { ok: false, reason: 'Raum nicht gefunden' }
  const slot = room.players.find(p => p.members.includes(username))
  if (!slot) return { ok: false, reason: 'Du bist in keinem Slot dieses Raums' }
  if (typeof pool !== 'string' || !pool.trim()) {
    return { ok: false, reason: 'Ungültige Version' }
  }
  const normalizedPool = pool.trim()
  if (normalizedPool.length > 100) {
    return { ok: false, reason: 'Ungültige Version' }
  }
  const isBattle = room.settings?.gameMode === 'battle'
  if (isBattle) {
    const duplicate = room.players.some(p => p.slotId !== slot.slotId && p.pool === normalizedPool)
    if (duplicate) {
      return { ok: false, reason: 'Diese Version wurde bereits von einem anderen Spieler gewählt' }
    }
  }
  slot.pool = normalizedPool
  return { ok: true, room }
}

/**
 * Spieler aus Raum entfernen.
 * Leere Slots werden gelöscht. Leerer Raum wird gelöscht.
 */
function removePlayerFromRoom (code, username) {
  const room = rooms.get(code)
  if (!room) return

  room.players = room.players
    .map(slot => ({ ...slot, members: slot.members.filter(m => m !== username) }))
    .filter(slot => slot.members.length > 0)

  if (room.players.length === 0) {
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

/**
 * Für Broadcasts (roomState-Event). Analog zu getRoom, aber filtert
 * sensible Bingo-Runden-Daten (`round.songData`) heraus, solange die
 * Antwortphase noch läuft. Verhindert, dass Team-Mitglieder die Antwort
 * per Devtools sehen können, bevor die Auflösung freigegeben wurde.
 */
function getRoomBroadcastState (code) {
  const room = rooms.get(code)
  if (!room) return null
  const clone = { ...room }
  // Interne Runtime-Objekte aus dem Payload entfernen
  delete clone.pendingSongUrl
  delete clone.songReadySlots
  // Profilbilder der Mitglieder mitgeben (username -> avatar|null).
  clone.memberAvatars = collectMemberAvatars(room)
  const bs = clone.bingoState
  if (bs && bs.round && !bs.round.answersRevealed) {
    clone.bingoState = {
      ...bs,
      round: { ...bs.round, songData: null }
    }
  }
  return clone
}

module.exports = {
  createRoom,
  getRoom,
  deleteRoom,
  addPlayerToSlot,
  removePlayerFromRoom,
  setSlotPool,
  getRoomPublicInfo,
  getRoomBroadcastState,
  initBingoState,
  ensureAllTeamsHaveCards,
  // Bingo-Runden-API
  startBingoRound,
  openBingoAnswering,
  setBingoTeamAnswer,
  allBingoTeamsAnswered,
  resolveBingoRound,
  classifyBingoSoloGroup,
  markBingoCell,
  useBingoBonus,
  skipBingoRound,
  nextBingoRound,
  resetBingoMarks,
  hostSetBingoCell,
  setBingoTimerMode,
  checkBingoVictory,
  countCompletedLines,
  getLockedMarkIndices,
  normalizeGameMode,
  normalizeBingoSettings,
  BINGO_CATEGORIES,
  BINGO_CELL_COUNT,
}
