import { app, BrowserWindow, shell, ipcMain, dialog } from 'electron'
import { autoUpdater } from 'electron-updater'
import log from 'electron-log'
import { exec } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'

// needed in case process is undefined under Linux
const platform = process.platform || os.platform()

// ── Persistente Datenablage über Updates hinweg ────────────────────────────
// FRÜHER: Alle App-Daten (Cookies/LocalStorage, Fenster-Settings, Logs)
// landeten „portable-artig" unter `<INSTDIR>\user-data\`. Das hat Serverdaten
// und Login jedes Windows-Update kostet – der NSIS-Silent-Installer räumt
// beim Ersetzen der App-Dateien den User-Data-Ordner im INSTDIR mit ab,
// weil er strukturell zur Installation gehört.
//
// JETZT: Wir belassen `userData` beim Electron-Standard
// (`%APPDATA%\Roaming\Hitster` unter Windows, `~/Library/Application Support`
// unter macOS, `~/.config/Hitster` unter Linux). Der Pfad liegt bewusst
// AUSSERHALB des Installations-Ordners – kein Installer fasst ihn mehr an,
// Server-URL und Login-Token überleben jedes Update.
//
// Migration: einmalig beim ersten Start nach diesem Fix versuchen wir, die
// Daten aus einem eventuell noch vorhandenen `<INSTDIR>\user-data\` in den
// Standard-Pfad zu übernehmen, damit der Nutzer sich nicht noch einmal neu
// einloggen muss. Ist der Standard-Pfad bereits mit Chromium-Daten befüllt,
// lassen wir ihn unangetastet.
try {
  if (app.isPackaged) {
    const execDir = path.dirname(app.getPath('exe'))
    const legacyDir = path.join(execDir, 'user-data')
    const currentDir = app.getPath('userData')
    const legacyHasData = (() => {
      try {
        return fs.existsSync(legacyDir) && fs.readdirSync(legacyDir).length > 0
      } catch {
        return false
      }
    })()
    const currentIsEmpty = (() => {
      try {
        return !fs.existsSync(currentDir) || fs.readdirSync(currentDir).length === 0
      } catch {
        return true
      }
    })()
    if (legacyHasData && currentIsEmpty) {
      fs.mkdirSync(currentDir, { recursive: true })
      // fs.cpSync ist seit Node 16.7 verfügbar; Electron liefert immer neuer.
      fs.cpSync(legacyDir, currentDir, { recursive: true, force: false })
    }
  }
} catch (err) {
  // Fehler nur loggen; App startet weiterhin – die Migration ist rein
  // freundlich, nicht kritisch.
  console.warn('[install] user-data-Migration fehlgeschlagen:', err?.message || err)
}

// electron-updater bekommt einen echten Logger. Ohne das verschluckt der Updater
// Fehler (Download-404, SHA512-Mismatch, blockierter Silent-Install durch
// SmartScreen/Defender) still. Mit electron-log landet alles im
// electron-log-Default-Pfad (`<userData>\logs\main.log`, also unter Windows
// `%APPDATA%\Roaming\Hitster\logs\main.log`). Bei Update-Problemen einfach
// diese Datei anschauen.
log.transports.file.level = 'info'
autoUpdater.logger = log

let mainWindow

// ── Persistente Fenster-Einstellungen ──────────────────────────────────────
// Aktuell nur "immer im Vordergrund" (alwaysOnTop). Bewusst NUR das Hauptfenster
// betroffen – das App-eigene Song-Fenster (Spotify) bleibt normal und darf sich
// über das Hauptfenster legen. Persistiert, damit die Wahl den Neustart übersteht.
const windowSettings = { alwaysOnTop: false }

function settingsPath () {
  return path.join(app.getPath('userData'), 'window-settings.json')
}

function loadWindowSettings () {
  try {
    const data = JSON.parse(fs.readFileSync(settingsPath(), 'utf-8'))
    if (data && typeof data.alwaysOnTop === 'boolean') {
      windowSettings.alwaysOnTop = data.alwaysOnTop
    }
  } catch {
    // Keine/kaputte Datei -> Standardwerte behalten.
  }
}

function saveWindowSettings () {
  try {
    fs.writeFileSync(settingsPath(), JSON.stringify(windowSettings))
  } catch (err) {
    console.warn('[settings] Speichern fehlgeschlagen:', err?.message || err)
  }
}

