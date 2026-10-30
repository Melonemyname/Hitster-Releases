// Gemeinsame Eingabe-Prüfungen für alles, was Clients an den Server schicken
// und was der Server an andere Clients weiterreicht oder dauerhaft ablegt.
//
// Die Regeln für Song-Links und Cover sind mit dem Client abgestimmt (er prüft
// dieselben Muster, bevor er einen Link öffnet oder ein Cover anzeigt). Wer
// hier etwas ändert, muss den Client mitziehen.

// ── Song-Links ─────────────────────────────────────────────────────────────
// Erlaubt sind nur Spotify-Track-Links (Web, auch mit Länder-Präfix und
// Query-String) und Spotify-URIs. Alle mitgelieferten Daten nutzen die Form
// https://open.spotify.com/track/<22 Zeichen>.
const SONG_URL_MAX = 300
const SONG_URL_WEB = /^https:\/\/open\.spotify\.com\/(intl-[a-z]{2}(-[a-z]{2})?\/)?track\/([A-Za-z0-9]{10,40})(\?\S*)?$/
const SONG_URL_URI = /^spotify:track:([A-Za-z0-9]{10,40})$/

function isValidSongUrl (url) {
  if (typeof url !== 'string' || url.length > SONG_URL_MAX) return false
  return SONG_URL_WEB.test(url) || SONG_URL_URI.test(url)
}

// Track-id aus einem gültigen Song-Link, sonst null.
function spotifyTrackId (url) {
  if (!isValidSongUrl(url)) return null
  const web = SONG_URL_WEB.exec(url)
  if (web) return web[3]
  const uri = SONG_URL_URI.exec(url)
  return uri ? uri[1] : null
}

// ── Cover ──────────────────────────────────────────────────────────────────
// Ein Cover ist entweder ein mitgeliefertes Motiv (preset) oder ein
// hochgeladenes Bild als Data-URI. Alles andere wird durch das Standard-Cover
// ersetzt, statt die ganze Anfrage abzulehnen.
const COVER_UPLOAD_MAX = 400000
const COVER_PRESET_REF = /^[a-z0-9_-]{1,40}$/
const COVER_UPLOAD_REF = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/

function defaultCover () {
  return { kind: 'preset', ref: 'custom' }
}

function isUploadDataUri (ref) {
  return typeof ref === 'string' && ref.length <= COVER_UPLOAD_MAX && COVER_UPLOAD_REF.test(ref)
}

function sanitizeCover (cover) {
  if (!cover || typeof cover !== 'object') return defaultCover()
  if (cover.kind === 'preset' && typeof cover.ref === 'string' && COVER_PRESET_REF.test(cover.ref)) {
    return { kind: 'preset', ref: cover.ref }
  }
  if (cover.kind === 'upload' && isUploadDataUri(cover.ref)) {
    return { kind: 'upload', ref: cover.ref }
  }
  return defaultCover()
}

// ── Kennungen ──────────────────────────────────────────────────────────────
// Versions-Kennungen (Pools): mitgelieferte wie „deutschland-rock" oder
// „español-rock", eigene „custom-<id>", geteilte „shared-<uuid>". Buchstaben
// aller Sprachen, Ziffern, Bindestrich und Unterstrich.
const POOL_ID = /^[\p{L}\p{N}_-]{1,100}$/u
const VERBOTENE_SCHLUESSEL = new Set(['__proto__', 'constructor', 'prototype'])

function isSafeKey (key) {
  return typeof key === 'string' && !VERBOTENE_SCHLUESSEL.has(key)
}

function isPoolId (value) {
  return typeof value === 'string' && POOL_ID.test(value) && isSafeKey(value)
}

// Liste von Pool-Kennungen: nur gültige, ohne Dubletten, höchstens `max`.
function sanitizePoolList (list, max) {
  if (!Array.isArray(list)) return []
  const out = []
  for (const v of list) {
    if (out.length >= max) break
    if (isPoolId(v) && !out.includes(v)) out.push(v)
  }
  return out
}

