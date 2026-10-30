import { watch, nextTick } from "vue";
import { Notify, copyToClipboard } from "quasar";
import {
  connect,
  emit as socketEmit,
  on as socketOn,
  off as socketOff,
} from "../utils/socketService";
import { getUsername } from "../utils/authService";
import { storeSlotAvatars } from "../utils/profileService";
import { encodeNamesQuery, decodeNamesQuery } from "./useGameState";

/**
 * Composable für Multiplayer-Logik: Synchronisation, Gast-Aktionen,
 * Socket-Listener und Watchers.
 *
 * @param {object} state - Alles aus useGameState (Refs + Funktionen)
 * @param {object} opts
 * @param {Function} opts.drawNewCard - aus useSongManager
 * @param {Function} opts.manualSkipSong - aus useSongManager
 * @param {Function} opts.placeCard - aus useGuessEngine
 * @param {Function} opts.submitGuess - aus useGuessEngine
 * @param {Function} opts.beginObjection - aus useGuessEngine
 * @param {Function} opts.toggleObjectionOptIn - aus useGuessEngine
 * @param {Function} opts.cancelGuessAndReplace - aus useGuessEngine
 * @param {Function} opts.clearObjectionTimers - aus useGuessEngine
 * @param {Function} opts.resumeObjectionTimers - aus useGuessEngine
 * @param {object} opts.route - vue-router route
 * @param {object} opts.router - vue-router router
 */