// ── Songs-Ordner (bearbeitbare Song-Daten) ─────────────────────────────────
// Die App liest Editionen, Link-Listen, Metadaten-CSV und Cover aus einem frei
// wählbaren Ordner. Beim ersten Start wird er mit den mitgelieferten Daten (Seed)
// gefüllt; bei Updates werden die Standard-Dateien überschrieben, während eigene
// (custom) Editionen und deren CSV-Sektionen erhalten bleiben (siehe ensureSeeded).
const METADATA_CSV = 'hitster-song-metadata.csv'
const EDITIONS_JSON = 'editions.json'

let songFolderPath = ''

function songFolderConfigPath () {
  return path.join(app.getPath('userData'), 'song-folder.json')
}

function loadSongFolder () {
  try {
    const data = JSON.parse(fs.readFileSync(songFolderConfigPath(), 'utf-8'))
    if (data && typeof data.path === 'string' && data.path.trim()) {
      songFolderPath = data.path
    }
  } catch { /* keine/kaputte Datei -> Standard unten */ }
  if (!songFolderPath) {
    // Standard: Dokumente/Hitster-Songs, bewusst ausserhalb des Installations-
    // ordners, damit Updates/Deinstallation die Daten nie anfassen.
    songFolderPath = path.join(app.getPath('documents'), 'Hitster-Songs')
  }
  return songFolderPath
}

function saveSongFolder () {
  try {
    fs.writeFileSync(songFolderConfigPath(), JSON.stringify({ path: songFolderPath }))
  } catch (err) {
    console.warn('[songs] Ordner-Pfad speichern fehlgeschlagen:', err?.message || err)
  }
}

// Seed-Quellen: packaged aus resources/song-seed, im Dev direkt aus den Assets.
function resolveSeedDirs () {
  if (app.isPackaged) {
    const base = path.join(process.resourcesPath, 'song-seed')
    return { base, covers: path.join(base, 'covers') }
  }
  const root = app.getAppPath()
  return {
    base: path.join(root, 'src', 'assets', 'songs'),
    covers: path.join(root, 'src', 'assets', 'versions')
  }
}

function listFiles (dir, ext) {
  try {
    return fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(ext))
  } catch {
    return []
  }
}

function copyFileSafe (src, dest) {
  try {
    fs.copyFileSync(src, dest)
  } catch (err) {
    console.warn('[songs] Kopieren fehlgeschlagen', src, '->', dest, err?.message || err)
  }
}

function readSeedManifest (seed) {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(seed.base, EDITIONS_JSON), 'utf-8'))
    return Array.isArray(parsed.editions) ? parsed.editions : []
  } catch {
    return []
  }
}

// CSV in Kopf + Sektionen aufteilen. Eine Sektion beginnt mit dem Muster
// SEP / Label / SEP (drei aufeinanderfolgende Zeilen). block = kompletter Text
// der Sektion inkl. Marker.
function splitCsvSections (csvText) {
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
    sections.push({ label, block: lines.slice(i, m).join('\n') })
    i = m
  }
  return { header: header.join('\n'), sections }
}

