import { Notify } from "quasar";
import { validateYearGuess } from "../utils/gameConstants";

/**
 * Composable für Rate-/Platzierungs-Logik, Einwände und Text-Matching.
 *
 * @param {object} state - Alles aus useGameState (Refs + Funktionen)
 * @param {object} songManager - { loadAnswerData } aus useSongManager
 */
export function useGuessEngine(state, { loadAnswerData }) {
  const {
    // Refs
    guessedTitle,
    guessedArtist,
    guessedYear,
    guessedMovie,
    guessResults,
    currentCard,
    showGuessDialog,
    showFeedback,
    feedbackCorrect,
    feedbackMessage,
    playerHasGuessed,
    activeGuessPlayerIndex,
    currentPlayerIndex,
    playerTimelines,
    pendingPlacement,
    pendingPlacementOriginal,
    pendingPlacementResult,
    pendingGuessPoints,
    pendingGuessObjectionReward,
    pendingObjectionPlacement,
    showObjectionDialog,
    objectionAttempts,
    currentObjectionPlayerIndex,
    isObjectionPhase,
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
    usedCards,
    turnCounts,
    playerIndexAfterResolution,
    playerCount,
    // Funktionen aus useGameState
    getRandomCardColor,
    buildCardFromCurrent,
    getChronologicalInsertIndex,
    calculateGuessPoints,
    calculateGuessObjectionReward,
    addPoints,
    finalizeRoundIfTurnCountsAreEqual,
  } = state;

  // ── Timer für den neuen Einwand-Ablauf (Etappe 1) ───────────────────
  const OBJECTION_OPT_IN_SECONDS = 10;
  const OBJECTION_PLACEMENT_SECONDS = 30;
  let optInInterval = null;
  let placementInterval = null;
  let raffleInterval = null;
  const clearObjectionTimers = () => {
    if (optInInterval) clearInterval(optInInterval);
    if (placementInterval) clearInterval(placementInterval);
    if (raffleInterval) clearTimeout(raffleInterval);
    optInInterval = null;
    placementInterval = null;
    raffleInterval = null;
  };

  // ── Text-Matching ───────────────────────────────────────────────────

  const normalizeGuessText = (value) => {
    return (value || "")
      .toString()
      .toLowerCase()
      .replace(/ß/g, "ss")
      .replace(/æ/g, "ae")
      .replace(/œ/g, "oe")
      .replace(/ø/g, "o")
      .replace(/d/g, "d")
      .replace(/l/g, "l")
      .replace(/þ/g, "th")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");
  };

  const stripFeaturingFromTitle = (value) => {
    return (value || "")
      .toString()
      .replace(/\s*[([–—-]?\s*\b(feat\.?|ft\.?|featuring)\b.*$/i, "")
      .trim();
  };

  const stripVersionDescriptors = (value) => {
    // Ganze Klammern-Zusätze im Titel werden für den Vergleich entfernt.
    // Beispiele die dadurch matchen sollen:
    //   „Main Titel Theme (From ...)" ≡ „Main Titel Theme"
    //   „Song (Remastered 2011)"       ≡ „Song"
    //   „Track [Radio Edit]"            ≡ „Track"
    //   „Song - Remastered"             ≡ „Song"
    // Zusätzlich Trenn-Suffixe hinter Bindestrich (Remaster/Reimagined).
    return (
      (value || "")
        .toString()
        // 1) Runde und eckige Klammern samt Inhalt weg.
        .replace(/\s*\([^)]*\)/g, "")
        .replace(/\s*\[[^\]]*\]/g, "")
        // 2) Fassungs-Hinweis nach " - " (Spotify-Konvention):
        //    „Song - 2011 Remaster", „Shine - Acoustic", „Theme - From ...".
        //    Die Leerzeichen um den Bindestrich sind Pflicht, sonst wuerde
        //    ein Titel wie „Played-A-Live" zu „Played-A" verstuemmelt.
        .replace(/\s+[-–—]\s+.*\b(remaster(?:ed)?|reimagin(?:ed)?|re-?recorded|live|acoustic|unplugged|instrumental|demo|mono|stereo|radio\s+edit|single\s+version|album\s+version|extended\s+(?:version|mix)|edit|mix|from\b.*)\b.*$/gi, "")
        // 3) Suffix ohne Klammern („Song Remastered 2011").
        .replace(/\s+\b(remaster(?:ed)?|reimagin(?:ed)?)\b.*$/gi, "")
        .trim()
    );
  };

  const splitArtistCandidates = (value) => {
    return (value || "")
      .toString()
      // Semikolon ist in den Song-Daten der häufigste Trenner zwischen
      // mehreren Künstlern („Luis Fonsi;Demi Lovato"). Ohne ihn galt der
      // Name eines einzelnen Beteiligten als falsche Antwort.
      .split(/,|;|&| feat\.?| ft\.?| featuring | x | und /i)
      .map((part) => part.trim())
      .filter(Boolean);
  };

  const levenshteinDistance = (a, b) => {
    const rows = a.length + 1;
    const cols = b.length + 1;
    const dp = Array.from({ length: rows }, () => Array(cols).fill(0));

    for (let i = 0; i < rows; i++) dp[i][0] = i;
    for (let j = 0; j < cols; j++) dp[0][j] = j;

    for (let i = 1; i < rows; i++) {
      for (let j = 1; j < cols; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + cost,
        );
      }
    }

    return dp[a.length][b.length];
  };

  const fuzzyTextMatch = (input, expected) => {
    const normalizedInput = normalizeGuessText(input);
    const normalizedExpected = normalizeGuessText(expected);
    if (!normalizedInput || !normalizedExpected) return false;
    if (normalizedInput === normalizedExpected) return true;

    const maxLen = Math.max(
      normalizedInput.length,
      normalizedExpected.length,
    );
    const allowedTypos = maxLen <= 4 ? 1 : maxLen <= 8 ? 2 : 3;
    return (
      levenshteinDistance(normalizedInput, normalizedExpected) <= allowedTypos
    );
  };

  // Wort-erhaltende Normalisierung (Leerzeichen bleiben) für den Film-Abgleich –
  // nötig, damit die Franchise-Toleranz an Wortgrenzen greift.
  const movieWordNorm = (value) =>
    (value || "")
      .toString()
      .toLowerCase()
      .replace(/ß/g, "ss")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

  // Film/Serie-Abgleich: akzeptiert mehrere hinterlegte Titel (per "|" getrennt,
  // z. B. Englisch|Deutsch) sowie Franchise-/Fortsetzungs-Toleranz – die Eingabe
  // darf ein Wort-Präfix des vollen Titels sein (und umgekehrt), z. B. reicht
  // "Star Wars" für "Star Wars: A New Hope".
  const movieMatches = (input, expected) => {
    const gWord = movieWordNorm(input);
    if (gWord.length < 2) return false;
    const aliases = String(expected || "")
      .split("|")
      .map((a) => a.trim())
      .filter(Boolean);
    return aliases.some((alias) => {
      if (fuzzyTextMatch(input, alias)) return true;
      const aWord = movieWordNorm(alias);
      if (!aWord) return false;
      if (aWord === gWord) return true;
      if (aWord.startsWith(gWord + " ")) return true;
      if (gWord.startsWith(aWord + " ")) return true;
      return false;
    });
  };

  const buildBonusResult = (correctData) => {
    const titleInput = (guessedTitle.value || "").trim();
    const artistInput = (guessedArtist.value || "").trim();
    const yearInput = guessedYear.value;

    // Reihenfolge ist wichtig: ERST die Klammern-Zusätze, DANN das Featuring.
    // Andersherum schneidet `stripFeaturingFromTitle` bei einem Titel wie
    // „Sucker for Pain (with … feat. X Ambassadors)" ab dem „feat." alles ab,
    // samt schließender Klammer. `stripVersionDescriptors` findet danach kein
    // vollständiges Klammerpaar mehr, und der halbe Zusatz bleibt stehen –
    // der Titel galt dann nur mit mitgetippter Gästeliste als richtig.
    const expectedTitle = stripFeaturingFromTitle(
      stripVersionDescriptors(correctData.title || ""),
    );
    const guessedTitleBase = stripFeaturingFromTitle(
      stripVersionDescriptors(titleInput),
    );
    const titleCorrect =
      titleInput.length > 0
        ? fuzzyTextMatch(guessedTitleBase, expectedTitle)
        : null;

    const expectedArtists = splitArtistCandidates(correctData.artist || "");
    const guessedArtists = splitArtistCandidates(artistInput);
    const artistCorrect =
      artistInput.length > 0
        ? guessedArtists.some((guessed) =>
            expectedArtists.some((expected) =>
              fuzzyTextMatch(guessed, expected),
            ),
          )
        : null;
    const yearDifference =
      yearInput !== null && yearInput !== ""
        ? Math.abs(Number(yearInput) - Number(correctData.year || 0))
        : null;
    const yearAccurate =
      yearDifference !== null
        ? validateYearGuess(Number(yearInput), Number(correctData.year || 0))
        : null;

    // Film/Serie (nur relevant im Film-Modus; null, wenn nichts eingegeben oder
    // der Song keinen hinterlegten Film hat).
    const movieInput = (guessedMovie?.value || "").trim();
    const expectedMovie = (correctData.movie || "").trim();
    const movieCorrect =
      movieInput.length > 0 && expectedMovie.length > 0
        ? movieMatches(movieInput, expectedMovie)
        : null;

    return {
      titleCorrect,
      artistCorrect,
      yearDifference,
      yearAccurate,
      movieCorrect,
    };
  };

  const clearGuessInput = () => {
    guessedTitle.value = "";
    guessedArtist.value = "";
    guessedYear.value = null;
    guessedMovie.value = "";
  };

  // ── Platzierung bewerten ────────────────────────────────────────────

  const evaluatePlacement = (
    timeline,
    position,
    cardYear,
    hasPlaceholderAtPosition,
  ) => {
    const left = position > 0 ? timeline[position - 1] : null;
    const rightIndex = hasPlaceholderAtPosition ? position + 1 : position;
    const right = rightIndex < timeline.length ? timeline[rightIndex] : null;

    if (left && left.year > cardYear) return false;
    if (right && right.year < cardYear) return false;
    return true;
  };

  const evaluateObjectionPlacement = (targetPosition, cardYear) => {
    const original = pendingPlacementOriginal.value;
    if (!original) return false;

    const originalTimeline =
      playerTimelines.value[original.playerIndex].cards;
    const timelineWithoutPlaceholder = [...originalTimeline];
    timelineWithoutPlaceholder.splice(original.position, 1);

    const normalizedPosition =
      targetPosition > original.position
        ? targetPosition - 1
        : targetPosition;

    return evaluatePlacement(
      timelineWithoutPlaceholder,
      normalizedPosition,
      cardYear,
      false,
    );
  };

  // ── Dialog-Helfer ───────────────────────────────────────────────────

  const getGuessDialogSubtitle = () => {
    const idx = activeGuessPlayerIndex.value ?? currentPlayerIndex.value;
    const player = playerTimelines.value[idx];
    return player ? player.name : `Spieler ${idx + 1}`;
  };

  const hasPlayerSubmittedObjection = (playerIdx) => {
    return objectionAttempts.value.some(
      (attempt) => attempt.playerIndex === playerIdx,
    );
  };

  const getNextEligibleObjectionPlayer = (afterIndex = -1) => {
    if (!pendingPlacement.value) return null;
    const placer = pendingPlacement.value.playerIndex;
    const totalPlayers = playerTimelines.value.length;
    if (totalPlayers === 0) return null;

    for (let offset = 1; offset <= totalPlayers; offset++) {
      const idx = (afterIndex + offset + totalPlayers) % totalPlayers;
      if (idx === placer) continue;
      if (playerTimelines.value[idx].objections <= 0) continue;
      if (hasPlayerSubmittedObjection(idx)) continue;
      return idx;
    }

    return null;
  };

  const canPlayerStartObjection = (playerIdx) => {
    if (!pendingPlacement.value) return false;
    if (
      currentObjectionPlayerIndex.value !== null &&
      currentObjectionPlayerIndex.value !== playerIdx
    )
      return false;
    if (playerIdx === pendingPlacement.value.playerIndex) return false;
    return (
      playerTimelines.value[playerIdx].objections > 0 &&
      !hasPlayerSubmittedObjection(playerIdx)
    );
  };

  // ── Karte platzieren / aufdecken ────────────────────────────────────

  const revealCardAt = (playerIndex, position) => {
    const timeline = playerTimelines.value[playerIndex].cards;
    if (!timeline || !timeline[position]) return;

    const resolvedCard = buildCardFromCurrent();
    if (!resolvedCard) return;

    const existing = timeline[position];
    const bgColor =
      existing && existing.bgColor ? existing.bgColor : getRandomCardColor();
    timeline[position] = { ...resolvedCard, bgColor };
  };

  const removePlaceholderAt = (playerIndex, position) => {
    const timeline = playerTimelines.value[playerIndex].cards;
    if (!timeline || !timeline[position]) return;
    timeline.splice(position, 1);
    usedCards.value.pop();
  };

  const insertResolvedCardForPlayer = (playerIndex) => {
    const timeline = playerTimelines.value[playerIndex].cards;
    const resolvedCard = buildCardFromCurrent();
    if (!timeline || !resolvedCard) return;
    const insertIndex = getChronologicalInsertIndex(
      timeline,
      resolvedCard.year,
    );
    timeline.splice(insertIndex, 0, resolvedCard);
  };

  const placeCard = (playerIndex, position) => {
    if (!currentCard.value || showFeedback.value) return;

    if (!isObjectionPhase.value && playerIndex !== currentPlayerIndex.value)
      return;
    if (isObjectionPhase.value && playerIndex !== currentPlayerIndex.value)
      return;

    const timeline = playerTimelines.value[playerIndex].cards;

    if (isObjectionPhase.value) {
      // Während des Opt-in-Fensters wird noch nicht platziert.
      if (objectionOptInActive.value) return;
      if (currentObjectionPlayerIndex.value === null) return;

      const objectorIndex = currentObjectionPlayerIndex.value;
      const objector = playerTimelines.value[objectorIndex];
      const isPlacementCorrect = evaluateObjectionPlacement(
        position,
        currentCard.value.year,
      );

      objectionAttempts.value.push({
        playerIndex: objectorIndex,
        playerName: objector.name,
        targetPosition: position,
        isPlacementCorrect,
        bonus: null,
      });
      // Einwand kostet einen Einwand-Token (korrekte Nicht-Gewinner bekommen ihn zurück).
      objector.objections = Math.max(0, objector.objections - 1);
      activeGuessPlayerIndex.value = null;
      playerHasGuessed.value = false;
      clearGuessInput();

      Notify.create({
        type: "info",
        message: `Einwand von ${objector.name} wurde erfasst.`,
        timeout: 1800,
      });

      startNextObjectorPlacement(objectionQueuePos.value + 1);
      return;
    }

    const placeholder = { placeholder: true, bgColor: getRandomCardColor() };
    timeline.splice(position, 0, placeholder);
    usedCards.value.push(currentCard.value);

    pendingPlacementOriginal.value = {
      playerIndex,
      position,
      playerName: playerTimelines.value[playerIndex].name,
    };
    pendingPlacement.value = { ...pendingPlacementOriginal.value };

    playerHasGuessed.value = true;
    activeGuessPlayerIndex.value = playerIndex;
    clearGuessInput();
    showGuessDialog.value = true;
  };

  const cancelGuessAndReplace = () => {
    if (!pendingPlacement.value) return;
    const { playerIndex, position } = pendingPlacement.value;
    removePlaceholderAt(playerIndex, position);
    pendingPlacement.value = null;
    pendingPlacementOriginal.value = null;
    pendingPlacementResult.value = null;
    pendingGuessPoints.value = 0;
    pendingGuessObjectionReward.value = 0;
    playerHasGuessed.value = false;
    guessedTitle.value = "";
    guessedArtist.value = "";
    guessedYear.value = null;
    guessedMovie.value = "";
    guessResults.value = null;
    showGuessDialog.value = false;
    Notify.create({
      type: "info",
      message: "Platzierung abgebrochen. Karte erneut einordnen.",
      timeout: 2000,
    });
  };

  // ── Raten / Einwand ─────────────────────────────────────────────────

  const submitGuess = async () => {
    try {
      let correctData = currentCard.value;
      if (!correctData || !correctData.year) {
        correctData = await loadAnswerData();
      }
      if (!correctData || !correctData.year) {
        Notify.create({
          type: "warning",
          message:
            "Antwortdaten nicht verfügbar! Stelle sicher, dass die CSV-Datei geladen werden kann.",
          timeout: 5000,
        });
        return;
      }

      if (
        isObjectionPhase.value &&
        currentObjectionPlayerIndex.value !== null
      ) {
        Notify.create({
          type: "info",
          message:
            "Einwand wird direkt über + erfasst. Kein zusätzliches Rateformular nötig.",
          timeout: 2500,
        });
        showGuessDialog.value = false;
        return;
      }

      const pending = pendingPlacement.value;
      if (!pending) {
        Notify.create({
          type: "negative",
          message: "Keine Platzierungsdaten vorhanden.",
          timeout: 2000,
        });
        return;
      }

      const timeline = playerTimelines.value[pending.playerIndex].cards;
      const isPlacementCorrect = evaluatePlacement(
        timeline,
        pending.position,
        correctData.year,
        true,
      );
      const bonus = buildBonusResult(correctData);
      guessResults.value = bonus;
      pendingGuessPoints.value = calculateGuessPoints(
        bonus,
        correctData.year,
      );
      pendingGuessObjectionReward.value =
        calculateGuessObjectionReward(bonus, correctData.year);

      pendingPlacementResult.value = {
        isPlacementCorrect,
        cardYear: correctData.year,
        cardTitle: correctData.title || "Unbekannt",
        cardArtist: correctData.artist || "Unbekannt",
        playerName: playerTimelines.value[pending.playerIndex].name,
      };

      feedbackCorrect.value = isPlacementCorrect;
      feedbackMessage.value = isPlacementCorrect
        ? `Platzierung von ${pendingPlacementResult.value.playerName} ist korrekt.`
        : `Platzierung von ${pendingPlacementResult.value.playerName} ist falsch.`;

      showGuessDialog.value = false;
      activeGuessPlayerIndex.value = null;

      const opened = checkForObjections();
      if (!opened) {
        handleNoObjection();
      }
    } catch (error) {
      Notify.create({
        type: "negative",
        message: `Fehler beim Prüfen: ${error.message}`,
        timeout: 3000,
      });
    }
  };

  const checkForObjections = () => {
    if (!pendingPlacement.value) return false;

    // Im Battle-Modus sind Einwände deaktiviert – jeder Spieler hat einen
    // eigenen Song-Pool, ein Einwand von jemandem mit einer anderen
    // Edition ist inhaltlich nicht sinnvoll.
    if (state.gameMode?.value === "battle") return false;

    const placer = pendingPlacement.value.playerIndex;
    const hasEligibleObjectors = playerTimelines.value.some(
      (player, index) => index !== placer && player.objections > 0,
    );
    if (!hasEligibleObjectors) return false;

    // Sauberer Start: alle Einwand-Felder zurücksetzen.
    clearObjectionTimers();
    objectionAttempts.value = [];
    objectionOptIns.value = [];
    objectionQueue.value = [];
    objectionQueuePos.value = 0;
    objectionRaffleActive.value = false;
    objectionRaffleNames.value = [];
    objectionRaffleWinner.value = null;
    correctObjectorNames.value = [];
    objectionWinnerName.value = "";
    currentObjectionPlayerIndex.value = null;
    pendingObjectionPlacement.value = null;
    playerHasGuessed.value = false;

    // Phase A: 10-Sekunden-Opt-in-Fenster (alle außer Platzierer dürfen sich melden).
    isObjectionPhase.value = true;
    objectionOptInActive.value = true;
    showObjectionDialog.value = true;
    objectionOptInCountdown.value = OBJECTION_OPT_IN_SECONDS;
    optInInterval = setInterval(() => {
      objectionOptInCountdown.value -= 1;
      if (objectionOptInCountdown.value <= 0) closeOptInWindow();
    }, 1000);
    return true;
  };

  // Spieler meldet sich (oder wieder ab) für einen Einwand an.
  const toggleObjectionOptIn = (playerIdx) => {
    if (!objectionOptInActive.value || !pendingPlacement.value) return;
    if (playerIdx === pendingPlacement.value.playerIndex) return;
    if (playerTimelines.value[playerIdx].objections <= 0) return;
    // Neues Array (statt in-place splice/push), damit der Multiplayer-
    // Sync-Watcher die Änderung erkennt und an die Gäste spiegelt.
    const arr = objectionOptIns.value;
    objectionOptIns.value = arr.includes(playerIdx)
      ? arr.filter((i) => i !== playerIdx)
      : [...arr, playerIdx];
  };

  // Opt-in-Fenster schließen -> geordnete Warteschlange bilden, Platzierung starten.
  const closeOptInWindow = () => {
    if (optInInterval) {
      clearInterval(optInInterval);
      optInInterval = null;
    }
    objectionOptInActive.value = false;
    objectionOptInCountdown.value = 0;
    objectionQueue.value = [...objectionOptIns.value].sort((a, b) => a - b);
    objectionQueuePos.value = 0;
    if (objectionQueue.value.length === 0) {
      showObjectionDialog.value = false;
      resolveObjections();
      return;
    }
    startNextObjectorPlacement(0);
  };

  // Nächsten Einwender an die Reihe holen (30-Sek-Timer, Timeout -> überspringen).
  const startNextObjectorPlacement = (pos) => {
    if (placementInterval) {
      clearInterval(placementInterval);
      placementInterval = null;
    }
    if (pos >= objectionQueue.value.length) {
      showObjectionDialog.value = false;
      currentObjectionPlayerIndex.value = null;
      objectionPlacementCountdown.value = 0;
      resolveObjections();
      return;
    }
    objectionQueuePos.value = pos;
    currentObjectionPlayerIndex.value = objectionQueue.value[pos];
    showObjectionDialog.value = false; // Platzierung über die + Slots
    activeGuessPlayerIndex.value = null;
    objectionPlacementCountdown.value = OBJECTION_PLACEMENT_SECONDS;
    Notify.create({
      type: "info",
      message: `${playerTimelines.value[currentObjectionPlayerIndex.value].name}: Wähle deine Position (+) – ${OBJECTION_PLACEMENT_SECONDS}s.`,
      timeout: 2500,
    });
    placementInterval = setInterval(() => {
      objectionPlacementCountdown.value -= 1;
      if (objectionPlacementCountdown.value <= 0) {
        Notify.create({
          type: "warning",
          message: `Zeit abgelaufen – ${playerTimelines.value[currentObjectionPlayerIndex.value].name} übersprungen.`,
          timeout: 2000,
        });
        startNextObjectorPlacement(objectionQueuePos.value + 1);
      }
    }, 1000);
  };

  const beginObjection = (playerIdx) => {
    if (!canPlayerStartObjection(playerIdx)) return;

    currentObjectionPlayerIndex.value = playerIdx;
    activeGuessPlayerIndex.value = playerIdx;
    pendingObjectionPlacement.value = null;
    playerHasGuessed.value = false;
    clearGuessInput();
    showObjectionDialog.value = false;

    Notify.create({
      type: "info",
      message: `${playerTimelines.value[playerIdx].name}: Wähle jetzt eine Position über +.`,
      timeout: 2500,
    });
  };

  // Wertet alle erfassten Einwände aus und löst die Runde auf.
  const resolveObjections = () => {
    clearObjectionTimers();
    const result = pendingPlacementResult.value;
    const pending = pendingPlacementOriginal.value || pendingPlacement.value;
    if (!pending || !result) return;

    const successful = objectionAttempts.value.filter(
      (a) => a.isPlacementCorrect,
    );
    correctObjectorNames.value = successful.map((a) => a.playerName);

    if (result.isPlacementCorrect) {
      // Aktueller Spieler lag richtig -> Einwände wirkungslos.
      finalizeObjectionOutcome({
        type: "placer",
        winnerIndex: pending.playerIndex,
        successful: [],
      });
      return;
    }
    if (successful.length === 0) {
      finalizeObjectionOutcome({ type: "none", winnerIndex: null, successful: [] });
      return;
    }
    if (successful.length === 1) {
      finalizeObjectionOutcome({
        type: "objection",
        winnerIndex: successful[0].playerIndex,
        successful,
      });
      return;
    }
    // Mehrere korrekte Einwände -> animierter Number-Picker.
    startRaffle(successful);
  };

  // Animierter Number-Picker: läuft durch die Namen und wird zum Ende hin
  // langsamer (Ease-out), bevor er exakt auf dem Gewinner landet.
  const startRaffle = (successful) => {
    objectionRaffleActive.value = true;
    objectionRaffleNames.value = successful.map((a) => a.playerName);
    objectionRaffleWinner.value = null;
    objectionRaffleHighlight.value = 0;
    const count = successful.length;
    const winnerPos = Math.floor(Math.random() * count);
    // Genug Schritte, dann so ausrichten, dass der letzte Schritt auf dem
    // Gewinner landet.
    let totalSteps = count * 4 + 6;
    totalSteps += (winnerPos - (totalSteps % count) + count) % count;
    let step = 0;
    const tick = () => {
      objectionRaffleHighlight.value = step % count;
      if (step >= totalSteps) {
        objectionRaffleWinner.value = winnerPos;
        raffleInterval = setTimeout(() => {
          objectionRaffleActive.value = false;
          finalizeObjectionOutcome({
            type: "objection",
            winnerIndex: successful[winnerPos].playerIndex,
            successful,
          });
        }, 1600);
        return;
      }
      step += 1;
      // Ease-out: Verzögerung wächst gegen Ende (schnell -> langsam).
      const progress = step / totalSteps;
      const delay = 55 + Math.round(progress * progress * 340);
      raffleInterval = setTimeout(tick, delay);
    };
    tick();
  };

  const finalizeObjectionOutcome = ({ type, winnerIndex, successful }) => {
    clearObjectionTimers();
    const pending = pendingPlacementOriginal.value || pendingPlacement.value;
    const result = pendingPlacementResult.value;
    if (!pending || !result) return;

    showObjectionDialog.value = false;
    objectionOptInActive.value = false;
    isObjectionPhase.value = false;
    currentObjectionPlayerIndex.value = null;
    activeGuessPlayerIndex.value = null;
    pendingObjectionPlacement.value = null;
    playerHasGuessed.value = false;
    objectionPlacementCountdown.value = 0;
    objectionOptInCountdown.value = 0;

    const applyPendingGuessRewards = (playerIndex) => {
      if (pendingGuessPoints.value > 0) {
        addPoints(playerIndex, pendingGuessPoints.value);
      }
      if (pendingGuessObjectionReward.value > 0) {
        const p = playerTimelines.value[playerIndex];
        if (p) {
          p.objections =
            Number(p.objections || 0) + pendingGuessObjectionReward.value;
        }
      }
    };

    if (type === "placer") {
      revealCardAt(pending.playerIndex, pending.position);
      applyPendingGuessRewards(pending.playerIndex);
      feedbackCorrect.value = true;
      feedbackMessage.value = `${result.playerName} hat korrekt eingeordnet.`;
    } else if (type === "none") {
      removePlaceholderAt(pending.playerIndex, pending.position);
      feedbackCorrect.value = false;
      feedbackMessage.value = `${result.playerName} hat falsch eingeordnet – Karte verfällt.`;
    } else {
      // Einwand-Gewinner
      removePlaceholderAt(pending.playerIndex, pending.position);
      insertResolvedCardForPlayer(winnerIndex);
      applyPendingGuessRewards(pending.playerIndex);
      // Korrekte Einwender, die NICHT gewonnen haben, bekommen ihren Einwand zurück.
      (successful || []).forEach((a) => {
        if (a.playerIndex !== winnerIndex) {
          const p = playerTimelines.value[a.playerIndex];
          if (p) p.objections = Number(p.objections || 0) + 1;
        }
      });
      // Kurzer Satz; die Liste der korrekten Einwände (inkl. Gewinner) steht darunter.
      objectionWinnerName.value = playerTimelines.value[winnerIndex].name;
      feedbackCorrect.value = true;
      feedbackMessage.value = `${result.playerName} hat falsch eingeordnet.`;
    }

    turnCounts.value[pending.playerIndex] =
      Number(turnCounts.value[pending.playerIndex] || 0) + 1;
    finalizeRoundIfTurnCountsAreEqual();

    playerIndexAfterResolution.value =
      (pending.playerIndex + 1) % playerCount.value;
    showFeedback.value = true;

    pendingPlacement.value = null;
    pendingPlacementOriginal.value = null;
    pendingPlacementResult.value = null;
    pendingGuessPoints.value = 0;
    pendingGuessObjectionReward.value = 0;
    objectionAttempts.value = [];
    objectionOptIns.value = [];
    objectionQueue.value = [];
    objectionQueuePos.value = 0;
  };

  // Kein Einwand möglich/vorhanden -> direkt auflösen.
  const handleNoObjection = () => {
    const result = pendingPlacementResult.value;
    const pending = pendingPlacementOriginal.value || pendingPlacement.value;
    if (!pending || !result) return;
    finalizeObjectionOutcome({
      type: result.isPlacementCorrect ? "placer" : "none",
      winnerIndex: pending.playerIndex,
      successful: [],
    });
  };

  // ── Return ──────────────────────────────────────────────────────────

  return {
    // Text-Matching (intern, aber ggf. testbar)
    normalizeGuessText,
    fuzzyTextMatch,
    // Platzierung
    evaluatePlacement,
    evaluateObjectionPlacement,
    // Dialog-Helfer
    getGuessDialogSubtitle,
    hasPlayerSubmittedObjection,
    getNextEligibleObjectionPlayer,
    canPlayerStartObjection,
    // Karten-Ops
    placeCard,
    revealCardAt,
    removePlaceholderAt,
    insertResolvedCardForPlayer,
    cancelGuessAndReplace,
    // Raten / Einwand
    submitGuess,
    checkForObjections,
    beginObjection,
    handleNoObjection,
    clearGuessInput,
    buildBonusResult,
    // Neuer Einwand-Ablauf (Etappe 1)
    toggleObjectionOptIn,
    closeOptInWindow,
    clearObjectionTimers,
  };
}
