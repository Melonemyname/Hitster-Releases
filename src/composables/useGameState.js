import { ref, computed, reactive, watch } from "vue";
import { Notify } from "quasar";
import { GAME_CONSTANTS } from "../utils/gameConstants";
import {
  createMetadataLookup,
  getTrackMetadataWithCache,
} from "../utils/spotifyCsvService";
import { songIdentitySignature, yearsOf } from "../utils/songVariants";
import {
  getKnownEditionValues,
  getSongPoolFileMapping,
} from "../utils/songDataProvider";
import { readCustomVersions } from "../utils/customVersionsStore";
import { readRestrictedVersions } from "../utils/restrictedVersionsStore";
import {
  openSongTab,
  canOpenSongWithoutClick,
} from "../utils/songTabManager";
import { addSavedGame, parseSnapshotText } from "../utils/savedGames";

const SCORE_STORAGE_KEY = "hitster-player-scores-v1";
const SESSION_STORAGE_KEY = "hitster-session-save-v1";
const LEGACY_PLAYED_LINKS_KEY = "hitster-played-links";

// Drei Töne minimal verschoben (vorher #2980b9, #9b59b6, #d35400), weil darauf
// weder helle noch dunkle Schrift 4,5:1 erreichte (Barrierefreiheit, WCAG 1.4.3). Die
// Schriftfarbe je Karte wählt Game.vue per readableTextOn().
const CARD_COLORS = [
  "#1abc9c", "#16a085", "#2ecc71", "#27ae60", "#3498db",
  "#2a84bf", "#9854b4", "#8e44ad", "#34495e", "#2c3e50",
  "#f1c40f", "#f39c12", "#e67e22", "#d65500", "#e74c3c",
  "#c0392b", "#95a5a6", "#7f8c8d", "#5f27cd", "#00d2d3",
  "#ff9f43", "#10ac84", "#ee5253", "#54a0ff", "#576574",
  "#222f3e", "#ff6b6b", "#48dbfb", "#1dd1a1", "#feca57",
];

// Gültige Pool-Werte zur Laufzeit: bekannte Editionen (aus dem Song-Daten-Store,
// inkl. dynamisch erkannter Ordner-Editionen) + eigene importierte Versionen.
// Bewusst KEINE Modul-Konstante mehr: früher fiel alles Unbekannte (auch eigene
// Versionen) still auf "staffel1" zurück.
function getValidPoolValues() {
  const values = getKnownEditionValues();
  for (const v of readCustomVersions()) values.add(v.value);
  for (const v of readRestrictedVersions()) values.add(v.value);
  return values;
}

// ── Song-Pool-Normalisierung ─────────────────────────────────────────────

export function normalizeSongPool(poolValue) {
  const normalized = (poolValue || "").toString().trim().toLowerCase();
  if (normalized === "mixed") return normalized;
  const valid = getValidPoolValues();
  // Vor dem Boot (Store noch leer) nicht wegfiltern, sonst bricht der Fallback.
  if (valid.size === 0) return normalized;
  if (valid.has(normalized)) return normalized;
  return "";
}

export function normalizeSongPools(poolValues) {
  const list = Array.isArray(poolValues)
    ? poolValues
    : (poolValues || "").toString().split(",");
  const cleaned = list.map((v) => v.toString().trim().toLowerCase());
  const valid = getValidPoolValues();
  if (valid.size === 0) return [...new Set(cleaned.filter(Boolean))];
  return [...new Set(cleaned.filter((v) => valid.has(v)))];
}

export function resolveSongPools(songPoolsValue, songPoolFallback) {
  const valid = getValidPoolValues();
  // Sicherer Default: Staffel 1 nur, wenn verfügbar (ist jetzt eine
  // eingeschränkte Version); sonst irgendeine gültige Edition, damit der
  // Spielstart bei leerer/korrupter Auswahl nie ins Leere läuft.
  const safeDefault = () => {
    if (valid.size === 0) return ["staffel1"]; // vor dem Boot: nicht wegfiltern
    if (valid.has("staffel1")) return ["staffel1"];
    const first = [...valid][0];
    return first ? [first] : ["staffel1"];
  };
  const multi = normalizeSongPools(songPoolsValue);
  if (multi.length > 0) return multi;
  const single = normalizeSongPool(songPoolFallback);
  if (single === "mixed") {
    const mix = ["staffel1", "staffel2"].filter((v) => valid.has(v));
    return mix.length ? mix : safeDefault();
  }
  if (single) return [single];
  return safeDefault();
}

// ── Spielernamen in der URL ──────────────────────────────────────────────

// Spielernamen gehen als JSON-Array in den Query-Parameter `names`. Früher
// war das eine Komma-Liste, dabei zerfiel ein Teamname wie „Mama, Papa" in
// zwei Namen. Gelesen werden beide Formate, damit alte Links weiter gehen.
export function encodeNamesQuery(names) {
  return JSON.stringify((names || []).map((n) => (n ?? "").toString()));
}

export function decodeNamesQuery(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === null || raw === undefined || raw === "") return [];
  const text = raw.toString();
  if (text.startsWith("[")) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return parsed.map((n) => (n ?? "").toString());
      }
    } catch {
      /* Kein JSON, also alte Komma-Liste (z. B. Name „[DJ]"). */
    }
  }
  return text.split(",");
}

// Die laufenden Punkte liegen nach Spielername im Browser, damit ein Neuladen
// der Spielseite sie nicht verliert. Ein neues Spiel muss sie deshalb leeren,
// sonst erbt „Spieler 1" die Punkte von „Spieler 1" aus der Vorrunde, auch
// wenn der Spielstand gar nicht gespeichert wurde.
//
// Damit ein anderes Spiel die Punkte nie erbt, liegen sie zusammen mit der
// Spiel-ID `gid` aus der URL ({ gid, scores }). Die Startseite vergibt für
// jedes neu gestartete lokale Spiel eine frische ID, ein Neuladen behält sie.
// Früher hing die Zuordnung allein am Namen: Ein Onlinespiel mit den Namen
// „Spieler 1/2" erbte so die Punkte eines lokalen Spiels, das per
// Browser-Zurück verlassen wurde.
export function clearStoredScores() {
  try {
    localStorage.removeItem(SCORE_STORAGE_KEY);
  } catch {
    /* Speicher nicht verfügbar, dann gibt es auch nichts zu erben. */
  }
}

function queryText(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === null || raw === undefined ? "" : raw.toString().trim();
}

// ── Composable ───────────────────────────────────────────────────────────

