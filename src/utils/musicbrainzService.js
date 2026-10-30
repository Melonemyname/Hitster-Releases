/**
 * Abgleich importierter Songs mit MusicBrainz (über den eigenen Server).
 *
 * Der Server fragt MusicBrainz ab (höchstens eine Anfrage pro Sekunde, deshalb
 * dauert ein Paket von zehn Songs gut 10 bis 20 Sekunden) und liefert je Song:
 * das Jahr der Erstveröffentlichung, Band/Solo und Hinweise wie Live-Aufnahme
 * oder Cover. Der Client schickt die Songs in Zehnerpaketen nacheinander.
 *
 * Die Prüfung ist eine Zugabe, keine Voraussetzung: Ohne Anmeldung, bei einem
 * älteren Server ohne diesen Endpunkt (404) oder wenn der Server nicht
 * erreichbar ist, kommt still ein leeres Ergebnis zurück, und der Import läuft
 * wie bisher.
 */

import { ref, shallowRef, computed } from "vue";
import { SERVER_URL, getToken } from "./authService";
import {
  firstVariant,
  displayArtists,
  parseYears,
  splitVariants,
} from "./songVariants";

const BATCH_SIZE = 10;
// Ein Paket braucht serverseitig bis zu 20 Sekunden. Hängt eine Anfrage
// deutlich länger, wird sie abgebrochen, statt die Anzeige ewig stehen zu
// lassen.
const REQUEST_TIMEOUT_MS = 60000;

// Hinweise des Servers in Worten. Unbekannte Kennungen werden übergangen.
export const FLAG_LABELS = {
  live: "Live-Aufnahme",
  cover: "Cover",
  remaster: "Remaster",
  rerecording: "Neuaufnahme",
  compilation: "Aus einer Compilation",
  remix: "Remix",
};

export function flagLabels(result) {
  return (Array.isArray(result?.flags) ? result.flags : [])
    .map((f) => FLAG_LABELS[f])
    .filter(Boolean);
}

/**
 * Schlüssel eines Songs für den Abgleich. Die Spotify-Track-id ist eindeutig
 * und übersteht Umsortieren und Entfernen; ältere Songs ohne id laufen über
 * Titel und Künstler.
 */
export function trackKey(track) {
  const id = String(track?.trackId || "").trim();
  if (id) return `id:${id}`;
  const title = firstVariant(track?.title).toLowerCase();
  const artist = firstVariant(track?.artist).toLowerCase();
  return `ta:${title}|${artist}`;
}

function toRequestTrack(key, track) {
  const out = {
    key,
    title: firstVariant(track.title),
    artist: displayArtists(track.artist),
  };
  const isrc = String(track.isrc || "").trim();
  if (isrc) out.isrc = isrc.toUpperCase();
  const trackId = String(track.trackId || "").trim();
  if (trackId) out.trackId = trackId;
  const year = parseYears(track.year)[0];
  if (year) out.year = year;
  return out;
}

