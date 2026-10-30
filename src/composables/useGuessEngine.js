import { Notify } from "quasar";
import { validateYearGuess } from "../utils/gameConstants";
import {
  splitVariants,
  yearsOf,
  closestYear,
  normalizeMatchText,
  titleMatchForms,
} from "../utils/songVariants";

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
  // useSongManager entsteht vor diesem Composable und erreicht die Timer
  // deshalb über deps (Skip räumt einen laufenden Einwand ab).
  if (state.deps) state.deps.clearObjectionTimers = clearObjectionTimers;

  // ── Text-Matching ───────────────────────────────────────────────────

  // Normalisierung und Titel-Aufbereitung liegen in songVariants, weil
  // useGameState dieselben Regeln zum Erkennen doppelter Songs braucht.
  const normalizeGuessText = (value) => normalizeMatchText(value);

  // „&", „and" und „und" gelten im Künstlernamen als gleich, damit „Kool and
  // the Gang" für „Kool & The Gang" und „Simon und Garfunkel" für „Simon &
  // Garfunkel" zählen. Nach der Normalisierung steht dann überall „and".
  const unifyArtistConjunctions = (value) =>
    (value || "")
      .toString()
      .replace(/\s*(?:&|\+)\s*/g, " and ")
      .replace(/\bund\b/gi, "and");

  // Mögliche richtige Antworten für ein Künstlerfeld: jede `;`-Variante als
  // Ganzes und zusätzlich jeder einzeln genannte Beteiligte (Komma aus
  // Exportify, Featuring, „ x "). Bewusst NICHT an „&" oder „und" trennen:
  // „Kool" allein ist keine Antwort für „Kool & The Gang".
  const splitArtistCandidates = (value) => {
    const candidates = [];
    for (const variant of splitVariants(value)) {
      candidates.push(variant);
      for (const part of variant.split(
        /,| feat\.?| ft\.?| featuring | x /i,
      )) {
        if (part.trim()) candidates.push(part.trim());
      }
    }
    return [...new Set(candidates.map(unifyArtistConjunctions))];
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
    // Varianten mit `;` (seit 1.0.8, wie bei allen Feldern) oder `|` (alt).
    const aliases = splitVariants(expected);
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

    // Mehrere Titel-Varianten mit `;`: jede zählt als richtig. Zu jeder
    // Variante zählen zwei Formen, ohne Klammerinhalt und mit Klammerinhalt
    // (siehe titleMatchForms), damit „Satisfaction" und „I Can't Get No
    // Satisfaction" beide für „(I Can't Get No) Satisfaction" gelten.
    const expectedTitles = splitVariants(correctData.title).flatMap((t) =>
      titleMatchForms(t),
    );
    const guessedTitleForms = titleMatchForms(titleInput);
    const titleCorrect =
      titleInput.length > 0
        ? guessedTitleForms.some((g) =>
            expectedTitles.some((t) => fuzzyTextMatch(g, t)),
          )
        : null;

    const expectedArtists = splitArtistCandidates(correctData.artist || "");
    // Auch die Eingabe als Ganzes und in Teilen: wer „A feat. B" tippt, hat
    // mit A oder B recht, wer „Earth, Wind & Fire" tippt, mit dem Ganzen.
    const guessedArtists = splitArtistCandidates(artistInput);
    const artistCorrect =
      artistInput.length > 0
        ? guessedArtists.some((guessed) =>
            expectedArtists.some((expected) =>
              fuzzyTextMatch(guessed, expected),
            ),
          )
        : null;
    // Mehrere Jahre: gewertet wird das, das am nächsten am Tipp liegt.
    const targetYear = closestYear(yearsOf(correctData), yearInput);
    const yearDifference =
      yearInput !== null && yearInput !== ""
        ? Math.abs(Number(yearInput) - Number(targetYear || 0))
        : null;
    const yearAccurate =
      yearDifference !== null
        ? validateYearGuess(Number(yearInput), Number(targetYear || 0))
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

  // `playerIndex` ist die Zeitleiste, in die gelegt wird. Auch Einwender legen
  // in die Zeitleiste des Spielers am Zug. `actorIndex` ist, wer handelt: Gast-
  // Aktionen kommen mit dem Slot des Absenders und werden gegen dessen Rolle
  // geprüft. Lokal und am Host-Gerät bleibt er leer, dort steuert die Oberfläche.
  const placeCard = (playerIndex, position, actorIndex = null) => {
    if (!currentCard.value || showFeedback.value) return;

    if (playerIndex !== currentPlayerIndex.value) return;
    if (actorIndex !== null && actorIndex !== undefined) {
      // Im Normalfall legt nur der Spieler am Zug, in der Einwandphase nur
      // der Einwender, der gerade dran ist. Damit zählt auch ein verspäteter
      // Doppeltipp eines Einwenders nicht als Einwand des nächsten.
      const expected = isObjectionPhase.value
        ? currentObjectionPlayerIndex.value
        : currentPlayerIndex.value;
      if (actorIndex !== expected) return;
    }

    const timeline = playerTimelines.value[playerIndex]?.cards;
    if (!timeline) return;
    if (
      !Number.isInteger(position) ||
      position < 0 ||
      position > timeline.length
    )
      return;

    if (isObjectionPhase.value) {
      // Während des Opt-in-Fensters wird noch nicht platziert.
      if (objectionOptInActive.value) return;
      if (currentObjectionPlayerIndex.value === null) return;

      const objectorIndex = currentObjectionPlayerIndex.value;
      const objector = playerTimelines.value[objectorIndex];
      // Einwände prüfen gegen dasselbe Kartenjahr wie der Spieler am Zug.
      const isPlacementCorrect = evaluateObjectionPlacement(
        position,
        currentCard.value.placedYear || currentCard.value.year,
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
    // Neue Platzierung, noch nicht ausgewertet (submitGuess prüft darauf).
    pendingPlacementResult.value = null;

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

  // Läuft gerade eine Auswertung? Zwischen Aufruf und gesetztem
  // `pendingPlacementResult` liegt ggf. ein `await loadAnswerData()`, ein
  // Doppelklick käme sonst in dieser Lücke ein zweites Mal durch.
  let submitGuessRunning = false;

  const submitGuess = async () => {
    if (submitGuessRunning) return;
    submitGuessRunning = true;
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
      // Diese Platzierung wurde schon ausgewertet (z. B. Doppelklick oder
      // doppelt angekommenes `guest:submitGuess` im Einwandfenster). Eine
      // zweite Auswertung würde Bonuspunkte neu vergeben und die Einwände
      // neu starten.
      if (pendingPlacementResult.value) return;

      const timeline = playerTimelines.value[pending.playerIndex].cards;
      // Mehrere Jahre (`;`) sind für Mehrdeutigkeiten gedacht, etwa einen
      // Song auf zwei Alben. Die Karte bekommt das eingegebene Jahr, wenn es
      // eines der hinterlegten ist, sonst das Hauptjahr. Nur gegen dieses
      // Kartenjahr wird die Platzierung geprüft, und damit liegt die Karte
      // danach in der Zeitleiste (buildCardFromCurrent liest placedYear).
      const kartenJahre = yearsOf(correctData);
      const tipp = Number(guessedYear.value);
      const kartenJahr = kartenJahre.includes(tipp)
        ? tipp
        : Number(correctData.year || 0);
      if (currentCard.value) currentCard.value.placedYear = kartenJahr;
      const isPlacementCorrect = evaluatePlacement(
        timeline,
        pending.position,
        kartenJahr,
        true,
      );
      const bonus = buildBonusResult(correctData);
      guessResults.value = bonus;
      // Bei mehreren Jahren zählt für „Jahr exakt" das, das dem Tipp am
      // nächsten liegt.
      const guessYear = closestYear(yearsOf(correctData), guessedYear.value);
      pendingGuessPoints.value = calculateGuessPoints(bonus, guessYear);
      pendingGuessObjectionReward.value =
        calculateGuessObjectionReward(bonus, guessYear);

      pendingPlacementResult.value = {
        isPlacementCorrect,
        cardYear: kartenJahr,
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
    } finally {
      submitGuessRunning = false;
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
    runOptInTimer();
    return true;
  };

  // Sekundentakt des Opt-in-Fensters (zählt den aktuellen Countdown herunter).
  const runOptInTimer = () => {
    if (optInInterval) clearInterval(optInInterval);
    optInInterval = setInterval(() => {
      objectionOptInCountdown.value -= 1;
      if (objectionOptInCountdown.value <= 0) closeOptInWindow();
    }, 1000);
  };

  // Sekundentakt des Einwenders, der gerade platziert.
  const runPlacementTimer = () => {
    if (placementInterval) clearInterval(placementInterval);
    placementInterval = setInterval(() => {
      objectionPlacementCountdown.value -= 1;
      if (objectionPlacementCountdown.value <= 0) {
        Notify.create({
          type: "warning",
          message: `Zeit abgelaufen, ${playerTimelines.value[currentObjectionPlayerIndex.value]?.name} wird übersprungen.`,
          timeout: 2000,
        });
        startNextObjectorPlacement(objectionQueuePos.value + 1);
      }
    }, 1000);
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
      message: `${playerTimelines.value[currentObjectionPlayerIndex.value].name}: Wähle deine Position über +, du hast ${OBJECTION_PLACEMENT_SECONDS} Sekunden.`,
      timeout: 2500,
    });
    runPlacementTimer();
  };

  // Nach einem Host-Wechsel liefen die Einwand-Timer nur beim alten Host.
  // Der neue Host setzt sie mit den übernommenen Restzeiten fort. Eine
  // unterbrochene Auslosung startet neu (das Ergebnis stand noch nicht fest).
  const resumeObjectionTimers = () => {
    clearObjectionTimers();
    if (!isObjectionPhase.value) return;
    if (objectionRaffleActive.value) {
      objectionRaffleActive.value = false;
      resolveObjections();
      return;
    }
    if (objectionOptInActive.value) {
      if (objectionOptInCountdown.value <= 0) closeOptInWindow();
      else runOptInTimer();
      return;
    }
    if (currentObjectionPlayerIndex.value !== null) {
      if (objectionPlacementCountdown.value <= 0) {
        startNextObjectorPlacement(objectionQueuePos.value + 1);
      } else {
        runPlacementTimer();
      }
      return;
    }
    // Kein Schritt offen, aber noch in der Einwandphase: direkt auswerten.
    resolveObjections();
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
      // Aktueller Spieler lag richtig, er behält die Karte. Wer mit seinem
      // Einwand ebenfalls richtig lag, bekommt den Einwand zurück (siehe
      // finalizeObjectionOutcome), denn falsch war der Einwand nicht.
      finalizeObjectionOutcome({
        type: "placer",
        winnerIndex: pending.playerIndex,
        successful,
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

    // Korrekte Einwender, die die Karte NICHT bekommen, erhalten ihren
    // Einwand zurück. Gilt auch, wenn der Spieler am Zug selbst richtig lag.
    const refundCorrectObjectors = (exceptIndex) => {
      (successful || []).forEach((a) => {
        if (a.playerIndex === exceptIndex) return;
        const p = playerTimelines.value[a.playerIndex];
        if (p) p.objections = Number(p.objections || 0) + 1;
      });
    };

    // Die Rate-Boni (Titel, Künstler, Jahr) gehen in jedem Fall an den
    // Spieler am Zug, unabhängig davon, ob seine Platzierung stimmte.
    if (type === "placer") {
      revealCardAt(pending.playerIndex, pending.position);
      applyPendingGuessRewards(pending.playerIndex);
      refundCorrectObjectors(pending.playerIndex);
      feedbackCorrect.value = true;
      feedbackMessage.value = `${result.playerName} hat korrekt eingeordnet.`;
    } else if (type === "none") {
      removePlaceholderAt(pending.playerIndex, pending.position);
      applyPendingGuessRewards(pending.playerIndex);
      feedbackCorrect.value = false;
      feedbackMessage.value = `${result.playerName} hat falsch eingeordnet, die Karte verfällt.`;
    } else {
      // Einwand-Gewinner
      removePlaceholderAt(pending.playerIndex, pending.position);
      insertResolvedCardForPlayer(winnerIndex);
      applyPendingGuessRewards(pending.playerIndex);
      refundCorrectObjectors(winnerIndex);
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
    resumeObjectionTimers,
  };
}
