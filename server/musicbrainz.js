// Abgleich von Songdaten mit MusicBrainz (https://musicbrainz.org/ws/2/).
//
// Wozu: Die Jahreszahlen und die Band/Solo-Einordnung in unseren Decks stammen
// aus Spotify-Exporten und Handarbeit. Spotify liefert oft das Datum eines
// Remasters oder einer Compilation statt der Erstveröffentlichung. MusicBrainz
// kennt pro Aufnahme das erste Veröffentlichungsdatum und pro Künstler, ob es
// eine Person oder eine Gruppe ist. Dieses Modul fragt beides ab.
//
// Genutzt von zwei Stellen, deshalb CommonJS ohne Express-Abhängigkeit:
//   - server/index.js (POST /api/musicbrainz/check, Prüfen einzelner Versionen)
//   - scripts/check-song-data.js (Komplettlauf über die Standard-CSV)
//
// Regeln von MusicBrainz, die hier durchgesetzt werden:
//   - höchstens eine Anfrage pro Sekunde und IP. Alle Anfragen laufen deshalb
//     durch EINE prozessweite Warteschlange mit mindestens 1100 ms Abstand,
//     egal wie viele Nutzer gleichzeitig prüfen.
//   - ein aussagekräftiger User-Agent (ohne Mailadresse, nur der Projektlink).
// Antworten (auch "nicht gefunden") landen in einem Datei-Cache, damit ein
// zweiter Lauf die API nicht erneut belastet.

const fs = require('fs')
const path = require('path')

const API_BASIS = 'https://musicbrainz.org/ws/2/'

function appVersion () {
  try {
    return require('../package.json').version || '0'
  } catch {
    return '0'
  }
}

const USER_AGENT = `Hitster/${appVersion()} ( https://github.com/Melonemyname/Hitster-Releases )`

const MIN_ABSTAND_MS = 1100
const TIMEOUT_MS = 20000
const MAX_VERSUCHE = 5
// Obergrenze für wartende Anfragen. Bei 1,1 s pro Anfrage sind 300 schon rund
// fünfeinhalb Minuten Wartezeit; mehr nimmt der Server nicht an, statt die
// Warteschlange beliebig wachsen zu lassen.
const MAX_WARTEND = 300

const TAG_MS = 24 * 60 * 60 * 1000
// Treffer ändern sich selten, Lücken in MusicBrainz werden dagegen laufend
// gefüllt. Deshalb verfallen "nicht gefunden"-Einträge deutlich früher.
const TTL_TREFFER_MS = 180 * TAG_MS
const TTL_FEHLT_MS = 30 * TAG_MS

// ─── Warteschlange und HTTP ───────────────────────────────────────────────────

let kette = Promise.resolve()
let naechsterSlot = 0
let wartend = 0
let anfragenGesamt = 0

const schlafen = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Hängt fn an die globale Kette. Ein Fehler in fn darf die Kette nicht
// abreißen lassen, deshalb wird die gespeicherte Kette immer aufgefangen.
function einreihen (fn) {
  const lauf = kette.then(() => fn())
  kette = lauf.catch(() => {})
  return lauf
}

async function abstandEinhalten () {
  const warten = naechsterSlot - Date.now()
  if (warten > 0) await schlafen(warten)
  naechsterSlot = Date.now() + MIN_ABSTAND_MS
}

async function einmalHolen (url) {
  if (typeof fetch !== 'function') {
    throw new Error('fetch fehlt (Node 18 oder neuer nötig)')
  }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    anfragenGesamt++
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: ctrl.signal
    })
    let body = null
    try {
      body = await res.json()
    } catch {
      body = null
    }
    return { status: res.status, retryAfter: res.headers.get('retry-after'), body }
  } finally {
    clearTimeout(timer)
  }
}

// Eine Anfrage samt Wiederholungen. Die Wiederholungen bleiben bewusst in
// derselben Warteschlangen-Position: Meldet MusicBrainz 503 (zu viele
// Anfragen), soll der ganze Prozess langsamer werden und nicht die nächste
// Anfrage aus der Schlange sofort hinterherschicken.
async function holeMitWiederholung (url) {
  let letzterFehler = null
  for (let versuch = 0; versuch < MAX_VERSUCHE; versuch++) {
    await abstandEinhalten()
    let antwort
    try {
      antwort = await einmalHolen(url)
    } catch (err) {
      letzterFehler = err
      await schlafen(2000 * 2 ** versuch)
      continue
    }
    const { status } = antwort
    if (status === 200) return antwort.body
    if (status === 404) return null
    if (status === 503 || status === 429 || status === 502 || status === 504) {
      const sek = Number.parseInt(antwort.retryAfter || '', 10)
      const pause = Number.isFinite(sek) && sek > 0
        ? Math.min(sek * 1000, 30000)
        : 2000 * 2 ** versuch
      letzterFehler = new Error(`MusicBrainz HTTP ${status}`)
      await schlafen(pause)
      continue
    }
    const meldung = antwort.body && antwort.body.error ? `: ${antwort.body.error}` : ''
    throw new Error(`MusicBrainz HTTP ${status}${meldung}`)
  }
  const err = new Error(`MusicBrainz nicht erreichbar (${letzterFehler?.message || 'unbekannt'})`)
  err.code = 'musicbrainz_unavailable'
  throw err
}

