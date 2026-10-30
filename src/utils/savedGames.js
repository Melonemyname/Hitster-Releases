// Liste gespeicherter Spielstände im Browser.
//
// Früher gab es genau einen Spielstand unter SESSION_STORAGE_KEY, jedes
// Speichern überschrieb den vorigen. Jetzt landen bis zu MAX_ENTRIES Stände in
// einer eigenen Liste. Der Ladeweg bleibt aber der alte: Wer einen Stand aus
// der Liste spielen will, schreibt ihn mit activateSavedGame() zurück unter
// SESSION_STORAGE_KEY und routet wie bisher mit `loadSession=1`. So müssen
// Game.vue und Lobby.vue am eigentlichen Laden nichts ändern.

const SAVED_GAMES_KEY = "hitster-saved-games-v1";
const SESSION_STORAGE_KEY = "hitster-session-save-v1";
const MAX_ENTRIES = 10;
const KNOWN_MODES = new Set(["normal", "film", "battle", "bingo"]);

// ── Speicher ─────────────────────────────────────────────────────────────

function readEntries() {
  try {
    const raw = localStorage.getItem(SAVED_GAMES_KEY);
    if (raw === null) return migrateSingleSnapshot();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e) => e && typeof e === "object" && e.id && e.snapshot && typeof e.snapshot === "object",
    );
  } catch {
    return [];
  }
}

// Schreibt die Liste. Reicht der Speicher nicht (mehrere Stände mit langer
// Song-Historie können groß werden), fliegen die ältesten Einträge raus, bis
// es passt. Lieber ein alter Stand weniger als gar keiner.
function writeEntries(entries) {
  let list = sortNewestFirst(entries).slice(0, MAX_ENTRIES);
  for (;;) {
    try {
      localStorage.setItem(SAVED_GAMES_KEY, JSON.stringify(list));
      return true;
    } catch (e) {
      if (list.length <= 1) {
        console.warn("Spielstände nicht im Browser gespeichert:", e);
        return false;
      }
      list = list.slice(0, list.length - 1);
    }
  }
}

function sortNewestFirst(entries) {
  return [...entries].sort((a, b) => timeOf(b.savedAt) - timeOf(a.savedAt));
}

function timeOf(iso) {
  const t = new Date(iso || "").getTime();
  return Number.isNaN(t) ? 0 : t;
}

function validIsoOrNow(value) {
  const t = new Date(value || "").getTime();
  return Number.isNaN(t) ? new Date().toISOString() : new Date(t).toISOString();
}

function createId() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {
    /* Kein sicherer Kontext, dann reicht der Zufallsstring unten. */
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// Ohne ausdrückliche Angabe lässt sich die Herkunft nur raten: Bingo gibt es
// ausschließlich online, alles andere gilt als lokales Spiel.
function guessSource(snapshot) {
  if (snapshot?.source === "online" || snapshot?.source === "local") return snapshot.source;
  if (snapshot?.gameMode === "bingo") return "online";
  return "local";
}

// Einmalige Übernahme des alten Einzel-Spielstands. Läuft nur, solange die
// Liste noch gar nicht existiert. Danach steht unter SAVED_GAMES_KEY immer
// mindestens "[]", sonst käme ein gelöschter Stand beim nächsten Lesen wieder.
function migrateSingleSnapshot() {
  let entries = [];
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (raw) {
      const snapshot = JSON.parse(raw);
      if (snapshot && typeof snapshot === "object") {
        entries = [makeEntry(snapshot, guessSource(snapshot))];
      }
    }
  } catch {
    /* Alter Stand unlesbar, dann startet die Liste leer. */
  }
  writeEntries(entries);
  return entries;
}

function makeEntry(snapshot, source) {
  return {
    id: createId(),
    savedAt: validIsoOrNow(snapshot.savedAt),
    source: source === "online" ? "online" : "local",
    snapshot,
  };
}

// ── Öffentliche API ──────────────────────────────────────────────────────

export function listSavedGames() {
  return sortNewestFirst(readEntries()).map((e) => ({
    id: e.id,
    savedAt: e.savedAt,
    source: e.source === "online" ? "online" : "local",
    summary: summarizeSnapshot(e.snapshot),
  }));
}