// Ordner anlegen und mit dem Seed füllen. Erststart: alles kopieren. Update:
// Standard-Dateien überschreiben, eigene .txt/Cover unangetastet lassen, eigene
// CSV-Sektionen (Label nicht im Standard-Manifest) aus der alten CSV in die neue
// übernehmen. Dopplungen von Metadaten sind egal (Lookup ist global per trackId).
function ensureSeeded (folder) {
  const seed = resolveSeedDirs()
  try {
    fs.mkdirSync(folder, { recursive: true })
    fs.mkdirSync(path.join(folder, 'covers'), { recursive: true })
  } catch (err) {
    console.warn('[songs] Ordner anlegen fehlgeschlagen:', err?.message || err)
    return
  }

  const folderCsvPath = path.join(folder, METADATA_CSV)
  const standardLabels = new Set(readSeedManifest(seed).map((e) => e.label))

  // 1. Eigene CSV-Sektionen aus der bestehenden Folder-CSV sichern.
  let customSectionsText = ''
  if (fs.existsSync(folderCsvPath)) {
    try {
      const { sections } = splitCsvSections(fs.readFileSync(folderCsvPath, 'utf-8'))
      const custom = sections.filter((s) => s.label && !standardLabels.has(s.label))
      if (custom.length) customSectionsText = '\n' + custom.map((s) => s.block).join('\n') + '\n'
    } catch (err) {
      console.warn('[songs] Custom-Sektionen lesen fehlgeschlagen:', err?.message || err)
    }
  }

  // 2. Standard-Dateien überschreiben (eigene .txt/.png bleiben, weil nicht im Seed).
  for (const f of listFiles(seed.base, '.txt')) {
    copyFileSafe(path.join(seed.base, f), path.join(folder, f))
  }
  for (const f of listFiles(seed.covers, '.png')) {
    copyFileSafe(path.join(seed.covers, f), path.join(folder, 'covers', f))
  }
  const seedManifest = path.join(seed.base, EDITIONS_JSON)
  if (fs.existsSync(seedManifest)) copyFileSafe(seedManifest, path.join(folder, EDITIONS_JSON))

  // 3. Neue Standard-CSV schreiben und die gesicherten Custom-Sektionen anhängen.
  try {
    let baseCsv = fs.readFileSync(path.join(seed.base, METADATA_CSV), 'utf-8')
    if (customSectionsText) baseCsv = baseCsv.replace(/\s*$/, '\n') + customSectionsText
    fs.writeFileSync(folderCsvPath, baseCsv)
  } catch (err) {
    console.warn('[songs] CSV schreiben fehlgeschlagen:', err?.message || err)
  }
}

// Aus einer .txt ohne Manifest-Eintrag eine Edition ableiten (dynamische Erkennung).
function synthesizeEdition (filename, folder) {
  const base = filename.replace(/\.txt$/i, '')
  const value = base.toLowerCase().replace(/^hitster-/, '')
  const label = base
    .replace(/^hitster-/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
  const coverCandidate = base + '.png'
  const cover = fs.existsSync(path.join(folder, 'covers', coverCandidate))
    ? coverCandidate
    : 'custom.png'
  return { value, label: label || value, file: filename, cover, custom: true }
}

// Kompletter Song-Daten-Payload für den Renderer.
function readSongData () {
  const folder = songFolderPath || loadSongFolder()
  const result = { editions: [], songFiles: {}, metadataCsv: '', covers: {} }
  try {
    let manifest = []
    const manifestPath = path.join(folder, EDITIONS_JSON)
    if (fs.existsSync(manifestPath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
        if (Array.isArray(parsed.editions)) manifest = parsed.editions
      } catch { /* kaputtes Manifest -> nur dynamische Editionen */ }
    }

    const txts = listFiles(folder, '.txt')
    for (const f of txts) {
      try { result.songFiles[f] = fs.readFileSync(path.join(folder, f), 'utf-8') } catch { /* skip */ }
    }

    const knownFiles = new Set(manifest.map((e) => e.file))
    const editions = manifest.map((e) => ({ ...e }))
    for (const f of txts) {
      if (!knownFiles.has(f)) editions.push(synthesizeEdition(f, folder))
    }
    result.editions = editions

    const csvPath = path.join(folder, METADATA_CSV)
    if (fs.existsSync(csvPath)) result.metadataCsv = fs.readFileSync(csvPath, 'utf-8')

    const coverDir = path.join(folder, 'covers')
    for (const f of listFiles(coverDir, '.png')) {
      try {
        const buf = fs.readFileSync(path.join(coverDir, f))
        result.covers[f] = 'data:image/png;base64,' + buf.toString('base64')
      } catch { /* skip */ }
    }
  } catch (err) {
    console.warn('[songs] readSongData fehlgeschlagen:', err?.message || err)
  }
  return result
}

function sendUpdateEvent (data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('hitster:updateEvent', data)
  }
}