// Eine Anfrage, deren Abbruch sowohl am äußeren Signal (Überspringen,
// Dialog zu) als auch an der Zeitgrenze hängt.
async function postBatch(batch, { signal, artistsOnly }) {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", onAbort, { once: true });
  }
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${SERVER_URL}/api/musicbrainz/check`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tracks: batch,
        ...(artistsOnly ? { artistsOnly: true } : {}),
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onAbort);
  }
}

/**
 * Songs mit MusicBrainz abgleichen.
 *
 * tracks:      Songs der Version (trackId, isrc, title, artist, year).
 * onProgress:  ({ done, total }) nach jedem Paket (und einmal zu Beginn).
 * onBatch:     (results) mit den Ergebnissen eines Pakets, sobald es da ist,
 *              damit die Oberfläche nicht auf den ganzen Lauf warten muss.
 * onUnavailable: () wenn die Prüfung gar nicht möglich war (ohne Anmeldung,
 *              älterer Server, Server nicht erreichbar).
 * signal:      AbortSignal zum Abbrechen.
 *
 * Rückgabe: { [trackKey]: null | Ergebnis }. Bei einem Abbruch oder einer
 * Störung mittendrin das, was bis dahin angekommen ist.
 */
export async function checkTracks(
  tracks,
  { onProgress, onBatch, onUnavailable, signal, artistsOnly = false } = {},
) {
  const results = {};
  if (!getToken()) {
    onUnavailable?.();
    return results;
  }

  // Jeder Schlüssel nur einmal, auch wenn ein Song doppelt in der Liste steht.
  const unique = new Map();
  for (const t of tracks || []) {
    if (!t || (!t.title && !t.isrc)) continue;
    const key = trackKey(t);
    if (!unique.has(key)) unique.set(key, toRequestTrack(key, t));
  }
  const list = [...unique.values()];
  const total = list.length;
  let done = 0;
  onProgress?.({ done, total });

  for (let i = 0; i < list.length; i += BATCH_SIZE) {
    if (signal?.aborted) break;
    const batch = list.slice(i, i + BATCH_SIZE);
    let res;
    try {
      res = await postBatch(batch, { signal, artistsOnly });
    } catch {
      // Abbruch oder Netzwerkfehler: aufhören, bisherige Ergebnisse bleiben.
      if (done === 0 && !signal?.aborted) onUnavailable?.();
      break;
    }
    // Älterer Server ohne Endpunkt, Sitzung abgelaufen: Weiterfragen bringt
    // nichts.
    if ([401, 403, 404].includes(res.status)) {
      if (done === 0) onUnavailable?.();
      break;
    }
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      const batchResults = {};
      const got = data && typeof data.results === "object" ? data.results : {};
      for (const entry of batch) {
        if (entry.key in got) batchResults[entry.key] = got[entry.key] || null;
      }
      Object.assign(results, batchResults);
      if (!signal?.aborted) onBatch?.(batchResults);
    }
    // Andere Fehler (etwa 503, MusicBrainz überlastet) betreffen nur dieses
    // Paket, der Rest wird trotzdem versucht.
    done += batch.length;
    if (!signal?.aborted) onProgress?.({ done, total });
  }
  return results;
}

// ── Ergebnisse auf Songs anwenden ──────────────────────────────────────────

/**
 * Band/Solo aus dem Ergebnis nachtragen. Nur ein leeres Feld wird gefüllt,
 * ein gesetzter Wert (aus dem Bestand oder von Hand) bleibt unberührt.
 * Gibt den Song unverändert (gleiches Objekt) zurück, wenn nichts zu tun ist.
 */
export function withEnsemble(track, result) {
  const ensemble = result?.ensemble;
  if (ensemble !== "Band" && ensemble !== "Solo") return track;
  if (String(track?.ensemble || "").trim()) return track;
  return { ...track, ensemble };
}

/**
 * Ein Jahr als Hauptjahr vorn einsetzen, das bisherige bleibt als weitere
 * Variante erhalten („1975;2011"). Beide zählen beim Raten. Steht das Jahr
 * schon unter den Varianten, wird nur umsortiert, nie doppelt eingetragen.
 */
export function yearWithFirst(year, firstYear) {
  const first = Number(firstYear);
  if (!Number.isInteger(first) || first <= 0) return year;
  const years = parseYears(year);
  if (years[0] === first) return year;
  const rest = years.filter((y) => y !== first);
  return rest.length ? [first, ...rest].join(";") : first;
}

function validYear(value) {
  const y = Number(value);
  return Number.isInteger(y) && y > 0 ? y : null;
}

// Kurzer Zusatz zum Jahr der gefundenen Aufnahme, wenn es eine eigene
// Fassung ist („2011 (Remaster)").
const RECORDING_NOTES = {
  remaster: "Remaster",
  rerecording: "Neuaufnahme",
  compilation: "Compilation",
  live: "Live",
};
function recordingFlag(result) {
  const flags = Array.isArray(result?.flags) ? result.flags : [];
  return flags.find((f) => RECORDING_NOTES[f]) || "";
}

/**
 * Jahr, das eine Wahl im Hinweis setzt: 'original' = Erstveröffentlichung
 * der Originalaufnahme, 'recording' = Erstveröffentlichung der gefundenen
 * Aufnahme. Null, wenn es das Jahr nicht gibt.
 */
export function chosenYear(result, which) {
  return which === "original"
    ? validYear(result?.originalYear)
    : validYear(result?.firstYear);
}

/**
 * Was zu einem Song angezeigt werden soll. Null, wenn es nichts zu zeigen
 * gibt (gefunden und alles stimmt überein).
 *
 * - firstYear:     Jahr der gefundenen Aufnahme, solange eine Jahreswahl
 *                  offen ist (zur Anzeige, auch wenn es dem Hauptjahr gleicht).
 * - canTakeFirst:  ob „Aufnahme übernehmen" etwas ändern würde.
 * - originalYear:  Jahr der Originalaufnahme, wenn es vom Hauptjahr abweicht.
 * - originalTitle: Titel der Originalaufnahme (nur zur Anzeige).
 * - recordingNote: „Remaster", „Neuaufnahme" … zur gefundenen Aufnahme.
 * - flags:         Merkmale in Worten.
 */
export function hintFor(track, result) {
  if (!result) return null;
  const mainYear = parseYears(track?.year)[0] || null;
  const first = validYear(result.firstYear);
  const original = validYear(result.originalYear);
  // Das Original zählt vor der Aufnahme. Steht das Hauptjahr schon auf dem
  // bevorzugten Jahr, gibt es nichts zu entscheiden.
  const preferred = original || first;
  const yearOpen =
    (result.yearDiffers || result.originalDiffers) &&
    !!preferred &&
    preferred !== mainYear;
  const originalYear = yearOpen && original && original !== mainYear ? original : null;
  const firstYear = yearOpen && first ? first : null;
  // Steht die Fassung schon beim Jahr („2011 (Remaster)"), fehlt sie bei den
  // Merkmalen, statt doppelt dazustehen.
  const noteFlag = originalYear && firstYear ? recordingFlag(result) : "";
  const flags = flagLabels({
    flags: (Array.isArray(result.flags) ? result.flags : []).filter(
      (f) => f !== noteFlag,
    ),
  });
  if (!originalYear && !firstYear && flags.length === 0) return null;
  return {
    firstYear,
    canTakeFirst: !!firstYear && firstYear !== mainYear,
    originalYear,
    originalTitle: originalYear ? String(result.originalTitle || "") : "",
    recordingNote: noteFlag ? RECORDING_NOTES[noteFlag] : "",
    flags,
  };
}

/**
 * Zustand einer laufenden Prüfung für einen Dialog: Fortschritt, Ergebnisse,
 * welche Hinweise schon erledigt sind („Übernehmen" oder „Behalten") und bei
 * welchen Songs die Prüfung ein leeres Band/Solo gefüllt hat (damit man es
 * sieht und zurücknehmen kann).
 *
 * Ein neuer Start oder `stop()` macht den alten Lauf ungültig; was von ihm
 * danach noch eintrifft, wird verworfen. So landen nach dem Schließen eines
 * Dialogs keine Ergebnisse mehr in einer anderen Liste.
 */
export function useMusicBrainzCheck() {
  const running = ref(false);
  const done = ref(0);
  const total = ref(0);
  const results = shallowRef({});
  const handled = ref({});
  // trackKey -> „Band" | „Solo", was die Prüfung in ein leeres Feld schrieb.
  const filled = shallowRef({});
  const baseSummary = ref("");
  let controller = null;
  let runId = 0;

  const stop = () => {
    runId += 1;
    if (controller) controller.abort();
    controller = null;
    running.value = false;
  };

  const reset = () => {
    stop();
    results.value = {};
    handled.value = {};
    filled.value = {};
    baseSummary.value = "";
    done.value = 0;
    total.value = 0;
  };

  // Überspringen: Lauf beenden, Bisheriges behalten.
  const skip = () => {
    const found = Object.values(results.value).filter(Boolean).length;
    stop();
    baseSummary.value = found
      ? `MusicBrainz-Prüfung übersprungen, ${found} Songs bis dahin gefunden.`
      : "";
  };

  /**
   * Prüfung starten. onBatch(results) bekommt jedes eintreffende Paket,
   * solange der Lauf gültig ist (zum Nachtragen von Band/Solo).
   */
  const start = async (tracks, { onBatch, onUnavailable } = {}) => {
    reset();
    if (!getToken() || !(tracks || []).length) return {};
    const id = runId;
    controller = new AbortController();
    running.value = true;
    let unavailable = false;
    try {
      const all = await checkTracks(tracks, {
        signal: controller.signal,
        onProgress: (p) => {
          if (id !== runId) return;
          done.value = p.done;
          total.value = p.total;
        },
        onBatch: (batch) => {
          if (id !== runId) return;
          results.value = { ...results.value, ...batch };
          onBatch?.(batch);
        },
        onUnavailable: () => {
          unavailable = true;
          if (id === runId) onUnavailable?.();
        },
      });
      if (id === runId && !unavailable) {
        const found = Object.values(all).filter(Boolean).length;
        baseSummary.value = `MusicBrainz: ${found} von ${total.value} Songs gefunden.`;
      }
      return all;
    } finally {
      if (id === runId) {
        running.value = false;
        controller = null;
      }
    }
  };

  const resultFor = (track) => results.value[trackKey(track)] || null;

  // Hinweis zu einem Song, solange er nicht erledigt ist.
  const openHint = (track) => {
    const key = trackKey(track);
    if (handled.value[key]) return null;
    return hintFor(track, results.value[key]);
  };

  const markHandled = (track) => {
    handled.value = { ...handled.value, [trackKey(track)]: true };
  };

  /**
   * Band/Solo aus dem Ergebnis in ein leeres Feld schreiben und sich merken,
   * dass es von MusicBrainz kommt. Gleiches Objekt zurück, wenn nichts zu tun
   * ist (siehe withEnsemble).
   */
  const fillEnsemble = (track, result) => {
    const next = withEnsemble(track, result);
    if (next !== track) {
      filled.value = { ...filled.value, [trackKey(track)]: next.ensemble };
    }
    return next;
  };

  // Von MusicBrainz gefülltes Band/Solo, solange es noch so im Song steht
  // (von Hand geändert zählt nicht mehr).
  const filledEnsemble = (track) => {
    const value = filled.value[trackKey(track)];
    if (!value) return null;
    return String(track?.ensemble || "").trim() === value ? value : null;
  };

  // Nach „Zurücknehmen": nicht mehr als gefüllt führen.
  const forgetFilled = (track) => {
    const key = trackKey(track);
    if (!(key in filled.value)) return;
    const next = { ...filled.value };
    delete next[key];
    filled.value = next;
  };

  // Jahreswahl auf einen Song anwenden ('original' oder 'recording').
  const applyYear = (track, which) => {
    const year = chosenYear(resultFor(track), which);
    return year ? { ...track, year: yearWithFirst(track.year, year) } : track;
  };

  // Alles, was an einem Song zu zeigen ist: offener Hinweis und gefülltes
  // Band/Solo. Null, wenn nichts davon.
  const trackHint = (track) => {
    const hint = openHint(track);
    const ensemble = filledEnsemble(track);
    if (!hint && !ensemble) return null;
    return { ...(hint || {}), ensemble };
  };

  // Zusammenfassung samt Zahl der gefüllten Band/Solo-Felder.
  const summary = computed(() => {
    const base = baseSummary.value;
    const n = Object.keys(filled.value).length;
    if (!base || n === 0) return base;
    return `${base} Band/Solo bei ${n} ${n === 1 ? "Song" : "Songs"} ergänzt.`;
  });

  return {
    running,
    done,
    total,
    results,
    summary,
    start,
    stop,
    skip,
    reset,
    resultFor,
    openHint,
    markHandled,
    filled,
    fillEnsemble,
    filledEnsemble,
    forgetFilled,
    applyYear,
    trackHint,
  };
}

// Für Listen: Anzeige-Felder eines Songs (Titel, Künstler, Jahr).
export function displayTrack(track) {
  return {
    title: firstVariant(track?.title),
    artist: displayArtists(track?.artist),
    year: splitVariants(track?.year).join(" / ") || String(track?.year ?? ""),
  };
}
