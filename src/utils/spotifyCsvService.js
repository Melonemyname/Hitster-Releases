/**
 * Spotify CSV Service
 * Liest Song-Metadaten aus der ins Bundle eingebetteten CSV (Web + Desktop
 * identisch; früher fetch('/songs/...'), was unter Electron file:// bricht).
 */

import { getMetadataCsvText } from './songDataProvider'
import { getAllCustomTracks } from './customVersionsStore'
import { getAllRestrictedTracks } from './restrictedVersionsStore'

const metadataCache = new Map()
let metadataIndexPromise = null

function normalizeText(rawText) {
  return String(rawText || '')
    .split('\u0000').join('')
    .replace(/^\uFEFF/, '')
    .trim()
}

function extractTrackId(trackRef) {
  const value = String(trackRef || '').trim()
  if (!value) return ''

  const uriMatch = value.match(/^spotify:track:([A-Za-z0-9]+)$/i)
  if (uriMatch) return uriMatch[1]

  const urlMatch = value.match(/\/track\/([A-Za-z0-9]+)(?:[/?#]|$)/i)
  if (urlMatch) return urlMatch[1]

  return value
}

function extractYear(releaseDate) {
  const match = String(releaseDate || '').match(/^(\d{4})/)
  return match ? Number.parseInt(match[1], 10) : 0
}

function parseCsvLine(line) {
  const fields = []
  let current = ''
  let inQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === ',' && !inQuotes) {
      fields.push(current)
      current = ''
      continue
    }

    current += char
  }

  fields.push(current)
  return fields
}

function parseCsvText(csvText) {
  return normalizeText(csvText)
    .split(/\r?\n/)
    .filter(line => line.trim().length > 0)
    .map(parseCsvLine)
}

// Metadaten-Index der gebündelten Standard-CSV (einmalig gecacht).
async function buildBundledIndex() {
  if (metadataIndexPromise) return metadataIndexPromise

  metadataIndexPromise = (async () => {
    const rows = parseCsvText(getMetadataCsvText())
    if (rows.length === 0) {
      return new Map()
    }

    const header = rows[0].map(column => String(column || '').trim())
    const trackIdIndex = header.indexOf('trackId')
    const titleIndex = header.indexOf('title')
    const artistIndex = header.indexOf('artist')
    const yearIndex = header.indexOf('year')
    // Optional: Film/Serie (nur für den Film-Modus, nicht für alle Editionen gesetzt).
    const movieIndex = header.indexOf('movie')
    // Optional: Band/Solo für den Bingo-Modus (leer = noch nicht klassifiziert).
    const ensembleIndex = header.indexOf('ensemble')

    if (trackIdIndex === -1 || titleIndex === -1 || artistIndex === -1 || yearIndex === -1) {
      // Kaputte/fremde CSV (z. B. ein selbst editierter Songs-Ordner): NICHT als
      // dauerhaft gecachte Rejection stehen lassen, sondern leer + rebuild-fähig,
      // damit die App weiterläuft statt lahmzulegen.
      console.error('[spotifyCsvService] CSV-Header unvollständig – Metadaten leer.')
      metadataIndexPromise = null
      return new Map()
    }

    const index = new Map()

    for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex]
      const trackId = extractTrackId(row[trackIdIndex])
      if (!trackId) continue

      const title = String(row[titleIndex] || '').trim()
      const artist = String(row[artistIndex] || '').trim()
      const year = extractYear(row[yearIndex])
      const movie =
        movieIndex !== -1 ? String(row[movieIndex] || '').trim() : ''
      const ensemble =
        ensembleIndex !== -1 ? String(row[ensembleIndex] || '').trim() : ''

      if (!title || !artist || !year) continue

      index.set(trackId, {
        artist,
        title,
        year,
        movie,
        ensemble
      })
    }

    return index
  })()

  return metadataIndexPromise
}