function createWindow () {
  /**
   * Initial window options
   */
  mainWindow = new BrowserWindow({
    icon: path.resolve(__dirname, 'icons/icon.png'), // tray icon
    width: 1000,
    height: 600,
    useContentSize: true,
    alwaysOnTop: windowSettings.alwaysOnTop,
    webPreferences: {
      contextIsolation: true,
      // More info: https://v2.quasar.dev/quasar-cli-vite/developing-electron-apps/electron-preload-script
      preload: path.resolve(__dirname, process.env.QUASAR_ELECTRON_PRELOAD)
    }
  })

  mainWindow.loadURL(process.env.APP_URL)

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Alle externen Links (Spotify, Exportify, Update-Downloadseite) extern
    // öffnen – nie in einem App-eigenen Fenster. Songs laufen ohnehin über den
    // IPC-Handler 'hitster:openSong' (nativer Spotify-Client / System-Browser).
    if (/^https?:\/\//i.test(url) || url.startsWith('spotify:')) {
      shell.openExternal(url)
      return { action: 'deny' }
    }
    return { action: 'allow' }
  })

  if (process.env.DEBUGGING) {
    // Dev-Modus: DevTools automatisch mit offen.
    mainWindow.webContents.openDevTools()
  }
  // Produktion: DevTools NICHT auto-öffnen, aber per F12 / Strg+Shift+I bzw.
  // dem Menü zugänglich lassen – für Debugging von Multiplayer-Events,
  // Server-Verbindung usw. Ohne diesen Zugriff kann der Nutzer keine
  // Console-Logs mehr melden, wenn etwas schiefgeht.

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ── IPC: Update-/Plattform-Bridge für den Renderer ─────────────────────────
ipcMain.handle('hitster:appVersion', () => app.getVersion())

ipcMain.handle('hitster:openExternal', (_e, url) => {
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
    shell.openExternal(url)
  }
})

