/**
 * Client-seitiges Parsen einer Exportify-CSV (Spotify-Playlist-Export).
 *
 * Wird beim Hochladen der Datei im Browser genutzt, um daraus die Track-Liste
 * (Links + Metadaten) für eine eigene Version zu erzeugen. Gleiche Logik wie
 * scripts/import_hitster_csvs.py bzw. der frühere Server-Parser.
 *
 * Band/Solo liefert Exportify nicht mit; das wird beim Import aus dem bereits
 * bekannten Bestand ergänzt (siehe `fillEnsemble`).
 */

import {
  buildArtistEnsembleIndex,
  normalizeArtistName,
} from "./spotifyCsvService";

const COLUMN_ALIASES = {
  "track uri": "track",
  "track id": "track",
  "spotify id": "track",
  "spotify track id": "track",
  uri: "track",
  "track name": "title",
  name: "title",
  "artist name(s)": "artist",
  "artist name": "artist",
  "artist names": "artist",
  artist: "artist",
  "album release date": "release_date",
  "release date": "release_date",
};

function parseCsvLine(line) {
  const fields = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      fields.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  fields.push(current);
  return fields;
}

function extractTrackId(value) {
  const v = (value || "").trim();
  if (!v) return "";
  let m = v.match(/^spotify:track:([A-Za-z0-9]+)$/i);
  if (m) return m[1];
  m = v.match(/\/track\/([A-Za-z0-9]+)/i);
  if (m) return m[1];
  return v;
}

function extractYear(releaseDate) {
  const m = String(releaseDate || "").match(/(\d{4})/);
  return m ? Number.parseInt(m[1], 10) : 0;
}

function buildColumnIndex(header) {
  const idx = {};
  header.forEach((col, i) => {
    const logical = COLUMN_ALIASES[(col || "").trim().toLowerCase()];
    if (logical && !(logical in idx)) idx[logical] = i;
  });
  return idx;
}

// CSV-Rohtext -> [{ trackId, title, artist, year, url }]
export function parseExportifyCsv(rawText) {
  const text = String(rawText || "")
    .split("\u0000")
    .join("")
    .replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) throw new Error("CSV ist leer");

  const header = parseCsvLine(lines[0]);
  const colIdx = buildColumnIndex(header);
  if (!("track" in colIdx)) {
    throw new Error("Keine Track-Spalte (z. B. 'Track URI') gefunden");
  }

  const field = (row, logical) => {
    const i = colIdx[logical];
    return i !== undefined && i < row.length ? (row[i] || "").trim() : "";
  };

  const tracks = [];
  const seen = new Set();
  for (let i = 1; i < lines.length; i += 1) {
    const row = parseCsvLine(lines[i]);
    const trackId = extractTrackId(field(row, "track"));
    if (!trackId || seen.has(trackId)) continue;
    const title = field(row, "title");
    const artist = field(row, "artist");
    const year = extractYear(field(row, "release_date"));
    // Songs ohne Jahr/Titel/Künstler würden im Spiel gefiltert -> überspringen.
    if (!title || !artist || !year) continue;
    seen.add(trackId);
    tracks.push({
      trackId,
      title,
      artist,
      year,
      url: `https://open.spotify.com/track/${trackId}`,
    });
  }
  return tracks;
}

/**
 * Trenner zwischen mehreren Künstlern in einem Feld.
 *
 * Exportify liefert je nach Fassung und Quelle unterschiedliche Zeichen; im
 * vorhandenen Bestand kommen Komma (364 Künstler), Semikolon (174), das
 * kaufmännische Und (83), Schrägstrich (7) und Plus (3) vor, und bei keinem
 * einzigen davon steht „Solo". Deshalb gelten sie alle als Zusammenschluss.
 */
const KUENSTLER_TRENNER =
  /\s*(?:[,;&+/]|\bfeat\.?\s|\bft\.?\s|\bfeaturing\s)\s*/i;

function splitArtists(raw) {
  return raw
    .split(KUENSTLER_TRENNER)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/**
 * Band/Solo für einen Künstler aus dem bekannten Bestand ableiten.
 *
 * Reihenfolge ist wichtig: Erst der exakte Treffer, denn manche Künstler
 * tragen ein Trennzeichen im eigenen Namen („AC/DC", „Tyler, The Creator").
 * Steht so einer im Bestand, gewinnt sein gepflegter Wert. Erst danach greift
 * die Trennregel, die einen unbekannten Namen mit Trennzeichen als
 * Zusammenschluss liest. Ist nichts bekannt, bleibt das Feld leer statt
 * geraten.
 */
export function guessEnsemble(artist, index) {
  const raw = String(artist || "").trim();
  if (!raw) return "";
  const known = index.get(normalizeArtistName(raw));
  if (known) return known;
  return splitArtists(raw).length > 1 ? "Band" : "";
}

// Band/Solo für alle Tracks nachtragen, bei denen es noch fehlt.
export async function fillEnsemble(tracks) {
  const index = await buildArtistEnsembleIndex();
  return (tracks || []).map((track) =>
    String(track.ensemble || "").trim()
      ? track
      : { ...track, ensemble: guessEnsemble(track.artist, index) },
  );
}

// File-Objekt -> Track-Liste (liest den Text, parst und ergänzt Band/Solo).
export function parseExportifyFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(parseExportifyCsv(reader.result));
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(new Error("Datei konnte nicht gelesen werden"));
    reader.readAsText(file);
  }).then(fillEnsemble);
}