export function useGameState(route, router) {
  // deps wird von Game.vue nach Multiplayer-Setup befüllt
  const deps = {
    syncMultiplayerState: () => {},
    socketEmit: () => {},
  };

  // ── Refs ─────────────────────────────────────────────────────────────

  const selectedSongPools = ref(
    resolveSongPools(route.query.songPools, route.query.songPool),
  );
  const getPlayedLinksStorageKey = () =>
    `hitster-played-links-${selectedSongPools.value.slice().sort().join("+")}`;

  const playerCount = ref(parseInt(route.query.players) || 2);
  // Spielmodus: "film" = Film/Serie-Modus (Extra-Feld + eigenes Scoring),
  // "battle" = Battle-Modus (jeder Spieler hat eine eigene Version),
  // "bingo"  = Bingo-Modus (Team-basiert, MP-only, 5x5-Bingokarte), sonst normal.
  // Kommt beim Start als Query-Param.
  const gameMode = ref(
    route.query.mode === "film"
      ? "film"
      : route.query.mode === "battle"
        ? "battle"
        : route.query.mode === "bingo"
          ? "bingo"
          : "normal",
  );
  // Bingo-Konfiguration (nur relevant im Bingo-Modus). Die Query liefert nur
  // den Startwert; danach gilt, was der Server per `roomState` schickt (etwa
  // wenn der Host im Spiel zwischen Timer und Warten umschaltet), siehe
  // useMultiplayer.
  const bingoSettings = reactive({
    difficulty:
      route.query.bingoDifficulty === "hard" ? "hard" : "easy",
    timerMode:
      route.query.bingoTimerMode === "wait-all" ? "wait-all" : "timer",
    timerSeconds: (() => {
      const parsed = parseInt(route.query.bingoTimerSeconds, 10);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
    })(),
    bingosToWin: (() => {
      const parsed = parseInt(route.query.bingosToWin, 10);
      if (!Number.isFinite(parsed)) return 3;
      return Math.max(1, Math.min(12, parsed));
    })(),
  });
  // Bingo-Runden-State: pro Team-Slot eine 25er-Farb-Karte + 25er-Kreuz-Array,
  // dazu der aktuelle Runden-Zustand vom Server (Kategorie, Phase, Antworten,
  // Bonus, Sieger). Wird initial aus sessionStorage geladen (vom Lobby-
  // Übergang gesetzt), spätere Änderungen kommen via `roomState`-Event vom
  // Server (siehe useMultiplayer).
  const bingoState = ref(
    (() => {
      if (gameMode.value !== "bingo") return null;
      try {
        const raw = sessionStorage.getItem("hitster-bingo-state");
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return null;
        return {
          teamCards: parsed.teamCards || {},
          teamMarks: parsed.teamMarks || {},
          bingoCounts: parsed.bingoCounts || {},
          round: parsed.round || null,
          winners: parsed.winners || null,
        };
      } catch {
        return null;
      }
    })(),
  );
  // Battle-Modus: Pool pro Spieler-Index. Leer außerhalb des Battle-Modus.
  const playerSongPools = ref(
    (route.query.playerSongPools || "")
      .toString()
      .split(",")
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean),
  );

  // Defensiv: `gameMode` an route.query.mode koppeln. Der `:key`-Fix am
  // `<router-view>` (MainLayout) sollte bei Modus-Wechsel eigentlich
  // schon ein Remount erzwingen, sodass useGameState frisch mit dem
  // neuen mode initialisiert wird. Falls das aus irgendeinem Grund
  // nicht greift (z. B. Router-Navigation, die als „same route" gilt),
  // hält dieser Watcher den `gameMode` trotzdem synchron zur URL –
  // dann wechselt der Client sofort in den neuen Modus, statt erst
  // beim nächsten `stateUpdate` vom Host mitzuwechseln.
  watch(
    () => route.query.mode,
    (newMode) => {
      const normalized =
        newMode === "film"
          ? "film"
          : newMode === "battle"
            ? "battle"
            : newMode === "bingo"
              ? "bingo"
              : "normal";
      if (gameMode.value !== normalized) gameMode.value = normalized;
    },
  );
  const playerNames = ref([]);
  const currentPlayerIndex = ref(0);
  const playerTimelines = ref([]);
  const currentCard = ref(null);
  const skipSongRequested = ref(false);
  const showFeedback = ref(false);
  const feedbackCorrect = ref(false);
  const feedbackMessage = ref("");
  const loadingNextSong = ref(false);
  const playedSongs = ref([]);

  // Manuelle Karte
  const showManualCardDialog = ref(false);
  const manualCardTitle = ref("");
  const manualCardArtist = ref("");
  const manualCardYear = ref(null);
  const manualCardPlayerIndex = ref(0);

  // Einwand-Mechanik
  const showObjectionDialog = ref(false);
  const objectionAttempts = ref([]);
  const pendingPlacement = ref(null);
  const pendingPlacementResult = ref(null);
  const pendingPlacementOriginal = ref(null);
  const pendingObjectionPlacement = ref(null);
  const pendingGuessPoints = ref(0);
  const pendingGuessObjectionReward = ref(0);

  // Sieg
  const showVictoryDialog = ref(false);
  const winnerName = ref("");
  const victoryHeadline = ref("hat gewonnen!");
  const victorySubline = ref("");
  const showRestartDialog = ref(false);

  // Session
  const showSaveSessionDialog = ref(false);
  const saveDialogCallbackPending = ref(false);
  let _afterSaveCallback = null;
  const showLoadSessionDialog = ref(false);
  const sessionFileInput = ref(null);
  const saveSessionOptions = ref({
    playerNames: true,
    points: true,
    playedCards: true,
  });
  const hasAnySaveSessionOption = computed(
    () =>
      saveSessionOptions.value.playerNames ||
      saveSessionOptions.value.points ||
      saveSessionOptions.value.playedCards,
  );

  const MAX_CARDS = 10;
  const turnCounts = ref([]);

  // Song-Verwaltung
  const currentSongLink = ref(null);
  // Welcher Song auf DIESEM Gerät zuletzt geöffnet wurde (bzw. das Öffnen
  // angestoßen). Der Rate-Dialog sagt nur dann „wurde geöffnet“, wenn das der
  // aktuelle Song ist. Ob Spotify wirklich aufgeht, lässt sich nicht abfragen.
  const songOpenedUrl = ref(null);
  // Song, der ohne Klick nicht geöffnet werden konnte (Browser blockiert
  // `spotify:`/Popups ohne Nutzergeste). Die Oberfläche zeigt dafür den
  // Knopf „Jetzt abspielen“.
  const songPlayPromptUrl = ref(null);
  const preloadedLink = ref(null);
  const playedLinksHistory = ref([]);
  const allSongLinks = ref([]);
  // Nur relevant im Battle-Modus: Zuordnung Song-Link -> Pool-Value,
  // damit beim Ziehen nach dem aktuellen Spieler-Pool gefiltert werden kann.
  const songLinkPoolMap = ref(new Map());
  const showGuessDialog = ref(false);

  // Ratemechanik
  const playerHasGuessed = ref(false);
  const guessedTitle = ref("");
  const guessedArtist = ref("");
  const guessedYear = ref(null);
  // Film/Serie-Rateeingabe (nur Film-Modus).
  const guessedMovie = ref("");
  const guessResults = ref(null);
  const inlineYearValue = ref(null);
  const feedbackCountdown = ref(5);
  let feedbackCountdownTimer = null;
  const usedCards = ref([]);

  // Objection / Resolution
  const currentObjectionPlayerIndex = ref(null);
  const activeGuessPlayerIndex = ref(null);
  const isObjectionPhase = ref(false);
  const playerIndexAfterResolution = ref(null);
  const loadingFirstCard = ref({});

  // Neuer Einwand-Ablauf (Etappe 1, lokal): 10-Sek-Opt-in-Fenster, danach
  // geordnete Platzierungen (je 30 Sek), Auflösung ggf. per Number-Picker.
  const objectionOptInActive = ref(false); // Opt-in-Fenster offen
  const objectionOptIns = ref([]); // Spieler-Indizes, die einwenden wollen
  const objectionOptInCountdown = ref(0); // Restsekunden Opt-in
  const objectionQueue = ref([]); // geordnete Einwender für die Platzierung
  const objectionQueuePos = ref(0); // Position in der Warteschlange
  const objectionPlacementCountdown = ref(0); // Restsekunden aktueller Einwender
  const objectionRaffleActive = ref(false); // Number-Picker-Animation läuft
  const objectionRaffleNames = ref([]); // Kandidaten-Namen (korrekte Einwender)
  const objectionRaffleHighlight = ref(0); // aktuell hervorgehobener Kandidat
  const objectionRaffleWinner = ref(null); // Gewinner-Position in objectionRaffleNames
  const correctObjectorNames = ref([]); // für die Feedback-Liste
  const objectionWinnerName = ref(""); // wer die Karte bekommt (Feedback-Markierung)

  // Multiplayer-State (Refs die hier leben, Logik in useMultiplayer)
  const multiplayerMode = ref(false);
  // Spiel-ID für den Punkte-Speicher, siehe clearStoredScores. Wird in
  // initGame aus der URL übernommen und danach festgehalten, damit ein
  // Speichern nach dem Wegnavigieren nicht unter fremder ID landet.
  let scoreGameId = queryText(route.query.gid);
  // Kennung des Spiels in der Liste gespeicherter Stände (savedGames.js).
  // Jede neue Runde speichert still, mit derselben Kennung ersetzt das den
  // Eintrag dieses Spiels, statt die Liste zu füllen. Ein geladener Stand
  // bringt seine Kennung mit, Weiterspielen überschreibt dann diesen Eintrag.
  let saveGameId =
    scoreGameId ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const multiplayerIsHost = ref(false);
  const multiplayerRoomCode = ref("");
  const multiplayerAudioMode = ref("host-only");
  // Name und Cover eigener und freigegebener Versionen aus dem Raum. Gäste
  // kennen die Versionen des Hosts oft nicht im eigenen Katalog.
  const roomVersionsMeta = ref({});
  const guestSlotIndex = ref(-1);
  const showSkipRequestDialog = ref(false);
  const skipRequestFrom = ref("");
  const guestSyncState = reactive({
    showGuessDialog: false,
    activeGuessPlayerIndex: null,
    showObjectionDialog: false,
    currentObjectionPlayerIndex: null,
    isObjectionPhase: false,
    objectionAttempts: [],
    playerHasGuessed: false,
    showFeedback: false,
    feedbackCorrect: false,
    feedbackMessage: "",
    guessResults: null,
    loadingNextSong: false,
    playedLinksHistoryCount: 0,
    pendingPlacementPlayerIndex: null,
  });
  const guestGuessTitle = ref("");
  const guestGuessArtist = ref("");
  const guestGuessYear = ref(null);
  const guestGuessMovie = ref("");
  const activeGuessDisplay = ref({
    title: "",
    artist: "",
    year: null,
    movie: "",
  });
  const guestPendingSongUrl = ref(null);
  const pendingSongUrl = ref(null);
  const songReadyCount = ref(0);
  const songReadyTotal = ref(0);
  const songReadyConfirmed = ref(false);

  // Bingo (Host-Buffer): Song-URL + Card-Daten werden nach dem Ziehen
  // gepuffert, damit sie erst nach der Kategorie-Reveal-Animation via
  // `host:bingoOpenAnswering` an alle Clients verteilt werden.
  const bingoPendingSongUrl = ref(null);
  const bingoPendingCardData = ref(null);
  // Team-Antwort-Buffer (Team-lokal, für die Live-Eingabe). Wird per
  // `team:bingoAnswer` an den Server geschickt.
  const bingoTeamAnswer = ref("");
  // Für die Reveal-Animation: aktueller Highlight-Index (0..4) und Flag.
  const bingoRevealHighlight = ref(0);
  const bingoRevealAnimating = ref(false);
  // Bonus-Dialog (nur wenn eigenes Team im Bonus-Pending steht).
  const showBingoBonusDialog = ref(false);
  const bingoBonusTargetSlotId = ref(null);
  const bingoBonusCellIndex = ref(null);

  // Computed (Multiplayer)
  const isMyGuestGuessTurn = computed(
    () =>
      multiplayerMode.value &&
      !multiplayerIsHost.value &&
      guestSyncState.showGuessDialog &&
      guestSyncState.activeGuessPlayerIndex === guestSlotIndex.value,
  );
  const showGuestGuessReadOnly = computed(
    () =>
      multiplayerMode.value &&
      !multiplayerIsHost.value &&
      guestSyncState.showGuessDialog &&
      guestSyncState.activeGuessPlayerIndex !== guestSlotIndex.value,
  );
  const showGuestObjectionDialog = computed(
    () =>
      multiplayerMode.value &&
      !multiplayerIsHost.value &&
      guestSyncState.showObjectionDialog,
  );
  const isMyGuestObjectionTurn = computed(
    () => guestSyncState.currentObjectionPlayerIndex === guestSlotIndex.value,
  );
  const isHostWatchingGuestGuess = computed(
    () =>
      multiplayerMode.value &&
      multiplayerIsHost.value &&
      showGuessDialog.value &&
      activeGuessPlayerIndex.value !== null &&
      activeGuessPlayerIndex.value !== guestSlotIndex.value,
  );

  // Watchers
  watch(
    () => saveSessionOptions.value.points,
    (pointsEnabled) => {
      if (pointsEnabled) {
        saveSessionOptions.value.playerNames = true;
      }
    },
  );

  // ── Hilfsfunktionen ──────────────────────────────────────────────────

  const getRandomCardColor = () =>
    CARD_COLORS[Math.floor(Math.random() * CARD_COLORS.length)];

  // Kennung „Titel plus erster Künstler", normalisiert und ohne Fassungs-
  // Hinweise (siehe songIdentitySignature). Früher war es der genaue Text
  // samt Jahr, damit galten „Song" und „Song - Remastered" als verschieden.
  // useSongManager überspringt beim Ziehen alle Links, deren Kennung schon
  // in `playedSongs` steht.
  const buildSongSignature = (song) => songIdentitySignature(song);

  const markSongAsPlayed = (song) => {
    const sig = buildSongSignature(song);
    if (sig && !playedSongs.value.includes(sig)) playedSongs.value.push(sig);
  };

  // Liegt derselbe Song schon in einer Zeitleiste? Gleich heißt: gleiche
  // Kennung und mindestens ein gemeinsames Jahr. Verglichen werden alle
  // Jahres-Varianten, denn die Karte auf dem Tisch trägt womöglich das beim
  // Raten gewählte Zweitjahr statt des Hauptjahrs.
  const isDuplicateOnTable = (card) => {
    const sig = buildSongSignature(card);
    if (!sig) return false;
    const cardYears = new Set(yearsOf(card));
    for (const p of playerTimelines.value) {
      for (const c of p.cards) {
        if (!c || c.placeholder || c.isStartCard) continue;
        if (buildSongSignature(c) !== sig) continue;
        const tableYears = yearsOf(c);
        if (
          cardYears.size === 0 ||
          tableYears.length === 0 ||
          tableYears.some((y) => cardYears.has(y))
        )
          return true;
      }
    }
    return false;
  };

  const getChronologicalInsertIndex = (cards, year) => {
    if (!cards || cards.length === 0) return 0;
    const target = Number(year || 0);
    const idx = cards.findIndex((c) => Number(c.year || 0) > target);
    return idx === -1 ? cards.length : idx;
  };

  const buildCardFromCurrent = () => {
    if (!currentCard.value) return null;
    return {
      artist: currentCard.value.artist || "Unbekannt",
      title: currentCard.value.title || "Unbekannt",
      // placedYear: das Kartenjahr nach der Jahr-Eingabe (siehe submitGuess
      // in useGuessEngine), bei mehreren Jahren evtl. nicht das Hauptjahr.
      year: currentCard.value.placedYear || currentCard.value.year || 0,
      years: currentCard.value.years || [],
      movie: currentCard.value.movie || "",
      songUrl: currentCard.value.songUrl || null,
      bgColor: currentCard.value.bgColor || getRandomCardColor(),
    };
  };

  // ── Scoring ──────────────────────────────────────────────────────────

  // Onlinespiele bekommen ihren Stand vom Host bzw. Server, gespeicherte
  // Punkte haben dort nichts verloren. Abgefragt über die URL, weil initGame
  // vor initMultiplayer läuft und multiplayerMode dann noch false ist.
  const isOnlineGame = () =>
    multiplayerMode.value ||
    route.query.multiplayer === "1" ||
    Boolean(queryText(route.query.roomCode));

  const loadStoredScores = () => {
    if (!scoreGameId || isOnlineGame()) return {};
    try {
      const raw = localStorage.getItem(SCORE_STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      // Altes Format ohne gid (reine Namensliste) wird bewusst ignoriert.
      if (!parsed || typeof parsed !== "object" || parsed.gid !== scoreGameId) return {};
      return parsed.scores && typeof parsed.scores === "object" ? parsed.scores : {};
    } catch {
      return {};
    }
  };

  const saveStoredScores = () => {
    // Ohne Spiel-ID könnte niemand die Punkte wieder diesem Spiel zuordnen.
    // Geschrieben würde dann nur ein Stand, der ein anderes Spiel überdeckt.
    if (!scoreGameId || isOnlineGame()) return;
    try {
      const scoreMap = {};
      for (const p of playerTimelines.value) {
        scoreMap[p.name] = Number(p.points || 0);
      }
      localStorage.setItem(
        SCORE_STORAGE_KEY,
        JSON.stringify({ gid: scoreGameId, scores: scoreMap }),
      );
    } catch (e) {
      console.error("Fehler beim Speichern der Punkte:", e);
    }
  };

  const addPoints = (playerIndex, pointsToAdd) => {
    const player = playerTimelines.value[playerIndex];
    if (!player) return;
    player.points = Number(player.points || 0) + pointsToAdd;
    saveStoredScores();
  };

  const addManualPoint = (playerIndex) => {
    addPoints(playerIndex, 1);
    deps.syncMultiplayerState();
  };

  const removeManualPoint = (playerIndex) => {
    const player = playerTimelines.value[playerIndex];
    if (!player) return;
    player.points = Math.max(0, Number(player.points || 0) - 1);
    saveStoredScores();
    deps.syncMultiplayerState();
  };

  const addManualObjection = (playerIndex) => {
    const player = playerTimelines.value[playerIndex];
    if (!player) return;
    player.objections = Number(player.objections || 0) + 1;
    deps.syncMultiplayerState();
  };

  const removeManualObjection = (playerIndex) => {
    const player = playerTimelines.value[playerIndex];
    if (!player) return;
    player.objections = Math.max(0, Number(player.objections || 0) - 1);
    deps.syncMultiplayerState();
  };

  const calculateGuessPoints = (bonusResult, cardYear) => {
    if (!bonusResult) return 0;
    const yearExact =
      guessedYear.value !== null &&
      guessedYear.value !== "" &&
      Number(guessedYear.value) === Number(cardYear);
    const titleArtist =
      bonusResult.titleCorrect === true && bonusResult.artistCorrect === true;

    // Film-Modus (film-zentriert): Zusätzliche Kombinationen mit Film.
    //   Titel + Künstler + Film + Jahr           -> 4
    //   Titel + Künstler + Film                  -> 3
    //   Film + Titel + Jahr / Film + Künstler + Jahr -> 3
    //   Film + Jahr                              -> 2
    //   nur Film                                 -> 1
    // Alle anderen Kombinationen (ohne Film) werden wie im Normal-Modus
    // bewertet, damit der Bonus für Titel+Künstler bzw. Jahr nicht verloren
    // geht, wenn der Film verpasst wurde.
    if (gameMode.value === "film") {
      const movieCorrect = bonusResult.movieCorrect === true;
      const titleCorrect = bonusResult.titleCorrect === true;
      const artistCorrect = bonusResult.artistCorrect === true;
      if (movieCorrect) {
        if (titleArtist && yearExact) return 4;
        if (titleArtist) return 3;
        // Film + (Titel ODER Künstler) + Jahr -> 3 Punkte.
        if ((titleCorrect || artistCorrect) && yearExact) return 3;
        if (yearExact) return 2;
        return 1;
      }
      // Fallback: Normal-Modus-Regeln.
    }

    // Normal-Modus: Titel+Künstler+Jahr=3, Titel+Künstler=1, nur Jahr=1.
    if (titleArtist && yearExact) return 3;
    if (titleArtist) return 1;
    if (yearExact) return 1;
    return 0;
  };

  const calculateGuessObjectionReward = (bonusResult, cardYear) => {
    if (!bonusResult) return 0;
    // Battle-Modus: keine Einwand-Boni ausgeben (Einwände sind in diesem
    // Modus komplett deaktiviert – siehe useGuessEngine.checkForObjections).
    if (gameMode.value === "battle") return 0;
    const yearExact =
      guessedYear.value !== null &&
      guessedYear.value !== "" &&
      cardYear !== undefined &&
      cardYear !== null &&
      Number(guessedYear.value) === Number(cardYear);
    const titleArtist =
      bonusResult.titleCorrect === true && bonusResult.artistCorrect === true;

    // Film-Modus: erweiterte Einwand-Belohnung.
    //   Titel + Künstler + Film + Jahr   -> 2 Einwände
    //   Titel + Künstler + Film          -> 1 Einwand
    //   Film + Jahr                      -> 1 Einwand
    //   Sonst wie Normal-Modus (Titel + Künstler -> 1 Einwand).
    if (gameMode.value === "film") {
      const movieCorrect = bonusResult.movieCorrect === true;
      if (movieCorrect && titleArtist && yearExact) return 2;
      if (movieCorrect && titleArtist) return 1;
      if (movieCorrect && yearExact) return 1;
      // Fallback: Normal-Modus.
    }

    return titleArtist ? 1 : 0;
  };

  // ── Init / Reset ────────────────────────────────────────────────────

  const initGame = () => {
    if (route.query.names) {
      playerNames.value = decodeNamesQuery(route.query.names);
    } else {
      playerNames.value = Array.from(
        { length: playerCount.value },
        (_, i) => `Spieler ${i + 1}`,
      );
    }

    if (route.query.startingPlayer !== undefined) {
      const parsed = parseInt(route.query.startingPlayer);
      currentPlayerIndex.value = Number.isNaN(parsed) ? 0 : parsed;
    } else {
      currentPlayerIndex.value = 0;
    }

    scoreGameId = queryText(route.query.gid);
    // Gespeicherte Punkte nur für das Neuladen genau dieses Spiels (gleiche
    // gid, siehe loadStoredScores). Ein geladener Spielstand bringt seine
    // Punkte selbst mit.
    const storedScores =
      route.query.loadSession === "1" ? {} : loadStoredScores();
    const carryScoresQuery = (route.query.carryScores || "").toString().trim();
    const carryScoresByIndex = carryScoresQuery
      ? carryScoresQuery
          .split(",")
          .map((v) => parseInt(v, 10))
          .map((v) => (Number.isNaN(v) ? 0 : Math.max(0, v)))
      : [];

    playerTimelines.value = Array.from(
      { length: playerCount.value },
      (_, i) => {
        const points =
          carryScoresByIndex.length > 0
            ? Number(carryScoresByIndex[i] || 0)
            : Number(storedScores[playerNames.value[i]] || 0);
        // Punktestand zu Rundenbeginn. Die Statistik bekommt nur, was in
        // dieser Runde dazukam (siehe getRoundPoints), sonst zählten
        // mitgenommene Punkte bei jeder Runde erneut. Liegt am Spieler-Objekt,
        // damit es mit den Zeitleisten an Gäste und einen neuen Host geht.
        return {
          name: playerNames.value[i],
          cards: [],
          objections: GAME_CONSTANTS.INITIAL_OBJECTIONS,
          points,
          roundStartPoints: points,
        };
      },
    );
    turnCounts.value = Array.from({ length: playerCount.value }, () => 0);
    if (carryScoresByIndex.length > 0) saveStoredScores();
  };

  const resetGameState = () => {
    playerTimelines.value.forEach((player) => {
      player.cards = [];
      player.objections = GAME_CONSTANTS.INITIAL_OBJECTIONS;
      player.points = 0;
      player.roundStartPoints = 0;
    });
    saveStoredScores();
    usedCards.value = [];
    currentCard.value = null;
    showVictoryDialog.value = false;
    showRestartDialog.value = false;
    winnerName.value = "";
    victoryHeadline.value = "hat gewonnen!";
    victorySubline.value = "";
    showFeedback.value = false;
    feedbackCorrect.value = false;
    feedbackMessage.value = "";
    showObjectionDialog.value = false;
    objectionAttempts.value = [];
    currentObjectionPlayerIndex.value = null;
    activeGuessPlayerIndex.value = null;
    pendingPlacement.value = null;
    pendingPlacementOriginal.value = null;
    pendingPlacementResult.value = null;
    pendingGuessPoints.value = 0;
    pendingGuessObjectionReward.value = 0;
    pendingObjectionPlacement.value = null;
    showGuessDialog.value = false;
    guessedTitle.value = "";
    guessedArtist.value = "";
    guessedYear.value = null;
    guessedMovie.value = "";
    guessResults.value = null;
    loadingNextSong.value = false;
    playedSongs.value = [];
    turnCounts.value = Array.from({ length: playerCount.value }, () => 0);
    currentSongLink.value = null;
    preloadedLink.value = null;
    playedLinksHistory.value = [];
    // Gesperrter Speicher darf den Reset nicht abbrechen, sonst kämen
    // `host:returnToLobby` und die Navigation unten nie an.
    try {
      localStorage.removeItem(getPlayedLinksStorageKey());
      localStorage.removeItem(LEGACY_PLAYED_LINKS_KEY);
    } catch {
      /* Speicher nicht verfügbar, ignorieren. */
    }

    // Bingo: gespiegelten Client-State + sessionStorage-Cache leeren,
    // damit ein Refresh nach dem Reset nicht mit alten Karten/Marks
    // wieder aufsetzt. Der Server löscht `bingoState` beim
    // `host:returnToLobby` schon (siehe server/index.js) und liefert
    // beim nächsten Bingo-Start via `roomState` frische Karten;
    // dieser Cleanup hier ist der Client-Spiegel.
    bingoState.value = null;
    try {
      sessionStorage.removeItem("hitster-bingo-state");
    } catch {
      /* ignore */
    }

    Notify.create({
      type: "positive",
      message: "Das Spiel wurde zurückgesetzt (inkl. Punkte)!",
      timeout: 1500,
    });

    if (multiplayerMode.value && multiplayerIsHost.value) {
      deps.syncMultiplayerState();
      deps.socketEmit("host:returnToLobby", {});
      setTimeout(() => router.push("/lobby"), 500);
    } else if (!multiplayerMode.value) {
      setTimeout(() => window.location.reload(), 1600);
    }
  };

  // ── Reload First Card ───────────────────────────────────────────────

  const reloadFirstCard = async (playerIndex) => {
    const player = playerTimelines.value[playerIndex];
    if (!player.cards.length) return;
    const firstCard = player.cards[0];
    if (!firstCard.songUrl) {
      Notify.create({ type: "warning", message: "Für diese Karte ist kein Song-Link hinterlegt.", timeout: 2000 });
      return;
    }
    loadingFirstCard.value[playerIndex] = true;
    try {
      const songData = await getTrackMetadataWithCache(firstCard.songUrl);
      if (songData && songData.year) {
        firstCard.title = songData.title || "Unbekannt";
        firstCard.artist = songData.artist || "Unbekannt";
        firstCard.year = songData.year;
        firstCard.years = songData.years || [];
        // Gäste sehen die aktualisierte Karte sofort, nicht erst beim
        // nächsten Anlass.
        deps.syncMultiplayerState();
        Notify.create({ type: "positive", message: "Songdaten erfolgreich aktualisiert!", timeout: 2000 });
      } else {
        Notify.create({ type: "warning", message: "Songdaten konnten nicht aktualisiert werden.", timeout: 2000 });
      }
    } catch (e) {
      Notify.create({ type: "negative", message: "Fehler beim Laden der Songdaten: " + e.message, timeout: 2000 });
    }
    loadingFirstCard.value[playerIndex] = false;
  };

  // ── Draw Start Card ─────────────────────────────────────────────────

  // Spanne der Hauptjahre (erstes Jahr eines Songs) im gewählten Pool. Im
  // Battle-Modus zählt nur der Pool des Spielers, denn nur daraus zieht er.
  // Hat dieser Pool keine Jahresdaten, gilt die ganze Auswahl. null, wenn
  // gar keine Songdaten da sind.
  const getStartYearRange = async (playerIndex) => {
    const links = allSongLinks.value || [];
    if (links.length === 0) return null;
    // Stellt sicher, dass der Index der Bundle-CSV fertig ist, bevor die
    // synchrone Nachschlage-Funktion ihn braucht.
    await getTrackMetadataWithCache(links[0]);
    const lookup = createMetadataLookup();
    const collect = (pool) => {
      let min = Infinity;
      let max = -Infinity;
      for (const link of links) {
        if (pool && songLinkPoolMap.value.get(link) !== pool) continue;
        const year = Number(lookup(link)?.year || 0);
        if (!year) continue;
        if (year < min) min = year;
        if (year > max) max = year;
      }
      return min <= max ? { min, max } : null;
    };
    const ownPool =
      playerSongPools.value.length > 0
        ? playerSongPools.value[playerIndex]
        : null;
    return (ownPool && collect(ownPool)) || collect(null);
  };

  const drawStartCard = async (playerIndex) => {
    const player = playerTimelines.value[playerIndex];
    if (player.cards.length > 0) return;
    // Gleichverteilt zwischen dem ältesten und dem jüngsten Song des Pools,
    // damit die Startkarte zu den Songs passt (bei einer 60er-Version kein
    // Startjahr 2015). Nur ohne Songdaten die feste Spanne ab 1990.
    let range = null;
    try {
      range = await getStartYearRange(playerIndex);
    } catch (e) {
      console.warn("Jahresspanne für die Startkarte nicht ermittelbar:", e);
    }
    const minYear = range ? range.min : 1990;
    const maxYear = range ? range.max : new Date().getFullYear();
    const randomYear = Math.floor(Math.random() * (maxYear - minYear + 1)) + minYear;
    // Zwischen dem await und hier könnte schon eine Karte liegen (Doppelklick).
    if (player.cards.length > 0) return;
    const card = {
      title: "",
      artist: "",
      year: randomYear,
      isStartCard: true,
      bgColor: getRandomCardColor(),
    };
    player.cards.push(card);
    usedCards.value.push(card);
    // Keine Meldung je Spieler: Das Jahr steht ohnehin in der Zeitleiste.
    deps.syncMultiplayerState();
  };

  // Song auf diesem Gerät öffnen und das für den Rate-Dialog vermerken.
  // Liefert openSongTab false (etwa wenn der Browser das Fenster blockiert),
  // gilt der Song als nicht geöffnet.
  const openSongHere = (url) => {
    if (!url) return;
    songOpenedUrl.value = openSongTab(url) === false ? null : url;
  };

  // Für Aufrufe ohne Klick (Socket-Ereignis, Timer): öffnen, wenn der Browser
  // es zulässt, sonst den Knopf „Jetzt abspielen“ anbieten. Ohne Nutzergeste
  // wird gar nicht erst versucht, der Versuch liefe ins Leere und sein
  // verzögerter Web-Player-Rückfall könnte später ein zweites Fenster öffnen.
  const openSongOrPrompt = (url) => {
    if (!url) return;
    if (!canOpenSongWithoutClick()) {
      songPlayPromptUrl.value = url;
      return;
    }
    openSongHere(url);
    songPlayPromptUrl.value = songOpenedUrl.value === url ? null : url;
  };

  // Klick auf „Jetzt abspielen“.
  const playPromptedSong = () => {
    const url = songPlayPromptUrl.value;
    songPlayPromptUrl.value = null;
    openSongHere(url);
  };

  // ── Manual Card ─────────────────────────────────────────────────────

  const openManualCardDialog = () => {
    manualCardTitle.value = "";
    manualCardArtist.value = "";
    manualCardYear.value = null;
    manualCardPlayerIndex.value = currentPlayerIndex.value;
    showManualCardDialog.value = true;
  };

  const confirmManualCard = () => {
    const year = Number(manualCardYear.value);
    if (!year || year < 1900 || year > 2100) {
      Notify.create({ type: "warning", message: "Bitte ein gültiges Jahr eingeben.", timeout: 2000 });
      return;
    }
    const pIdx = manualCardPlayerIndex.value;
    const timeline = playerTimelines.value[pIdx]?.cards;
    if (!timeline) return;
    const card = {
      title: manualCardTitle.value || "Unbekannt",
      artist: manualCardArtist.value || "Unbekannt",
      year,
      songUrl: null,
      bgColor: getRandomCardColor(),
    };
    const insertIndex = getChronologicalInsertIndex(timeline, year);
    timeline.splice(insertIndex, 0, card);
    // Die Karte wird direkt in die Timeline eingefügt, ein Watcher greift
    // dabei nicht. Deshalb hier selbst an die Gäste schicken.
    deps.syncMultiplayerState();
    Notify.create({
      type: "positive",
      message: `Karte für ${playerTimelines.value[pIdx].name} hinzugefügt (${year}).`,
      timeout: 2000,
    });
    showManualCardDialog.value = false;
  };

  // ── Session Save/Load ───────────────────────────────────────────────

  const downloadSessionSnapshotFile = (snapshot) => {
    try {
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      a.href = url;
      a.download = `hitster-save-${stamp}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Fehler beim Export der Save-Datei:", e);
    }
  };

  const openSaveSessionDialog = (callback) => {
    if (callback) {
      _afterSaveCallback = callback;
      saveDialogCallbackPending.value = true;
    }
    showSaveSessionDialog.value = true;
  };

  const confirmSaveSessionSnapshot = () => {
    const saved = saveSessionSnapshot({ ...saveSessionOptions.value });
    if (saved) {
      showSaveSessionDialog.value = false;
      if (_afterSaveCallback) {
        const cb = _afterSaveCallback;
        _afterSaveCallback = null;
        saveDialogCallbackPending.value = false;
        cb();
      }
    }
  };

  const skipSaveAndContinue = () => {
    showSaveSessionDialog.value = false;
    if (_afterSaveCallback) {
      const cb = _afterSaveCallback;
      _afterSaveCallback = null;
      saveDialogCallbackPending.value = false;
      cb();
    }
  };

  // Nutzer klickt „Abbrechen" (oder Escape / Klick daneben): Dialog
  // schließen, Callback verwerfen, im Spiel bleiben. Der Auslöse-Button
  // (z. B. „Zur Lobby") muss neu geklickt werden, wenn der Nutzer sich
  // umentscheidet.
  const cancelSaveSessionDialog = () => {
    _afterSaveCallback = null;
    saveDialogCallbackPending.value = false;
    showSaveSessionDialog.value = false;
  };

  // `@hide`-Callback des Dialogs: läuft nach jeder Schließung (auch nach
  // den anderen Buttons). Cleanup, damit ein Rest-Callback nicht bei
  // erneutem Dialog-Öffnen wieder auftaucht. Führt selbst KEIN „weiter"
  // aus – der Skip-Weg läuft ausschließlich über den „Überspringen"-Button.
  const onSaveSessionDialogHidden = () => {
    _afterSaveCallback = null;
    saveDialogCallbackPending.value = false;
  };

  const buildSessionSnapshot = (norm) => {
    const snapshot = {
      savedAt: new Date().toISOString(),
      sections: norm,
      currentPlayerIndex: Number(currentPlayerIndex.value || 0),
      playerCardCounts: playerTimelines.value.map((p) => Number(p.cards?.length || 0)),
      // Modus, Kennung und Herkunft immer mitschreiben, auch ohne
      // „gespielte Karten": Die Liste gespeicherter Stände zeigt den Modus an.
      // Übernommen wird der Modus beim Laden weiter nur mit den Karten.
      gameMode: gameMode.value,
      gameId: saveGameId,
      source: multiplayerMode.value ? "online" : "local",
    };
    if (norm.playerNames) {
      snapshot.players = playerTimelines.value.map((p) => ({
        name: p.name,
        ...(norm.points ? { points: Number(p.points || 0) } : {}),
      }));
    }
    if (norm.playedCards) {
      snapshot.songPools = [...selectedSongPools.value];
      snapshot.songPool = selectedSongPools.value[0] || "staffel1";
      snapshot.playerSongPools = [...playerSongPools.value];
      snapshot.playedLinksHistory = [...playedLinksHistory.value];
      snapshot.playedSongs = [...playedSongs.value];
    }
    return snapshot;
  };

  // Stilles Zwischenspeichern im Browser, ohne Datei-Download und ohne
  // Meldung. Für „Neue Runde, Punkte behalten": So lassen sich Punkte und
  // gespielte Songs nach einem Absturz über „Spielstand laden" zurückholen,
  // ohne dass jede Runde eine Datei herunterlädt.
  const storeSessionSnapshotSilently = () => {
    let snapshot = null;
    try {
      snapshot = buildSessionSnapshot({
        playerNames: true,
        points: true,
        playedCards: true,
      });
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(snapshot));
    } catch (e) {
      console.warn("Spielstand nicht im Browser gespeichert:", e);
    }
    rememberSnapshot(snapshot);
  };

  // Zusätzlich zum Einzelstand in die Liste gespeicherter Spiele. Eigenes
  // try/catch, damit ein Fehler dort weder den Einzelstand noch den
  // Datei-Download verhindert.
  const rememberSnapshot = (snapshot) => {
    if (!snapshot) return;
    try {
      addSavedGame(snapshot, { source: multiplayerMode.value ? "online" : "local" });
    } catch (e) {
      console.warn("Spielstand nicht in die Liste übernommen:", e);
    }
  };

  const saveSessionSnapshot = (options = { playerNames: true, points: true, playedCards: true }) => {
    try {
      const norm = {
        playerNames: options.playerNames === true || options.points === true,
        points: options.points === true,
        playedCards: options.playedCards === true,
      };
      if (!norm.playerNames && !norm.playedCards) {
        Notify.create({ type: "warning", message: "Bitte mindestens einen Bereich zum Speichern auswählen.", timeout: 2500 });
        return false;
      }
      const snapshot = buildSessionSnapshot(norm);
      // Ist der Speicher gesperrt oder voll, bleibt immer noch die Datei.
      // Ohne eigenes try/catch fiele sonst auch der Download aus, und der
      // Weg zurück in die Lobby hinge am Speichern-Dialog fest.
      try {
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(snapshot));
      } catch (e) {
        console.warn("Spielstand nicht im Browser gespeichert:", e);
      }
      rememberSnapshot(snapshot);
      downloadSessionSnapshotFile(snapshot);
      const parts = [];
      if (norm.points) parts.push("Punkte + Spielernamen");
      else if (norm.playerNames) parts.push("Spielernamen");
      if (norm.playedCards) parts.push("gespielte Karten + Versionen");
      Notify.create({ type: "positive", message: `Spielstand gespeichert: ${parts.join(", ")}.`, timeout: 2000 });
      return true;
    } catch (e) {
      Notify.create({ type: "negative", message: `Fehler beim Speichern: ${e.message}`, timeout: 3000 });
      return false;
    }
  };

  const loadSessionSnapshot = () => {
    try {
      const raw = localStorage.getItem(SESSION_STORAGE_KEY);
      if (!raw) {
        Notify.create({ type: "warning", message: "Kein gespeicherter Spielstand gefunden.", timeout: 2000 });
        return;
      }
      applySessionSnapshot(JSON.parse(raw));
    } catch (e) {
      Notify.create({ type: "negative", message: `Fehler beim Laden: ${e.message}`, timeout: 3000 });
    }
  };

  const openLoadSessionDialog = () => { showLoadSessionDialog.value = true; };

  const confirmLoadFromLocalStorage = () => {
    showLoadSessionDialog.value = false;
    loadSessionSnapshot();
  };

  const openSessionFilePicker = () => { sessionFileInput.value?.click(); };

  // Prüfung liegt jetzt in savedGames.js, damit Startseite und Lobby
  // dieselbe Regel nutzen können.
  const parseSnapshotFromImport = (text) => parseSnapshotText(text);

  const handleSessionFileSelected = async (event) => {
    try {
      const file = event?.target?.files?.[0];
      if (!file) return;
      const text = await file.text();
      const snapshot = parseSnapshotFromImport(text);
      showLoadSessionDialog.value = false;
      applySessionSnapshot(snapshot);
    } catch (e) {
      Notify.create({ type: "negative", message: `Fehler beim Laden der Datei: ${e.message}`, timeout: 3000 });
    } finally {
      if (event?.target) event.target.value = "";
    }
  };

  const applySessionSnapshot = (parsed) => {
    const legacyHasPlayers = Array.isArray(parsed.players) && parsed.players.length >= GAME_CONSTANTS.MIN_PLAYERS;
    const legacyHasPlayedCards = Array.isArray(parsed.playedLinksHistory) || Array.isArray(parsed.playedSongs) || parsed.songPools || parsed.songPool;
    const sec = parsed.sections && typeof parsed.sections === "object"
      ? parsed.sections
      : { playerNames: legacyHasPlayers, points: legacyHasPlayers, playedCards: legacyHasPlayedCards };

    const shouldLoadPlayers = sec.playerNames === true || sec.points === true;
    const shouldLoadPoints = sec.points === true;
    const shouldLoadPlayedCards = sec.playedCards === true;
    const savedLinks = Array.isArray(parsed.playedLinksHistory) ? parsed.playedLinksHistory : [];
    let loadedPlayersCount = playerCount.value;
    if (typeof parsed.gameId === "string" && parsed.gameId) saveGameId = parsed.gameId;

    const players = Array.isArray(parsed.players) ? parsed.players : [];
    if (shouldLoadPlayers && players.length < GAME_CONSTANTS.MIN_PLAYERS) {
      Notify.create({ type: "negative", message: "Gespeicherte Spielernamen/Punkte sind ungültig.", timeout: 2500 });
      return;
    }

    // Einen laufenden Zug samt Einwand vollständig abräumen, bevor der
    // Spielstand greift. Sonst laufen Opt-in-, Platzierungs- oder Auslosungs-
    // Timer weiter und lösen danach einen Zug ohne Karte auf, oder ein
    // Platzhalter bleibt als Lücke in einer Zeitleiste stehen.
    deps.clearObjectionTimers?.();
    clearFeedbackCountdown();
    for (const p of playerTimelines.value) {
      if (Array.isArray(p.cards)) p.cards = p.cards.filter((c) => c && !c.placeholder);
    }
    objectionOptInActive.value = false;
    objectionOptIns.value = [];
    objectionOptInCountdown.value = 0;
    objectionQueue.value = [];
    objectionQueuePos.value = 0;
    objectionPlacementCountdown.value = 0;
    objectionRaffleActive.value = false;
    objectionRaffleNames.value = [];
    objectionRaffleHighlight.value = 0;
    objectionRaffleWinner.value = null;
    correctObjectorNames.value = [];
    objectionWinnerName.value = "";
    playerIndexAfterResolution.value = null;

    if (shouldLoadPlayers) {
      const scores = loadStoredScores();
      playerCount.value = players.length;
      loadedPlayersCount = players.length;
      playerNames.value = players.map((p, i) => p?.name || `Spieler ${i + 1}`);
      playerTimelines.value = players.map((p, i) => {
        const name = p?.name || `Spieler ${i + 1}`;
        const pts = shouldLoadPoints ? Math.max(0, Number(p?.points || 0)) : Math.max(0, Number(scores[name] || 0));
        // Geladene Punkte stammen aus einem früheren Spiel und sind dort schon
        // in die Statistik eingegangen, also zählt die Runde ab hier.
        return { name, cards: [], objections: GAME_CONSTANTS.INITIAL_OBJECTIONS, points: pts, roundStartPoints: pts };
      });
    }

    const savedCur = Number(parsed.currentPlayerIndex);
    if (!Number.isNaN(savedCur)) {
      currentPlayerIndex.value = Math.min(Math.max(savedCur, 0), playerCount.value - 1);
    } else {
      const savedCounts = Array.isArray(parsed.playerCardCounts) ? parsed.playerCardCounts : [];
      if (savedCounts.length >= playerCount.value) {
        let minIdx = 0, minVal = Number(savedCounts[0] || 0);
        for (let i = 1; i < playerCount.value; i++) {
          const v = Number(savedCounts[i] || 0);
          if (v < minVal) { minVal = v; minIdx = i; }
        }
        currentPlayerIndex.value = minIdx;
      }
    }

    if (shouldLoadPlayedCards) {
      selectedSongPools.value = resolveSongPools(parsed.songPools, parsed.songPool);
      // Gespielte Songs werden bewusst NICHT in localStorage persistiert
      // (siehe useSongManager). Beim Laden eines Spielstands landen sie
      // nur im In-Memory-Ref, damit Duplikate in der aktuellen Session
      // verhindert werden – nach einem Reload beginnt der Song-Pool wieder
      // von vorn.
      playedLinksHistory.value = savedLinks;
      playedSongs.value = Array.isArray(parsed.playedSongs) ? parsed.playedSongs : [];
      if (parsed.gameMode === "battle" || parsed.gameMode === "film" || parsed.gameMode === "normal") {
        gameMode.value = parsed.gameMode;
      }
      if (Array.isArray(parsed.playerSongPools)) {
        playerSongPools.value = parsed.playerSongPools
          .map((v) => (v || "").toString().trim().toLowerCase())
          .filter(Boolean);
      }
    }

    currentCard.value = null;
    showFeedback.value = false;
    showGuessDialog.value = false;
    showObjectionDialog.value = false;
    isObjectionPhase.value = false;
    pendingPlacement.value = null;
    pendingPlacementOriginal.value = null;
    pendingPlacementResult.value = null;
    pendingObjectionPlacement.value = null;
    pendingGuessPoints.value = 0;
    pendingGuessObjectionReward.value = 0;
    objectionAttempts.value = [];
    currentObjectionPlayerIndex.value = null;
    activeGuessPlayerIndex.value = null;
    turnCounts.value = Array.from({ length: loadedPlayersCount }, () => 0);
    playerHasGuessed.value = false;
    guessedTitle.value = "";
    guessedArtist.value = "";
    guessedYear.value = null;
    guessedMovie.value = "";
    guessResults.value = null;
    skipSongRequested.value = false;
    loadingNextSong.value = false;
    showVictoryDialog.value = false;
    showRestartDialog.value = false;
    winnerName.value = "";
    victoryHeadline.value = "hat gewonnen!";
    victorySubline.value = "";

    if (shouldLoadPlayers || shouldLoadPoints) saveStoredScores();

    const loadedParts = [];
    if (shouldLoadPoints) loadedParts.push("Punkte + Spielernamen");
    else if (shouldLoadPlayers) loadedParts.push("Spielernamen");
    if (shouldLoadPlayedCards) loadedParts.push("gespielte Karten + Versionen");
    if (loadedParts.length === 0) loadedParts.push("keine bekannten Bereiche");
    Notify.create({ type: "positive", message: `Spielstand geladen: ${loadedParts.join(", ")}.`, timeout: 2500 });
  };

  // ── Feedback ────────────────────────────────────────────────────────

  const clearFeedbackCountdown = () => {
    if (feedbackCountdownTimer) {
      clearInterval(feedbackCountdownTimer);
      feedbackCountdownTimer = null;
    }
  };

  const doCloseFeedback = () => {
    clearFeedbackCountdown();
    showFeedback.value = false;
    if (playerIndexAfterResolution.value !== null) {
      currentPlayerIndex.value = playerIndexAfterResolution.value;
      playerIndexAfterResolution.value = null;
    } else {
      currentPlayerIndex.value = (currentPlayerIndex.value + 1) % playerCount.value;
    }
    pendingPlacement.value = null;
    pendingPlacementOriginal.value = null;
    pendingObjectionPlacement.value = null;
    pendingPlacementResult.value = null;
    pendingGuessPoints.value = 0;
    pendingGuessObjectionReward.value = 0;
    objectionAttempts.value = [];
    currentObjectionPlayerIndex.value = null;
    activeGuessPlayerIndex.value = null;
    isObjectionPhase.value = false;
    showObjectionDialog.value = false;
    objectionOptInActive.value = false;
    objectionOptIns.value = [];
    objectionOptInCountdown.value = 0;
    objectionQueue.value = [];
    objectionQueuePos.value = 0;
    objectionPlacementCountdown.value = 0;
    objectionRaffleActive.value = false;
    objectionRaffleNames.value = [];
    objectionRaffleWinner.value = null;
    correctObjectorNames.value = [];
    objectionWinnerName.value = "";
    currentCard.value = null;
    playerHasGuessed.value = false;
    guessedTitle.value = "";
    guessedArtist.value = "";
    guessedYear.value = null;
    guessedMovie.value = "";
    guessResults.value = null;
    deps.syncMultiplayerState();
  };

  const startFeedbackCountdown = () => {
    clearFeedbackCountdown();
    feedbackCountdown.value = 5;
    feedbackCountdownTimer = setInterval(() => {
      feedbackCountdown.value--;
      if (feedbackCountdown.value <= 0) {
        if (multiplayerMode.value && !multiplayerIsHost.value) {
          clearFeedbackCountdown();
        } else {
          doCloseFeedback();
        }
      }
    }, 1000);
  };

  const closeFeedback = () => startFeedbackCountdown();

  watch(showFeedback, (val) => {
    if (val) startFeedbackCountdown();
    else clearFeedbackCountdown();
  });

  // ── Victory / Restart ───────────────────────────────────────────────

  // Wer gewinnt, entscheiden allein die Karten. Punkte (Rate-Boni, der
  // Bonus für 10 Karten) sind Anzeige und Statistik.

  const joinNames = (names) =>
    names.length > 1
      ? `${names.slice(0, -1).join(", ")} und ${names[names.length - 1]}`
      : names[0] || "";

  const cardsText = (n) => (n === 1 ? "1 Karte" : `${n} Karten`);

  // Platzhalter (gelegte, noch nicht aufgelöste Karte) zählen nicht mit.
  const countCards = (player) =>
    (player?.cards || []).filter((c) => c && !c.placeholder).length;

  const getMostCardsLeaders = () => {
    const counts = playerTimelines.value.map(countCards);
    if (counts.length === 0) return { indices: [], maxCards: 0 };
    const maxCards = Math.max(...counts);
    const indices = counts
      .map((c, i) => (c === maxCards ? i : -1))
      .filter((i) => i >= 0);
    return { indices, maxCards };
  };

  const getUniqueMostCardsPlayerIndex = () => {
    const { indices } = getMostCardsLeaders();
    return indices.length === 1 ? indices[0] : null;
  };

  // Punkte, die in dieser Runde dazukamen (Statistik). Grundlage ist der
  // Stand zu Rundenbeginn, gesetzt bei Spielstart, beim Laden eines
  // Spielstands und bei „Neue Runde, Punkte behalten".
  const getRoundPoints = () =>
    playerTimelines.value.map((p) =>
      Math.max(0, Number(p.points || 0) - Number(p.roundStartPoints || 0)),
    );

  // Bei Spielende bekommt jeder mit mindestens MAX_CARDS Karten 3 Punkte.
  const awardTenCardBonus = () => {
    const withTen = playerTimelines.value
      .map((p, i) => ({ p, i }))
      .filter((e) => countCards(e.p) >= MAX_CARDS);
    if (withTen.length === 0) return;
    withTen.forEach((e) => addPoints(e.i, 3));
    const names = joinNames(withTen.map((e) => e.p.name));
    Notify.create({
      type: "positive",
      message:
        withTen.length === 1
          ? `${names} erhält 3 Bonuspunkte für mindestens ${MAX_CARDS} Karten.`
          : `${names} erhalten je 3 Bonuspunkte für mindestens ${MAX_CARDS} Karten.`,
      timeout: 3000,
    });
  };

  const showWinnerDialog = (winnerIndices, subline) => {
    const winners = winnerIndices
      .map((i) => playerTimelines.value[i])
      .filter(Boolean);
    winnerName.value = joinNames(winners.map((p) => p.name));
    victoryHeadline.value =
      winners.length > 1 ? "haben gemeinsam gewonnen!" : "hat gewonnen!";
    victorySubline.value = subline || "";
    showVictoryDialog.value = true;
    if (multiplayerMode.value && multiplayerIsHost.value) {
      // Ergebnis für die Statistik verbuchen (nur Online, nur Host). Punkte je
      // Slot in Slot-Reihenfolge, aber nur die dieser Runde: Bei „Punkte
      // behalten" stünden sonst die Punkte der Vorrunden ein zweites Mal
      // drin. Sieger sind die Spieler mit den meisten Karten.
      const scores = getRoundPoints();
      deps.socketEmit("host:recordGameResult", {
        scores,
        winnerIndices: [...winnerIndices],
      });
      deps.socketEmit("host:syncGameOver", { winnerName: winnerName.value, headline: victoryHeadline.value });
      deps.socketEmit("host:gameEnded", {});
    }
  };

  // Läuft nach jedem abgeschlossenen Zug. Das Spiel endet nur am Ende einer
  // vollständigen Runde (alle hatten gleich viele Züge), wenn jemand
  // mindestens MAX_CARDS Karten hat UND allein die meisten Karten hat. Teilen
  // sich mehrere die meisten Karten, geht es mit der nächsten Runde weiter.
  const finalizeRoundIfTurnCountsAreEqual = () => {
    if (showVictoryDialog.value) return;
    const hasTen = playerTimelines.value.some((p) => countCards(p) >= MAX_CARDS);
    if (!hasTen) return;
    const minT = Math.min(...turnCounts.value);
    const maxT = Math.max(...turnCounts.value);
    if (minT !== maxT) return;
    const { indices, maxCards } = getMostCardsLeaders();
    if (indices.length > 1) {
      const names = joinNames(indices.map((i) => playerTimelines.value[i].name));
      Notify.create({
        type: "info",
        message: `Gleichstand: ${names} haben je ${cardsText(maxCards)}. Es geht weiter, bis nach einer Runde jemand allein vorn liegt.`,
        timeout: 4000,
      });
      return;
    }
    awardTenCardBonus();
    showWinnerDialog(
      indices,
      `Mit ${cardsText(maxCards)} allein vorn nach einer vollständigen Runde.`,
    );
  };

  // Keine Songs mehr: Das Spiel endet sofort. Es gewinnen alle, die die
  // meisten Karten haben, auch mehrere.
  const finalizeGameBecauseNoSongsLeft = () => {
    if (showVictoryDialog.value) return;
    awardTenCardBonus();
    const { indices, maxCards } = getMostCardsLeaders();
    showWinnerDialog(
      indices,
      indices.length > 1
        ? `Alle Songs wurden gespielt. Gemeinsam vorn mit je ${cardsText(maxCards)}.`
        : `Alle Songs wurden gespielt. Vorn mit ${cardsText(maxCards)}.`,
    );
  };

  const pickNextStarterIndexFromLastRound = () => {
    const counts = playerTimelines.value.map((p) => Number(p.cards.length || 0));
    const min = Math.min(...counts);
    const candidates = counts.map((c, i) => ({ c, i })).filter((x) => x.c === min).map((x) => x.i);
    return candidates[Math.floor(Math.random() * candidates.length)] ?? 0;
  };

  const openRestartDialog = () => { showRestartDialog.value = true; };

  const restartKeepingPlayersAndScores = () => {
    const nextStarter = pickNextStarterIndexFromLastRound();
    deps.clearObjectionTimers?.();
    clearFeedbackCountdown();
    playerTimelines.value.forEach((p) => {
      p.cards = [];
      p.objections = GAME_CONSTANTS.INITIAL_OBJECTIONS;
      // Neue Runde für die Statistik: gezählt wird ab dem jetzigen Stand.
      p.roundStartPoints = Number(p.points || 0);
    });
    turnCounts.value = Array.from({ length: playerCount.value }, () => 0);
    usedCards.value = [];
    currentCard.value = null;
    showFeedback.value = false;
    feedbackCorrect.value = false;
    feedbackMessage.value = "";
    showObjectionDialog.value = false;
    objectionAttempts.value = [];
    currentObjectionPlayerIndex.value = null;
    activeGuessPlayerIndex.value = null;
    pendingPlacement.value = null;
    pendingPlacementOriginal.value = null;
    pendingPlacementResult.value = null;
    pendingGuessPoints.value = 0;
    pendingGuessObjectionReward.value = 0;
    pendingObjectionPlacement.value = null;
    showGuessDialog.value = false;
    guessedTitle.value = "";
    guessedArtist.value = "";
    guessedYear.value = null;
    guessedMovie.value = "";
    guessResults.value = null;
    loadingNextSong.value = false;
    // `playedSongs` bleibt wie `playedLinksHistory` stehen: Gespielte Songs
    // sollen auch in der nächsten Runde nicht wiederkommen.
    currentSongLink.value = null;
    preloadedLink.value = null;
    playerIndexAfterResolution.value = null;
    isObjectionPhase.value = false;
    objectionOptInActive.value = false;
    objectionOptIns.value = [];
    objectionOptInCountdown.value = 0;
    objectionQueue.value = [];
    objectionQueuePos.value = 0;
    objectionPlacementCountdown.value = 0;
    objectionRaffleActive.value = false;
    objectionRaffleNames.value = [];
    objectionRaffleWinner.value = null;
    correctObjectorNames.value = [];
    objectionWinnerName.value = "";
    playerHasGuessed.value = false;
    currentPlayerIndex.value = nextStarter;
    showRestartDialog.value = false;
    showVictoryDialog.value = false;
    winnerName.value = "";
    victoryHeadline.value = "hat gewonnen!";
    victorySubline.value = "";
    // Früher saveSessionSnapshot() mit Datei-Download und Meldung in jeder
    // Runde. Jetzt nur still in den Browser.
    storeSessionSnapshotSilently();
    if (multiplayerMode.value && multiplayerIsHost.value) {
      deps.socketEmit("host:gameRestarted", {});
      deps.syncMultiplayerState();
    }
    Notify.create({
      type: "positive",
      message: `Neue Runde: ${playerTimelines.value[nextStarter].name} beginnt (wenigste Karten in der letzten Runde).`,
      timeout: 3000,
    });
  };

  const handleEndGame = () => {
    showRestartDialog.value = false;
    showVictoryDialog.value = false;
    if (multiplayerMode.value && multiplayerIsHost.value) {
      // Host im MP: Save-Dialog anbieten (mit „Überspringen"-Option),
      // danach kompletter Spiel-Reset. Ohne den Reset landen die Gäste
      // beim nächsten Modus-Wechsel (Bingo → Normal etc.) in der alten
      // /game-Route hängen; `resetGameState` räumt currentCard, offene
      // Dialoge, History auf und ruft syncMultiplayerState +
      // host:returnToLobby, sodass alle Clients sauber in die Lobby
      // wechseln und für den neuen Modus bereit sind. Punkte sind ggf.
      // im Save-Dialog vorher schon gesichert.
      openSaveSessionDialog(() => {
        resetGameState();
      });
    } else if (multiplayerMode.value) {
      // Gast im MP: direkt zur Lobby (kein Spielstand zum Speichern – der
      // wird vom Host synchronisiert).
      router.push("/lobby");
    } else {
      // Lokales Spiel: Save-Dialog mit „Überspringen"-Option anbieten,
      // danach zur Startseite. Vorher gab es hier gar keinen Dialog –
      // ein versehentlicher Klick auf „Zur Lobby" verwarf den Spielstand
      // ohne Rückfrage.
      // Die Punkte stehen, falls gewünscht, jetzt im gespeicherten Stand.
      // Der Punkte-Speicher selbst gehört zum beendeten Spiel.
      openSaveSessionDialog(() => {
        clearStoredScores();
        router.push("/");
      });
    }
  };

  const restartAsNewGame = () => {
    showRestartDialog.value = false;
    showVictoryDialog.value = false;
    if (multiplayerMode.value && multiplayerIsHost.value) {
      openSaveSessionDialog(() => {
        deps.socketEmit("host:returnToLobby", {});
        router.push("/lobby");
      });
    } else {
      try {
        localStorage.removeItem(SCORE_STORAGE_KEY);
        localStorage.removeItem(getPlayedLinksStorageKey());
        localStorage.removeItem(LEGACY_PLAYED_LINKS_KEY);
      } catch {
        /* Speicher nicht verfügbar, Navigation trotzdem ausführen. */
      }
      router.push("/");
    }
  };

  const restartWithNewNamesKeepingScores = () => {
    showRestartDialog.value = false;
    showVictoryDialog.value = false;
    if (multiplayerMode.value && multiplayerIsHost.value) {
      deps.socketEmit("host:returnToLobby", {});
      router.push("/lobby");
      return;
    }
    const nextStarter = pickNextStarterIndexFromLastRound();
    const carryScores = playerTimelines.value.map((p) => Number(p.points || 0));
    router.push({
      path: "/",
      query: {
        players: playerCount.value,
        startingPlayer: nextStarter,
        carryScores: carryScores.join(","),
        renameOnly: 1,
        songPools: selectedSongPools.value.join(","),
        songPool: selectedSongPools.value[0] || "staffel1",
        // Modus und Battle-Pools mitgeben, sonst startete die nächste Runde
        // still im Normalmodus. Index.vue liest beide Schlüssel aus.
        mode: gameMode.value,
        ...(playerSongPools.value.length > 0
          ? { playerSongPools: playerSongPools.value.join(",") }
          : {}),
      },
    });
  };

  // ── Return ──────────────────────────────────────────────────────────

  return {
    // Deps-Objekt (von Game.vue nach Multiplayer-Setup befüllt)
    deps,
    // Konstanten
    CARD_COLORS,
    SONG_POOL_FILE_MAPPING: getSongPoolFileMapping(),
    VALID_SONG_POOL_VALUES: [...getValidPoolValues()],
    LEGACY_PLAYED_LINKS_KEY,
    MAX_CARDS,
    // Hilfsfunktionen
    getPlayedLinksStorageKey,
    getRandomCardColor,
    buildSongSignature,
    markSongAsPlayed,
    isDuplicateOnTable,
    getChronologicalInsertIndex,
    buildCardFromCurrent,
    resolveSongPools,
    // Scoring
    loadStoredScores,
    saveStoredScores,
    addPoints,
    addManualPoint,
    removeManualPoint,
    addManualObjection,
    removeManualObjection,
    calculateGuessPoints,
    calculateGuessObjectionReward,
    // Init / Reset
    initGame,
    resetGameState,
    // Reload
    reloadFirstCard,
    loadingFirstCard,
    // Draw Start Card
    drawStartCard,
    // Manual Card
    openManualCardDialog,
    confirmManualCard,
    // Session
    openSaveSessionDialog,
    confirmSaveSessionSnapshot,
    saveSessionSnapshot,
    skipSaveAndContinue,
    onSaveSessionDialogHidden,
    cancelSaveSessionDialog,
    loadSessionSnapshot,
    openLoadSessionDialog,
    confirmLoadFromLocalStorage,
    openSessionFilePicker,
    handleSessionFileSelected,
    // Feedback
    clearFeedbackCountdown,
    doCloseFeedback,
    startFeedbackCountdown,
    closeFeedback,
    // Victory / Restart
    getMostCardsLeaders,
    getRoundPoints,
    showWinnerDialog,
    finalizeRoundIfTurnCountsAreEqual,
    getUniqueMostCardsPlayerIndex,
    finalizeGameBecauseNoSongsLeft,
    pickNextStarterIndexFromLastRound,
    openRestartDialog,
    restartKeepingPlayersAndScores,
    handleEndGame,
    restartAsNewGame,
    restartWithNewNamesKeepingScores,
    // ── Alle Refs ──────────────────────────────────────────────────────
    selectedSongPools,
    playerCount,
    playerNames,
    currentPlayerIndex,
    playerTimelines,
    currentCard,
    skipSongRequested,
    showFeedback,
    feedbackCorrect,
    feedbackMessage,
    loadingNextSong,
    playedSongs,
    showManualCardDialog,
    manualCardTitle,
    manualCardArtist,
    manualCardYear,
    manualCardPlayerIndex,
    showObjectionDialog,
    objectionAttempts,
    pendingPlacement,
    pendingPlacementResult,
    pendingPlacementOriginal,
    pendingObjectionPlacement,
    pendingGuessPoints,
    pendingGuessObjectionReward,
    showVictoryDialog,
    winnerName,
    victoryHeadline,
    victorySubline,
    showRestartDialog,
    showSaveSessionDialog,
    saveDialogCallbackPending,
    showLoadSessionDialog,
    sessionFileInput,
    saveSessionOptions,
    hasAnySaveSessionOption,
    turnCounts,
    currentSongLink,
    songOpenedUrl,
    openSongHere,
    songPlayPromptUrl,
    openSongOrPrompt,
    playPromptedSong,
    preloadedLink,
    playedLinksHistory,
    allSongLinks,
    songLinkPoolMap,
    playerSongPools,
    showGuessDialog,
    playerHasGuessed,
    guessedTitle,
    guessedArtist,
    guessedYear,
    guessedMovie,
    gameMode,
    bingoSettings,
    bingoState,
    guessResults,
    inlineYearValue,
    feedbackCountdown,
    usedCards,
    currentObjectionPlayerIndex,
    activeGuessPlayerIndex,
    isObjectionPhase,
    playerIndexAfterResolution,
    // Neuer Einwand-Ablauf
    objectionOptInActive,
    objectionOptIns,
    objectionOptInCountdown,
    objectionQueue,
    objectionQueuePos,
    objectionPlacementCountdown,
    objectionRaffleActive,
    objectionRaffleNames,
    objectionRaffleHighlight,
    objectionRaffleWinner,
    correctObjectorNames,
    objectionWinnerName,
    // Multiplayer-Refs
    multiplayerMode,
    multiplayerIsHost,
    multiplayerRoomCode,
    multiplayerAudioMode,
    roomVersionsMeta,
    guestSlotIndex,
    showSkipRequestDialog,
    skipRequestFrom,
    guestSyncState,
    guestGuessTitle,
    guestGuessArtist,
    guestGuessYear,
    guestGuessMovie,
    activeGuessDisplay,
    guestPendingSongUrl,
    pendingSongUrl,
    songReadyCount,
    songReadyTotal,
    songReadyConfirmed,
    // Bingo (Runden-UI)
    bingoPendingSongUrl,
    bingoPendingCardData,
    bingoTeamAnswer,
    bingoRevealHighlight,
    bingoRevealAnimating,
    showBingoBonusDialog,
    bingoBonusTargetSlotId,
    bingoBonusCellIndex,
    // Multiplayer-Computed
    isMyGuestGuessTurn,
    showGuestGuessReadOnly,
    showGuestObjectionDialog,
    isMyGuestObjectionTurn,
    isHostWatchingGuestGuess,
  };
}
