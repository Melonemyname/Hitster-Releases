import { computed, watch, onBeforeUnmount } from "vue";
import { emit as socketEmit } from "../utils/socketService";
import { openSongTab } from "../utils/songTabManager";
import { BINGO_CATEGORIES } from "./useBingo";

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

  // Kategorie-Farbe der aktuellen Runde (für pickableColor der eigenen Karte).
  const activeCategoryColor = computed(
    () => round.value?.category?.color || null,
  );

  // Countdown in Sekunden (nur im Timer-Modus).
  const secondsRemaining = computed(() => {
    const r = round.value;
    if (!r || r.phase !== "answering") return null;
    if (!r.deadlineTimestamp) return null;
    return Math.max(0, Math.ceil((r.deadlineTimestamp - Date.now()) / 1000));
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

  const hostDrawBingoCard = async () => {
    if (!multiplayerIsHost.value) return;
    if (round.value && round.value.phase !== "idle") return;
    // Vor dem Ziehen: Team-Antwort-Buffer leeren.
    bingoTeamAnswer.value = "";
    // useSongManager.drawNewCard erkennt bingo-Modus und emittiert
    // stattdessen `host:bingoStartRound` + puffert Song-URL/Card-Data.
    await drawNewCard();
  };

  const hostOpenAnsweringPhase = () => {
    if (!multiplayerIsHost.value) return;
    if (!bingoPendingSongUrl.value) return;
    const songUrl = bingoPendingSongUrl.value;
    const cardData = bingoPendingCardData.value;
    socketEmit("host:bingoOpenAnswering", {
      songUrl,
      cardData,
    });
    // Host-only-Modus: Server broadcastet `cardDrawn` ohne Ready-Flow,
    // öffnet aber keine Popups. Der Host öffnet den Song hier lokal.
    // All-clients-Modus: Popup wird pro Client via Ready-Flow geöffnet.
    if (multiplayerAudioMode?.value !== "all-clients") {
      openSongTab(songUrl);
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

  watch(
    () => round.value?.deadlineTimestamp,
    (dl) => {
      if (dl && multiplayerIsHost.value) startAutoResolveTimer();
    },
    { immediate: true },
  );

  // Cleanup
  onBeforeUnmount(() => {
    cancelRevealAnimation();
    if (answerDebounce) clearTimeout(answerDebounce);
    if (timerInterval) clearInterval(timerInterval);
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
    teamMarkCell,
    teamUseBonus,
    teamSkipBonus,
    // Reveal-Animation
    startRevealAnimation,
    cancelRevealAnimation,
  };
}