// Song öffnen: bevorzugt im nativen Spotify-Client (spotify:track:ID) – der
// ersetzt die laufende Wiedergabe, sodass kein Tab-Wildwuchs entsteht und der
// "vorherige Song" automatisch abgelöst wird. Fällt auf den System-Browser
// (open.spotify.com) zurück, wenn keine App den spotify:-Link übernimmt.
ipcMain.handle('hitster:openSong', async (_e, url) => {
  const s = typeof url === 'string' ? url : ''
  const m = s.match(/track[/:]([A-Za-z0-9]+)/)
  // Track-ID ist per Regex auf [A-Za-z0-9] beschränkt -> sicher fürs Einsetzen
  // in den AppleScript-/URI-String (keine Shell-Sonderzeichen möglich).
  const id = m ? m[1] : ''
  const httpsUrl = /^https?:\/\//i.test(s)
    ? s
    : id
      ? `https://open.spotify.com/track/${id}`
      : ''

  // Ein blosser spotify:track:ID-Aufruf öffnet den Track nur, startet die
  // Wiedergabe aber nicht, wenn Spotify bereits läuft. Deshalb pro Plattform
  // die Wiedergabe erzwingen, damit der neue Song sofort läuft und den alten
  // ablöst. Track-ID ist per Regex auf [A-Za-z0-9] beschränkt -> sicher fürs
  // Einsetzen in Shell-/Script-Strings.
  const run = (cmd) =>
    new Promise((resolve) => exec(cmd, (err) => resolve(!err)))

  if (id && platform === 'darwin') {
    // macOS: AppleScript -> spielt den Track sofort.
    if (
      await run(
        `osascript -e 'tell application "Spotify" to play track "spotify:track:${id}"'`
      )
    ) {
      return { via: 'mac-applescript' }
    }
  } else if (id && platform === 'linux') {
    // Linux: MPRIS/D-Bus -> Track laden (OpenUri) und Wiedergabe erzwingen (Play).
    const base =
      'dbus-send --type=method_call --dest=org.mpris.MediaPlayer2.spotify ' +
      '/org/mpris/MediaPlayer2 org.mpris.MediaPlayer2.Player'
    if (
      await run(
        `${base}.OpenUri string:'spotify:track:${id}' && sleep 0.4 && ${base}.Play`
      )
    ) {
      return { via: 'linux-mpris' }
    }
  } else if (id && platform === 'win32') {
    // Windows – langer Iterationsweg, endgültige Lösung in preview.47:
    // Iterations-Historie (preview.36–.46):
    //   – gezielt `WM_APPCOMMAND MEDIA_PLAY` an Spotify.exe-Fenster
    //     (Toplevel + Message-Only): kein Play.
    //   – HWND_BROADCAST des Play-Commands: resumt den ALTEN Track,
    //     weil Spotifys „current track" nach `spotify:track:XXX`-Load
    //     noch der vorherige ist.
    //   – Timing 200/900/1500 ms Wartezeit vor Play: keine Änderung.
    //   – Vorher pausieren via `MEDIA_STOP` (13): pausiert Spotify
    //     nicht. Via `MEDIA_PAUSE` (47): pausiert korrekt, aber der
    //     nachfolgende Broadcast-Play resumt trotzdem den alten Track.
    //   – `keybd_event(VK_MEDIA_PLAY_PAUSE)`: ebenfalls „resume last".
    //   – `WScript.Shell.AppActivate` + `SendKeys ' '`: Space wird
    //     zwar an Spotify geschickt, aber Fokus lag nicht auf dem
    //     hervorgehobenen Track – Space löste nur den Media-Session-
    //     Toggle aus (resumte den alten Track).
    //   – preview.45: Web-URL `https://open.spotify.com/track/XXX?
    //     autoplay=true` via `shell.openExternal`. Spotify hat sich
    //     für `open.spotify.com` als Handler registriert; der
    //     Standard-Browser leitet an Spotify-Desktop weiter, der
    //     `autoplay=true`-Parameter kommt beim Redirect mit. Endlich
    //     Play + neuer Track, überraschenderweise auch ohne
    //     sichtbaren Browser-Tab-Popup.
    //   – preview.46: Wartezeit zwischen MEDIA_PAUSE-Broadcast und
    //     URL-Load von 400 ms auf 60 ms reduziert. Neuer Bug: der
    //     Web-URL-Load ist jetzt so schnell, dass er VOR dem
    //     PowerShell-Pause fertig ist → der Pause pausiert den frisch
    //     gestarteten neuen Track.
    //
    // preview.47-Strategie: **Kein Pause-Broadcast mehr.** Der
    // `autoplay=true`-Parameter in der Web-URL wechselt Spotifys
    // Track sauber, unabhängig davon, ob vorher etwas lief. Die
    // Pause war nur notwendig, solange wir versucht haben, Play über
    // Broadcast/Media-Key/Space zu triggern (weil Spotify sonst den
    // alten Track resumte). Mit dem Autoplay-Redirect entfällt der
    // gesamte PowerShell-Umweg – der Track-Load ist damit auch
    // spürbar schneller.
    try {
      // `https://open.spotify.com/track/XXX?autoplay=true` – Spotify
      // hat sich für `open.spotify.com` als Handler registriert. Der
      // Standard-Browser leitet direkt weiter, der `autoplay=true`-
      // Parameter kommt mit und Spotify wechselt automatisch auf den
      // neuen Track (auch wenn vorher ein anderer lief).
      await shell.openExternal(
        `https://open.spotify.com/track/${id}?autoplay=true`
      )
      return { via: 'win-uri' }
    } catch {
      // Fallback unten
    }
  }

  // Fallback: spotify:-URI (startet frisch gestarteten Client meist automatisch),
  // sonst der Song im System-Browser.
  if (id) {
    try {
      await shell.openExternal(`spotify:track:${id}`)
      return { via: 'app' }
    } catch {
      // Keine Spotify-App registriert -> Browser-Fallback unten.
    }
  }
  if (httpsUrl) {
    await shell.openExternal(httpsUrl)
    return { via: 'browser' }
  }
  return { via: 'none' }
})

// "Immer im Vordergrund" – gilt bewusst nur fürs Hauptfenster.
ipcMain.handle('hitster:getAlwaysOnTop', () => {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow.isAlwaysOnTop()
  return windowSettings.alwaysOnTop
})

ipcMain.handle('hitster:setAlwaysOnTop', (_e, value) => {
  const on = !!value
  windowSettings.alwaysOnTop = on
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setAlwaysOnTop(on)
  saveWindowSettings()
  return on
})

// ── IPC: Songs-Ordner ──────────────────────────────────────────────────────
ipcMain.handle('hitster:readSongData', () => readSongData())

ipcMain.handle('hitster:getSongFolder', () => ({ path: songFolderPath }))