// Metadaten-Index eigener (importierter) Versionen – frisch aus localStorage,
// damit gerade erstellte Versionen sofort spielbar sind.
function buildCustomIndex() {
  const map = new Map()
  // Eigene Versionen + eingeschränkte (freigegebene) Versionen liefern beide
  // eingebettete Metadaten, die nicht in der Bundle-CSV stehen.
  const tracks = [...getAllCustomTracks(), ...getAllRestrictedTracks()]
  for (const track of tracks) {
    const trackId = extractTrackId(track.trackId || track.url)
    const title = String(track.title || '').trim()
    const artist = String(track.artist || '').trim()
    const year = Number(track.year) || 0
    const movie = String(track.movie || '').trim()
    const ensemble = String(track.ensemble || '').trim()
    if (!trackId || !title || !artist || !year) continue
    map.set(trackId, { artist, title, year, movie, ensemble })
  }
  return map
}

// ── Künstler -> Band/Solo ────────────────────────────────────────────────
// Aus allen bekannten Metadaten (gebündelte CSV + eigene/freigegebene
// Versionen) abgeleitet, damit ein Import das Feld für bereits bekannte
// Künstler nicht erneut von Hand gefüllt bekommen muss.

let artistEnsembleCounts = null

export function normalizeArtistName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

// Stimmen je Künstler zählen. Dieselbe Map wird von beiden Quellen befüllt.
function countEnsembles(target, metadataValues) {
  for (const meta of metadataValues) {
    const artist = normalizeArtistName(meta.artist)
    const ensemble = String(meta.ensemble || '').trim()
    if (!artist || (ensemble !== 'Band' && ensemble !== 'Solo')) continue
    let entry = target.get(artist)
    if (!entry) {
      entry = { Band: 0, Solo: 0 }
      target.set(artist, entry)
    }
    entry[ensemble] += 1
  }
  return target
}

/**
 * Map „Künstlername (normalisiert) -> 'Band' | 'Solo'".
 *
 * Der gebündelte Teil ist stabil und wird gecacht; eigene und freigegebene
 * Versionen kommen bei jedem Aufruf frisch dazu, weil sie sich häufig ändern.
 * Bei widersprüchlichen Angaben entscheidet die Mehrheit, bei Gleichstand
 * bleibt der Künstler ungesetzt (dann soll niemand raten müssen).
 */
export async function buildArtistEnsembleIndex() {
  if (!artistEnsembleCounts) {
    artistEnsembleCounts = countEnsembles(
      new Map(),
      (await buildBundledIndex()).values()
    )
  }
  const counts = new Map()
  for (const [artist, entry] of artistEnsembleCounts) {
    counts.set(artist, { ...entry })
  }
  countEnsembles(counts, buildCustomIndex().values())

  const index = new Map()
  for (const [artist, entry] of counts) {
    if (entry.Band > entry.Solo) index.set(artist, 'Band')
    else if (entry.Solo > entry.Band) index.set(artist, 'Solo')
  }
  return index
}

function normalizeSongKey(songKey) {
  return extractTrackId(songKey)
}

async function getTrackMetadataWithCache(songKey = 'current') {
  const normalizedKey = normalizeSongKey(songKey)
  if (!normalizedKey) {
    return { artist: '', title: '', year: 0, movie: '', ensemble: '' }
  }

  if (metadataCache.has(normalizedKey)) {
    return metadataCache.get(normalizedKey)
  }

  const bundled = await buildBundledIndex()
  const metadata =
    bundled.get(normalizedKey) ||
    buildCustomIndex().get(normalizedKey) ||
    { artist: '', title: '', year: 0, movie: '', ensemble: '' }
  metadataCache.set(normalizedKey, metadata)
  return metadata
}

async function filterSongLinksWithMetadata(songLinks = []) {
  const bundled = await buildBundledIndex()
  const custom = buildCustomIndex()
  return songLinks.filter(songLink => {
    const key = normalizeSongKey(songLink)
    return bundled.has(key) || custom.has(key)
  })
}

// Caches leeren (z. B. nach einem Songs-Ordner-Wechsel), damit Metadaten neu
// aus der aktuellen CSV aufgebaut werden.
function resetMetadataIndex() {
  metadataCache.clear()
  metadataIndexPromise = null
  artistEnsembleCounts = null
}

export {
  filterSongLinksWithMetadata,
  getTrackMetadataWithCache,
  resetMetadataIndex
}
