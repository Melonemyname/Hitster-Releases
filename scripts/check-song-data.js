#!/usr/bin/env node
// Prüft die Songdaten der Standard-Decks (und optional eigener Versionen)
// gegen MusicBrainz und schreibt einen Markdown-Bericht.
//
// Aufruf (aus dem Repo-Wurzelordner):
//   node scripts/check-song-data.js [Optionen]
//
// Optionen:
//   --csv <datei>        Metadaten-CSV (Standard: src/assets/songs/hitster-song-metadata.csv)
//   --versions <datei>   JSON mit eigenen Versionen: [{ label, tracks: [{ trackId, title, artist, year }] }]
//   --cache <datei>      Cache-Datei (Standard: ./.musicbrainz-cache.json im aktuellen Ordner)
//   --out <datei>        Bericht (Standard: ./song-data-report.md)
//   --edition <name>     nur diese Edition(en); Teil des Namens genügt, Groß/klein egal
//   --limit <n>          nur die ersten n Songs (zum Ausprobieren)
//
// Der volle Lauf dauert wegen des MusicBrainz-Limits (eine Anfrage pro
// Sekunde) gut eine Stunde oder mehr. Er lässt sich jederzeit mit Control-C
// abbrechen: Cache und ein Zwischenbericht werden dann geschrieben, ein
// erneuter Aufruf macht dort weiter, wo der letzte aufgehört hat.
//
// Die CSV wird nur gelesen, nie verändert.

const fs = require('fs')
const path = require('path')
const { createMusicBrainz, requestCount, hauptjahr, spotifyIdAus } = require('../server/musicbrainz')

// ─── Argumente ────────────────────────────────────────────────────────────────

