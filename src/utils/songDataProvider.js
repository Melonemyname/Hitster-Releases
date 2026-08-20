/**
 * Zentrale Quelle für Song-Daten (Editionen, Link-Listen, Metadaten-CSV, Cover).
 *
 * Web: alles ins Bundle eingebettet (wie bisher). Desktop-App (Electron): sofern
 * ein Songs-Ordner-IPC vorhanden ist, werden die Daten von der Platte gelesen und
 * über das Bundle gemerged (Platte gewinnt, Bundle füllt Lücken → nie ein Brick).
 *
 * Der Store wird EINMAL vor dem App-Mount durch das Boot-File `song-data.js`
 * (`initSongData`) befüllt. Alle Konsumenten lesen über die synchronen Getter,
 * damit synchrone Stellen (z. B. `countBundledTracks` in einer computed) synchron
 * bleiben und das Web-Verhalten byte-identisch ist.
 */

import { SONG_FILES } from "../assets/songs";
import editionsManifest from "../assets/songs/editions.json";
import metadataCsvText from "../assets/songs/hitster-song-metadata.csv?raw";
import { isDesktopApp } from "./platform";

// Cover als Vite-Assets (aufgelöste URLs), damit sie in Web UND Electron (file://)
// funktionieren. Schlüssel = Dateiname (wie im Manifest referenziert).
import coverCustom from "../assets/versions/custom.png";
import coverRock from "../assets/versions/rock.png";
import coverStandart from "../assets/versions/standart.png";
import coverCelebration from "../assets/versions/celebration.png";
import coverSoundtrack from "../assets/versions/soundtrack.png";
import coverChristmas from "../assets/versions/christmas.png";
import coverBingo from "../assets/versions/bingo.png";
import coverBayern from "../assets/versions/bayern.png";
import coverPlatinum from "../assets/versions/platinum.png";
import coverBattle from "../assets/versions/battle-generations.png";
import coverGuilty from "../assets/versions/guilty.png";
import coverSummer from "../assets/versions/summer.png";
import coverHipHop from "../assets/versions/hiphop.png";
import coverSchlager from "../assets/versions/schlager.png";

// Dateiname → aufgelöste Asset-URL (gebündelte Standard-Cover).
export const BUNDLED_COVER_URLS = {
  "custom.png": coverCustom,
  "rock.png": coverRock,
  "standart.png": coverStandart,
  "celebration.png": coverCelebration,
  "soundtrack.png": coverSoundtrack,
  "christmas.png": coverChristmas,
  "bingo.png": coverBingo,
  "bayern.png": coverBayern,
  "platinum.png": coverPlatinum,
  "battle-generations.png": coverBattle,
  "guilty.png": coverGuilty,
  "summer.png": coverSummer,
  "hiphop.png": coverHipHop,
  "schlager.png": coverSchlager,
};

const FALLBACK_COVER = "custom.png";

function bundleStore() {
  return {
    editions: (editionsManifest.editions || []).map((e) => ({ ...e })),
    songFiles: { ...SONG_FILES },
    metadataCsv: metadataCsvText,
    covers: { ...BUNDLED_COVER_URLS },
  };
}

// Disk-Daten (Electron) pro Schlüssel über das Bundle mergen: Platte gewinnt,
// Bundle füllt fehlende Einträge → App kann bei leerem/kaputtem Ordner nie bricken.
function mergeDiskOverBundle(base, disk) {
  if (!disk || typeof disk !== "object") return base;
  const merged = {
    editions: Array.isArray(disk.editions) && disk.editions.length
      ? disk.editions.map((e) => ({ ...e }))
      : base.editions,
    songFiles: { ...base.songFiles, ...(disk.songFiles || {}) },
    metadataCsv:
      typeof disk.metadataCsv === "string" && disk.metadataCsv.trim().length
        ? disk.metadataCsv
        : base.metadataCsv,
    covers: { ...base.covers, ...(disk.covers || {}) },
  };
  return merged;
}

// Modul-Store (nach initSongData() befüllt). Getter fallen notfalls auf das
// Bundle zurück, falls sie vor dem Boot aufgerufen werden.
let store = null;

function s() {
  if (!store) store = bundleStore();
  return store;
}

/**
 * Befüllt den Store vor dem App-Mount. Wird vom Boot-File aufgerufen.
 * Web: aus dem Bundle. Electron mit Songs-Ordner-IPC: Platte über Bundle gemerged.
 */
export async function initSongData() {
  const base = bundleStore();
  if (
    isDesktopApp() &&
    typeof window !== "undefined" &&
    window.hitster &&
    typeof window.hitster.readSongData === "function"
  ) {
    try {
      const disk = await window.hitster.readSongData();
      store = mergeDiskOverBundle(base, disk);
      return;
    } catch (err) {
      console.warn("[songData] Ordner-Read fehlgeschlagen, Bundle-Fallback:", err?.message || err);
    }
  }
  store = base;
}

// ── Synchrone Getter ───────────────────────────────────────────────────────

export function getSongFileText(filename) {
  return s().songFiles[filename];
}

export function getMetadataCsvText() {
  return s().metadataCsv;
}

// Rohe Manifest-Einträge ({ value, label, file, cover, custom }).
export function getEditions() {
  return s().editions;
}

// Cover-Referenz (Dateiname) → anzeigbare URL bzw. Data-URL.
export function getCoverUrl(coverRef) {
  const covers = s().covers;
  return covers[coverRef] || covers[FALLBACK_COVER] || BUNDLED_COVER_URLS[FALLBACK_COVER];
}

// Editionen im Format des früheren STANDARD_VERSIONS ({ value, label, file, icon, custom }).
export function getStandardVersions() {
  return getEditions().map((e) => ({
    value: e.value,
    label: e.label,
    file: e.file,
    icon: getCoverUrl(e.cover),
    custom: !!e.custom,
    // Film-/Serien-Edition (nur für den Film-Modus relevant). Standardmäßig aus.
    film: !!e.film,
  }));
}

// Menge aller bekannten Editions-Werte (für die Pool-Whitelist).
export function getKnownEditionValues() {
  return new Set(getEditions().map((e) => e.value));
}

// Pool-Wert → Dateiname (früher SONG_POOL_FILE_MAPPING).
export function getSongPoolFileMapping() {
  const map = {};
  for (const e of getEditions()) map[e.value] = e.file;
  return map;
}
