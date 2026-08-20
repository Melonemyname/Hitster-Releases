import { Notify } from "quasar";
import { openSongTab } from "../utils/songTabManager";
import { getSongFileText } from "../utils/songDataProvider";
import { getCustomVersionLinks } from "../utils/customVersionsStore";
import { getRestrictedVersionLinks } from "../utils/restrictedVersionsStore";
import {
  filterSongLinksWithMetadata,
  getTrackMetadataWithCache,
} from "../utils/spotifyCsvService";

const MAX_FETCH_RETRIES = 3;
const FETCH_RETRY_DELAY_MS = 2000;

/**
 * Composable für Song-Verwaltung: Laden, Ziehen, Skippen, History.
 *
 * @param {object} state - Alles aus useGameState (Refs + Funktionen)
 * @param {object} options
 * @param {Function} options.socketEmit - emit aus socketService
 */
export function useSongManager(state, { socketEmit }) {
  const {
    // Refs
    allSongLinks,
    preloadedLink,
    playedLinksHistory,
    currentSongLink,
    selectedSongPools,
    currentCard,
    loadingNextSong,
    skipSongRequested,
    inlineYearValue,
    playerHasGuessed,
    guessedTitle,
    guessedArtist,
    guessedYear,
    guessResults,
    multiplayerMode,
    multiplayerIsHost,
    multiplayerAudioMode,
    playerTimelines,
    showFeedback,
    activeGuessPlayerIndex,
    pendingPlacement,
    pendingPlacementOriginal,
    pendingPlacementResult,
    pendingGuessPoints,
    pendingGuessObjectionReward,
    pendingObjectionPlacement,
    playerIndexAfterResolution,
    isObjectionPhase,
    showGuessDialog,
    playerSongPools,
    currentPlayerIndex,
    songLinkPoolMap,
    gameMode,
    bingoPendingSongUrl,
    bingoPendingCardData,
    pendingSongUrl,
    songReadyConfirmed,
    // Konstanten
    SONG_POOL_FILE_MAPPING,
    LEGACY_PLAYED_LINKS_KEY,
    // Funktionen
    getPlayedLinksStorageKey,
    getRandomCardColor,
    markSongAsPlayed,
    isDuplicateOnTable,
    finalizeGameBecauseNoSongsLeft,
    clearFeedbackCountdown,
  } = state;

  // ── Song-Links laden ────────────────────────────────────────────────

  const loadSongLinksFile = async (filename) => {
    // Song-Listen kommen aus dem Song-Daten-Store (Web: Bundle, Desktop:
    // Songs-Ordner). Kein Laufzeit-fetch, damit es unter Electron file:// läuft.
    const rawText = getSongFileText(filename);
    if (rawText === undefined) {
      throw new Error(`${filename} nicht gefunden`);
    }

    const normalizedText = rawText
      .split("\u0000")
      .join("")
      .replace(/^\uFEFF/, "");

    return normalizedText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(
        (line) =>
          line.includes("open.spotify.com") && line.includes("/track/"),
      );
  };

  const loadSongLinks = async () => {
    try {
      const pools = selectedSongPools.value;
      const fileLoads = [];

      for (const pool of pools) {
        const filename = SONG_POOL_FILE_MAPPING[pool];
        if (filename) {
          fileLoads.push(
            loadSongLinksFile(filename).then((links) => ({ pool, links })),
          );
        } else {
          // Eigene (importierte) oder eingeschränkte (freigegebene) Version:
          // Links direkt aus dem lokalen Cache.
          const customLinks = getCustomVersionLinks(pool);
          const links =
            customLinks.length > 0 ? customLinks : getRestrictedVersionLinks(pool);
          if (links.length > 0) {
            fileLoads.push(Promise.resolve({ pool, links }));
          }
        }
      }

      if (fileLoads.length === 0) {
        throw new Error("Keine gueltige Song-Auswahl vorhanden.");
      }

      const fileResults = await Promise.all(fileLoads);

      // Song-Link -> Pool-Zuordnung (fuer Battle-Modus). Wenn ein Link in
      // mehreren Pools vorkommt, gewinnt der erste Pool (Duplikate werden per
      // Set entfernt und die spaeter angetroffenen Pool-Eintraege ignoriert).
      const poolMap = new Map();
      const flatLinks = [];
      for (const { pool, links } of fileResults) {
        for (const link of links) {
          if (!poolMap.has(link)) {
            poolMap.set(link, pool);
            flatLinks.push(link);
          }
        }
      }
      songLinkPoolMap.value = poolMap;

      const linksWithMetadata = await filterSongLinksWithMetadata(flatLinks);
      const missingMetadataCount = flatLinks.length - linksWithMetadata.length;

      if (missingMetadataCount > 0) {
        console.warn(
          `${missingMetadataCount} Song-Links ohne CSV-Metadaten wurden übersprungen.`,
        );
      }

      console.log(
        `Loaded ${linksWithMetadata.length} Song-Links mit CSV-Metadaten (${pools.join("+")})`,
      );
      return linksWithMetadata;
    } catch (error) {
      console.error("Fehler beim Laden der Song-Links:", error);
      throw error;
    }
  };

  const loadAnswerData = async () => {
    try {
      if (!currentSongLink.value) {
        console.warn("Keine Song-URL verfügbar");
        return { artist: "", title: "", year: 0 };
      }

      const metadata = await getTrackMetadataWithCache(currentSongLink.value);
      return metadata;
    } catch (error) {
      console.error("Fehler beim Laden der CSV-Daten:", error);
      return { artist: "", title: "", year: 0 };
    }
  };

  // ── Link-History ────────────────────────────────────────────────────
  // Bewusst NICHT persistent: gespielte Songs werden nur pro Spielsession
  // im Speicher gemerkt (`playedLinksHistory`-Ref). Beim App-Start /
  // Reload beginnt jeder Raum wieder mit voller Song-Auswahl.

  const loadPlayedLinksHistory = async () => {
    // Kein localStorage mehr – immer mit leerer History starten.
    return [];
  };

  const normalizeSongLink = (link) => {
    try {
      const base = link.split("?")[0].split("#")[0].trim();
      return base.replace(/\/intl-[a-z]{2,5}\//i, "/");
    } catch {
      return link;
    }
  };

  const checkIfLinkPlayed = (link) => {
    const normalizedLink = normalizeSongLink(link);
    return playedLinksHistory.value.some(
      (playedLink) => normalizeSongLink(playedLink) === normalizedLink,
    );
  };

  const saveLinkToHistory = async (link) => {
    // Nur In-Memory – kein localStorage. Reload/Neustart = frischer Pool.
    playedLinksHistory.value.push(link);
    return link;
  };

  const clearSongsHistory = async () => {
    // Nur In-Memory zurücksetzen. Alt-Einträge aus vorherigen Versionen
    // (Legacy-Key + neuer per-Pool-Key) trotzdem entfernen, damit sie
    // nicht wieder auftauchen, falls jemand die App zurückstuft.
    playedLinksHistory.value = [];
    try {
      localStorage.removeItem(getPlayedLinksStorageKey());
      localStorage.removeItem(LEGACY_PLAYED_LINKS_KEY);
    } catch {
      /* Speicher nicht verfügbar – ignorieren. */
    }
    Notify.create({
      type: "positive",
      message: "History erfolgreich gelöscht.",
      timeout: 1500,
    });
  };

  // ── Preload / Popup ─────────────────────────────────────────────────

  // Im Battle-Modus (playerSongPools gesetzt): Song-Links auf den Pool des
  // aktuellen Spielers einschraenken. Sonst alle nutzen.
  const filterLinksForCurrentPlayer = (links) => {
    const perPlayerPools = playerSongPools?.value || [];
    if (perPlayerPools.length === 0) return links;
    const idx = currentPlayerIndex?.value ?? 0;
    const targetPool = perPlayerPools[idx];
    if (!targetPool) return links;
    const map = songLinkPoolMap?.value;
    if (!map || map.size === 0) return links;
    return links.filter((link) => map.get(link) === targetPool);
  };

  const preloadForNextCard = () => {
    if (allSongLinks.value.length === 0) return;
    const available = filterLinksForCurrentPlayer(
      allSongLinks.value.filter((link) => !checkIfLinkPlayed(link)),
    );
    if (available.length === 0) return;
    const idx = Math.floor(Math.random() * available.length);
    preloadedLink.value = available[idx];
  };

  const openPopupEarly = (songUrl) => {
    if (!multiplayerMode.value) {
      openSongTab(songUrl);
      return;
    }
    // Bingo-Modus: Song wird erst nach der Kategorie-Reveal-Animation
    // geöffnet (siehe `useBingoRound.openAnsweringPhase`). Kein Early-Popup.
    if (gameMode?.value === "bingo") {
      return;
    }
    // Im all-clients-Modus wird der Song synchron über den Ready-Flow geöffnet
    if (multiplayerAudioMode.value === "all-clients") {
      return;
    }
    if (multiplayerIsHost.value) {
      openSongTab(songUrl);
    }
  };

  // ── Karte ziehen ────────────────────────────────────────────────────

  const drawNewCard = async (autoSkipDepth = 0) => {
    // Preload wurde am Ende des vorherigen Zugs erstellt und gehoert im
    // Battle-Modus ggf. zum Pool des vorherigen Spielers -> vor dem Popup
    // pruefen und ggf. verwerfen, damit wir nicht den falschen Song oeffnen.
    if (autoSkipDepth === 0) {
      const preloaded = preloadedLink.value;
      if (preloaded) {
        const perPlayerPools = playerSongPools?.value || [];
        const idx = currentPlayerIndex?.value ?? 0;
        const targetPool = perPlayerPools[idx];
        const map = songLinkPoolMap?.value;
        const preloadedPool = map?.get(preloaded);
        if (
          perPlayerPools.length > 0 &&
          targetPool &&
          preloadedPool &&
          preloadedPool !== targetPool
        ) {
          preloadedLink.value = null;
        } else {
          openPopupEarly(preloaded);
        }
      }
    }

    loadingNextSong.value = true;
    skipSongRequested.value = false;

    try {
      if (allSongLinks.value.length === 0) {
        allSongLinks.value = await loadSongLinks();
      }
      if (playedLinksHistory.value.length === 0) {
        playedLinksHistory.value = await loadPlayedLinksHistory();
      }

      const availableLinks = filterLinksForCurrentPlayer(
        allSongLinks.value.filter((link) => !checkIfLinkPlayed(link)),
      );

      if (availableLinks.length === 0) {
        finalizeGameBecauseNoSongsLeft();
        Notify.create({
          type: "warning",
          message: "Alle Songs wurden bereits gespielt.",
          timeout: 5000,
        });
        loadingNextSong.value = false;
        return;
      }

      let selectedLink = preloadedLink.value;
      if (!selectedLink || !availableLinks.includes(selectedLink)) {
        const idx = Math.floor(Math.random() * availableLinks.length);
        selectedLink = availableLinks[idx];

        if (autoSkipDepth === 0) {
          openPopupEarly(selectedLink);
        }
      }

      preloadedLink.value = null;

      await saveLinkToHistory(selectedLink);
      currentSongLink.value = selectedLink;

      // Beim Ziehen einer neuen Karte alle Rate-/Dialog-States hart
      // zurücksetzen. Ohne das blitzte beim Gast kurz das Rateformular
      // eines vorherigen Zugs auf, weil `showGuessDialog=true` aus dem
      // letzten Sync-Snapshot noch aktiv war, bis der nächste Sync
      // eintrudelte. Der Reset läuft NICHT über den State-Watcher (der
      // pusht das Update über syncMultiplayerState an die Gäste weiter).
      playerHasGuessed.value = false;
      showGuessDialog.value = false;
      activeGuessPlayerIndex.value = null;
      pendingPlacement.value = null;
      pendingPlacementOriginal.value = null;
      pendingPlacementResult.value = null;
      pendingGuessPoints.value = 0;
      pendingGuessObjectionReward.value = 0;
      pendingObjectionPlacement.value = null;
      guessedTitle.value = "";
      guessedArtist.value = "";
      guessedYear.value = null;
      guessResults.value = null;

      let songData = null;
      for (let attempt = 1; attempt <= MAX_FETCH_RETRIES; attempt++) {
        if (skipSongRequested.value) {
          skipSongRequested.value = false;
          loadingNextSong.value = false;
          await drawNewCard(autoSkipDepth);
          return;
        }
        try {
          songData = await loadAnswerData();
        } catch {
          songData = null;
        }
        if (songData?.title && songData?.artist && songData?.year) break;
        if (attempt < MAX_FETCH_RETRIES) {
          Notify.create({
            type: "warning",
            message: `Songdaten nicht verfügbar, neuer Versuch (${attempt}/${MAX_FETCH_RETRIES})...`,
            timeout: 2000,
          });
          await new Promise((resolve) =>
            setTimeout(resolve, FETCH_RETRY_DELAY_MS),
          );
          songData = null;
        }
      }

      if (!songData?.title || !songData?.artist || !songData?.year) {
        Notify.create({
          type: "negative",
          message:
            "Songdaten konnten nach mehreren Versuchen nicht geladen werden.",
          timeout: 5000,
        });
        loadingNextSong.value = false;
        return;
      }

      if (isDuplicateOnTable(songData)) {
        Notify.create({
          type: "warning",
          message: "Song liegt bereits auf dem Tisch.",
          timeout: 4000,
        });
        loadingNextSong.value = false;
        return;
      }

      currentCard.value = {
        artist: songData.artist,
        title: songData.title,
        year: songData.year,
        movie: songData.movie || "",
        ensemble: songData.ensemble || "",
        songUrl: currentSongLink.value,
        bgColor: getRandomCardColor(),
      };
      inlineYearValue.value = songData.year;
      markSongAsPlayed(currentCard.value);
      preloadForNextCard();
      loadingNextSong.value = false;

      if (multiplayerMode.value && multiplayerIsHost.value) {
        // all-clients-Modus (nicht Bingo): pendingSongUrl SOFORT lokal
        // setzen, damit die Timeline-Slots des Hosts nicht kurz aufblitzen
        // zwischen "currentCard gesetzt" und dem Zurückkommen des
        // cardDrawn-Server-Events (dort wird pendingSongUrl gesetzt).
        // Der Server-Roundtrip überschreibt später mit demselben Wert –
        // kein Nebeneffekt, aber kein sichtbarer Flackerer mehr.
        if (
          multiplayerAudioMode.value === "all-clients" &&
          gameMode?.value !== "bingo"
        ) {
          pendingSongUrl.value = currentCard.value.songUrl;
          songReadyConfirmed.value = false;
        }
        if (gameMode?.value === "bingo") {
          // Bingo: Song noch nicht öffnen. Runde beim Server starten
          // (Kategorie wird dort gewählt, Reveal-Animation läuft parallel).
          // Songdaten + URL im Buffer halten, damit `useBingoRound` sie nach
          // der Reveal-Animation über `host:bingoOpenAnswering` an alle
          // verteilen kann (Audio-Modus wie in anderen MP-Modi).
          bingoPendingSongUrl.value = currentCard.value.songUrl;
          bingoPendingCardData.value = {
            title: currentCard.value.title,
            artist: currentCard.value.artist,
            year: currentCard.value.year,
          };
          socketEmit("host:bingoStartRound", {
            songLink: currentCard.value.songUrl,
            songData: {
              title: currentCard.value.title,
              artist: currentCard.value.artist,
              year: currentCard.value.year,
              // Band/Solo aus der Metadaten-CSV: erspart dem Host die Nachfrage
              // in der Bingo-Kategorie „Solo oder Gruppe?", wenn gesetzt.
              ensemble: currentCard.value.ensemble || "",
            },
          });
        } else {
          socketEmit("host:cardDrawn", {
            songUrl: currentCard.value.songUrl,
            cardData: {
              title: currentCard.value.title,
              artist: currentCard.value.artist,
              year: currentCard.value.year,
            },
          });
        }
      }
    } catch (error) {
      console.error("Fehler beim Laden:", error);
      Notify.create({
        type: "negative",
        message: `Fehler: ${error.message}`,
        timeout: 5000,
      });
      loadingNextSong.value = false;
    }
  };

  // ── Song skippen ────────────────────────────────────────────────────

  const manualSkipSong = async () => {
    if (loadingNextSong.value) {
      skipSongRequested.value = true;
      Notify.create({
        type: "info",
        message: "Skip angefordert. Wechsel zum nächsten Song...",
        timeout: 1500,
      });
      return;
    }

    if (!currentCard.value && !currentSongLink.value) {
      Notify.create({
        type: "warning",
        message: "Aktuell gibt es keinen Song zum Skippen.",
        timeout: 1500,
      });
      return;
    }

    clearFeedbackCountdown();
    showFeedback.value = false;
    activeGuessPlayerIndex.value = null;
    // Falls ein Placeholder in einer Timeline lag (der Aktive hatte gerade
    // platziert), muss der Platzhalter entfernt werden, damit er nach dem
    // Skip nicht als klickbarer „Leerslot" bestehen bleibt. Der Placeholder
    // wurde in `placeCard` als `{ placeholder: true, ... }` eingefügt.
    if (pendingPlacementOriginal.value) {
      const { playerIndex, position } = pendingPlacementOriginal.value;
      const tl = playerTimelines?.value?.[playerIndex]?.cards;
      if (tl && tl[position] && tl[position].placeholder) {
        tl.splice(position, 1);
      }
    }
    pendingPlacement.value = null;
    pendingPlacementOriginal.value = null;
    pendingPlacementResult.value = null;
    pendingGuessPoints.value = 0;
    pendingGuessObjectionReward.value = 0;
    pendingObjectionPlacement.value = null;
    playerIndexAfterResolution.value = null;
    isObjectionPhase.value = false;
    playerHasGuessed.value = false;

    currentCard.value = null;
    playerHasGuessed.value = false;
    showGuessDialog.value = false;
    guessedTitle.value = "";
    guessedArtist.value = "";
    guessedYear.value = null;
    guessResults.value = null;

    // Multiplayer-Host: Skip an alle Clients broadcasten, damit auch dort
    // pendingPlacement, showGuessDialog etc. zurückgesetzt werden. Sonst
    // konnten Gäste nach einem Host-Skip noch weiter platzieren/raten.
    // Zusätzlich einen expliziten Sync-Push senden (nicht nur auf den
    // debouncten Watcher warten), damit die neuen State-Werte SOFORT bei
    // den Gästen ankommen und der Guess-Dialog dort direkt schließt.
    if (multiplayerMode.value && multiplayerIsHost.value) {
      socketEmit("host:confirmSkip", {});
      try {
        state.deps?.syncMultiplayerState?.();
      } catch {
        /* Deps evtl. noch nicht befüllt – wird per Watcher nachgezogen. */
      }
    }

    try {
      await drawNewCard();
    } finally {
      loadingNextSong.value = false;
    }
  };

  // ── Return ──────────────────────────────────────────────────────────

  return {
    loadSongLinks,
    loadAnswerData,
    loadPlayedLinksHistory,
    normalizeSongLink,
    checkIfLinkPlayed,
    saveLinkToHistory,
    clearSongsHistory,
    preloadForNextCard,
    openPopupEarly,
    drawNewCard,
    manualSkipSong,
  };
}