// Freitext kürzen. Liefert '' für alles, was kein Text oder keine Zahl ist.
function text (value, max) {
  if (typeof value === 'string') return value.slice(0, max)
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

// ── Versions-Metadaten im Raum ─────────────────────────────────────────────
// Der Host (bzw. im Battle der Spieler) teilt Name und Bild eigener und
// freigegebener Versionen, damit alle sie anzeigen können. `icon` ist eine
// fertige Bildquelle aus dem Client: ein Data-URI wie beim Cover oder ein
// relativer Pfad auf ein mitgeliefertes Bild. Fremde Adressen fallen weg.
const META_LABEL_MAX = 100
const ICON_PFAD = /^[A-Za-z0-9_./-]{1,300}$/

function sanitizeIcon (icon) {
  if (typeof icon !== 'string') return null
  if (isUploadDataUri(icon)) return icon
  if (ICON_PFAD.test(icon) && !icon.includes('//') && !icon.includes('..')) return icon
  return null
}

function sanitizeVersionMeta (key, meta) {
  if (!meta || typeof meta !== 'object') return null
  const out = {
    value: key,
    label: text(meta.label, META_LABEL_MAX) || key,
    icon: sanitizeIcon(meta.icon),
    trackCount: Number.isInteger(meta.trackCount)
      ? Math.max(0, Math.min(100000, meta.trackCount))
      : 0
  }
  if (meta.cover !== undefined) out.cover = sanitizeCover(meta.cover)
  return out
}

// ── Song-Daten in Versionen ────────────────────────────────────────────────
// Tracks bleiben bewusst offen (der Client legt je nach Import verschiedene
// Felder an), werden aber auf einfache Werte begrenzt: Text bis 500 Zeichen,
// Zahlen, Wahrheitswerte und kurze Listen davon (etwa `years`).
const TRACK_KEY = /^[A-Za-z][A-Za-z0-9_]{0,40}$/
const TRACK_MAX_KEYS = 25
const TRACK_TEXT_MAX = 500

function sanitizePrimitive (value) {
  if (typeof value === 'string') return value.slice(0, TRACK_TEXT_MAX)
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value === 'boolean' || value === null) return value
  return undefined
}

function sanitizeTrack (track) {
  if (!track || typeof track !== 'object' || Array.isArray(track)) return null
  const out = {}
  let anzahl = 0
  for (const [key, value] of Object.entries(track)) {
    if (anzahl >= TRACK_MAX_KEYS) break
    if (!TRACK_KEY.test(key) || !isSafeKey(key)) continue
    let clean
    if (Array.isArray(value)) {
      clean = value.slice(0, 10).map(sanitizePrimitive).filter((v) => v !== undefined)
    } else {
      clean = sanitizePrimitive(value)
    }
    if (clean === undefined) continue
    out[key] = clean
    anzahl += 1
  }
  // Ein Song-Link, der nicht der Regel entspricht, fällt weg. Lässt er sich
  // aus der trackId wiederherstellen, steht dort die kanonische Form.
  if (out.url !== undefined && !isValidSongUrl(out.url)) {
    delete out.url
    if (typeof out.trackId === 'string' && /^[A-Za-z0-9]{10,40}$/.test(out.trackId)) {
      out.url = `https://open.spotify.com/track/${out.trackId}`
    }
  }
  return out
}

// ── Song-Links in einem vom Host gemeldeten Spielstand ─────────────────────
// Der Spielstand (`host:syncState`) ist ein offenes Objekt. Alle Felder, die
// einen Song-Link tragen, werden geprüft; ungültige werden zu null. Tiefe und
// Breite sind begrenzt, damit ein präparierter Stand den Server nicht aufhält.
const LINK_FELDER = new Set(['songUrl', 'songLink', 'pendingSongUrl'])

function scrubSongUrls (obj, tiefe = 0) {
  if (!obj || typeof obj !== 'object' || tiefe > 6) return
  if (Array.isArray(obj)) {
    for (let i = 0; i < Math.min(obj.length, 2000); i += 1) scrubSongUrls(obj[i], tiefe + 1)
    return
  }
  for (const key of Object.keys(obj)) {
    const value = obj[key]
    if (LINK_FELDER.has(key) && typeof value === 'string') {
      if (!isValidSongUrl(value)) obj[key] = null
    } else if (value && typeof value === 'object') {
      scrubSongUrls(value, tiefe + 1)
    }
  }
}

// Karten-Kurzdaten, die mit `cardDrawn` an alle gehen: nur einfache Werte.
function sanitizeCardData (cardData) {
  if (!cardData || typeof cardData !== 'object' || Array.isArray(cardData)) return undefined
  const out = {}
  let anzahl = 0
  for (const [key, value] of Object.entries(cardData)) {
    if (anzahl >= 10) break
    if (!TRACK_KEY.test(key) || !isSafeKey(key)) continue
    const clean = Array.isArray(value)
      ? value.slice(0, 10).map(sanitizePrimitive).filter((v) => v !== undefined)
      : sanitizePrimitive(value)
    if (clean === undefined) continue
    out[key] = typeof clean === 'string' ? clean.slice(0, 300) : clean
    anzahl += 1
  }
  return out
}

module.exports = {
  SONG_URL_MAX,
  isValidSongUrl,
  spotifyTrackId,
  sanitizeCover,
  defaultCover,
  isSafeKey,
  isPoolId,
  sanitizePoolList,
  text,
  sanitizeVersionMeta,
  sanitizeTrack,
  scrubSongUrls,
  sanitizeCardData
}