export function getSavedGame(id) {
  const entry = readEntries().find((e) => e.id === id);
  return entry ? entry.snapshot : null;
}

// Trägt einen Stand mit derselben `gameId` schon in der Liste, wird er ersetzt
// statt ergänzt. Sonst füllte eine einzige Partie mit vielen Runden (jede
// neue Runde speichert still) die ganze Liste und verdrängte alle anderen.
export function addSavedGame(snapshot, { source } = {}) {
  if (!snapshot || typeof snapshot !== "object") return null;
  const entry = makeEntry(snapshot, source || guessSource(snapshot));
  const entries = readEntries();
  const gameId = snapshot.gameId;
  const kept = gameId
    ? entries.filter((e) => e.snapshot?.gameId !== gameId)
    : entries;
  writeEntries([entry, ...kept]);
  return entry.id;
}

export function deleteSavedGame(id) {
  const entries = readEntries();
  const kept = entries.filter((e) => e.id !== id);
  if (kept.length !== entries.length) writeEntries(kept);
}

// Legt den Stand dort ab, wo der bestehende Ladeweg ihn sucht
// (useGameState.loadSessionSnapshot und die Lobby beim Raum-Anlegen).
export function activateSavedGame(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return false;
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(snapshot));
    return true;
  } catch (e) {
    console.warn("Spielstand nicht aktiviert:", e);
    return false;
  }
}

// Prüfung einer heruntergeladenen Spielstand-Datei. Dieselbe Regel wie bisher
// in useGameState, Index.vue und Lobby.vue: Entweder ist es der Stand selbst
// (erkennbar an `players`), oder ein Export des ganzen Browser-Speichers, in
// dem der Stand als Text unter dem alten Schlüssel steckt.
export function parseSnapshotText(text) {
  const parsed = JSON.parse(text);
  if (parsed && typeof parsed === "object" && parsed.players) return parsed;
  const rawSession = parsed?.[SESSION_STORAGE_KEY];
  if (typeof rawSession === "string") return JSON.parse(rawSession);
  throw new Error("Datei enthält keinen gültigen Spielstand.");
}

export async function readSnapshotFile(file) {
  if (!file) throw new Error("Keine Datei ausgewählt.");
  const text = await file.text();
  return parseSnapshotText(text);
}

// Kurzfassung für die Liste. Welche Teile ein Stand enthält, hängt von den
// Speicher-Optionen ab (Namen, Punkte, gespielte Karten), deshalb ist alles,
// was fehlen kann, hier `null` statt einer erfundenen Null.
export function summarizeSnapshot(snapshot) {
  const s = snapshot && typeof snapshot === "object" ? snapshot : {};
  const mode = KNOWN_MODES.has(s.gameMode) ? s.gameMode : null;

  const counts = Array.isArray(s.playerCardCounts) ? s.playerCardCounts : [];
  const cardsAt = (i) => {
    const n = Number(counts[i]);
    return i < counts.length && Number.isFinite(n) ? n : null;
  };
  const savedPlayers = Array.isArray(s.players) ? s.players : [];
  const players = savedPlayers.length > 0
    ? savedPlayers.map((p, i) => {
        const pts = Number(p?.points);
        return {
          name: p?.name || `Spieler ${i + 1}`,
          points: p && p.points !== undefined && Number.isFinite(pts) ? pts : null,
          cards: cardsAt(i),
        };
      })
    : counts.map((_, i) => ({ name: `Spieler ${i + 1}`, points: null, cards: cardsAt(i) }));

  const pools = [];
  if (Array.isArray(s.songPools)) pools.push(...s.songPools);
  else if (s.songPool) pools.push(s.songPool);
  if (Array.isArray(s.playerSongPools)) pools.push(...s.playerSongPools);
  const versions = [
    ...new Set(pools.map((v) => (v || "").toString().trim().toLowerCase()).filter(Boolean)),
  ];

  let playedCount = null;
  if (Array.isArray(s.playedLinksHistory)) playedCount = s.playedLinksHistory.length;
  else if (Array.isArray(s.playedSongs)) playedCount = s.playedSongs.length;

  return { mode, players, versions, playedCount };
}
