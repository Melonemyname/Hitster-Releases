import { ref, computed, reactive, watch } from "vue";
import { Notify } from "quasar";
import { GAME_CONSTANTS } from "../utils/gameConstants";
import { getTrackMetadataWithCache } from "../utils/spotifyCsvService";
import {
  getKnownEditionValues,
  getSongPoolFileMapping,
} from "../utils/songDataProvider";
import { readCustomVersions } from "../utils/customVersionsStore";
import { readRestrictedVersions } from "../utils/restrictedVersionsStore";

const SCORE_STORAGE_KEY = "hitster-player-scores-v1";
const SESSION_STORAGE_KEY = "hitster-session-save-v1";
const LEGACY_PLAYED_LINKS_KEY = "hitster-played-links";

const CARD_COLORS = [
  "#1abc9c", "#16a085", "#2ecc71", "#27ae60", "#3498db",
  "#2980b9", "#9b59b6", "#8e44ad", "#34495e", "#2c3e50",
  "#f1c40f", "#f39c12", "#e67e22", "#d35400", "#e74c3c",
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
  // Bingo-Konfiguration aus Query (nur relevant im Bingo-Modus).
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
  const multiplayerIsHost = ref(false);
  const multiplayerRoomCode = ref("");
  const multiplayerAudioMode = ref("host-only");
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

  const buildSongSignature = (song) => {
    if (!song) return "";
    const title = (song.title || "").toString().trim().toLowerCase();
    const artist = (song.artist || "").toString().trim().toLowerCase();
    const year = Number(song.year || 0);
    if (!title || !artist || !year) return "";
    return `${title}__${artist}__${year}`;
  };

  const markSongAsPlayed = (song) => {
    const sig = buildSongSignature(song);
    if (sig && !playedSongs.value.includes(sig)) playedSongs.value.push(sig);
  };

  const isDuplicateOnTable = (card) => {
    const sig = buildSongSignature(card);
    if (!sig) return false;
    for (const p of playerTimelines.value) {
      for (const c of p.cards) {
        if (c && buildSongSignature(c) === sig) return true;
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
      year: currentCard.value.year || 0,
      movie: currentCard.value.movie || "",
      songUrl: currentCard.value.songUrl || null,
      bgColor: currentCard.value.bgColor || getRandomCardColor(),
    };
  };

  // ── Scoring ──────────────────────────────────────────────────────────

  const loadStoredScores = () => {
    try {
      const raw = localStorage.getItem(SCORE_STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  };

  const saveStoredScores = () => {
    try {
      const scoreMap = {};
      for (const p of playerTimelines.value) {
        scoreMap[p.name] = Number(p.points || 0);
      }
      localStorage.setItem(SCORE_STORAGE_KEY, JSON.stringify(scoreMap));
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
      playerNames.value = route.query.names.split(",");
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
      (_, i) => ({
        name: playerNames.value[i],
        cards: [],
        objections: GAME_CONSTANTS.INITIAL_OBJECTIONS,
        points:
          carryScoresByIndex.length > 0
            ? Number(carryScoresByIndex[i] || 0)
            : Number(storedScores[playerNames.value[i]] || 0),
      }),
    );
    turnCounts.value = Array.from({ length: playerCount.value }, () => 0);
    if (carryScoresByIndex.length > 0) saveStoredScores();
  };

  const resetGameState = () => {
    playerTimelines.value.forEach((player) => {
      player.cards = [];
      player.objections = GAME_CONSTANTS.INITIAL_OBJECTIONS;
      player.points = 0;
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
    localStorage.removeItem(getPlayedLinksStorageKey());
    localStorage.removeItem(LEGACY_PLAYED_LINKS_KEY);

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
      Notify.create({ type: "warning", message: "Keine Song-URL für diese Karte verfügbar.", timeout: 2000 });
      return;
    }
    loadingFirstCard.value[playerIndex] = true;
    try {
      const songData = await getTrackMetadataWithCache(firstCard.songUrl);
      if (songData && songData.year) {
        firstCard.title = songData.title || "Unbekannt";
        firstCard.artist = songData.artist || "Unbekannt";
        firstCard.year = songData.year;
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

  const drawStartCard = async (playerIndex) => {
    const player = playerTimelines.value[playerIndex];
    if (player.cards.length > 0) return;
    const minYear = 1990;
    const maxYear = new Date().getFullYear();
    const randomYear = Math.floor(Math.random() * (maxYear - minYear + 1)) + minYear;
    const card = {
      title: "",
      artist: "",
      year: randomYear,
      isStartCard: true,
      bgColor: getRandomCardColor(),
    };
    player.cards.push(card);
    usedCards.value.push(card);
    deps.syncMultiplayerState();
    Notify.create({ type: "positive", message: `Startkarte für ${player.name}: ${randomYear}`, timeout: 2000 });
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
      const snapshot = {
        savedAt: new Date().toISOString(),
        sections: norm,
        currentPlayerIndex: Number(currentPlayerIndex.value || 0),
        playerCardCounts: playerTimelines.value.map((p) => Number(p.cards?.length || 0)),
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
        snapshot.gameMode = gameMode.value;
        snapshot.playedLinksHistory = [...playedLinksHistory.value];
        snapshot.playedSongs = [...playedSongs.value];
      }
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(snapshot));
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

  const parseSnapshotFromImport = (text) => {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && parsed.players) return parsed;
    const rawSession = parsed?.["hitster-session-save-v1"];
    if (typeof rawSession === "string") return JSON.parse(rawSession);
    throw new Error("Datei enthält keinen gültigen Spielstand.");
  };

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

    if (shouldLoadPlayers) {
      const players = Array.isArray(parsed.players) ? parsed.players : [];
      if (players.length < GAME_CONSTANTS.MIN_PLAYERS) {
        Notify.create({ type: "negative", message: "Gespeicherte Spielernamen/Punkte sind ungültig.", timeout: 2500 });
        return;
      }
      const scores = loadStoredScores();
      playerCount.value = players.length;
      loadedPlayersCount = players.length;
      playerNames.value = players.map((p, i) => p?.name || `Spieler ${i + 1}`);
      playerTimelines.value = players.map((p, i) => {
        const name = p?.name || `Spieler ${i + 1}`;
        const pts = shouldLoadPoints ? Math.max(0, Number(p?.points || 0)) : Math.max(0, Number(scores[name] || 0));
        return { name, cards: [], objections: GAME_CONSTANTS.INITIAL_OBJECTIONS, points: pts };
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

  const getPointLeaders = () => {
    const maxPts = Math.max(...playerTimelines.value.map((p) => Number(p.points || 0)));
    const leaders = playerTimelines.value.filter((p) => Number(p.points || 0) === maxPts);
    return { leaders, maxPoints: maxPts };
  };

  const showPointsWinnerDialog = (subline) => {
    const { leaders, maxPoints } = getPointLeaders();
    if (leaders.length === 1) {
      winnerName.value = leaders[0].name;
      victoryHeadline.value = "hat gewonnen!";
    } else {
      winnerName.value = leaders.map((p) => p.name).join(", ");
      victoryHeadline.value = "liegen punktgleich vorn.";
    }
    victorySubline.value = subline || `${maxPoints} Punkte`;
    showVictoryDialog.value = true;
    if (multiplayerMode.value && multiplayerIsHost.value) {
      // Ergebnis für die Statistik verbuchen (nur Online, nur Host). Punkte je
      // Slot in Slot-Reihenfolge; Sieger = Punkt-Leader (bei Gleichstand mehrere).
      const scores = playerTimelines.value.map((p) => Number(p.points || 0));
      const winnerIndices = scores
        .map((s, i) => (s === maxPoints ? i : -1))
        .filter((i) => i >= 0);
      deps.socketEmit("host:recordGameResult", { scores, winnerIndices });
      deps.socketEmit("host:syncGameOver", { winnerName: winnerName.value, headline: victoryHeadline.value });
      deps.socketEmit("host:gameEnded", {});
    }
  };

  const finalizeRoundIfTurnCountsAreEqual = () => {
    if (showVictoryDialog.value) return;
    const hasTen = playerTimelines.value.some((p) => Number(p.cards.length || 0) >= MAX_CARDS);
    if (!hasTen) return;
    const minT = Math.min(...turnCounts.value);
    const maxT = Math.max(...turnCounts.value);
    if (minT !== maxT) return;
    const withTen = playerTimelines.value
      .map((p, i) => ({ p, i }))
      .filter((e) => Number(e.p.cards.length || 0) >= MAX_CARDS);
    if (withTen.length > 0) {
      withTen.forEach((e) => addPoints(e.i, 3));
      Notify.create({
        type: "positive",
        message: `${withTen.map((e) => e.p.name).join(", ")} erhalten +3 Punkte für 10 Karten!`,
        timeout: 3000,
      });
    }
    showPointsWinnerDialog(`${MAX_CARDS}+ Karten und gleiche Rundenzahl erreicht.`);
  };

  const getUniqueMostCardsPlayerIndex = () => {
    if (!playerTimelines.value.length) return null;
    const counts = playerTimelines.value.map((p) => Number(p.cards.length || 0));
    const max = Math.max(...counts);
    const leaders = counts.map((c, i) => ({ c, i })).filter((x) => x.c === max);
    return leaders.length === 1 ? leaders[0].i : null;
  };

  const finalizeGameBecauseNoSongsLeft = () => {
    if (showVictoryDialog.value) return;
    const idx = getUniqueMostCardsPlayerIndex();
    if (idx !== null) {
      addPoints(idx, 3);
      Notify.create({
        type: "positive",
        message: `${playerTimelines.value[idx].name} erhält +3 Punkte für die meisten Karten!`,
        timeout: 2500,
      });
    }
    const { maxPoints } = getPointLeaders();
    showPointsWinnerDialog(`Alle Songs wurden gespielt (${maxPoints} Punkte).`);
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
    playerTimelines.value.forEach((p) => {
      p.cards = [];
      p.objections = GAME_CONSTANTS.INITIAL_OBJECTIONS;
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
    playedSongs.value = [];
    currentSongLink.value = null;
    preloadedLink.value = null;
    playerIndexAfterResolution.value = null;
    isObjectionPhase.value = false;
    playerHasGuessed.value = false;
    currentPlayerIndex.value = nextStarter;
    showRestartDialog.value = false;
    showVictoryDialog.value = false;
    winnerName.value = "";
    victoryHeadline.value = "hat gewonnen!";
    victorySubline.value = "";
    saveSessionSnapshot();
    if (multiplayerMode.value && multiplayerIsHost.value) {
      deps.socketEmit("host:gameRestarted", {});
      deps.syncMultiplayerState();
    }
    Notify.create({
      type: "positive",
      message: `${playerTimelines.value[nextStarter].name} startet die neue Runde (wenigste Karten in der letzten Runde).`,
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
      openSaveSessionDialog(() => {
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
      localStorage.removeItem(SCORE_STORAGE_KEY);
      localStorage.removeItem(getPlayedLinksStorageKey());
      localStorage.removeItem(LEGACY_PLAYED_LINKS_KEY);
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
    getPointLeaders,
    showPointsWinnerDialog,
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
