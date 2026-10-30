// ── Songs-Ordner mit den mitgelieferten Daten (Seed) abgleichen ────────────
// Bis 1.0.10 hat die App bei jedem Start die Standard-Dateien im Songs-Ordner
// mit dem Seed überschrieben. Der Songs-Ordner-Dialog lädt aber ausdrücklich
// zum Bearbeiten ein, eigene Änderungen an Standard-Dateien gingen so beim
// nächsten Start verloren.
//
// Jetzt führt der Ordner ein Manifest (.hitster-seed.json) mit dem Hash des
// zuletzt geseedeten Inhalts je Datei bzw. je Standard-Abschnitt der
// Metadaten-CSV. Beim Start und beim Ordnerwechsel gilt:
//   - Fehlt eine Datei oder ein Abschnitt, wird er angelegt.
//   - Entspricht der Inhalt noch dem zuletzt geseedeten (also vom Nutzer
//     unverändert), wird er durch den neuen Seed ersetzt.
//   - Sonst bleibt er, wie er ist, und landet einmal im Log.
// Ordner aus der Zeit vor dem Manifest: Eine Datei gilt als unverändert, wenn
// sie einem jemals ausgelieferten Seed gleicht (aktueller Seed oder einer aus
// song-seed-legacy.js), sonst als vom Nutzer geändert.
//
// Zeilenenden: Gehasht wird der Rohinhalt. Text zusätzlich mit LF statt CRLF,
// damit eine Datei, die sich nur in den Zeilenenden unterscheidet, als
// unverändert gilt (der Windows-Build bringt den Seed mit CRLF mit, ältere
// Versionen haben die CSV gemischt geschrieben, Editoren stellen gern um).
//
// Bewusst ohne Electron-Abhängigkeit, damit sich die Logik mit Node allein
// testen lässt.
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { LEGACY_SEED_HASHES } from './song-seed-legacy.js'

export const METADATA_CSV = 'hitster-song-metadata.csv'
export const EDITIONS_JSON = 'editions.json'
export const SEED_MANIFEST = '.hitster-seed.json'

export function listFiles (dir, ext) {
  try {
    return fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(ext))
  } catch {
    return []
  }
}

const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex')

// Hashes einer Datei. Text bekommt zusätzlich den Hash mit LF-Zeilenenden.
export function fileHashes (buf, isText) {
  const h = { raw: sha256(buf) }
  if (isText) h.lf = sha256(buf.toString('utf-8').replace(/\r\n/g, '\n'))
  return h
}

// Hash eines CSV-Abschnitts (Zeilen ohne \r, Leerzeilen am Ende zählen nicht,
// sie hängen nur davon ab, wo der Abschnitt in der Datei steht).
export function linesHash (lines) {
  const l = lines.slice()
  while (l.length && !l[l.length - 1].trim()) l.pop()
  return { lf: sha256(l.join('\n')) }
}

function sameContent (a, b) {
  if (!a || !b) return false
  if (a.raw && b.raw && a.raw === b.raw) return true
  return !!(a.lf && b.lf && a.lf === b.lf)
}

function matchesLegacy (key, cur) {
  const list = LEGACY_SEED_HASHES[key]
  const h = cur.lf || cur.raw
  return Array.isArray(list) && list.includes(h)
}

// CSV in Kopf + Abschnitte aufteilen. Ein Abschnitt beginnt mit dem Muster
// SEP / Label / SEP (drei aufeinanderfolgende Zeilen). Alles zeilenweise,
// damit sich die Datei aus Kopf und Abschnitten exakt wieder zusammensetzt.
export function splitCsvSections (csvText) {
  const lines = String(csvText || '').split(/\r?\n/)
  const isSep = (s) => /^-{3,}$/.test((s || '').trim())
  const isStart = (idx) => isSep(lines[idx]) && isSep(lines[idx + 2])
  const header = []
  let i = 0
  while (i < lines.length && !isStart(i)) {
    header.push(lines[i]); i++
  }
  const sections = []
  while (i < lines.length) {
    const label = (lines[i + 1] || '').trim()
    let m = i + 3
    while (m < lines.length && !isStart(m)) m++
    sections.push({ label, lines: lines.slice(i, m) })
    i = m
  }
  return { header, sections }
}

