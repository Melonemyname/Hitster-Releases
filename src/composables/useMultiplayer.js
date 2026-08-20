import { watch, nextTick } from "vue";
import { openSongTab } from "../utils/songTabManager";
import { Notify, copyToClipboard } from "quasar";
import {
  connect,
  emit as socketEmit,
  on as socketOn,
  off as socketOff,
} from "../utils/socketService";
import { getUsername } from "../utils/authService";
import { storeSlotAvatars } from "../utils/profileService";

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
    pendingPlacement,
    guessedTitle,
    guessedArtist,
    guessedYear,
    guessedMovie,
    gameMode,
    bingoState,
    // Computed
    isMyGuestGuessTurn,
  } = state;

  let _syncDebounceTimer = null;
  let _cleanup = null;

  // ── State-Synchronisation (nur Host) ───────────────────────────────

  const syncMultiplayerState = () => {
    if (!multiplayerMode.value || !multiplayerIsHost.value) return;
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
        },
      });
    }, 50);
  };

  // Deps für useGameState setzen
  deps.syncMultiplayerState = syncMultiplayerState;
  deps.socketEmit = socketEmit;

  // ── Gast-Funktionen ────────────────────────────────────────────────

  const guestRequestSkip = () => {
    socketEmit("guest:skipRequest", {});
    Notify.create({
      type: "info",
      message: "Skip-Anfrage an Host gesendet...",
      timeout: 2000,
    });
  };

  const confirmGuestSkip = () => {
    showSkipRequestDialog.value = false;
    socketEmit("host:confirmSkip", {});
    manualSkipSong();
  };

  const guestDrawCard = () => {
    guestPendingSongUrl.value = null;
    socketEmit("guest:drawCard", {});
  };

  const openGuestSongUrl = () => {
    if (guestPendingSongUrl.value) {
      openSongTab(guestPendingSongUrl.value);
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

  const confirmSongReady = () => {
    if (songReadyConfirmed.value) return;
    songReadyConfirmed.value = true;
    socketEmit("player:songReady", {});
  };

  const resetSongReady = () => {
    pendingSongUrl.value = null;
    songReadyCount.value = 0;
    songReadyTotal.value = 0;
    songReadyConfirmed.value = false;
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

    // roomState: Audio-Modus-Änderungen vom Host empfangen
    const onRoomState = (room) => {
      multiplayerAudioMode.value = room.audioMode;
      // Slot-Avatare bei jedem roomState mitziehen: der Server sendet
      // `memberAvatars` in getRoomBroadcastState. Damit werden Profilbilder
      // auch nach Rejoin/späterem Beitritt in der Spielansicht korrekt
      // aktualisiert (ohne auf ein `gameStarted`-Event angewiesen zu sein).
      if (room && Array.isArray(room.players)) {
        storeSlotAvatars(room.players, room.memberAvatars || {});
      }
      // Host-Failover erkennen: Wenn der Host-Name im Raum jetzt mit dem
      // eigenen Nutzernamen übereinstimmt, sind wir der neue Host. UI
      // schaltet automatisch auf Host-Ansicht (Skip-Button, Draw-Button,
      // Bingo-Aktionen). Umgekehrt: wenn wir vorher Host waren aber der
      // Server jemand anderen zeigt, degradieren wir.
      const me = getUsername() || "";
      if (room?.hostUsername && me) {
        const shouldBeHost = room.hostUsername === me;
        if (shouldBeHost && !multiplayerIsHost.value) {
          multiplayerIsHost.value = true;
          Notify.create({
            type: "info",
            message: "Du bist jetzt Host.",
            timeout: 2500,
            position: "top",
          });
        } else if (!shouldBeHost && multiplayerIsHost.value) {
          multiplayerIsHost.value = false;
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
    };

    // cardDrawn: Song-URL an alle – im all-clients-Modus Ready-Flow starten
    const onCardDrawn = ({ songUrl, audioMode, waitForReady, totalPlayers }) => {
      multiplayerAudioMode.value = audioMode;
      if (audioMode === "all-clients" && songUrl && waitForReady) {
        // Ready-Flow: URL speichern, auf Klick aller warten
        pendingSongUrl.value = songUrl;
        songReadyCount.value = 0;
        songReadyTotal.value = totalPlayers;
        songReadyConfirmed.value = false;
        guestPendingSongUrl.value = null;
      } else if (!multiplayerIsHost.value) {
        // host-only: Gäste brauchen den Song nicht
        guestPendingSongUrl.value = null;
      }
    };

    // stateUpdate: Gäste synchronisieren ihren lokalen State vom Host
    const onStateUpdate = ({ gameState }) => {
      if (multiplayerIsHost.value || !gameState) return;
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
        if (
          multiplayerAudioMode.value === "all-clients" &&
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

    // HOST: Gast möchte Karte ziehen
    const onGuestDrawCard = ({ fromUsername }) => {
      if (!multiplayerIsHost.value) return;
      Notify.create({
        type: "info",
        message: `${fromUsername} zieht eine Karte...`,
        timeout: 1500,
      });
      drawNewCard();
    };

    // HOST: Gast möchte Karte platzieren
    const onGuestPlaceCard = ({ playerIndex, position }) => {
      if (!multiplayerIsHost.value) return;
      // Sicherheit gegen späten Klick nach Skip / Feedback / Song noch
      // nicht geöffnet: nur akzeptieren, wenn beim Host aktuell eine
      // Karte auf dem Tisch ist und noch nicht platziert wurde.
      if (!state.currentCard?.value) return;
      if (state.playerHasGuessed?.value) return;
      if (state.showFeedback?.value) return;
      if (state.pendingSongUrl?.value) return;
      placeCard(playerIndex, position);
    };

    // HOST: Gast möchte Song skippen – Bestätigung anfordern
    const onGuestSkipRequest = ({ fromUsername }) => {
      if (!multiplayerIsHost.value) return;
      skipRequestFrom.value = fromUsername;
      showSkipRequestDialog.value = true;
    };

    // HOST: Gast sendet seine Rateeingabe
    const onGuestSubmitGuess = ({ title, artist, year, movie }) => {
      if (!multiplayerIsHost.value) return;
      // Dieselbe Sicherheit wie bei onGuestPlaceCard: nur wenn wirklich
      // eine Platzierung offen ist. Verhindert, dass ein spät ankommender
      // Guess nach einem Skip die Runde erneut auflöst.
      if (!state.pendingPlacement?.value) return;
      guessedTitle.value = title || "";
      guessedArtist.value = artist || "";
      guessedYear.value = year || null;
      guessedMovie.value = movie || "";
      nextTick(() => submitGuess());
    };

    // HOST: Gast beginnt einen Einwand
    const onGuestBeginObjection = ({ playerIndex }) => {
      if (!multiplayerIsHost.value) return;
      beginObjection(playerIndex);
    };

    // HOST: Gast meldet sich im Opt-in-Fenster (ab), Host führt die Umschaltung aus.
    const onGuestToggleObjectionOptIn = ({ playerIndex }) => {
      if (!multiplayerIsHost.value) return;
      toggleObjectionOptIn(playerIndex);
      syncMultiplayerState();
    };

    const onGuestCancelGuessAndReplace = () => {
      if (!multiplayerIsHost.value) return;
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
    const onSongOpenNow = ({ songUrl }) => {
      openSongTab(songUrl);
      resetSongReady();
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
      Notify.create({
        type: "positive",
        message: "Host hat den Skip bestätigt",
        timeout: 2000,
      });
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
        names: players.map((p) => p.slotName).join(","),
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
      Notify.create({
        type: "info",
        message: "Neue Runde gestartet!",
        timeout: 3000,
        position: "top",
      });
    };

    socketOn("roomState", onRoomState);
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
    socketOn("returnToLobby", onReturnToLobby);
    socketOn("gameStarted", onGameStartedInGame);
    socketOn("syncGameOver", onSyncGameOver);
    socketOn("gameRestarted", onGameRestarted);

    if (!multiplayerIsHost.value) {
      socketEmit("guest:requestSync", {});
    }

    const mySlotName = !multiplayerIsHost.value
      ? (route.query.names || "").split(",")[guestSlotIndex.value] || ""
      : "";
    const onSocketConnect = () => {
      socketEmit("joinRoom", {
        roomCode: multiplayerRoomCode.value,
        slotName: multiplayerIsHost.value ? "" : mySlotName,
      });
      if (!multiplayerIsHost.value) {
        socketEmit("guest:requestSync", {});
      }
    };
    socket.on("connect", onSocketConnect);

    _cleanup = () => {
      stopWatchHostGuess();
      stopWatchGuestGuess();
      stopWatchDialogSync();
      if (_syncDebounceTimer) {
        clearTimeout(_syncDebounceTimer);
        _syncDebounceTimer = null;
      }
      socket.off("connect", onSocketConnect);
      socketOff("roomState", onRoomState);
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