export function useMultiplayer(
  state,
  {
    drawNewCard,
    manualSkipSong,
    placeCard,
    submitGuess,
    beginObjection,
    toggleObjectionOptIn,
    cancelGuessAndReplace,
    clearObjectionTimers,
    resumeObjectionTimers,
    route,
    router,
  },
) {
  const {
    deps,
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
    // Reguläre Refs
    playerTimelines,
    currentPlayerIndex,
    playerCount,
    currentCard,
    showGuessDialog,
    activeGuessPlayerIndex,
    showObjectionDialog,
    currentObjectionPlayerIndex,
    isObjectionPhase,
    objectionAttempts,
    // Neuer Einwand-Ablauf (Etappe 2: Online-Sync)
    objectionOptInActive,
    objectionOptIns,
    objectionOptInCountdown,
    objectionPlacementCountdown,
    objectionRaffleActive,
    objectionRaffleNames,
    objectionRaffleHighlight,
    objectionRaffleWinner,
    correctObjectorNames,
    objectionWinnerName,
    playerHasGuessed,
    showFeedback,
    feedbackCorrect,
    feedbackMessage,
    guessResults,
    loadingNextSong,
    playedLinksHistory,
    playedSongs,
    currentSongLink,
    turnCounts,
    playerIndexAfterResolution,
    pendingPlacement,
    pendingPlacementOriginal,
    pendingPlacementResult,
    pendingGuessPoints,
    pendingGuessObjectionReward,
    pendingObjectionPlacement,
    objectionQueue,
    objectionQueuePos,
    guessedTitle,
    guessedArtist,
    guessedYear,
    guessedMovie,
    gameMode,
    bingoState,
    bingoSettings,
    songPlayPromptUrl,
    // Funktionen
    openSongHere,
    openSongOrPrompt,
    startFeedbackCountdown,
    // Computed
    isMyGuestGuessTurn,
  } = state;

  let _syncDebounceTimer = null;
  let _cleanup = null;
  // Host frisch in der Spielansicht: Bis der erste roomState zeigt, ob der
  // Raum schon einen Spielstand hat, wird nichts gesendet. Sonst überschriebe
  // ein neu geladener Host den laufenden Stand mit seinem leeren.
  let _holdHostSync = false;
  let _hostSyncHeld = false;
  // Zeitpunkt der eigenen Skip-Anfrage (Gast). Nur wer gefragt hat, bekommt
  // die Rückmeldung, dass der Host übersprungen hat.
  let _skipRequestedAt = 0;
  // Song, für den dieser Client „bereit“ gedrückt hat. Ging der Klick ohne
  // Verbindung ins Leere oder hat der Server ihn mit dem alten Socket
  // verloren, wird er nach dem Wiederverbinden nachgereicht.
  let _readyWantedUrl = null;

  // ── State-Synchronisation (nur Host) ───────────────────────────────

  const syncMultiplayerState = () => {
    if (!multiplayerMode.value || !multiplayerIsHost.value) return;
    if (_holdHostSync) {
      _hostSyncHeld = true;
      return;
    }
    if (_syncDebounceTimer) clearTimeout(_syncDebounceTimer);
    _syncDebounceTimer = setTimeout(() => {
      _syncDebounceTimer = null;
      if (!multiplayerMode.value || !multiplayerIsHost.value) return;
      socketEmit("host:syncState", {
        gameState: {
          playerTimelines: playerTimelines.value,
          currentPlayerIndex: currentPlayerIndex.value,
          playerCount: playerCount.value,
          gameMode: gameMode.value,
          currentCard: currentCard.value,
          showGuessDialog: showGuessDialog.value,
          activeGuessPlayerIndex: activeGuessPlayerIndex.value,
          showObjectionDialog: showObjectionDialog.value,
          currentObjectionPlayerIndex: currentObjectionPlayerIndex.value,
          isObjectionPhase: isObjectionPhase.value,
          objectionAttempts: objectionAttempts.value,
          // Neuer Einwand-Ablauf (Etappe 2): Opt-in, Countdowns, Number-Picker
          objectionOptInActive: objectionOptInActive.value,
          objectionOptIns: objectionOptIns.value,
          objectionOptInCountdown: objectionOptInCountdown.value,
          objectionPlacementCountdown: objectionPlacementCountdown.value,
          objectionRaffleActive: objectionRaffleActive.value,
          objectionRaffleNames: objectionRaffleNames.value,
          objectionRaffleHighlight: objectionRaffleHighlight.value,
          objectionRaffleWinner: objectionRaffleWinner.value,
          correctObjectorNames: correctObjectorNames.value,
          objectionWinnerName: objectionWinnerName.value,
          playerHasGuessed: playerHasGuessed.value,
          showFeedback: showFeedback.value,
          feedbackCorrect: feedbackCorrect.value,
          feedbackMessage: feedbackMessage.value,
          guessResults: guessResults.value,
          loadingNextSong: loadingNextSong.value,
          playedLinksHistoryCount: playedLinksHistory.value.length,
          pendingPlacementPlayerIndex:
            pendingPlacement.value?.playerIndex ?? null,
          // Felder, die nur der Host braucht. Der Server speichert den
          // Spielstand als `room.gameState`; ein Nachfolger nach einem
          // Host-Wechsel übernimmt sie von dort und kann weiterspielen.
          host: {
            playedLinksHistory: playedLinksHistory.value,
            // Im Bingo nicht: der letzte Eintrag (Titel, Künstler, Jahr)
            // wäre die Lösung der laufenden Runde.
            playedSongs: gameMode.value === "bingo" ? [] : playedSongs.value,
            currentSongLink: currentSongLink.value,
            turnCounts: turnCounts.value,
            playerIndexAfterResolution: playerIndexAfterResolution.value,
            pendingPlacement: pendingPlacement.value,
            pendingPlacementOriginal: pendingPlacementOriginal.value,
            pendingPlacementResult: pendingPlacementResult.value,
            pendingGuessPoints: pendingGuessPoints.value,
            pendingGuessObjectionReward: pendingGuessObjectionReward.value,
            pendingObjectionPlacement: pendingObjectionPlacement.value,
            objectionQueue: objectionQueue.value,
            objectionQueuePos: objectionQueuePos.value,
          },
        },
      });
    }, 50);
  };

  // Deps für useGameState setzen
  deps.syncMultiplayerState = syncMultiplayerState;
  deps.socketEmit = socketEmit;

  // ── Gast-Funktionen ────────────────────────────────────────────────

  const guestRequestSkip = () => {
    if (socketEmit("guest:skipRequest", {})) _skipRequestedAt = Date.now();
    Notify.create({
      type: "info",
      message: "Skip-Anfrage an Host gesendet...",
      timeout: 2000,
    });
  };

  // `host:confirmSkip` an die Gäste schickt manualSkipSong selbst. Ein
  // zweiter Emit hier hätte die Gäste doppelt zurückgesetzt.
  const confirmGuestSkip = () => {
    showSkipRequestDialog.value = false;
    manualSkipSong();
  };

  const guestDrawCard = () => {
    guestPendingSongUrl.value = null;
    socketEmit("guest:drawCard", {});
  };

  const openGuestSongUrl = () => {
    if (guestPendingSongUrl.value) {
      openSongHere(guestPendingSongUrl.value);
      guestPendingSongUrl.value = null;
    }
  };

  const guestPlaceCard = (playerIndex, position) => {
    socketEmit("guest:placeCard", { playerIndex, position });
  };

  const guestSubmitGuess = () => {
    socketEmit("guest:submitGuess", {
      title: guestGuessTitle.value || "",
      artist: guestGuessArtist.value || "",
      year: guestGuessYear.value || null,
      movie: guestGuessMovie.value || "",
    });
    guestGuessTitle.value = "";
    guestGuessArtist.value = "";
    guestGuessYear.value = null;
    guestGuessMovie.value = "";
  };

  const guestBeginObjection = () => {
    socketEmit("guest:beginObjection", { playerIndex: guestSlotIndex.value });
  };

  // Gast meldet sich (oder wieder ab) für einen Einwand an – nur der eigene Slot.
  const guestToggleObjectionOptIn = () => {
    socketEmit("guest:toggleObjectionOptIn", {
      playerIndex: guestSlotIndex.value,
    });
  };

  const guestCancelGuessAndReplace = () => {
    socketEmit("guest:cancelGuessAndReplace", {});
    guestGuessTitle.value = "";
    guestGuessArtist.value = "";
    guestGuessYear.value = null;
    guestGuessMovie.value = "";
  };

  // Ohne Verbindung bleibt der Knopf aktiv: Ein dauerhaft gesetztes
  // „bestätigt“ ohne Wirkung beim Server hielte die Runde für alle an. Der
  // Wunsch wird gemerkt und nach dem Wiederverbinden nachgereicht.
  const confirmSongReady = () => {
    if (songReadyConfirmed.value) return;
    _readyWantedUrl = pendingSongUrl.value || null;
    if (socketEmit("player:songReady", {})) {
      songReadyConfirmed.value = true;
      return;
    }
    Notify.create({
      type: "warning",
      message:
        "Keine Verbindung zum Server. Deine Bestätigung wird nachgereicht, sobald die Verbindung wieder steht.",
      timeout: 3500,
    });
  };

  const resetSongReady = () => {
    pendingSongUrl.value = null;
    songReadyCount.value = 0;
    songReadyTotal.value = 0;
    songReadyConfirmed.value = false;
    _readyWantedUrl = null;
  };

  // Gast-seitiger Reset der (gespiegelten) Einwand-UI – für Skip/Neustart, damit
  // kein Opt-in-Dialog oder Number-Picker hängenbleibt.
  const resetGuestObjectionUi = () => {
    isObjectionPhase.value = false;
    currentObjectionPlayerIndex.value = null;
    objectionOptInActive.value = false;
    objectionOptIns.value = [];
    objectionOptInCountdown.value = 0;
    objectionPlacementCountdown.value = 0;
    objectionRaffleActive.value = false;
    objectionRaffleNames.value = [];
    objectionRaffleHighlight.value = 0;
    objectionRaffleWinner.value = null;
    correctObjectorNames.value = [];
    objectionWinnerName.value = "";
  };

  // Host-Felder aus einem gespeicherten Spielstand übernehmen (Host-Wechsel).
  // Fehlt ein Feld (älterer Host-Client), bleibt der lokale Wert stehen.
  const adoptHostFields = (h) => {
    if (!h || typeof h !== "object") return;
    if (Array.isArray(h.playedLinksHistory)) {
      playedLinksHistory.value = [...h.playedLinksHistory];
    }
    if (Array.isArray(h.playedSongs) && h.playedSongs.length > 0) {
      playedSongs.value = [...h.playedSongs];
    }
    if ("currentSongLink" in h) currentSongLink.value = h.currentSongLink || null;
    if (Array.isArray(h.turnCounts)) turnCounts.value = [...h.turnCounts];
    if ("playerIndexAfterResolution" in h) {
      playerIndexAfterResolution.value = h.playerIndexAfterResolution ?? null;
    }
    pendingPlacement.value = h.pendingPlacement || null;
    pendingPlacementOriginal.value = h.pendingPlacementOriginal || null;
    pendingPlacementResult.value = h.pendingPlacementResult || null;
    pendingGuessPoints.value = Number(h.pendingGuessPoints) || 0;
    pendingGuessObjectionReward.value =
      Number(h.pendingGuessObjectionReward) || 0;
    pendingObjectionPlacement.value = h.pendingObjectionPlacement || null;
    objectionQueue.value = Array.isArray(h.objectionQueue)
      ? [...h.objectionQueue]
      : [];
    objectionQueuePos.value = Number(h.objectionQueuePos) || 0;
  };

  const copyRoomCode = () => {
    if (!multiplayerRoomCode.value) return;
    copyToClipboard(multiplayerRoomCode.value).then(() => {
      Notify.create({
        type: "positive",
        message: "Raumcode kopiert!",
        timeout: 1500,
      });
    });
  };

  // ── Multiplayer-Setup (in onMounted aufrufen) ──────────────────────

  const initMultiplayer = () => {
    if (route.query.multiplayer !== "1") return;

    multiplayerMode.value = true;
    multiplayerRoomCode.value = route.query.roomCode || "";
    multiplayerIsHost.value = route.query.isHost === "1";
    multiplayerAudioMode.value = route.query.audioMode || "host-only";
    guestSlotIndex.value =
      route.query.guestSlotIndex !== undefined
        ? parseInt(route.query.guestSlotIndex)
        : -1;

    const socket = connect();

    // Spielerliste aus dem letzten roomState (Reihenfolge wie room.players)
    // und der zuletzt bekannte Spielstand des Servers. Beides braucht es für
    // die Absender-Prüfung und für die Übernahme bei einem Host-Wechsel.
    let lastRoomPlayers = [];
    let lastGameState = null;
    // Hat der Server gerade einen Bereit-Ablauf („Alle Geräte“) offen?
    // null, solange unbekannt (frisch geladen).
    let serverReadyPending = null;
    // Nach dem Wiederverbinden die eigene Bereit-Bestätigung nachreichen,
    // sobald `songReady:state` zeigt, dass der Ablauf für denselben Song
    // noch offen ist.
    let resendReadyOnState = false;

    // Startet dieser Client die Spielansicht als Host (isHost=1 in der URL),
    // prüft der erste roomState, ob der Raum schon einen Spielstand hat.
    // Bis dahin hält syncMultiplayerState still (siehe `_holdHostSync`).
    let hostStateChecked = !multiplayerIsHost.value;
    let holdTimer = null;
    const releaseHostSync = () => {
      if (holdTimer) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }
      if (!_holdHostSync) return;
      _holdHostSync = false;
      if (_hostSyncHeld) {
        _hostSyncHeld = false;
        syncMultiplayerState();
      }
    };
    if (multiplayerIsHost.value) {
      _holdHostSync = true;
      _hostSyncHeld = false;
      // Kommt kein roomState (Server antwortet nicht), nicht ewig schweigen.
      holdTimer = setTimeout(() => {
        hostStateChecked = true;
        releaseHostSync();
      }, 5000);
    }

    // Noch nichts gespielt: keine Karte auf dem Tisch, keine Zeitleiste mit
    // Karten. Nur dann darf ein Spielstand vom Server den lokalen ersetzen.
    const hasCards = (timelines) =>
      (Array.isArray(timelines) ? timelines : []).some((p) =>
        (p?.cards || []).some((c) => c && !c.placeholder),
      );
    const localStateIsFresh = () =>
      !currentCard.value && !hasCards(playerTimelines.value);
    const roomStateHasProgress = (gs) =>
      !!gs &&
      typeof gs === "object" &&
      (!!gs.currentCard ||
        hasCards(gs.playerTimelines) ||
        Number(gs.playedLinksHistoryCount) > 0);

    // Zeitleisten-Index des Absenders einer Gast-Aktion. `fromSlotIndex`
    // setzt der Server (Index in room.players). Die Zeitleisten folgen der
    // Slot-Reihenfolge beim Spielstart; verschiebt sie sich doch (jemand hat
    // den Raum verlassen), hilft der Slotname. -1 heißt: verwerfen.
    const senderTimelineIndex = ({ fromSlotIndex, fromUsername } = {}) => {
      let idx = Number.isInteger(fromSlotIndex) ? fromSlotIndex : -1;
      // Älterer Server ohne `fromSlotIndex`: über den Nutzernamen suchen.
      if (fromSlotIndex === undefined && fromUsername) {
        idx = lastRoomPlayers.findIndex((p) =>
          (p.members || []).includes(fromUsername),
        );
      }
      if (idx < 0) return -1;
      const timelines = playerTimelines.value || [];
      const slotName = lastRoomPlayers[idx]?.slotName;
      if (slotName && timelines[idx]?.name !== slotName) {
        const treffer = timelines
          .map((p, i) => (p?.name === slotName ? i : -1))
          .filter((i) => i >= 0);
        if (treffer.length === 1) return treffer[0];
      }
      return idx < timelines.length ? idx : -1;
    };

    // roomState: Audio-Modus-Änderungen vom Host empfangen
    const onRoomState = (room) => {
      multiplayerAudioMode.value = room.audioMode;
      // Namen eigener/freigegebener Versionen für die Versionsanzeige.
      if (room?.settings?.customVersionsMeta) {
        roomVersionsMeta.value = room.settings.customVersionsMeta;
      }
      // Slot-Avatare bei jedem roomState mitziehen: der Server sendet
      // `memberAvatars` in getRoomBroadcastState. Damit werden Profilbilder
      // auch nach Rejoin/späterem Beitritt in der Spielansicht korrekt
      // aktualisiert (ohne auf ein `gameStarted`-Event angewiesen zu sein).
      if (room && Array.isArray(room.players)) {
        storeSlotAvatars(room.players, room.memberAvatars || {});
        lastRoomPlayers = room.players;
      }
      if (room?.gameState && typeof room.gameState === "object") {
        lastGameState = room.gameState;
      }
      const me = getUsername() || "";
      // Erster roomState nach dem Start als Host: Läuft im Raum schon ein
      // Spiel (Host hat neu geladen, kommt aus der Lobby zurück oder ist
      // ohne verbundenen Host eingesprungen), übernehmen wir dessen Stand
      // auf demselben Weg wie beim Host-Wechsel, statt leer anzufangen und
      // den Stand aller zu überschreiben.
      if (!hostStateChecked && room?.code) {
        hostStateChecked = true;
        if (
          multiplayerIsHost.value &&
          room.hostUsername === me &&
          localStateIsFresh() &&
          roomStateHasProgress(room.gameState)
        ) {
          if (holdTimer) {
            clearTimeout(holdTimer);
            holdTimer = null;
          }
          _holdHostSync = false;
          _hostSyncHeld = false;
          becomeHost(room.gameState, "Laufendes Spiel übernommen.");
        } else {
          releaseHostSync();
        }
      }
      // Bereit-Ablauf: Ist keiner offen, darf beim Gast auch kein „Song
      // öffnen“ mehr hängen (etwa nach einem Neuladen, als der Song schon
      // per `song:openNow` lief). Beim Host nicht: er setzt pendingSongUrl
      // schon vor `host:cardDrawn`, ein älterer roomState würde es löschen.
      if (typeof room?.songReadyPending === "boolean") {
        serverReadyPending = room.songReadyPending;
        if (
          !room.songReadyPending &&
          !multiplayerIsHost.value &&
          pendingSongUrl.value
        ) {
          resetSongReady();
        }
      }
      // Host-Failover erkennen: Der URL-Parameter `isHost` ist nur der
      // Startwert, maßgeblich ist der Host-Name im Raum. Stimmt er mit dem
      // eigenen Nutzernamen überein, sind wir (neuer) Host und übernehmen
      // den Spielstand. Umgekehrt (etwa ein neu geladener Ex-Host) werden
      // wir Gast und holen uns den Stand vom Server.
      if (room?.hostUsername && me) {
        const shouldBeHost = room.hostUsername === me;
        if (shouldBeHost && !multiplayerIsHost.value) {
          becomeHost(lastGameState);
        } else if (!shouldBeHost && multiplayerIsHost.value) {
          becomeGuest();
        }
      }
      // Bingo-Modus: Karten, Kreuze, Runden-State und Sieger direkt aus dem
      // autoritativen Room-Objekt übernehmen. Wird von jedem `roomState`-
      // Event getriggert. Der Server filtert `round.songData` bis zur
      // Auflösung heraus, damit die Antwort nicht via Devtools leakt.
      if (room?.settings?.gameMode === "bingo" && room.bingoState) {
        bingoState.value = {
          teamCards: room.bingoState.teamCards || {},
          teamMarks: room.bingoState.teamMarks || {},
          bingoCounts: room.bingoState.bingoCounts || {},
          round: room.bingoState.round || null,
          winners: room.bingoState.winners || null,
        };
      }
      // Bingo-Einstellungen ebenfalls vom Server übernehmen. Die URL-Query ist
      // nur der Startwert; schaltet der Host im Spiel zwischen Timer und
      // Warten um, kommt das allein über `roomState` an.
      const s = room?.settings;
      if (s?.gameMode === "bingo") {
        if (s.bingoTimerMode === "timer" || s.bingoTimerMode === "wait-all") {
          bingoSettings.timerMode = s.bingoTimerMode;
        }
        if (s.bingoDifficulty === "easy" || s.bingoDifficulty === "hard") {
          bingoSettings.difficulty = s.bingoDifficulty;
        }
        const secs = Number(s.bingoTimerSeconds);
        if (Number.isFinite(secs) && secs > 0) {
          bingoSettings.timerSeconds = secs;
        }
        const toWin = Number(s.bingosToWin);
        if (Number.isFinite(toWin) && toWin > 0) {
          bingoSettings.bingosToWin = toWin;
        }
      }
    };

    // cardDrawn: Song-URL an alle – im all-clients-Modus Ready-Flow starten
    const onCardDrawn = ({ songUrl, audioMode, waitForReady, totalPlayers }) => {
      multiplayerAudioMode.value = audioMode;
      serverReadyPending = !!(
        audioMode === "all-clients" &&
        songUrl &&
        waitForReady
      );
      // „Jetzt abspielen“ eines früheren Songs gilt nicht mehr. Der eigene
      // Knopf für genau diesen Song (Host im Modus „Nur Host“) bleibt.
      if (songPlayPromptUrl.value && songPlayPromptUrl.value !== songUrl) {
        songPlayPromptUrl.value = null;
      }
      // Ein neuer Song beendet eine offene Skip-Anfrage (der Host hat sie
      // abgelehnt oder übergangen).
      _skipRequestedAt = 0;
      if (audioMode === "all-clients" && songUrl && waitForReady) {
        // Ready-Flow: URL speichern, auf Klick aller warten. Das eigene Echo
        // des Hosts kommt erst nach seinem Klick an; eine schon gegebene
        // Bestätigung für genau diesen Song bleibt deshalb stehen.
        const gleicherSong =
          pendingSongUrl.value === songUrl &&
          (songReadyConfirmed.value || _readyWantedUrl === songUrl);
        pendingSongUrl.value = songUrl;
        songReadyTotal.value = totalPlayers;
        if (!gleicherSong) {
          songReadyCount.value = 0;
          songReadyConfirmed.value = false;
          _readyWantedUrl = null;
        }
        guestPendingSongUrl.value = null;
      } else if (!multiplayerIsHost.value) {
        // host-only: Gäste brauchen den Song nicht
        guestPendingSongUrl.value = null;
      }
    };

    // Spielstand des Hosts in den lokalen State spiegeln (Gast, und beim
    // Host-Werden als Grundlage für die Übernahme).
    const applyGameState = (gameState) => {
      if (gameState.playerTimelines) {
        playerTimelines.value = gameState.playerTimelines;
      }
      if (gameState.currentPlayerIndex !== undefined) {
        currentPlayerIndex.value = gameState.currentPlayerIndex;
      }
      if (gameState.playerCount !== undefined) {
        playerCount.value = gameState.playerCount;
      }
      if (gameState.gameMode !== undefined) {
        // Spielmodus vom Host übernehmen, damit der Gast das Film-Feld sieht.
        gameMode.value = gameState.gameMode;
      }
      if ("currentCard" in gameState) {
        const prevSongUrl = currentCard.value?.songUrl || null;
        const newSongUrl = gameState.currentCard?.songUrl || null;
        currentCard.value = gameState.currentCard;
        // Karten-Flicker-Guard beim Gast: Wenn im all-clients-Modus eine
        // NEUE Karte reinkommt (andere songUrl als vorher) und wir noch
        // nicht im Ready-Flow sind, proaktiv `pendingSongUrl` setzen.
        // Normalerweise kommt `cardDrawn` schon vor `stateUpdate` (Server
        // sendet in dieser Reihenfolge, Socket.IO ist FIFO) – bei
        // ungünstigem Timing (z. B. sofortiges stateUpdate durch anderen
        // Trigger) blitzen die Timeline-Slots sonst kurz auf, bevor der
        // cardDrawn-Event das `pendingSongUrl` setzt. Der `newSongUrl !==
        // prevSongUrl`-Vergleich verhindert, dass wir nach dem Ready-Flow-
        // Ende (pendingSongUrl=null, currentCard unverändert) fälschlich
        // wieder sperren.
        // Weiß der Client schon, dass kein Bereit-Ablauf offen ist (roomState
        // oder `songReady:state` nach dem Neuladen), wird nicht gesperrt.
        if (
          multiplayerAudioMode.value === "all-clients" &&
          serverReadyPending !== false &&
          newSongUrl &&
          newSongUrl !== prevSongUrl &&
          !songReadyConfirmed.value &&
          !pendingSongUrl.value
        ) {
          pendingSongUrl.value = newSongUrl;
        }
      }
      // Dialog-Zustände synchronisieren
      if (gameState.showGuessDialog !== undefined) {
        guestSyncState.showGuessDialog = gameState.showGuessDialog;
      }
      if (gameState.activeGuessPlayerIndex !== undefined) {
        guestSyncState.activeGuessPlayerIndex =
          gameState.activeGuessPlayerIndex;
      }
      if (gameState.showObjectionDialog !== undefined) {
        guestSyncState.showObjectionDialog = gameState.showObjectionDialog;
      }
      if (gameState.currentObjectionPlayerIndex !== undefined) {
        guestSyncState.currentObjectionPlayerIndex =
          gameState.currentObjectionPlayerIndex;
        currentObjectionPlayerIndex.value =
          gameState.currentObjectionPlayerIndex;
      }
      if (gameState.isObjectionPhase !== undefined) {
        guestSyncState.isObjectionPhase = gameState.isObjectionPhase;
        isObjectionPhase.value = gameState.isObjectionPhase;
      }
      if (gameState.objectionAttempts !== undefined)
        guestSyncState.objectionAttempts = gameState.objectionAttempts;
      // Neuer Einwand-Ablauf (Etappe 2): in die echten Refs spiegeln, damit
      // Opt-in-Dialog, Header-Countdown, Number-Picker und Feedback-Liste
      // beim Gast dieselben Templates wie beim Host nutzen können.
      if (gameState.objectionOptInActive !== undefined)
        objectionOptInActive.value = gameState.objectionOptInActive;
      if (gameState.objectionOptIns !== undefined)
        objectionOptIns.value = gameState.objectionOptIns;
      if (gameState.objectionOptInCountdown !== undefined)
        objectionOptInCountdown.value = gameState.objectionOptInCountdown;
      if (gameState.objectionPlacementCountdown !== undefined)
        objectionPlacementCountdown.value =
          gameState.objectionPlacementCountdown;
      if (gameState.objectionRaffleActive !== undefined)
        objectionRaffleActive.value = gameState.objectionRaffleActive;
      if (gameState.objectionRaffleNames !== undefined)
        objectionRaffleNames.value = gameState.objectionRaffleNames;
      if (gameState.objectionRaffleHighlight !== undefined)
        objectionRaffleHighlight.value = gameState.objectionRaffleHighlight;
      if (gameState.objectionRaffleWinner !== undefined)
        objectionRaffleWinner.value = gameState.objectionRaffleWinner;
      if (gameState.correctObjectorNames !== undefined)
        correctObjectorNames.value = gameState.correctObjectorNames;
      if (gameState.objectionWinnerName !== undefined)
        objectionWinnerName.value = gameState.objectionWinnerName;
      if (gameState.playerHasGuessed !== undefined) {
        guestSyncState.playerHasGuessed = gameState.playerHasGuessed;
        playerHasGuessed.value = gameState.playerHasGuessed;
      }
      // Feedback-Overlay für Gäste synchronisieren
      if (gameState.showFeedback !== undefined) {
        showFeedback.value = gameState.showFeedback;
        guestSyncState.showFeedback = gameState.showFeedback;
      }
      if (gameState.feedbackCorrect !== undefined) {
        feedbackCorrect.value = gameState.feedbackCorrect;
        guestSyncState.feedbackCorrect = gameState.feedbackCorrect;
      }
      if (gameState.feedbackMessage !== undefined) {
        feedbackMessage.value = gameState.feedbackMessage;
        guestSyncState.feedbackMessage = gameState.feedbackMessage;
      }
      if (gameState.guessResults !== undefined) {
        guessResults.value = gameState.guessResults;
        guestSyncState.guessResults = gameState.guessResults;
      }
      // loadingNextSong und Songs-Zähler
      if (gameState.loadingNextSong !== undefined) {
        loadingNextSong.value = gameState.loadingNextSong;
        guestSyncState.loadingNextSong = gameState.loadingNextSong;
      }
      if (gameState.playedLinksHistoryCount !== undefined) {
        guestSyncState.playedLinksHistoryCount =
          gameState.playedLinksHistoryCount;
      }
      if (gameState.pendingPlacementPlayerIndex !== undefined) {
        guestSyncState.pendingPlacementPlayerIndex =
          gameState.pendingPlacementPlayerIndex;
      }
    };

    // stateUpdate: Gäste synchronisieren ihren lokalen State vom Host
    const onStateUpdate = ({ gameState } = {}) => {
      if (!gameState || typeof gameState !== "object") return;
      lastGameState = gameState;
      if (multiplayerIsHost.value) return;
      applyGameState(gameState);
    };

    // Gast wird Host (Failover oder Rückkehr in einen Raum ohne Host): den
    // letzten Spielstand samt Host-Feldern übernehmen und die Timer, die nur
    // beim alten Host liefen, hier fortsetzen.
    const becomeHost = (gs, message = "Du bist jetzt Host.") => {
      if (gs && typeof gs === "object") {
        applyGameState(gs);
        // Beim Gast stehen diese Werte nur im Spiegel (guestSyncState), der
        // Host arbeitet mit den echten Refs.
        showGuessDialog.value = !!gs.showGuessDialog;
        activeGuessPlayerIndex.value = gs.activeGuessPlayerIndex ?? null;
        showObjectionDialog.value = !!gs.showObjectionDialog;
        objectionAttempts.value = Array.isArray(gs.objectionAttempts)
          ? [...gs.objectionAttempts]
          : [];
        adoptHostFields(gs.host);
      }
      // War man gerade selbst beim Raten, geht die Eingabe in den Host-Dialog.
      if (
        showGuessDialog.value &&
        activeGuessPlayerIndex.value === guestSlotIndex.value
      ) {
        guessedTitle.value = guestGuessTitle.value || "";
        guessedArtist.value = guestGuessArtist.value || "";
        guessedYear.value = guestGuessYear.value || null;
        guessedMovie.value = guestGuessMovie.value || "";
      }
      // Ein Ladevorgang des alten Hosts ist mit ihm verloren gegangen.
      loadingNextSong.value = false;
      multiplayerIsHost.value = true;
      resumeObjectionTimers?.();
      if (showFeedback.value) startFeedbackCountdown?.();
      // Übernommenen Stand (mit Host-Feldern) sofort wieder ablegen.
      syncMultiplayerState();
      Notify.create({
        type: "info",
        message,
        timeout: 2500,
        position: "top",
      });
    };

    // Host wird Gast: eigene Host-Timer anhalten und den aktuellen Stand
    // beim Server anfordern (`stateUpdate` und `songReady:state`).
    const becomeGuest = () => {
      multiplayerIsHost.value = false;
      if (_syncDebounceTimer) {
        clearTimeout(_syncDebounceTimer);
        _syncDebounceTimer = null;
      }
      clearObjectionTimers?.();
      showGuessDialog.value = false;
      showObjectionDialog.value = false;
      socketEmit("guest:requestSync", {});
    };

    // Antwort auf `guest:requestSync`: Stand des Bereit-Ablaufs. Nur wenn er
    // wirklich offen ist, bleibt bzw. kommt „Song öffnen“; sonst aufräumen.
    const onSongReadyState = ({ pending, songUrl } = {}) => {
      serverReadyPending = !!pending;
      if (pending && songUrl) {
        if (pendingSongUrl.value !== songUrl) {
          pendingSongUrl.value = songUrl;
          songReadyConfirmed.value = false;
          songReadyCount.value = 0;
          songReadyTotal.value = lastRoomPlayers.length;
          guestPendingSongUrl.value = null;
        }
      } else if (pendingSongUrl.value) {
        resetSongReady();
      }
      // Eigene Bestätigung nachreichen (nach dem Wiederverbinden oder wenn
      // der Klick ohne Verbindung kam). Der Server zählt jeden Platz nur
      // einmal, ein doppeltes Senden schadet nicht.
      if (resendReadyOnState) {
        resendReadyOnState = false;
        if (pending && songUrl && _readyWantedUrl === songUrl) {
          if (socketEmit("player:songReady", {})) {
            songReadyConfirmed.value = true;
          }
        }
      }
    };

    // HOST: Gast möchte Karte ziehen
    const onGuestDrawCard = ({ fromUsername }) => {
      if (!multiplayerIsHost.value) return;
      // Doppeltipp des Gastes oder spät ankommendes Event: Läuft schon ein
      // Ladevorgang oder liegt bereits eine Karte im Spiel, nichts tun.
      // Sonst würde ein weiterer Song verbraucht und die Bereit-Klicks
      // der Runde zurückgesetzt.
      if (loadingNextSong.value) return;
      if (currentCard.value) return;
      if (pendingSongUrl.value) return;
      Notify.create({
        type: "info",
        message: `${fromUsername} zieht eine Karte...`,
        timeout: 1500,
      });
      drawNewCard();
    };

    // Alle `guest:*`-Handler prüfen den Absender (`fromSlotIndex` vom Server)
    // gegen seine Rolle. Ungültiges wird still verworfen, damit ein Gast per
    // Devtools nicht für andere Spieler handeln kann.

    // HOST: Gast möchte Karte platzieren
    const onGuestPlaceCard = (payload = {}) => {
      if (!multiplayerIsHost.value) return;
      const { playerIndex, position } = payload;
      // Sicherheit gegen späten Klick nach Skip / Feedback / Song noch
      // nicht geöffnet: nur akzeptieren, wenn beim Host aktuell eine
      // Karte auf dem Tisch ist und noch nicht platziert wurde.
      if (!state.currentCard?.value) return;
      if (state.playerHasGuessed?.value) return;
      if (state.showFeedback?.value) return;
      if (state.pendingSongUrl?.value) return;
      const actor = senderTimelineIndex(payload);
      if (actor < 0) return;
      // placeCard lässt nur den Spieler am Zug bzw. in der Einwandphase den
      // aktuellen Einwender legen.
      placeCard(playerIndex, position, actor);
    };

    // HOST: Gast möchte Song skippen – Bestätigung anfordern
    const onGuestSkipRequest = ({ fromUsername }) => {
      if (!multiplayerIsHost.value) return;
      skipRequestFrom.value = fromUsername;
      showSkipRequestDialog.value = true;
    };

    // HOST: Gast sendet seine Rateeingabe
    const onGuestSubmitGuess = (payload = {}) => {
      if (!multiplayerIsHost.value) return;
      const { title, artist, year, movie } = payload;
      // Dieselbe Sicherheit wie bei onGuestPlaceCard: nur wenn wirklich
      // eine Platzierung offen ist. Verhindert, dass ein spät ankommender
      // Guess nach einem Skip die Runde erneut auflöst.
      if (!state.pendingPlacement?.value) return;
      // Doppelt abgeschickt: Die Platzierung ist schon ausgewertet (das
      // Einwandfenster läuft gerade). Eine zweite Auswertung würde die
      // Bonuspunkte erneut berechnen und die Einwände neu starten.
      if (state.pendingPlacementResult?.value) return;
      // Raten darf nur, wer die Karte gelegt hat.
      if (senderTimelineIndex(payload) !== pendingPlacement.value.playerIndex) {
        return;
      }
      guessedTitle.value = title || "";
      guessedArtist.value = artist || "";
      guessedYear.value = year || null;
      guessedMovie.value = movie || "";
      nextTick(() => submitGuess());
    };

    // HOST: Gast beginnt einen Einwand
    // Einwand nur für den eigenen Slot.
    const onGuestBeginObjection = (payload = {}) => {
      if (!multiplayerIsHost.value) return;
      const actor = senderTimelineIndex(payload);
      if (actor < 0) return;
      if (payload.playerIndex !== undefined && payload.playerIndex !== actor) {
        return;
      }
      beginObjection(actor);
    };

    // HOST: Gast meldet sich im Opt-in-Fenster (ab), Host führt die
    // Umschaltung aus. Auch hier nur für den eigenen Slot.
    const onGuestToggleObjectionOptIn = (payload = {}) => {
      if (!multiplayerIsHost.value) return;
      const actor = senderTimelineIndex(payload);
      if (actor < 0) return;
      if (payload.playerIndex !== undefined && payload.playerIndex !== actor) {
        return;
      }
      toggleObjectionOptIn(actor);
      syncMultiplayerState();
    };

    // Platzierung zurücknehmen darf nur der Platzierende, und nur solange
    // sie noch nicht ausgewertet ist (danach läuft das Einwandfenster).
    const onGuestCancelGuessAndReplace = (payload = {}) => {
      if (!multiplayerIsHost.value) return;
      if (!pendingPlacement.value || pendingPlacementResult.value) return;
      if (senderTimelineIndex(payload) !== pendingPlacement.value.playerIndex) {
        return;
      }
      cancelGuessAndReplace();
    };

    // HOST + GÄSTE: Ein anderer Client tippt live → Anzeige aktualisieren.
    // Server broadcastet den Payload jetzt an alle im Raum außer den
    // Absender (`socket.to(roomCode).emit(...)`), damit z. B. im Film-Modus
    // alle sehen, was der aktive Rater eintippt (nicht nur der Host).
    const onGuestGuessInputSync = ({ title, artist, year, movie }) => {
      activeGuessDisplay.value = { title, artist, year, movie: movie || "" };
    };

    // GAST: Host tippt live → Anzeige aktualisieren
    const onHostGuessInputSync = ({ title, artist, year, movie }) => {
      if (multiplayerIsHost.value) return;
      activeGuessDisplay.value = { title, artist, year, movie: movie || "" };
    };

    // song:readyUpdate: Ready-Zähler aktualisieren
    const onSongReadyUpdate = ({ readyCount, totalCount }) => {
      songReadyCount.value = readyCount;
      songReadyTotal.value = totalCount;
    };

    // song:openNow: Alle bereit – Song jetzt öffnen
    // Das Ereignis kommt ohne Klick an. Die Desktop-App öffnet trotzdem,
    // im Browser blockiert ohne Nutzergeste aber `spotify:` bzw. das Popup;
    // dann erscheint im Kopf der Knopf „Jetzt abspielen“.
    const onSongOpenNow = ({ songUrl }) => {
      serverReadyPending = false;
      resetSongReady();
      openSongOrPrompt(songUrl);
    };

    // GAST / HOST: Live-Tipp-Sync (eigene Eingabe senden)
    const stopWatchHostGuess = watch(
      () => [
        guessedTitle.value,
        guessedArtist.value,
        guessedYear.value,
        guessedMovie.value,
      ],
      ([t, a, y, m]) => {
        if (
          multiplayerMode.value &&
          multiplayerIsHost.value &&
          showGuessDialog.value
        ) {
          socketEmit("host:guessInputSync", {
            title: t || "",
            artist: a || "",
            year: y || null,
            movie: m || "",
          });
        }
      },
    );
    const stopWatchGuestGuess = watch(
      () => [
        guestGuessTitle.value,
        guestGuessArtist.value,
        guestGuessYear.value,
        guestGuessMovie.value,
      ],
      ([t, a, y, m]) => {
        if (
          multiplayerMode.value &&
          !multiplayerIsHost.value &&
          isMyGuestGuessTurn.value
        ) {
          socketEmit("guest:guessInputSync", {
            title: t || "",
            artist: a || "",
            year: y || null,
            movie: m || "",
          });
        }
      },
    );

    // Dialog-Zustand-Watcher: syncMultiplayerState auslösen
    const stopWatchDialogSync = watch(
      () => [
        showGuessDialog.value,
        activeGuessPlayerIndex.value,
        showObjectionDialog.value,
        currentObjectionPlayerIndex.value,
        isObjectionPhase.value,
        playerHasGuessed.value,
        showFeedback.value,
        feedbackCorrect.value,
        feedbackMessage.value,
        loadingNextSong.value,
        currentCard.value,
        playerTimelines.value,
        // Neuer Einwand-Ablauf (Etappe 2): Opt-in / Countdowns / Number-Picker
        objectionOptInActive.value,
        objectionOptIns.value,
        objectionOptInCountdown.value,
        objectionPlacementCountdown.value,
        objectionRaffleActive.value,
        objectionRaffleNames.value,
        objectionRaffleHighlight.value,
        objectionRaffleWinner.value,
        correctObjectorNames.value,
        objectionWinnerName.value,
      ],
      () => {
        if (multiplayerMode.value && multiplayerIsHost.value) {
          syncMultiplayerState();
        }
      },
    );

    // GAST: Host bestätigt Skip
    const onHostConfirmSkip = () => {
      if (multiplayerIsHost.value) return;
      guestSyncState.showGuessDialog = false;
      guestSyncState.activeGuessPlayerIndex = null;
      guestSyncState.showObjectionDialog = false;
      guestSyncState.currentObjectionPlayerIndex = null;
      guestSyncState.isObjectionPhase = false;
      guestSyncState.playerHasGuessed = false;
      guestSyncState.pendingPlacementPlayerIndex = null;
      guestSyncState.loadingNextSong = false;
      currentCard.value = null;
      playerHasGuessed.value = false;
      // Falls in einer Timeline noch ein Placeholder aus einer laufenden
      // Platzierung liegt (der Aktive hatte gerade platziert), Placeholder
      // beim Gast lokal entfernen. Der Host schickt ohnehin nach dem Skip
      // einen frischen State via syncState, dieses Aufräumen verhindert
      // aber einen kurzen Frame mit „Leerslot in der Mitte einer Timeline".
      for (const p of playerTimelines.value || []) {
        if (!Array.isArray(p?.cards)) continue;
        p.cards = p.cards.filter((c) => !c?.placeholder);
      }
      pendingPlacement.value = null;
      resetGuestObjectionUi();
      guestPendingSongUrl.value = null;
      songPlayPromptUrl.value = null;
      serverReadyPending = false;
      guestGuessTitle.value = "";
      guestGuessArtist.value = "";
      guestGuessYear.value = null;
      guestGuessMovie.value = "";
      activeGuessDisplay.value = {
        title: "",
        artist: "",
        year: null,
        movie: "",
      };
      resetSongReady();
      // Die Rückmeldung gilt nur dem Gast, der um den Skip gebeten hat, und
      // nur einmal. Andere Skips (auch eine abgebrochene Bingo-Runde) laufen
      // ohne Hinweis.
      const angefragt =
        _skipRequestedAt && Date.now() - _skipRequestedAt < 2 * 60 * 1000;
      _skipRequestedAt = 0;
      if (angefragt) {
        Notify.create({
          type: "positive",
          message: "Der Host hat den Skip bestätigt.",
          timeout: 2000,
        });
      }
    };

    // GAST: Host schickt alle zur Lobby zurück
    const onReturnToLobby = () => {
      if (multiplayerIsHost.value) return;
      // Bingo-State aufräumen, damit ein Modus-Wechsel zurück ins Bingo
      // beim nächsten Start nicht mit alten Karten weiterspielt.
      try {
        sessionStorage.removeItem("hitster-bingo-state");
      } catch {
        /* Speicher nicht verfügbar */
      }
      router.push("/lobby");
    };

    // GAST: Host startet eine neue Runde (nach Rückkehr zur Lobby und
    // ggf. Modus-/Version-Wechsel). Wenn der Client noch in der alten
    // /game-Instanz hängt (weil er das returnToLobby-Event verpasst hat
    // oder der Host direkt neu gestartet hat), zwingt uns das hier
    // trotzdem in die neue Route mit den frisch gewählten Query-Params.
    // Ohne das blieben Gäste im alten Modus, wenn der Host z. B. von
    // Bingo zu Normal wechselt.
    const onGameStartedInGame = (room) => {
      if (multiplayerIsHost.value) return;
      if (!room) return;
      // Wenn wir gerade nicht in /game sind, macht Lobby.vue den Push
      // selbst – hier nichts tun.
      if (route.path !== "/game") return;
      const me = getUsername() || "";
      const players = room.players || [];
      const mySlotIndex = players.findIndex((p) =>
        (p.members || []).includes(me)
      );
      let idx = mySlotIndex;
      if (idx < 0 && guestSlotIndex?.value >= 0) idx = guestSlotIndex.value;
      const mode = room.settings?.gameMode || "normal";
      const isBattle = mode === "battle";
      const perPlayerPools = isBattle
        ? players.map((p) => p.pool || "")
        : [];
      const effectivePools = isBattle
        ? [...new Set(perPlayerPools.filter(Boolean))]
        : room.settings?.songPools || ["staffel1"];
      const query = {
        multiplayer: "1",
        roomCode: room.code,
        isHost: "0",
        guestSlotIndex: idx >= 0 ? idx : 0,
        songPools: effectivePools.join(","),
        songPool: effectivePools[0] || "staffel1",
        audioMode: room.audioMode,
        mode,
        names: encodeNamesQuery(players.map((p) => p.slotName)),
        players: players.length,
      };
      if (isBattle) {
        query.playerSongPools = perPlayerPools.join(",");
      }
      if (mode === "bingo") {
        query.bingoDifficulty = room.settings?.bingoDifficulty || "easy";
        query.bingoTimerMode = room.settings?.bingoTimerMode || "timer";
        query.bingoTimerSeconds = String(
          room.settings?.bingoTimerSeconds || 30
        );
        query.bingosToWin = String(room.settings?.bingosToWin || 3);
        try {
          if (room.bingoState) {
            sessionStorage.setItem(
              "hitster-bingo-state",
              JSON.stringify(room.bingoState)
            );
          }
        } catch {
          /* ignore */
        }
      } else {
        // Wechsel WEG von Bingo: alten Bingo-State entsorgen, damit die
        // nächste Bingo-Runde keine alten Karten wiederverwendet.
        try {
          sessionStorage.removeItem("hitster-bingo-state");
        } catch {
          /* ignore */
        }
      }
      // Profilbilder pro Slot für die Spielansicht ablegen (siehe Lobby).
      storeSlotAvatars(players, room.memberAvatars);
      // Direkter Push zur neuen /game-Route: der `:key`-Fix am
      // `<router-view>` (MainLayout) erzwingt bei Modus-Wechsel ein
      // sauberes Remount, weshalb der frühere Umweg über /lobby nicht
      // mehr nötig ist (und tatsächlich schädlich war: der Zwischen-
      // Unmount hat useMultiplayer destroyed, sodass der frisch
      // eintreffende `stateUpdate` beim Modus-Wechsel manchmal ins
      // Leere lief). `router.replace` statt `push`, damit die alte
      // /game-Route nicht in der History bleibt.
      router.replace({ path: "/game", query });
    };

    // GAST: Spielsieg-Nachricht vom Host
    const onSyncGameOver = ({ winnerName: winner, headline }) => {
      if (multiplayerIsHost.value) return;
      Notify.create({
        type: "positive",
        message: `🏆 ${winner} ${headline}`,
        timeout: 6000,
        position: "top",
      });
    };

    // GAST: Neue Runde gestartet – guestSyncState zurücksetzen
    const onGameRestarted = () => {
      if (multiplayerIsHost.value) return;
      guestSyncState.showGuessDialog = false;
      guestSyncState.activeGuessPlayerIndex = null;
      guestSyncState.showObjectionDialog = false;
      guestSyncState.currentObjectionPlayerIndex = null;
      guestSyncState.isObjectionPhase = false;
      guestSyncState.objectionAttempts = [];
      guestSyncState.playerHasGuessed = false;
      resetGuestObjectionUi();
      activeGuessDisplay.value = { title: "", artist: "", year: null, movie: "" };
      resetSongReady();
      songPlayPromptUrl.value = null;
      Notify.create({
        type: "info",
        message: "Neue Runde gestartet!",
        timeout: 3000,
        position: "top",
      });
    };

    // Fehlermeldungen des Servers auch in der Spielansicht zeigen (bisher
    // hörte nur die Lobby zu). Antworten mit Callback kommen nicht zusätzlich
    // als `error`, ein Hinweis erscheint also nur einmal.
    const onSocketError = ({ message } = {}) => {
      if (!message) return;
      Notify.create({ type: "negative", message, timeout: 3500 });
    };

    socketOn("roomState", onRoomState);
    socketOn("error", onSocketError);
    socketOn("cardDrawn", onCardDrawn);
    socketOn("stateUpdate", onStateUpdate);
    socketOn("guest:drawCard", onGuestDrawCard);
    socketOn("guest:placeCard", onGuestPlaceCard);
    socketOn("guest:skipRequest", onGuestSkipRequest);
    socketOn("guest:submitGuess", onGuestSubmitGuess);
    socketOn("guest:beginObjection", onGuestBeginObjection);
    socketOn("guest:toggleObjectionOptIn", onGuestToggleObjectionOptIn);
    socketOn("guest:cancelGuessAndReplace", onGuestCancelGuessAndReplace);
    socketOn("guest:guessInputSync", onGuestGuessInputSync);
    socketOn("host:guessInputSync", onHostGuessInputSync);
    socketOn("host:confirmSkip", onHostConfirmSkip);
    socketOn("song:readyUpdate", onSongReadyUpdate);
    socketOn("song:openNow", onSongOpenNow);
    socketOn("songReady:state", onSongReadyState);
    socketOn("returnToLobby", onReturnToLobby);
    socketOn("gameStarted", onGameStartedInGame);
    socketOn("syncGameOver", onSyncGameOver);
    socketOn("gameRestarted", onGameRestarted);

    if (!multiplayerIsHost.value) {
      socketEmit("guest:requestSync", {});
    }

    // Auch für den Host bestimmen: wird er später Gast (Host-Wechsel), meldet
    // er sich beim Wiederverbinden mit seinem Slot.
    const mySlotName =
      decodeNamesQuery(route.query.names)[guestSlotIndex.value] || "";
    const onSocketConnect = () => {
      socketEmit("joinRoom", {
        roomCode: multiplayerRoomCode.value,
        slotName: multiplayerIsHost.value ? "" : mySlotName,
      });
      // Hatte dieser Client für den offenen Song schon „bereit“ gedrückt,
      // ist das beim Server mit dem alten Socket verloren gegangen. Den
      // Stand des Ablaufs holt `guest:requestSync` (auch für den Host).
      resendReadyOnState =
        !!_readyWantedUrl && pendingSongUrl.value === _readyWantedUrl;
      if (!multiplayerIsHost.value || resendReadyOnState) {
        socketEmit("guest:requestSync", {});
      }
    };
    socket.on("connect", onSocketConnect);
    // Host mit schon verbundenem Socket (kommt aus der Lobby): Das connect-
    // Ereignis bleibt aus, den roomState für die Prüfung oben fordert ein
    // erneutes joinRoom an (für den Server ein reiner Reconnect).
    if (multiplayerIsHost.value && socket.connected) {
      socketEmit("joinRoom", {
        roomCode: multiplayerRoomCode.value,
        slotName: "",
      });
    }

    _cleanup = () => {
      stopWatchHostGuess();
      stopWatchGuestGuess();
      stopWatchDialogSync();
      if (_syncDebounceTimer) {
        clearTimeout(_syncDebounceTimer);
        _syncDebounceTimer = null;
      }
      socket.off("connect", onSocketConnect);
      if (holdTimer) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }
      _holdHostSync = false;
      _hostSyncHeld = false;
      socketOff("roomState", onRoomState);
      socketOff("error", onSocketError);
      socketOff("cardDrawn", onCardDrawn);
      socketOff("stateUpdate", onStateUpdate);
      socketOff("guest:drawCard", onGuestDrawCard);
      socketOff("guest:placeCard", onGuestPlaceCard);
      socketOff("guest:skipRequest", onGuestSkipRequest);
      socketOff("guest:submitGuess", onGuestSubmitGuess);
      socketOff("guest:beginObjection", onGuestBeginObjection);
      socketOff(
        "guest:toggleObjectionOptIn",
        onGuestToggleObjectionOptIn,
      );
      socketOff(
        "guest:cancelGuessAndReplace",
        onGuestCancelGuessAndReplace,
      );
      socketOff("guest:guessInputSync", onGuestGuessInputSync);
      socketOff("host:guessInputSync", onHostGuessInputSync);
      socketOff("host:confirmSkip", onHostConfirmSkip);
      socketOff("song:readyUpdate", onSongReadyUpdate);
      socketOff("song:openNow", onSongOpenNow);
      socketOff("songReady:state", onSongReadyState);
      socketOff("returnToLobby", onReturnToLobby);
      socketOff("gameStarted", onGameStartedInGame);
      socketOff("syncGameOver", onSyncGameOver);
      socketOff("gameRestarted", onGameRestarted);
    };
  };

  const destroyMultiplayer = () => {
    _cleanup?.();
    _cleanup = null;
  };

  // ── Return ──────────────────────────────────────────────────────────

  return {
    syncMultiplayerState,
    socketEmit,
    // Gast-Aktionen
    guestRequestSkip,
    confirmGuestSkip,
    guestDrawCard,
    openGuestSongUrl,
    guestPlaceCard,
    guestSubmitGuess,
    guestBeginObjection,
    guestToggleObjectionOptIn,
    guestCancelGuessAndReplace,
    copyRoomCode,
    // Song-Ready
    confirmSongReady,
    // Lifecycle
    initMultiplayer,
    destroyMultiplayer,
  };
}