ipcMain.handle('hitster:pickSongFolder', async () => {
  const opts = { properties: ['openDirectory', 'createDirectory'] }
  if (songFolderPath) opts.defaultPath = songFolderPath
  const res = mainWindow && !mainWindow.isDestroyed()
    ? await dialog.showOpenDialog(mainWindow, opts)
    : await dialog.showOpenDialog(opts)
  if (res.canceled || !res.filePaths || !res.filePaths.length) return { canceled: true }
  return { path: res.filePaths[0] }
})

ipcMain.handle('hitster:setSongFolder', (_e, newPath) => {
  const p = typeof newPath === 'string' ? newPath.trim() : ''
  if (!p) return { ok: false, error: 'invalid_path' }
  try {
    fs.mkdirSync(p, { recursive: true })
  } catch (err) {
    return { ok: false, error: 'mkdir_failed', message: String(err?.message || err) }
  }
  songFolderPath = p
  saveSongFolder()
  ensureSeeded(songFolderPath)
  return { ok: true, path: songFolderPath }
})

// Update sofort installieren (Renderer triggert nach `downloaded`-Event).
// Ohne diesen expliziten Aufruf startet Windows den NSIS-Installer manchmal
// nicht automatisch beim regulären Quit – dann sieht der Nutzer nur die
// „neue Version verfügbar"-Meldung, aber es passiert nichts.
ipcMain.handle('hitster:installUpdate', () => {
  try {
    // isSilent=false: NSIS-Installer sichtbar (SmartScreen-Freigabe möglich).
    // isForceRunAfter=true: App startet nach dem Update automatisch neu.
    autoUpdater.quitAndInstall(false, true)
    return { ok: true }
  } catch (err) {
    log.error('[auto-update] quitAndInstall Fehler:', err)
    return { ok: false, message: String(err?.message || err) }
  }
})

// Manueller Update-Check entfernt: er funktionierte nicht zuverlässig (Timeout
// hat den laufenden Aufruf nicht wirklich abgebrochen). Auto-Update übernimmt.

// Auto-Update-Events sichtbar machen (an den Renderer weiterreichen).
autoUpdater.on('checking-for-update', () => sendUpdateEvent({ status: 'checking' }))
autoUpdater.on('update-available', (info) =>
  sendUpdateEvent({ status: 'available', version: info?.version })
)
autoUpdater.on('update-not-available', () => sendUpdateEvent({ status: 'none' }))
autoUpdater.on('download-progress', (p) =>
  sendUpdateEvent({ status: 'downloading', percent: Math.round(p?.percent || 0) })
)
autoUpdater.on('update-downloaded', (info) =>
  sendUpdateEvent({ status: 'downloaded', version: info?.version })
)
autoUpdater.on('error', (err) =>
  sendUpdateEvent({ status: 'error', message: String(err?.message || err) })
)

app.whenReady().then(() => {
  loadWindowSettings()
  // Songs-Ordner bestimmen und (bei Erststart/Update) mit dem Seed füllen,
  // BEVOR das Fenster lädt – der Renderer liest die Daten im Boot-File von dort.
  loadSongFolder()
  try {
    ensureSeeded(songFolderPath)
  } catch (err) {
    console.warn('[songs] Seeding fehlgeschlagen:', err?.message || err)
  }
  createWindow()

  // Auto-Update: prüft beim Start auf neue Releases und lädt sie im Hintergrund.
  // Silent-Update funktioniert nur für Windows (NSIS) und Linux AppImage;
  // .rpm/.deb erhalten kein Auto-Update.
  //
  // `allowPrerelease` wird bewusst NICHT gesetzt: electron-updater leitet den
  // Kanal dann aus der laufenden Version ab. Wer eine Vorabversion installiert
  // hat, bekommt weiter Vorabversionen (und auch stabile, die höher stehen),
  // wer eine stabile hat, bleibt bei stabilen. Fest auf `true` gesetzt bekäme
  // jede stabile Installation künftig ungefragt jede Testversion.
  try {
    autoUpdater.autoDownload = true
    autoUpdater.checkForUpdates().catch((err) =>
      sendUpdateEvent({ status: 'error', message: String(err?.message || err) })
    )
  } catch (err) {
    // Im Dev-Modus / ohne Update-Konfiguration ignorieren.
    console.warn('[auto-update] übersprungen:', err?.message || err)
  }
})

app.on('window-all-closed', () => {
  if (platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow()
  }
})