// Atomar schreiben: erst in eine Temp-Datei daneben, dann umbenennen. Unter
// Windows kann das Umbenennen scheitern, wenn ein anderes Programm (Editor,
// Virenscanner) das Ziel gerade offen hält. Dann ersatzweise kopieren.
export function writeFileAtomic (dest, data) {
  const tmp = `${dest}.${process.pid}.tmp`
  fs.writeFileSync(tmp, data)
  try {
    fs.renameSync(tmp, dest)
  } catch {
    try {
      fs.copyFileSync(tmp, dest)
    } finally {
      try { fs.unlinkSync(tmp) } catch { /* egal */ }
    }
  }
}

function readManifest (folder) {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(folder, SEED_MANIFEST), 'utf-8'))
    if (data && typeof data === 'object' && data.entries && typeof data.entries === 'object') {
      return data
    }
  } catch { /* fehlt oder kaputt -> wie ein Ordner ohne Manifest */ }
  return null
}

/**
 * Songs-Ordner anlegen und mit dem Seed abgleichen (siehe Kopfkommentar).
 * seed: { base, covers } (Ordner mit .txt/CSV/editions.json bzw. Cover-PNGs)
 * opts: { appVersion, log } (log mit info/warn, Standard: console)
 * Rückgabe: { created, updated, kept } mit den Schlüsseln aus dem Manifest.
 */