function argumente (argv) {
  const opt = {
    csv: path.join(__dirname, '..', 'src', 'assets', 'songs', 'hitster-song-metadata.csv'),
    versions: null,
    cache: path.resolve('.musicbrainz-cache.json'),
    out: path.resolve('song-data-report.md'),
    edition: null,
    limit: 0
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const wert = () => {
      const v = argv[++i]
      if (v === undefined) throw new Error(`${a} braucht einen Wert`)
      return v
    }
    if (a === '--csv') opt.csv = path.resolve(wert())
    else if (a === '--versions') opt.versions = path.resolve(wert())
    else if (a === '--cache') opt.cache = path.resolve(wert())
    else if (a === '--out') opt.out = path.resolve(wert())
    else if (a === '--edition') opt.edition = wert()
    else if (a === '--limit') opt.limit = Math.max(0, Number.parseInt(wert(), 10) || 0)
    else if (a === '--help' || a === '-h') {
      console.log(fs.readFileSync(__filename, 'utf-8').split('\n').slice(1, 20).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'))
      process.exit(0)
    } else throw new Error(`Unbekannte Option: ${a}`)
  }
  return opt
}

// ─── CSV lesen (gleiche Regeln wie App und Seed) ──────────────────────────────

// Wie parseCsvLine in src/utils/spotifyCsvService.js: Anführungszeichen
// klammern Felder, "" steht für ein einzelnes Anführungszeichen.
function csvZeile (zeile) {
  const felder = []
  let aktuell = ''
  let inQuotes = false
  for (let i = 0; i < zeile.length; i++) {
    const z = zeile[i]
    if (z === '"') {
      if (inQuotes && zeile[i + 1] === '"') {
        aktuell += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
      continue
    }
    if (z === ',' && !inQuotes) {
      felder.push(aktuell)
      aktuell = ''
      continue
    }
    aktuell += z
  }
  felder.push(aktuell)
  return felder
}

// Abschnitte wie splitCsvSections in src-electron/song-seed.js: Ein
// Abschnitt beginnt mit drei Zeilen Trenner / Name / Trenner.
function csvLesen (datei) {
  const text = fs.readFileSync(datei, 'utf-8').split('\u0000').join('').replace(/^\uFEFF/, '')
  const zeilen = text.split(/\r?\n/)
  const istTrenner = (s) => /^-{3,}$/.test((s || '').trim())
  const kopf = csvZeile(zeilen[0] || '').map((s) => s.trim())
  const spalte = (name) => kopf.indexOf(name)
  const iId = spalte('trackId')
  const iTitel = spalte('title')
  const iKuenstler = spalte('artist')
  const iJahr = spalte('year')
  const iEnsemble = spalte('ensemble')
  // ISRC (seit 1.0.20, optional): sicherste Zuordnung zu MusicBrainz.
  const iIsrc = spalte('isrc')
  if (iId < 0 || iTitel < 0 || iKuenstler < 0 || iJahr < 0) {
    throw new Error('CSV-Kopf unvollständig (trackId,title,artist,year erwartet)')
  }
  const songs = []
  let edition = '(ohne Abschnitt)'
  for (let i = 1; i < zeilen.length; i++) {
    const z = zeilen[i]
    if (istTrenner(z) && istTrenner(zeilen[i + 2])) {
      edition = (zeilen[i + 1] || '').trim()
      i += 2
      continue
    }
    if (!z.trim() || istTrenner(z)) continue
    const f = csvZeile(z)
    const trackId = spotifyIdAus(f[iId]) || String(f[iId] || '').trim()
    const title = String(f[iTitel] || '').trim()
    const artist = String(f[iKuenstler] || '').trim()
    const year = String(f[iJahr] || '').trim()
    if (!trackId || !title || !artist || !year) continue
    songs.push({
      trackId,
      title,
      artist,
      year,
      ensemble: iEnsemble >= 0 ? String(f[iEnsemble] || '').trim() : '',
      isrc: iIsrc >= 0 ? String(f[iIsrc] || '').trim().toUpperCase() : '',
      edition
    })
  }
  return songs
}

function versionenLesen (datei) {
  const daten = JSON.parse(fs.readFileSync(datei, 'utf-8'))
  if (!Array.isArray(daten)) throw new Error('--versions: erwartet ein Array von Versionen')
  const songs = []
  for (const v of daten) {
    const label = `Version: ${String(v?.label || 'ohne Namen').trim()}`
    for (const t of v?.tracks || []) {
      const trackId = spotifyIdAus(t.trackId || t.url) || String(t.trackId || '').trim()
      const title = String(t.title || '').trim()
      const artist = String(t.artist || '').trim()
      if (!trackId || !title || !artist) continue
      songs.push({
        trackId,
        title,
        artist,
        year: String(t.year ?? '').trim(),
        ensemble: String(t.ensemble || '').trim(),
        edition: label
      })
    }
  }
  return songs
}

// ─── Fortschritt ──────────────────────────────────────────────────────────────

function dauer (ms) {
  const s = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h) return `${h} h ${String(m).padStart(2, '0')} min`
  if (m) return `${m} min ${String(s % 60).padStart(2, '0')} s`
  return `${s} s`
}

function fortschrittAnzeige (gesamt) {
  const tty = process.stdout.isTTY
  const breite = String(gesamt).length
  return (n, restSchaetzung, text) => {
    const prozent = gesamt ? ((n / gesamt) * 100).toFixed(1) : '100'
    const zeile = `[${String(n).padStart(breite)}/${gesamt}] ${prozent.padStart(5)} %  noch ca. ${dauer(restSchaetzung)}  ${text}`
    if (tty) {
      const spalten = process.stdout.columns || 120
      process.stdout.write(`\r${zeile.slice(0, spalten - 1).padEnd(spalten - 1)}`)
    } else if (n % 25 === 0 || n === gesamt) {
      console.log(zeile)
    }
  }
}

// ─── Bericht ──────────────────────────────────────────────────────────────────

const md = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
const link = (mbid) => (mbid ? `[MB](https://musicbrainz.org/recording/${mbid})` : '')
const spotify = (id) => `[Spotify](https://open.spotify.com/track/${id})`

function berichtSchreiben (datei, eintraege, info) {
  const mitErgebnis = eintraege.filter((e) => e.ergebnis)
  const gefunden = mitErgebnis.filter((e) => e.ergebnis.matchedBy)
  const zeilen = []
  const tabelle = (kopf, reihen) => {
    if (!reihen.length) {
      zeilen.push('_Keine Einträge._', '')
      return
    }
    zeilen.push(`| ${kopf.join(' | ')} |`, `|${kopf.map(() => '---').join('|')}|`)
    for (const r of reihen) zeilen.push(`| ${r.map(md).join(' | ')} |`)
    zeilen.push('')
  }
  const editionen = (e) => [...e.editionen].join(', ')

  const nachWeg = {}
  for (const e of gefunden) nachWeg[e.ergebnis.matchedBy] = (nachWeg[e.ergebnis.matchedBy] || 0) + 1

  zeilen.push('# Songdaten-Abgleich mit MusicBrainz', '')
  zeilen.push(`Erstellt: ${new Date().toISOString().replace('T', ' ').slice(0, 16)} UTC${info.abgebrochen ? ' (Zwischenstand, Lauf abgebrochen)' : ''}`, '')
  zeilen.push(`- Geprüft: ${mitErgebnis.length} von ${eintraege.length} Songs`)
  zeilen.push(`- Gefunden: ${gefunden.length} (${Object.entries(nachWeg).map(([k, v]) => `${k}: ${v}`).join(', ') || 'keine'})`)
  zeilen.push(`- Nicht gefunden: ${mitErgebnis.length - gefunden.length}`)
  zeilen.push(`- Fehler (beim nächsten Lauf erneut versucht): ${eintraege.filter((e) => e.fehler).length}`)
  zeilen.push(`- Originalaufnahme mit anderem Jahr als unserem: ${gefunden.filter((e) => e.ergebnis.originalDiffers).length}`)
  zeilen.push('')
  zeilen.push('Hinweis: Bei Treffern über die Suche ist das MusicBrainz-Jahr das der passenden Studiofassung mit den meisten offiziellen Releases. ' +
    'Bei Treffern über den Spotify-Link ist es das Jahr genau dieser Aufnahme; ist das ein Remaster oder eine Neuaufnahme, steht das in den Merkmalen. ' +
    'Für solche Fassungen sucht der Abgleich zusätzlich die ursprüngliche Studioaufnahme desselben Künstlers; deren Jahr steht in der Spalte "Original".', '')

  // 1. Jahr weicht ab (von der gefundenen Aufnahme oder vom Original)
  // Sortiert nach der größten Abweichung; maßgeblich ist das Original, wenn es
  // eines gibt.
  const vergleichsjahr = (e) => e.ergebnis.originalYear || e.ergebnis.firstYear
  const jahr = gefunden
    .filter((e) => e.ergebnis.yearDiffers || e.ergebnis.originalDiffers)
    .sort((a, b) => Math.abs(b.unserJahr - vergleichsjahr(b)) - Math.abs(a.unserJahr - vergleichsjahr(a)))
  zeilen.push(`## Jahr weicht ab (${jahr.length})`, '')
  tabelle(
    ['Song', 'Künstler', 'Edition(en)', 'Unser Jahr', 'MB erstes Jahr', 'Original', 'Variante passt', 'Treffer über', 'Merkmale', 'Links'],
    jahr.map((e) => [
      e.title, e.artist, editionen(e), e.year, e.ergebnis.firstYear, e.ergebnis.originalYear ?? '',
      e.jahre.includes(vergleichsjahr(e)) ? 'ja' : '',
      e.ergebnis.matchedBy, e.ergebnis.flags.join(', '),
      `${link(e.ergebnis.mbid)} ${spotify(e.trackId)}` +
        (e.ergebnis.originalMbid ? ` [Original](https://musicbrainz.org/recording/${e.ergebnis.originalMbid})` : '')
    ])
  )

  // 2. Merkmale
  // Auch nicht gefundene Songs, wenn schon der Spotify-Titel "Live" o. ä. sagt.
  const markiert = mitErgebnis
    .filter((e) => e.ergebnis.flags.some((f) => ['live', 'cover', 'rerecording', 'remaster', 'remix'].includes(f)))
  zeilen.push(`## Live, Cover, Neuaufnahme, Remaster, Remix (${markiert.length})`, '')
  tabelle(
    ['Song', 'Künstler', 'Edition(en)', 'Unser Jahr', 'MB erstes Jahr', 'Merkmale', 'Treffer über', 'Links'],
    markiert.map((e) => [
      e.title, e.artist, editionen(e), e.year, e.ergebnis.firstYear ?? '',
      e.ergebnis.flags.join(', '), e.ergebnis.matchedBy || 'nur Titel',
      `${link(e.ergebnis.mbid)} ${spotify(e.trackId)}`
    ])
  )

  // 3. Dubletten: dieselbe Aufnahme unter mehreren Spotify-Links
  const nachMbid = new Map()
  for (const e of gefunden) {
    if (!nachMbid.has(e.ergebnis.mbid)) nachMbid.set(e.ergebnis.mbid, [])
    nachMbid.get(e.ergebnis.mbid).push(e)
  }
  const dubletten = [...nachMbid.entries()].filter(([, l]) => l.length > 1)
  zeilen.push(`## Dieselbe Aufnahme unter mehreren Spotify-Links (${dubletten.length})`, '')
  if (!dubletten.length) zeilen.push('_Keine Einträge._', '')
  for (const [mbid, liste] of dubletten) {
    zeilen.push(`- ${link(mbid)} ${md(liste[0].ergebnis.artist)}: ${md(liste[0].ergebnis.title)}`)
    for (const e of liste) {
      zeilen.push(`  - ${spotify(e.trackId)} \`${e.trackId}\` ${md(e.artist)}: ${md(e.title)} (${md(e.year)}; ${md(editionen(e))})`)
    }
  }
  if (dubletten.length) zeilen.push('')

  // 4. Band/Solo
  const ensemble = gefunden.filter((e) => e.ergebnis.ensemble && e.ensemble !== e.ergebnis.ensemble)
  zeilen.push(`## Band/Solo fehlt oder weicht ab (${ensemble.length})`, '')
  tabelle(
    ['Song', 'Künstler', 'Edition(en)', 'Unsere Angabe', 'MusicBrainz', 'Künstlertyp', 'Links'],
    ensemble.map((e) => [
      e.title, e.artist, editionen(e), e.ensemble || '(leer)', e.ergebnis.ensemble,
      e.ergebnis.artistType || '',
      `${link(e.ergebnis.mbid)} ${spotify(e.trackId)}`
    ])
  )

  // 5. Nicht gefunden
  const fehlt = mitErgebnis.filter((e) => !e.ergebnis.matchedBy)
  zeilen.push(`## Nicht gefunden (${fehlt.length})`, '')
  tabelle(
    ['Song', 'Künstler', 'Edition(en)', 'Unser Jahr', 'Spotify'],
    fehlt.map((e) => [e.title, e.artist, editionen(e), e.year, spotify(e.trackId)])
  )

  const fehler = eintraege.filter((e) => e.fehler)
  if (fehler.length) {
    zeilen.push(`## Fehler bei der Abfrage (${fehler.length})`, '')
    tabelle(['Song', 'Künstler', 'Fehler'], fehler.map((e) => [e.title, e.artist, e.fehler]))
  }

  fs.mkdirSync(path.dirname(datei), { recursive: true })
  fs.writeFileSync(datei, zeilen.join('\n'))
}

// ─── Ablauf ───────────────────────────────────────────────────────────────────

async function main () {
  const opt = argumente(process.argv.slice(2))
  let songs = csvLesen(opt.csv)
  if (opt.versions) songs = songs.concat(versionenLesen(opt.versions))

  if (opt.edition) {
    const filter = opt.edition.toLowerCase()
    songs = songs.filter((s) => s.edition.toLowerCase().includes(filter))
  }

  // Eindeutig nach Spotify-ID; ein Song in mehreren Editionen wird einmal
  // abgefragt, die Editionen werden gesammelt.
  const nachId = new Map()
  for (const s of songs) {
    const vorhanden = nachId.get(s.trackId)
    if (vorhanden) {
      vorhanden.editionen.add(s.edition)
      continue
    }
    nachId.set(s.trackId, {
      ...s,
      editionen: new Set([s.edition]),
      unserJahr: hauptjahr(s.year),
      jahre: String(s.year).split(/[;|]/).map((y) => hauptjahr(y)).filter(Boolean),
      ergebnis: null,
      fehler: null
    })
  }
  let eintraege = [...nachId.values()]
  if (opt.limit) eintraege = eintraege.slice(0, opt.limit)
  if (!eintraege.length) {
    console.error('Keine Songs gefunden (Filter zu eng?).')
    process.exit(1)
  }

  const mb = createMusicBrainz({ cacheFile: opt.cache })
  console.log(`${eintraege.length} Songs, Cache ${opt.cache} (${mb.cacheSize()} Einträge), Bericht ${opt.out}`)

  let abgebrochen = false
  process.on('SIGINT', () => {
    if (abgebrochen) process.exit(130)
    abgebrochen = true
    process.stdout.write('\nAbbruch angefordert, schreibe Cache und Zwischenbericht ...\n')
  })

  const anzeigen = fortschrittAnzeige(eintraege.length)
  // Restzeit: Durchschnitt der Songs, die wirklich Anfragen gebraucht haben.
  // Beim Fortsetzen kommen die schon gecachten Songs zuerst und gehen fast
  // sofort, der Rest braucht dann je Song etwa so lange wie bisher.
  let netzZeit = 0
  let netzSongs = 0
  const BLOCK = 50
  for (let i = 0; i < eintraege.length && !abgebrochen; i++) {
    if (i % BLOCK === 0) {
      try {
        await mb.prefetchSpotify(eintraege.slice(i, i + BLOCK).map((e) => e.trackId))
      } catch (err) {
        // Kein Beinbruch: lookupTrack fragt den Link dann einzeln ab.
        process.stdout.write(`\nSpotify-Vorabfrage fehlgeschlagen: ${err.message}\n`)
      }
    }
    const e = eintraege[i]
    const start = Date.now()
    const vorher = requestCount()
    try {
      const r = await mb.lookupTrack({ isrc: e.isrc || undefined, spotifyId: e.trackId, title: e.title, artist: e.artist })
      e.ergebnis = {
        ...r,
        yearDiffers: !!(e.unserJahr && r.firstYear && e.unserJahr !== r.firstYear),
        originalDiffers: !!(e.unserJahr && r.originalYear && e.unserJahr !== r.originalYear)
      }
    } catch (err) {
      e.fehler = err.message || String(err)
    }
    if (requestCount() > vorher) {
      netzZeit += Date.now() - start
      netzSongs++
    }
    const proSong = netzSongs ? netzZeit / netzSongs : 2500
    anzeigen(i + 1, (eintraege.length - i - 1) * proSong, `${e.artist}: ${e.title}`)
  }
  if (process.stdout.isTTY) process.stdout.write('\n')

  mb.flush()
  berichtSchreiben(opt.out, eintraege, { abgebrochen })
  const geprueft = eintraege.filter((e) => e.ergebnis).length
  console.log(`Fertig: ${geprueft}/${eintraege.length} geprüft, ${requestCount()} Anfragen an MusicBrainz. Bericht: ${opt.out}`)
  if (abgebrochen) process.exit(130)
}

main().catch((err) => {
  console.error(err?.stack || err)
  process.exit(1)
})