// GET auf die API. Liefert das JSON oder null bei 404.
async function mbGet (pfad, params = {}) {
  const url = new URL(pfad, API_BASIS)
  for (const [schluessel, wert] of Object.entries(params)) {
    if (Array.isArray(wert)) {
      for (const w of wert) url.searchParams.append(schluessel, w)
    } else if (wert !== undefined && wert !== null) {
      url.searchParams.set(schluessel, wert)
    }
  }
  url.searchParams.set('fmt', 'json')
  if (wartend >= MAX_WARTEND) {
    const err = new Error('Zu viele MusicBrainz-Anfragen in der Warteschlange')
    err.code = 'busy'
    throw err
  }
  wartend++
  try {
    return await einreihen(() => holeMitWiederholung(url.toString()))
  } finally {
    wartend--
  }
}

// ─── Cache ────────────────────────────────────────────────────────────────────

// Einfacher JSON-Cache: { schluessel: { t: Zeitstempel, v: Wert } }, v === null
// bedeutet "bei MusicBrainz nicht gefunden". Netzwerkfehler werden NIE
// gecacht, nur echte Antworten.
function dateiCache (datei) {
  let daten = {}
  try {
    const roh = JSON.parse(fs.readFileSync(datei, 'utf-8'))
    if (roh && typeof roh === 'object' && roh.eintraege && typeof roh.eintraege === 'object') {
      daten = roh.eintraege
    }
  } catch (err) {
    if (err && err.code !== 'ENOENT') {
      console.warn('[musicbrainz] Cache unlesbar, starte leer:', err.message)
    }
  }

  let timer = null
  let schmutzig = false

  function schreiben () {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    if (!schmutzig) return
    schmutzig = false
    try {
      fs.mkdirSync(path.dirname(datei), { recursive: true })
      // Atomar über eine Temp-Datei, damit ein Abbruch mitten im Schreiben
      // (Strg+C im Skript, Neustart des Servers) den Cache nicht zerstört.
      const tmp = `${datei}.${process.pid}.tmp`
      fs.writeFileSync(tmp, JSON.stringify({ version: 1, eintraege: daten }))
      fs.renameSync(tmp, datei)
    } catch (err) {
      console.warn('[musicbrainz] Cache schreiben fehlgeschlagen:', err?.message || err)
    }
  }

  return {
    // { gefunden: bool, wert } ; abgelaufene Einträge gelten als fehlend.
    lesen (schluessel) {
      const e = daten[schluessel]
      if (!e) return { gefunden: false }
      const ttl = e.v === null ? TTL_FEHLT_MS : TTL_TREFFER_MS
      if (Date.now() - e.t > ttl) return { gefunden: false }
      return { gefunden: true, wert: e.v }
    },
    setzen (schluessel, wert) {
      daten[schluessel] = { t: Date.now(), v: wert === undefined ? null : wert }
      schmutzig = true
      if (!timer) {
        timer = setTimeout(schreiben, 3000)
        // Der Timer allein soll ein Skript nicht am Beenden hindern; das
        // Skript ruft am Ende ohnehin flush() auf.
        if (typeof timer.unref === 'function') timer.unref()
      }
    },
    flush: schreiben,
    groesse: () => Object.keys(daten).length
  }
}

// ─── Hilfen für Texte ─────────────────────────────────────────────────────────

// Für Vergleiche: klein, ohne Akzente, ohne Satzzeichen, "&" = "and".
function norm (text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[’'`´]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\u00c0-\uffff]+/g, ' ')
    .trim()
}

// Zusätze wie "(feat. X)", "- Remastered 2011" oder "(Live)" sagen etwas über
// die Spotify-Fassung, gehören aber nicht zum Werktitel. Für die Suche und den
// Titelvergleich fliegen sie raus.
const ZUSATZ_WOERTER = /\b(feat|ft|featuring|with|remaster|remastered|live|version|edit|mix|remix|mono|stereo|from|deluxe|bonus|single|radio|anniversary|re-?recorded|taylor)/i

function titelKern (titel) {
  let t = String(titel || '').split(';')[0].trim()
  // " - Zusatz" am Ende (Spotify-Schreibweise)
  const strich = t.match(/^(.*?)\s+-\s+(.*)$/)
  if (strich && ZUSATZ_WOERTER.test(strich[2])) t = strich[1]
  // Klammerzusätze mit Schlüsselwörtern
  t = t.replace(/\s*[([]([^)\]]*)[)\]]/g, (ganz, innen) => (ZUSATZ_WOERTER.test(innen) ? '' : ganz))
  return t.trim() || String(titel || '').trim()
}