export function ensureSeeded (folder, seed, opts = {}) {
  const log = opts.log || console
  const result = { created: [], updated: [], kept: [] }
  try {
    fs.mkdirSync(folder, { recursive: true })
    fs.mkdirSync(path.join(folder, 'covers'), { recursive: true })
  } catch (err) {
    log.warn('[songs] Ordner anlegen fehlgeschlagen:', err?.message || err)
    return result
  }

  const prev = readManifest(folder)
  const prevEntries = prev ? prev.entries : {}
  // Alte Einträge bleiben stehen, bis sie ersetzt werden. So geht der zuletzt
  // geseedete Hash nicht verloren, wenn ein Schreiben scheitert oder eine
  // Datei vom Nutzer geändert ist.
  const entries = { ...prevEntries }

  // Was tun mit einem Eintrag? cur = Hashes des Ordner-Inhalts (null = fehlt).
  const decide = (key, cur, seedHash) => {
    if (!cur) return 'create'
    if (sameContent(cur, seedHash)) return 'same'
    const last = prevEntries[key]
    if (last ? sameContent(cur, last) : matchesLegacy(key, cur)) return 'update'
    return 'keep'
  }
  // Ergebnis festhalten. Bei 'keep' bleibt der zuletzt geseedete Hash stehen,
  // damit die Datei auch beim nächsten Seed als geändert erkannt wird.
  const record = (key, action, seedHash) => {
    if (action === 'keep') {
      result.kept.push(key)
      return
    }
    entries[key] = seedHash
    if (action === 'create') result.created.push(key)
    else if (action === 'update') result.updated.push(key)
  }

  // 1. Ganze Dateien: Link-Listen, editions.json, Cover.
  const files = listFiles(seed.base, '.txt').map((f) => ({ key: f, rel: [f], text: true }))
  if (fs.existsSync(path.join(seed.base, EDITIONS_JSON))) {
    files.push({ key: EDITIONS_JSON, rel: [EDITIONS_JSON], text: true })
  }
  for (const f of listFiles(seed.covers, '.png')) {
    files.push({ key: 'covers/' + f, rel: ['covers', f], src: path.join(seed.covers, f), text: false })
  }
  for (const f of files) {
    const src = f.src || path.join(seed.base, ...f.rel)
    const dest = path.join(folder, ...f.rel)
    let seedBuf
    try {
      seedBuf = fs.readFileSync(src)
    } catch (err) {
      log.warn('[songs] Seed lesen fehlgeschlagen', src, err?.message || err)
      continue
    }
    const seedHash = fileHashes(seedBuf, f.text)
    let cur = null
    if (fs.existsSync(dest)) {
      try {
        cur = fileHashes(fs.readFileSync(dest), f.text)
      } catch (err) {
        // Nicht lesbar: lieber stehen lassen als blind überschreiben.
        log.warn('[songs] Lesen fehlgeschlagen, bleibt unverändert:', dest, err?.message || err)
        continue
      }
    }
    const action = decide(f.key, cur, seedHash)
    if (action === 'create' || action === 'update') {
      try {
        writeFileAtomic(dest, seedBuf)
      } catch (err) {
        log.warn('[songs] Schreiben fehlgeschlagen', dest, err?.message || err)
        continue
      }
    }
    record(f.key, action, seedHash)
  }

  // 2. Metadaten-CSV abschnittsweise. Reihenfolge: Kopf, Standard-Abschnitte
  // in Seed-Reihenfolge, danach alle übrigen Abschnitte aus dem Ordner (eigene
  // Editionen, nicht mehr ausgelieferte Standards, Dubletten) wie vorgefunden.
  // Ins Manifest kommt erst etwas, wenn die Datei geschrieben ist.
  try {
    const seedText = fs.readFileSync(path.join(seed.base, METADATA_CSV), 'utf-8')
    const seedParts = splitCsvSections(seedText)
    const csvPath = path.join(folder, METADATA_CSV)
    const curText = fs.existsSync(csvPath) ? fs.readFileSync(csvPath, 'utf-8') : null
    const pending = []

    if (curText === null) {
      pending.push(['csv:header', 'create', linesHash(seedParts.header)])
      for (const s of seedParts.sections) pending.push(['csv:' + s.label, 'create', linesHash(s.lines)])
      writeFileAtomic(csvPath, seedText)
    } else {
      const curParts = splitCsvSections(curText)
      const out = []

      const headerSeed = linesHash(seedParts.header)
      const headerLeer = !curParts.header.some((l) => l.trim())
      const headerAction = decide('csv:header', headerLeer ? null : linesHash(curParts.header), headerSeed)
      out.push(...(headerAction === 'keep' ? curParts.header : seedParts.header))
      pending.push(['csv:header', headerAction, headerSeed])

      // Je Label der erste Abschnitt im Ordner zählt als der Standard-Abschnitt.
      const rest = curParts.sections.slice()
      for (const s of seedParts.sections) {
        const idx = rest.findIndex((c) => c.label === s.label)
        const cur = idx >= 0 ? rest.splice(idx, 1)[0] : null
        const key = 'csv:' + s.label
        const seedHash = linesHash(s.lines)
        const action = decide(key, cur ? linesHash(cur.lines) : null, seedHash)
        out.push(...(action === 'keep' ? cur.lines : s.lines))
        pending.push([key, action, seedHash])
      }
      for (const c of rest) out.push(...c.lines)
      if (out[out.length - 1] !== '') out.push('')

      // Nur schreiben, wenn sich inhaltlich etwas ändert. Die Zeilenenden der
      // vorhandenen Datei bleiben dabei erhalten.
      const neu = out.join('\n')
      if (neu !== curText.replace(/\r\n/g, '\n')) {
        writeFileAtomic(csvPath, curText.includes('\r\n') ? neu.replace(/\n/g, '\r\n') : neu)
      }
    }
    for (const [key, action, hash] of pending) record(key, action, hash)
  } catch (err) {
    log.warn('[songs] CSV abgleichen fehlgeschlagen:', err?.message || err)
  }

  // 3. Protokoll und Manifest. Übersprungene nur melden, wenn sie neu dazukommen,
  // sonst stünde dieselbe Zeile bei jedem Start im Log.
  const prevKept = new Set(prev && Array.isArray(prev.kept) ? prev.kept : [])
  const neuKept = result.kept.filter((k) => !prevKept.has(k))
  if (neuKept.length) {
    log.info('[songs] Vom Nutzer geändert, Seed nicht übernommen:', neuKept.join(', '))
  }
  if (result.created.length || result.updated.length) {
    log.info(
      `[songs] Seed abgeglichen: ${result.created.length} angelegt, ${result.updated.length} aktualisiert`
    )
  }
  const manifest = {
    version: 1,
    appVersion: opts.appVersion || '',
    entries,
    kept: result.kept
  }
  const manifestText = JSON.stringify(manifest, null, 2) + '\n'
  let alt = ''
  try { alt = fs.readFileSync(path.join(folder, SEED_MANIFEST), 'utf-8') } catch { /* fehlt */ }
  if (manifestText !== alt) {
    try {
      writeFileAtomic(path.join(folder, SEED_MANIFEST), manifestText)
    } catch (err) {
      log.warn('[songs] Seed-Manifest schreiben fehlgeschlagen:', err?.message || err)
    }
  }
  return result
}
