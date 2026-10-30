import { ref, computed, watch, onBeforeUnmount } from "vue";
import { emit as socketEmit } from "../utils/socketService";
import { BINGO_CATEGORIES } from "./useBingo";
import { guessEnsemble } from "../utils/exportifyCsv";
import { buildArtistEnsembleIndex } from "../utils/spotifyCsvService";

/**
 * Composable für den Bingo-Runden-Ablauf im Client:
 *   - Reveal-Animation (Kategorie-Auslosung, analog `objectionRaffle`)
 *   - Host-/Team-Aktionen an den Server (Emit-Wrapper)
 *   - Watcher, die auf Phasen-Wechsel vom Server reagieren
 *
 * Autoritativ ist der Server; hier läuft ausschließlich UI-Logik.
 */
export function useBingoRound(state, { drawNewCard }) {
  const {
    gameMode,
    bingoState,
    bingoSettings,
    bingoPendingSongUrl,
    bingoPendingCardData,
    bingoTeamAnswer,
    bingoRevealHighlight,
    bingoRevealAnimating,
    showBingoBonusDialog,
    bingoBonusTargetSlotId,
    bingoBonusCellIndex,
    multiplayerIsHost,
    multiplayerAudioMode,
    guestSlotIndex,
    pendingSongUrl,
    songReadyCount,
    songReadyTotal,
    songReadyConfirmed,
    openSongOrPrompt,
    currentCard,
  } = state;

  // ── Abgeleitete Referenzen aus dem Server-State ─────────────────────

  const round = computed(() => bingoState.value?.round || null);
  const roundPhase = computed(() => round.value?.phase || "idle");
  const winners = computed(() => bingoState.value?.winners || null);

  // Kategorien in stabiler Reihenfolge (identisch zur Server-Reihenfolge),
  // damit die Reveal-Animation deterministisch am Ziel landet.
  const orderedCategories = computed(
    () =>
      BINGO_CATEGORIES[bingoSettings.difficulty || "easy"] ||
      BINGO_CATEGORIES.easy,
  );

  // Slot-Index (0-basiert) → slotId. Slots kommen sortiert vom Server.
  const orderedSlotIds = computed(() => {
    const bs = bingoState.value;
    if (!bs?.teamCards) return [];
    return Object.keys(bs.teamCards)
      .map((k) => Number(k))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);
  });

  const mySlotId = computed(() => {
    const idx = guestSlotIndex?.value;
    if (idx === null || idx === undefined || idx < 0) return null;
    return orderedSlotIds.value[idx] ?? null;
  });

  const iAmInBonusPending = computed(() => {
    const r = round.value;
    if (!r) return false;
    const sid = mySlotId.value;
    if (sid === null) return false;
    return (
      (r.bonusPending || []).includes(sid) && !(r.bonusResolved || {})[sid]
    );
  });

  const iAmCorrectAndNeedsMark = computed(() => {
    const r = round.value;
    if (!r || r.phase !== "marking") return false;
    const sid = mySlotId.value;
    if (sid === null) return false;
    return (
      (r.correctSlots || []).includes(sid) && !(r.markedThisRound || {})[sid]
    );
  });

  // Hat das eigene Team seine Antwort schon abgegeben?
  const myAnswerConfirmed = computed(() => {
    const sid = mySlotId.value;
    if (sid === null) return false;
    return !!round.value?.teamConfirmed?.[sid];
  });

  // Kategorie-Farbe der aktuellen Runde (für pickableColor der eigenen Karte).
  const activeCategoryColor = computed(
    () => round.value?.category?.color || null,
  );

  // Reaktive Zeitquelle für den Countdown. `Date.now()` allein ist nicht
  // reaktiv, die Anzeige würde sonst nur bei eingehenden roomStates
  // springen. Der Takt läuft nur, solange eine Deadline aktiv ist.
  const now = ref(Date.now());
  let countdownTicker = null;
  const stopCountdownTicker = () => {
    if (countdownTicker) {
      clearInterval(countdownTicker);
      countdownTicker = null;
    }
  };
  const startCountdownTicker = () => {
    now.value = Date.now();
    if (countdownTicker) return;
    countdownTicker = setInterval(() => {
      now.value = Date.now();
    }, 250);
  };
  watch(
    () => {
      const r = round.value;
      return r && r.phase === "answering" && r.deadlineTimestamp
        ? r.deadlineTimestamp
        : null;
    },
    (deadline) => {
      if (deadline) startCountdownTicker();
      else stopCountdownTicker();
    },
    { immediate: true },
  );

  // Countdown in Sekunden (nur im Timer-Modus).
  const secondsRemaining = computed(() => {
    const r = round.value;
    if (!r || r.phase !== "answering") return null;
    if (!r.deadlineTimestamp) return null;
    return Math.max(0, Math.ceil((r.deadlineTimestamp - now.value) / 1000));
  });

  // ── Reveal-Animation (lokal) ────────────────────────────────────────

  let revealTimer = null;
  const cancelRevealAnimation = () => {
    if (revealTimer) {
      clearTimeout(revealTimer);
      revealTimer = null;
    }
    bingoRevealAnimating.value = false;
    bingoRevealHighlight.value = 0;
  };

  const startRevealAnimation = () => {
    cancelRevealAnimation();
    const cats = orderedCategories.value;
    const currentCat = round.value?.category;
    if (!currentCat || cats.length === 0) return;
    const targetIndex = cats.findIndex((c) => c.id === currentCat.id);
    if (targetIndex < 0) return;

    bingoRevealAnimating.value = true;
    // Ähnlich `startRaffle` in useGuessEngine: viele Schritte, dann Ease-out
    // bis Ziel-Index. So landet der Highlight garantiert auf der Kategorie.
    const count = cats.length;
    let totalSteps = count * 3 + 5;
    totalSteps += (targetIndex - (totalSteps % count) + count) % count;
    let step = 0;
    const tick = () => {
      bingoRevealHighlight.value = step % count;
      if (step >= totalSteps) {
        // Nach kurzer Landepause: Animation beenden. Der Host emittiert
        // dann `host:bingoOpenAnswering` und startet den Song.
        revealTimer = setTimeout(() => {
          bingoRevealAnimating.value = false;
          if (multiplayerIsHost.value) {
            hostOpenAnsweringPhase();
          }
        }, 1200);
        return;
      }
      step += 1;
      const progress = step / totalSteps;
      const delay = 55 + Math.round(progress * progress * 340);
      revealTimer = setTimeout(tick, delay);
    };
    tick();
  };

  // ── Host-Aktionen ───────────────────────────────────────────────────

  // Start unterwegs: Zwischen `host:bingoStartRound` und dem roomState mit
  // der neuen Phase steht die Runde lokal noch auf 'idle'. Ein zweiter
  // Klick in dieser Lücke würde eine weitere Karte ziehen und den Song-
  // Puffer überschreiben, der Server lehnt den zweiten Start aber ab und
  // wertet gegen die erste Karte. Die Sperre fällt, sobald die Phase
  // wechselt, oder spätestens nach einer Frist (falls der Server den Start
  // still verworfen hat).
  const START_PENDING_TIMEOUT_MS = 10000;
  let startPending = false;
  let startPendingTimer = null;
  const clearStartPending = () => {
    startPending = false;
    if (startPendingTimer) {
      clearTimeout(startPendingTimer);
      startPendingTimer = null;
    }
  };

  // Band/Solo für die Kategorie „Solo oder Gruppe?“: Fehlt der Wert in den
  // Songdaten, wird er vor dem Rundenstart aus dem bekannten Bestand
  // abgeleitet (gleiche Regeln wie beim Import). Der Host muss dann nur noch
  // bei wirklich unbekannten Künstlern selbst entscheiden.
  let ensembleIndex = null;
  let ensembleIndexPromise = null;
  const loadEnsembleIndex = () => {
    if (!ensembleIndexPromise) {
      ensembleIndexPromise = buildArtistEnsembleIndex()
        .then((index) => {
          ensembleIndex = index;
          return index;
        })
        .catch(() => {
          // Beim nächsten Ziehen erneut versuchen; ohne Index fragt der
          // Server wie bisher den Host.
          ensembleIndexPromise = null;
          return null;
        });
    }
    return ensembleIndexPromise;
  };

  // drawNewCard setzt die Karte und schickt `host:bingoStartRound` im selben
  // Durchlauf ab. Ein synchroner Watcher ergänzt den Wert dazwischen, also
  // bevor die Songdaten das Gerät verlassen.
  watch(
    () => currentCard?.value,
    (card) => {
      if (!card || gameMode?.value !== "bingo") return;
      if (!multiplayerIsHost.value || !ensembleIndex) return;
      if (String(card.ensemble || "").trim()) return;
      const vermutet = guessEnsemble(card.artist, ensembleIndex, card.title);
      if (vermutet) card.ensemble = vermutet;
    },
    { flush: "sync" },
  );

  const hostDrawBingoCard = async () => {
    if (!multiplayerIsHost.value) return;
    if (round.value && round.value.phase !== "idle") return;
    if (startPending) return;
    startPending = true;
    startPendingTimer = setTimeout(clearStartPending, START_PENDING_TIMEOUT_MS);
    // Index vorher laden (einmal pro Spiel), damit er beim Setzen der Karte
    // schon bereitliegt.
    await loadEnsembleIndex();
    // Vor dem Ziehen: Team-Antwort-Buffer leeren. Ein Song-Puffer aus einem
    // verworfenen Start ist in 'idle' veraltet und wird ebenfalls geleert,
    // damit unten erkennbar ist, ob wirklich ein Start abging.
    bingoTeamAnswer.value = "";
    bingoPendingSongUrl.value = null;
    bingoPendingCardData.value = null;
    try {
      // useSongManager.drawNewCard erkennt bingo-Modus und emittiert
      // stattdessen `host:bingoStartRound` + puffert Song-URL/Card-Data.
      await drawNewCard();
    } finally {
      // Kein Puffer gesetzt: Ziehen ist gescheitert (keine Songs, Ladefehler),
      // es ist also kein Start unterwegs.
      if (!bingoPendingSongUrl.value) clearStartPending();
    }
  };

  const hostOpenAnsweringPhase = () => {
    if (!multiplayerIsHost.value) return;
    // Der Puffer liegt nur bei dem Host, der die Karte gezogen hat. Wurde
    // jemand mitten in der Kategorie-Auslosung Host, nimmt er den Song-Link
    // der Runde aus dem roomState (die Songdaten bleiben beim Server).
    const songUrl =
      bingoPendingSongUrl.value ||
      (round.value?.phase === "reveal" ? round.value?.songLink : null);
    if (!songUrl) return;
    const cardData = bingoPendingCardData.value;
    socketEmit("host:bingoOpenAnswering", {
      songUrl,
      cardData,
    });
    // Host-only-Modus: Server broadcastet `cardDrawn` ohne Ready-Flow,
    // öffnet aber keine Popups. Der Host öffnet den Song hier lokal.
    // All-clients-Modus: Popup wird pro Client via Ready-Flow geöffnet.
    // Der Aufruf kommt aus dem Timer der Animation, also ohne Klick: blockiert
    // der Browser, bietet der Kopf „Jetzt abspielen“ an.
    if (multiplayerAudioMode?.value !== "all-clients") {
      openSongOrPrompt(songUrl);
    }
    // Buffer leeren – der Song ist raus.
    bingoPendingSongUrl.value = null;
    bingoPendingCardData.value = null;
  };

  const hostResolveRound = () => {
    if (!multiplayerIsHost.value) return;
    socketEmit("host:bingoResolveRound", {});
  };

  const hostClassifySoloGroup = (classification) => {
    if (!multiplayerIsHost.value) return;
    if (classification !== "solo" && classification !== "group") return;
    socketEmit("host:bingoClassifySoloGroup", { classification });
  };

  const hostSkipRound = () => {
    if (!multiplayerIsHost.value) return;
    cancelRevealAnimation();
    // Song-Ready-Flow lokal zurücksetzen.
    pendingSongUrl.value = null;
    songReadyCount.value = 0;
    songReadyTotal.value = 0;
    songReadyConfirmed.value = false;
    bingoPendingSongUrl.value = null;
    bingoPendingCardData.value = null;
    socketEmit("host:bingoSkipRound", {});
  };

  const hostNextRound = () => {
    if (!multiplayerIsHost.value) return;
    bingoTeamAnswer.value = "";
    socketEmit("host:bingoNextRound", {});
  };

  const hostSetTimerMode = (timerMode) => {
    if (!multiplayerIsHost.value) return;
    if (timerMode !== "timer" && timerMode !== "wait-all") return;
    socketEmit("host:bingoSetTimerMode", { timerMode });
  };

  // Host-Werkzeug: alle Kreuze zurücksetzen (gespielte Songs/Karten bleiben).
  const hostResetMarks = () => {
    if (!multiplayerIsHost.value) return;
    socketEmit("host:bingoResetMarks", {});
  };

  // Host-Werkzeug: einzelnes Kreuz eines Teams setzen/entfernen (Korrektur).
  const hostSetCell = (slotId, cellIndex, marked) => {
    if (!multiplayerIsHost.value) return;
    socketEmit("host:bingoSetCell", { slotId, cellIndex, marked: !!marked });
  };

  // ── Team-Aktionen (jeder Slot-Angehörige darf agieren) ──────────────

  // Live-Sync des Antwort-Feldes: pro Änderung ein Emit (debounced), damit
  // das Team-eigene Feld synchron bleibt. Server persistiert die letzte
  // Version pro Slot.
  let answerDebounce = null;
  let lastLocalAnswerAt = 0;
  const submitTeamAnswer = (value) => {
    if (!round.value || round.value.phase !== "answering") return;
    lastLocalAnswerAt = Date.now();
    if (answerDebounce) clearTimeout(answerDebounce);
    answerDebounce = setTimeout(() => {
      answerDebounce = null;
      socketEmit("team:bingoAnswer", { value: String(value ?? "") });
    }, 250);
  };

  // Sync von Team-Mitgliedern: wenn das Antwort-Feld des eigenen Teams
  // vom Server einen anderen Wert liefert und wir nicht gerade selbst
  // getippt haben (>500ms Ruhe), ins lokale Feld übernehmen.
  watch(
    () => {
      const sid = mySlotId.value;
      if (sid === null) return null;
      return round.value?.teamAnswers?.[sid];
    },
    (serverVal) => {
      if (serverVal === null || serverVal === undefined) return;
      if (Date.now() - lastLocalAnswerAt < 500) return;
      if (bingoTeamAnswer.value === serverVal) return;
      bingoTeamAnswer.value = serverVal;
    },
  );

  // Abgeben: aktuelle Antwort gleich mitschicken und einen noch offenen
  // Live-Sync verwerfen, sonst könnte er nach der Abgabe ankommen.
  const teamConfirmAnswer = () => {
    if (!round.value || round.value.phase !== "answering") return;
    const value = String(bingoTeamAnswer.value ?? "");
    if (value.trim() === "") return;
    if (answerDebounce) {
      clearTimeout(answerDebounce);
      answerDebounce = null;
    }
    socketEmit("team:bingoConfirmAnswer", { confirmed: true, value });
  };

  // Abgabe zurücknehmen, um die Antwort noch zu ändern.
  const teamReopenAnswer = () => {
    if (!round.value || round.value.phase !== "answering") return;
    socketEmit("team:bingoConfirmAnswer", { confirmed: false });
  };

  const teamMarkCell = (cellIndex) => {
    if (!iAmCorrectAndNeedsMark.value) return;
    socketEmit("team:bingoMarkCell", { cellIndex });
  };

  const teamUseBonus = (targetSlotId, cellIndex) => {
    socketEmit("team:bingoUseBonus", { targetSlotId, cellIndex });
    showBingoBonusDialog.value = false;
    bingoBonusTargetSlotId.value = null;
    bingoBonusCellIndex.value = null;
  };

  const teamSkipBonus = () => {
    socketEmit("team:bingoUseBonus", {
      targetSlotId: null,
      cellIndex: null,
    });
    showBingoBonusDialog.value = false;
    bingoBonusTargetSlotId.value = null;
    bingoBonusCellIndex.value = null;
  };

  // ── Watcher: Phasen-Wechsel ─────────────────────────────────────────

  // Reveal-Animation starten, wenn Runde in Phase 'reveal' wechselt.
  watch(
    () => round.value?.phase,
    (phase, prev) => {
      // Server hat den Start angenommen: Sperre gegen Doppelstart lösen.
      if (phase && phase !== "idle") clearStartPending();
      if (phase === "reveal" && prev !== "reveal") {
        // Antwort-Feld leeren, wenn eine neue Runde beginnt.
        bingoTeamAnswer.value = "";
        startRevealAnimation();
      }
      // Sobald die Antwortphase / Auflösung startet, Reveal-Animation
      // hart abbrechen (Fallback für Reconnects mitten in einer Runde).
      if (
        phase &&
        phase !== "reveal" &&
        bingoRevealAnimating.value
      ) {
        cancelRevealAnimation();
      }
      // Wenn wir die Antwortphase erreichen und der Host das Popup noch
      // im Buffer hat (z. B. Klick auf „Runde starten" wurde direkt vom
      // Reveal-Timer aufgelöst), sicherstellen dass der Song offen ist.
      if (
        phase === "answering" &&
        multiplayerIsHost.value &&
        bingoPendingSongUrl.value
      ) {
        // Buffer noch da → sofort öffnen (falls Timer-Race)
        hostOpenAnsweringPhase();
      }
      // Bonus-Phase: eigenes Team hat Bonus → Dialog öffnen.
      if (phase === "bonus" && iAmInBonusPending.value) {
        bingoBonusTargetSlotId.value = null;
        bingoBonusCellIndex.value = null;
        showBingoBonusDialog.value = true;
      }
      // Bonus vorbei → Dialog schließen.
      if (phase && phase !== "bonus" && showBingoBonusDialog.value) {
        showBingoBonusDialog.value = false;
      }
    },
  );

  // Bonus des eigenen Teams erledigt (ein Teammitglied hat ihn eingesetzt
  // oder verworfen), die Phase bleibt aber „bonus“, weil andere Teams noch
  // entscheiden: Dialog bei den übrigen Mitgliedern schließen.
  watch(iAmInBonusPending, (offen, warOffen) => {
    if (warOffen && !offen && showBingoBonusDialog.value) {
      showBingoBonusDialog.value = false;
      bingoBonusTargetSlotId.value = null;
      bingoBonusCellIndex.value = null;
    }
  });

  // Auto-Resolve im Timer-Modus (Host): wenn Deadline abläuft, Runde
  // auflösen. Nur der Host emittiert, damit der Server nur einmal
  // aufgerufen wird.
  let timerInterval = null;
  const startAutoResolveTimer = () => {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      if (!multiplayerIsHost.value) return;
      const r = round.value;
      if (!r || r.phase !== "answering") return;
      if (!r.deadlineTimestamp) return;
      if (Date.now() >= r.deadlineTimestamp) {
        clearInterval(timerInterval);
        timerInterval = null;
        socketEmit("host:bingoResolveRound", {});
      }
    }, 500);
  };

  // Auch beim Host-Werden: Lief die Deadline schon, als der alte Host ging,
  // ändert sie sich nicht mehr, der Timer muss trotzdem starten.
  watch(
    () => [round.value?.deadlineTimestamp, multiplayerIsHost.value],
    ([dl, isHost]) => {
      if (dl && isHost) startAutoResolveTimer();
    },
    { immediate: true },
  );

  // Host-Wechsel mitten in der Kategorie-Auslosung: Ist die Animation hier
  // schon durch, hat sie die Antwortphase nicht geöffnet (wir waren noch
  // Gast). Das holt der neue Host nach. Läuft sie noch, öffnet ihr Ende.
  watch(multiplayerIsHost, (isHost, wasHost) => {
    if (!isHost || wasHost) return;
    if (round.value?.phase === "reveal" && !bingoRevealAnimating.value) {
      hostOpenAnsweringPhase();
    }
  });

  // Cleanup
  onBeforeUnmount(() => {
    cancelRevealAnimation();
    if (answerDebounce) clearTimeout(answerDebounce);
    if (timerInterval) clearInterval(timerInterval);
    stopCountdownTicker();
    clearStartPending();
  });

  // Bingo-Modus wechseln → wenn wir auf 'bingo' bleiben, ist alles OK.
  // Wenn wir keinen Bingo-Modus haben, macht das Composable nichts.
  const isBingo = computed(() => gameMode?.value === "bingo");

  return {
    isBingo,
    round,
    roundPhase,
    winners,
    orderedCategories,
    orderedSlotIds,
    mySlotId,
    iAmInBonusPending,
    iAmCorrectAndNeedsMark,
    myAnswerConfirmed,
    activeCategoryColor,
    secondsRemaining,
    // Host
    hostDrawBingoCard,
    hostOpenAnsweringPhase,
    hostResolveRound,
    hostClassifySoloGroup,
    hostSkipRound,
    hostNextRound,
    hostSetTimerMode,
    hostResetMarks,
    hostSetCell,
    // Team
    submitTeamAnswer,
    teamConfirmAnswer,
    teamReopenAnswer,
    teamMarkCell,
    teamUseBonus,
    teamSkipBonus,
    // Reveal-Animation
    startRevealAnimation,
    cancelRevealAnimation,
  };
}