function lucene (text) {
  // Innerhalb eines Phrasen-Ausdrucks müssen nur " und \ maskiert werden.
  return String(text || '').replace(/[\\"]/g, (z) => `\\${z}`)
}

function jahrAus (datum) {
  const m = String(datum || '').match(/^(\d{4})/)
  return m ? Number.parseInt(m[1], 10) : null
}

// Hauptjahr eines Feldes wie "1975;2011" (erste Variante).
function hauptjahr (wert) {
  if (typeof wert === 'number') return Number.isInteger(wert) && wert > 0 ? wert : null
  const erste = String(wert ?? '').split(/[;|]/)[0] || ''
  const m = erste.match(/(\d{4})/)
  return m ? Number.parseInt(m[1], 10) : null
}

// Spotify-ID aus ID, URI oder URL (wie extractTrackId im Client).
function spotifyIdAus (wert) {
  const v = String(wert || '').trim()
  if (!v) return ''
  const uri = v.match(/^spotify:track:([A-Za-z0-9]+)$/i)
  if (uri) return uri[1]
  const url = v.match(/\/track\/([A-Za-z0-9]+)(?:[/?#]|$)/i)
  if (url) return url[1]
  return /^[A-Za-z0-9]{22}$/.test(v) ? v : ''
}

// ─── Aufnahmen auswerten ──────────────────────────────────────────────────────

// Kompakte Fassung einer Aufnahme, egal ob aus Lookup, ISRC- oder Suchantwort.
// Nur das landet im Cache, nicht die teils sehr großen Rohantworten.
function aufnahmeKompakt (rec) {
  const releases = Array.isArray(rec.releases) ? rec.releases : []
  const zaehler = { gesamt: releases.length, live: 0, compilation: 0, remix: 0, offiziell: 0 }
  let fruehestes = null
  for (const rel of releases) {
    const rg = rel['release-group'] || {}
    const sek = (rg['secondary-types'] || []).map((s) => String(s).toLowerCase())
    if (sek.includes('live')) zaehler.live++
    if (sek.includes('compilation')) zaehler.compilation++
    if (sek.includes('remix')) zaehler.remix++
    if (String(rel.status || '').toLowerCase() === 'official') zaehler.offiziell++
    const d = rel.date || rg['first-release-date']
    if (d && (!fruehestes || d < fruehestes)) fruehestes = d
  }
  const werkAttribute = new Set()
  for (const rel of rec.relations || []) {
    if (rel['target-type'] === 'work' || rel.work) {
      for (const a of rel.attributes || []) werkAttribute.add(String(a).toLowerCase())
    }
  }
  // Werke (Kompositionen), die diese Aufnahme einspielt. Nur gesetzt, wenn die
  // Antwort Beziehungen enthält (Lookup mit inc=work-rels); ISRC- und
  // Suchantworten haben keine, dann bleibt das Feld weg und wird bei Bedarf
  // eigens nachgeladen (siehe werkeDerAufnahme).
  const werke = Array.isArray(rec.relations)
    ? [...new Set(rec.relations
        .filter((r) => (r['target-type'] === 'work' || r.work) && r.type === 'performance' && r.work?.id)
        .map((r) => r.work.id))]
    : undefined
  const credits = (rec['artist-credit'] || []).map((c) => ({
    mbid: c.artist?.id || null,
    name: c.artist?.name || c.name || '',
    credited: c.name || c.artist?.name || '',
    type: c.artist?.type || null,
    joinphrase: c.joinphrase || ''
  }))
  return {
    mbid: rec.id,
    title: rec.title || '',
    disambiguation: rec.disambiguation || '',
    // Das erste Veröffentlichungsdatum der Aufnahme; fehlt es, das früheste
    // Datum unter den mitgelieferten Releases.
    firstDate: rec['first-release-date'] || fruehestes || null,
    credits,
    releases: zaehler,
    werkAttribute: [...werkAttribute],
    werke
  }
}

function creditText (credits) {
  return credits.map((c) => `${c.credited}${c.joinphrase}`).join('').trim()
}

const RE_LIVE_TITEL = /(\s-\s|[([])[^)\]]*\blive\b/i
const RE_REMASTER = /remaster/i
// Bewusst ohne bloßes "Mix": "Mono Mix"/"Stereo Mix" sind bei älteren Songs
// übliche Bezeichnungen der Originalfassung, kein Remix.
const RE_REMIX = /\bre-?mix|\brmx\b/i
const RE_RERECORD = /re-?record|taylor['’]s version|neuaufnahme|neu eingespielt/i

// Merkmale aus einem Spotify-Titel (sagt etwas über genau diese Fassung).
function titelMerkmale (titel) {
  const t = String(titel || '')
  const m = new Set()
  if (RE_LIVE_TITEL.test(t)) m.add('live')
  if (RE_REMASTER.test(t)) m.add('remaster')
  if (RE_REMIX.test(t)) m.add('remix')
  if (RE_RERECORD.test(t)) m.add('rerecording')
  if (/[([-]\s*[^)\]]*\bcover\b/i.test(t)) m.add('cover')
  return m
}

// Merkmale einer MusicBrainz-Aufnahme. Live/Compilation/Remix aus den
// Release-Groups gelten nur, wenn ALLE bekannten Releases so eingeordnet sind:
// Fast jede Studioaufnahme taucht irgendwann auch auf einer Compilation auf,
// das sagt über die Aufnahme selbst nichts.
function aufnahmeMerkmale (a) {
  const m = titelMerkmale(a.title)
  const dis = String(a.disambiguation || '')
  if (/\blive\b/i.test(dis)) m.add('live')
  if (/\bcover\b/i.test(dis)) m.add('cover')
  if (RE_REMASTER.test(dis)) m.add('remaster')
  if (RE_REMIX.test(dis)) m.add('remix')
  if (RE_RERECORD.test(dis)) m.add('rerecording')
  for (const attr of a.werkAttribute || []) {
    if (attr === 'live') m.add('live')
    if (attr === 'cover') m.add('cover')
  }
  const r = a.releases || {}
  if (r.gesamt > 0) {
    if (r.live === r.gesamt) m.add('live')
    if (r.compilation === r.gesamt) m.add('compilation')
    if (r.remix === r.gesamt) m.add('remix')
  }
  return m
}

const PROBLEM_MERKMALE = ['live', 'remix', 'rerecording', 'cover']

// Bei diesen Merkmalen ist die gefundene Aufnahme womöglich nicht die
// Originalaufnahme, sondern ein eigens erfasstes Remaster, eine Neuaufnahme
// oder eine Fassung, die es nur auf Compilations gibt. Dann wird zusätzlich
// nach der ursprünglichen Studioaufnahme gesucht (originalFinden).
const ORIGINAL_SUCHEN_MERKMALE = ['remaster', 'rerecording', 'compilation']
const RE_FASSUNG = /\bversion\b|re-?record|remaster/i

// Was bei der Suche nach dem Original NICHT als Original zählt, erkannt an
// Titel oder Zusatz (disambiguation) einer Aufnahme.
const RE_KEIN_ORIGINAL = /\b(live|cover|re-?mix(ed)?|rmx|demo|instrumental|karaoke|acoustic|akustik|unplugged|remaster(ed)?|re-?record(ed|ing)?)\b|taylor['’]s version|neuaufnahme/i
// Dasselbe für die Attribute der Werk-Beziehung (MusicBrainz-Vokabular).
const WERK_ATTRIBUTE_KEIN_ORIGINAL = new Set(['live', 'cover', 'partial', 'medley', 'instrumental', 'karaoke'])

function keinOriginal (titel, zusatz) {
  return RE_KEIN_ORIGINAL.test(String(titel || '')) || RE_KEIN_ORIGINAL.test(String(zusatz || ''))
}

// Reihenfolge der Kandidaten: erst saubere Fassungen (nicht live/Remix/
// Neuaufnahme/Cover), dann mit offiziellem Release, dann das früheste Datum.
function vergleicheAufnahmen (a, b) {
  const sauber = (x) => (PROBLEM_MERKMALE.some((f) => aufnahmeMerkmale(x).has(f)) ? 1 : 0)
  const offiziell = (x) => (x.releases && x.releases.offiziell > 0 ? 0 : 1)
  const datum = (x) => x.firstDate || '9999'
  return (sauber(a) - sauber(b)) ||
    (offiziell(a) - offiziell(b)) ||
    (datum(a) < datum(b) ? -1 : datum(a) > datum(b) ? 1 : 0)
}

// Für Suchtreffer: exakter Titel zuerst, dann saubere Fassung mit
// offiziellem Release, dann die Aufnahme mit den MEISTEN offiziellen Releases
// und erst danach das Datum. Nur nach dem frühesten Datum zu gehen, griffe zu
// oft daneben: Demos und Vorab-Fassungen ("Mr. Brightside" hat zwei von 2001
// mit je einem Release) sind früher erschienen als die Aufnahme, die alle
// kennen. Die bekannte Aufnahme steckt dagegen auf Dutzenden Releases.
function vergleicheSuchtreffer (a, b) {
  const sauber = (x) => (PROBLEM_MERKMALE.some((f) => aufnahmeMerkmale(x).has(f)) ? 1 : 0)
  const offiziell = (x) => (x.releases && x.releases.offiziell) || 0
  const datum = (x) => x.firstDate || '9999'
  return (Number(!!b.exakt) - Number(!!a.exakt)) ||
    (sauber(a) - sauber(b)) ||
    (Number(offiziell(b) > 0) - Number(offiziell(a) > 0)) ||
    (offiziell(b) - offiziell(a)) ||
    (datum(a) < datum(b) ? -1 : datum(a) > datum(b) ? 1 : 0)
}

function ensembleAus (credits, typ) {
  if (credits && credits.length > 1) return 'Band'
  if (typ === 'Person' || typ === 'Character') return 'Solo'
  if (typ === 'Group' || typ === 'Orchestra' || typ === 'Choir') return 'Band'
  return null
}

// ─── Instanz mit eigenem Cache ────────────────────────────────────────────────

function createMusicBrainz ({ cacheFile } = {}) {
  if (!cacheFile) throw new Error('cacheFile fehlt')
  const cache = dateiCache(cacheFile)
  // Gleiche Abfragen, die gerade laufen, nur einmal stellen (zwei Nutzer
  // prüfen dieselbe Version, oder ein Deck enthält denselben Song doppelt).
  const laufend = new Map()

  async function gecacht (schluessel, holen) {
    const c = cache.lesen(schluessel)
    if (c.gefunden) return c.wert
    if (laufend.has(schluessel)) return laufend.get(schluessel)
    const p = (async () => {
      const wert = await holen()
      cache.setzen(schluessel, wert === undefined ? null : wert)
      return wert === undefined ? null : wert
    })()
    laufend.set(schluessel, p)
    try {
      return await p
    } finally {
      laufend.delete(schluessel)
    }
  }

  // Spotify-Links in einem Rutsch auflösen. Der URL-Endpunkt nimmt mehrere
  // resource-Parameter an; so kostet ein ganzes Deck nur wenige Anfragen statt
  // einer pro Song. Ergebnis landet unter "spotify:<id>" im Cache.
  async function prefetchSpotify (ids) {
    const offen = [...new Set((ids || []).map(spotifyIdAus).filter(Boolean))]
      .filter((id) => !cache.lesen(`spotify:${id}`).gefunden && !laufend.has(`spotify:${id}`))
    for (let i = 0; i < offen.length; i += 50) {
      const block = offen.slice(i, i + 50)
      const urls = block.map((id) => `https://open.spotify.com/track/${id}`)
      const antwort = await mbGet('url', { resource: urls, inc: 'recording-rels' })
      // Ein einzelner Link kommt ohne "urls"-Hülle zurück.
      const liste = antwort ? (Array.isArray(antwort.urls) ? antwort.urls : [antwort]) : []
      const treffer = new Map()
      for (const u of liste) {
        const m = String(u.resource || '').match(/\/track\/([A-Za-z0-9]+)/)
        if (!m) continue
        const mbids = (u.relations || [])
          .filter((r) => r['target-type'] === 'recording' && r.recording?.id)
          .map((r) => r.recording.id)
        if (mbids.length) treffer.set(m[1], mbids)
      }
      for (const id of block) cache.setzen(`spotify:${id}`, treffer.get(id) || null)
    }
  }

  async function spotifyAufnahmen (id) {
    const schluessel = `spotify:${id}`
    if (!cache.lesen(schluessel).gefunden) await prefetchSpotify([id])
    const c = cache.lesen(schluessel)
    return c.gefunden ? c.wert : null
  }

  function aufnahmeLaden (mbid) {
    return gecacht(`rec:${mbid}`, async () => {
      const rec = await mbGet(`recording/${encodeURIComponent(mbid)}`, {
        inc: 'artist-credits+releases+release-groups+work-rels'
      })
      return rec ? aufnahmeKompakt(rec) : null
    })
  }

  function isrcLaden (isrc) {
    const sauber = String(isrc || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase()
    if (!/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(sauber)) return Promise.resolve(null)
    return gecacht(`isrc:${sauber}`, async () => {
      // Für den ISRC-Endpunkt sind release-groups/work-rels nicht erlaubt;
      // Künstlertyp und erstes Datum kommen aber mit.
      const antwort = await mbGet(`isrc/${sauber}`, { inc: 'artist-credits' })
      const recs = (antwort?.recordings || []).map(aufnahmeKompakt)
      if (!recs.length) return null
      recs.sort(vergleicheAufnahmen)
      return recs[0]
    })
  }

  // Suche nach Künstler + Titel. Gewählt wird unter den Treffern mit Score
  // >= 90, deren Künstler und Titel zu unserem passen, die saubere Fassung,
  // die am häufigsten offiziell veröffentlicht wurde (siehe
  // vergleicheSuchtreffer). Ihr erstes Datum ist das Jahr des Songs.
  function suchen (titel, kuenstler) {
    const kern = titelKern(titel)
    const kuenstlerVoll = String(kuenstler || '').split(';')[0].trim()
    const schluessel = `search:${norm(kuenstlerVoll)}|${norm(kern)}`
    return gecacht(schluessel, async () => {
      const versuche = [kuenstlerVoll]
      // "A, B" bzw. "A feat. B": falls die volle Zeichenkette nichts findet,
      // mit dem ersten Namen weiterversuchen. Bandnamen mit Komma ("Crosby,
      // Stills, Nash & Young") werden so trotzdem zuerst vollständig gesucht.
      const erster = kuenstlerVoll.split(/\s*,\s*|\s+feat\.?\s+|\s+ft\.?\s+|\s+featuring\s+/i)[0]
      if (erster && erster !== kuenstlerVoll) versuche.push(erster)

      const titelNorm = norm(kern)
      const teileNorm = new Set(
        String(kuenstler || '').split(/;|,|\s+&\s+|\s+feat\.?\s+|\s+ft\.?\s+/i).map(norm).filter(Boolean)
      )
      teileNorm.add(norm(kuenstlerVoll))

      const auswerten = (antwort, ziel) => {
        for (const rec of antwort?.recordings || []) {
          if (Number(rec.score) < 90 || ziel.has(rec.id)) continue
          const a = aufnahmeKompakt(rec)
          const recTitel = norm(titelKern(a.title))
          const titelPasst = recTitel === titelNorm ||
            (recTitel.length > 3 && titelNorm.length > 3 && (recTitel.includes(titelNorm) || titelNorm.includes(recTitel)))
          const kuenstlerPasst = norm(creditText(a.credits)) === norm(kuenstlerVoll) ||
            a.credits.some((c) => teileNorm.has(norm(c.name)) || teileNorm.has(norm(c.credited)))
          if (!titelPasst || !kuenstlerPasst) continue
          a.exakt = recTitel === titelNorm
          ziel.set(rec.id, a)
        }
      }

      for (const k of versuche) {
        const basis = `recording:"${lucene(kern)}" AND artist:"${lucene(k)}"`
        const kandidaten = new Map()
        const erste = await mbGet('recording', { query: basis, limit: 100 })
        auswerten(erste, kandidaten)
        if (!kandidaten.size) continue
        // Bekannte Songs haben bei MusicBrainz oft weit über 100 Aufnahmen
        // (Bootlegs, Live-Mitschnitte). Die Suche liefert sie in beliebiger
        // Reihenfolge, die eigentliche Studioaufnahme kann also fehlen (so bei
        // "Juke Box Hero": 90 Treffer, die 1981er Albumaufnahme nicht unter
        // den ersten 40). Dann ein zweites Mal nur nach Aufnahmen suchen, die
        // nicht später erschienen sind als der bisher beste Kandidat.
        const anzahl = Number(erste?.count) || 0
        if (anzahl > (erste?.recordings || []).length) {
          const bisher = [...kandidaten.values()].sort(vergleicheSuchtreffer)[0]
          const grenze = jahrAus(bisher.firstDate) || new Date().getFullYear()
          const zweite = await mbGet('recording', {
            query: `${basis} AND firstreleasedate:[* TO ${grenze}-12-31]`,
            limit: 100
          })
          auswerten(zweite, kandidaten)
        }
        const beste = [...kandidaten.values()].sort(vergleicheSuchtreffer)[0]
        delete beste.exakt
        return beste
      }
      return null
    })
  }

  // Künstlertyp per MBID (Suchergebnisse liefern ihn nicht mit). Eigener
  // Cache-Bereich, Künstler wiederholen sich in den Decks sehr oft.
  function kuenstlerPerMbid (mbid) {
    return gecacht(`artist:${mbid}`, async () => {
      const a = await mbGet(`artist/${encodeURIComponent(mbid)}`)
      return a ? { mbid: a.id, name: a.name || '', type: a.type || null } : null
    })
  }

  // ─── Originalaufnahme ───────────────────────────────────────────────────────

  // Werk-IDs einer Aufnahme. Liegt die Aufnahme schon mit Werken vor (Lookup
  // mit work-rels), kostet das nichts; sonst eine Anfrage, eigens gecacht.
  // Ältere Cache-Einträge von "rec:" haben das Feld noch nicht und landen
  // ebenfalls hier, statt den ganzen Cache ungültig zu machen.
  async function werkeDerAufnahme (aufnahme) {
    if (Array.isArray(aufnahme.werke)) return aufnahme.werke
    const werke = await gecacht(`werke:${aufnahme.mbid}`, async () => {
      const rec = await mbGet(`recording/${encodeURIComponent(aufnahme.mbid)}`, { inc: 'work-rels' })
      return rec ? (aufnahmeKompakt(rec).werke || []) : []
    })
    return Array.isArray(werke) ? werke : []
  }

  // Aufnahmen eines Werks durch einen Künstler, die als Original infrage
  // kommen (keine Live-, Cover-, Teil-, Medley-, Instrumental- oder
  // Karaoke-Fassung). Der Werk-Lookup liefert alle Aufnahmen in einer
  // Antwort (bei "Bohemian Rhapsody" rund 460), aber ohne Datum; die Daten
  // kommen aus der Suche in originalFinden. Gecacht pro Werk und Künstler,
  // nur die MBIDs, nicht die große Rohantwort.
  function werkAufnahmen (werkId, artistMbid) {
    return gecacht(`werk:${werkId}|${artistMbid}`, async () => {
      const werk = await mbGet(`work/${encodeURIComponent(werkId)}`, { inc: 'recording-rels+artist-credits' })
      if (!werk) return []
      const mbids = []
      for (const rel of werk.relations || []) {
        const rec = rel.recording
        if (rel['target-type'] !== 'recording' || !rec?.id) continue
        if (rel.type && rel.type !== 'performance') continue
        const erster = (rec['artist-credit'] || [])[0]
        if (erster?.artist?.id !== artistMbid) continue
        const attribute = (rel.attributes || []).map((a) => String(a).toLowerCase())
        if (attribute.some((a) => WERK_ATTRIBUTE_KEIN_ORIGINAL.has(a))) continue
        if (keinOriginal(rec.title, rec.disambiguation)) continue
        mbids.push(rec.id)
      }
      return mbids
    })
  }

  // Sucht die ursprüngliche Studioaufnahme zu einer Aufnahme, die selbst ein
  // Remaster, eine Neuaufnahme oder eine reine Compilation-Fassung ist.
  // Ergebnis: { year, mbid, title }, year null, wenn es nichts Früheres gibt.
  //
  // Ablauf, auf wenige Anfragen getrimmt:
  //   1. Suche nach Aufnahmen desselben Künstlers (MBID) mit demselben
  //      Kerntitel, die VOR der gefundenen erschienen sind. Gibt es keine, ist
  //      die gefundene schon die früheste, und es bleibt bei einer Anfrage.
  //   2. Sonst die Werke der Aufnahme holen und nur Kandidaten gelten lassen,
  //      die dasselbe Werk einspielen und dort nicht als live, Cover usw.
  //      geführt sind. Hat die Aufnahme kein Werk, entscheidet der Titel.
  //   3. Unter den verbliebenen zählt das früheste Datum.
  function originalFinden (aufnahme) {
    const artistMbid = aufnahme.credits[0]?.mbid
    if (!artistMbid || !aufnahme.mbid) return Promise.resolve(null)
    return gecacht(`orig:${aufnahme.mbid}`, async () => {
      const leer = { year: null, mbid: null, title: null }
      const kern = titelKern(aufnahme.title)
      const kernNorm = norm(kern)
      const jahr = jahrAus(aufnahme.firstDate)
      let query = `recording:"${lucene(kern)}" AND arid:${artistMbid} AND NOT comment:live`
      if (jahr) query += ` AND firstreleasedate:[* TO ${jahr - 1}-12-31]`
      const antwort = await mbGet('recording', { query, limit: 100 })
      const kandidaten = (antwort?.recordings || [])
        .map(aufnahmeKompakt)
        .filter((a) => a.mbid !== aufnahme.mbid && a.firstDate && a.credits[0]?.mbid === artistMbid)
        .filter((a) => !keinOriginal(a.title, a.disambiguation))
        .filter((a) => !jahr || (jahrAus(a.firstDate) && jahrAus(a.firstDate) < jahr))
      if (!kandidaten.length) return leer

      const werke = (await werkeDerAufnahme(aufnahme)).slice(0, 2)
      let passend
      if (werke.length) {
        const erlaubt = new Set()
        for (const w of werke) {
          for (const id of await werkAufnahmen(w, artistMbid) || []) erlaubt.add(id)
        }
        passend = kandidaten.filter((a) => erlaubt.has(a.mbid))
      } else {
        passend = kandidaten.filter((a) => norm(titelKern(a.title)) === kernNorm)
      }
      if (!passend.length) return leer
      passend.sort((a, b) => (a.firstDate < b.firstDate ? -1 : a.firstDate > b.firstDate ? 1 : 0))
      const o = passend[0]
      return { year: jahrAus(o.firstDate), mbid: o.mbid, title: o.title }
    })
  }

  function originalNoetig (aufnahme, merkmale) {
    if (ORIGINAL_SUCHEN_MERKMALE.some((f) => merkmale.has(f))) return true
    return RE_FASSUNG.test(aufnahme.title) || RE_FASSUNG.test(aufnahme.disambiguation)
  }

  async function ergebnisBauen (aufnahme, matchedBy, eingabeTitel) {
    const merkmale = aufnahmeMerkmale(aufnahme)
    // Zusätze im Spotify-Titel beschreiben genau die Fassung im Deck, auch
    // wenn die Suche die Studiofassung gefunden hat.
    for (const f of titelMerkmale(eingabeTitel)) merkmale.add(f)
    const erster = aufnahme.credits[0] || null
    let typ = erster?.type || null
    if (erster?.mbid && !typ) {
      const a = await kuenstlerPerMbid(erster.mbid)
      typ = a?.type || null
    }
    // Nur für verdächtige Fassungen nach dem Original suchen, alle anderen
    // kosten keine zusätzliche Anfrage.
    const firstYear = jahrAus(aufnahme.firstDate)
    const originalFelder = { originalYear: null, originalMbid: null, originalTitle: null }
    if (originalNoetig(aufnahme, merkmale)) {
      const o = await originalFinden(aufnahme)
      if (o && o.year && o.year !== firstYear) {
        originalFelder.originalYear = o.year
        originalFelder.originalMbid = o.mbid
        originalFelder.originalTitle = o.title
      }
    }
    return {
      matchedBy,
      mbid: aufnahme.mbid,
      title: aufnahme.title,
      artist: creditText(aufnahme.credits),
      firstYear,
      flags: [...merkmale].sort(),
      artistMbid: erster?.mbid || null,
      artistType: typ,
      ensemble: ensembleAus(aufnahme.credits, typ),
      ...originalFelder
    }
  }

  function leeresErgebnis (eingabeTitel) {
    return {
      matchedBy: null,
      mbid: null,
      title: null,
      artist: null,
      firstYear: null,
      flags: [...titelMerkmale(eingabeTitel)].sort(),
      artistMbid: null,
      artistType: null,
      ensemble: null,
      originalYear: null,
      originalMbid: null,
      originalTitle: null
    }
  }

  /**
   * Einen Song bei MusicBrainz nachschlagen.
   * Reihenfolge: ISRC, dann Spotify-Link, dann Suche nach Künstler + Titel.
   * Wirft nur bei Netzwerk-/Serverfehlern; "nicht gefunden" ist matchedBy null.
   */
  async function lookupTrack ({ isrc, spotifyId, title, artist } = {}) {
    if (isrc) {
      const a = await isrcLaden(isrc)
      if (a) return ergebnisBauen(a, 'isrc', title)
    }
    const sid = spotifyIdAus(spotifyId)
    if (sid) {
      const mbids = await spotifyAufnahmen(sid)
      if (mbids && mbids.length) {
        const aufnahmen = []
        for (const mbid of mbids.slice(0, 3)) {
          const a = await aufnahmeLaden(mbid)
          if (a) aufnahmen.push(a)
        }
        if (aufnahmen.length) {
          aufnahmen.sort(vergleicheAufnahmen)
          return ergebnisBauen(aufnahmen[0], 'spotify', title)
        }
      }
    }
    if (title && artist) {
      const a = await suchen(title, artist)
      if (a) return ergebnisBauen(a, 'search', title)
    }
    return leeresErgebnis(title)
  }

  function kuenstlerSuchen (name) {
    return gecacht(`artistname:${norm(name)}`, async () => {
      const antwort = await mbGet('artist', { query: `artist:"${lucene(name)}"`, limit: 10 })
      const kandidaten = (antwort?.artists || []).filter((a) => Number(a.score) >= 95)
      if (!kandidaten.length) return null
      const ziel = norm(name)
      const exakt = kandidaten.find((a) => norm(a.name) === ziel) ||
        kandidaten.find((a) => (a.aliases || []).some((al) => norm(al.name) === ziel))
      const a = exakt || kandidaten[0]
      return { mbid: a.id, name: a.name || '', type: a.type || null }
    })
  }

  /**
   * Künstler per Name: { mbid, name, type, ensemble, multi } oder null.
   * Mehrere Beteiligte ("A;B", oder "A, B" bzw. "A feat. B", wenn der volle
   * Name kein eigener Künstler ist) zählen wie in unserer CSV als Band.
   */
  async function lookupArtist (name) {
    const roh = String(name || '').trim()
    if (!roh) return null
    const varianten = roh.split(';').map((s) => s.trim()).filter(Boolean)
    if (varianten.length > 1) {
      const erster = await kuenstlerSuchen(varianten[0])
      return { mbid: erster?.mbid || null, name: roh, type: erster?.type || null, ensemble: 'Band', multi: true }
    }
    const voll = await kuenstlerSuchen(roh)
    if (voll) return { ...voll, ensemble: ensembleAus(null, voll.type), multi: false }
    const teile = roh.split(/\s*,\s*|\s+&\s+|\s+feat\.?\s+|\s+ft\.?\s+|\s+featuring\s+|\s+x\s+/i).filter(Boolean)
    if (teile.length > 1) {
      const erster = await kuenstlerSuchen(teile[0])
      return { mbid: erster?.mbid || null, name: roh, type: erster?.type || null, ensemble: 'Band', multi: true }
    }
    return null
  }

  return {
    lookupTrack,
    lookupArtist,
    prefetchSpotify,
    flush: () => cache.flush(),
    cacheSize: () => cache.groesse()
  }
}

// ─── Standard-Instanz für den Server ──────────────────────────────────────────

let standard = null
function standardInstanz () {
  if (!standard) {
    // Erst hier laden: dataDir legt beim Import DATA_DIR an, das braucht das
    // Skript mit eigenem Cache-Pfad nicht.
    const { dataPath } = require('./dataDir')
    standard = createMusicBrainz({ cacheFile: dataPath('musicbrainz-cache.json') })
  }
  return standard
}

module.exports = {
  USER_AGENT,
  createMusicBrainz,
  lookupTrack: (track) => standardInstanz().lookupTrack(track),
  lookupArtist: (name) => standardInstanz().lookupArtist(name),
  prefetchSpotify: (ids) => standardInstanz().prefetchSpotify(ids),
  flushCache: () => { if (standard) standard.flush() },
  requestCount: () => anfragenGesamt,
  hauptjahr,
  spotifyIdAus,
  titelKern
}
