import { app, BrowserWindow, shell, ipcMain, dialog, powerMonitor, screen } from 'electron'
import { autoUpdater } from 'electron-updater'
import log from 'electron-log'
import { exec, spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { ensureSeeded as abgleichSeed, listFiles, METADATA_CSV, EDITIONS_JSON } from './song-seed.js'

// needed in case process is undefined under Linux
const platform = process.platform || os.platform()

// ── Linux: unter Wayland über XWayland (X11) laufen ────────────────────────
// Seit Electron 38 startet die App in einer Wayland-Sitzung nativ als
// Wayland-Client. Wayland erlaubt einem Fenster aber nicht, sich selbst über
// andere zu legen: setAlwaysOnTop() bleibt dort wirkungslos, und "Immer im
// Vordergrund" ging in der AppImage nicht. Unter XWayland funktioniert es.
//
// Ein app.commandLine.appendSwitch('ozone-platform', 'x11') hier käme zu spät,
// Electron wählt die Plattform, bevor dieses Skript läuft. Deshalb einmal mit
// dem Schalter auf der echten Kommandozeile neu starten. Nur in der gepackten
// App, im Dev-Modus würde der Neustart Quasars Prozessverwaltung aushebeln.
// Ohne DISPLAY gibt es kein XWayland. deb/rpm bekommen den Schalter schon über
// die .desktop-Datei (linux.executableArgs), dort greift das hier nur beim
// Start von Hand.
//
// NICHT app.relaunch() benutzen (so in 1.0.5, die AppImage startete gar nicht
// mehr): Electron startet den neuen Prozess unter Linux über einen Helfer aus
// der eigenen Binary, und die liegt bei der AppImage im Einhängepunkt unter
// /tmp. Den hängt die AppImage-Runtime aus, sobald dieser Prozess endet, der
// Helfer verschwindet mit, bevor er etwas starten kann. Deshalb selbst und
// abgekoppelt starten, bei der AppImage über die echte Datei (APPIMAGE), die
// sich beim Start neu einhängt. spawn() meldet ein Scheitern von exec schon
// synchron (keine pid), dann einfach unter Wayland weiterlaufen.
if (
  platform === 'linux' &&
  app.isPackaged &&
  (process.env.XDG_SESSION_TYPE === 'wayland' || process.env.WAYLAND_DISPLAY) &&
  process.env.DISPLAY &&
  !process.argv.some((a) => a.startsWith('--ozone-platform'))
) {
  try {
    const kind = spawn(
      process.env.APPIMAGE || process.execPath,
      [...process.argv.slice(1), '--ozone-platform=x11'],
      { detached: true, stdio: 'ignore' }
    )
    kind.on('error', () => { /* siehe pid-Prüfung */ })
    if (kind.pid) {
      kind.unref()
      app.exit(0)
    }
  } catch (err) {
    console.warn('[x11] Neustart fehlgeschlagen, bleibe bei Wayland:', err?.message || err)
  }
}

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

// Ebene für "Immer im Vordergrund". Ohne Angabe nimmt Electron 'floating',
// und alle Ebenen von 'floating' bis 'status' legt Electron unter Windows
// direkt HINTER die Taskleiste (laut Doku, „below the taskbar on Windows").
// Topmost bleibt das Fenster dabei nur, solange die Taskleiste selbst topmost
// ist. Holt sich ein anderes Fenster den Vordergrund, etwa Spotify beim
// Songstart, nimmt Windows der Taskleiste den Status zeitweise ab, und Hitster
// rutscht mit ihr hinter Spotify. Das passt zum Springen seit 1.0.7, und
// das Auffrischen unten konnte es mit jedem Aufruf neu auslösen, weil es
// ebenfalls 'floating' gesetzt hat. 'screen-saver' liegt über der
// Taskleiste und hängt nicht an ihr. Auf macOS und Linux bleibt der Standard.
const TOPMOST_LEVEL = platform === 'win32' ? 'screen-saver' : 'floating'

function applyAlwaysOnTop (on) {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (on) mainWindow.setAlwaysOnTop(true, TOPMOST_LEVEL)
  else mainWindow.setAlwaysOnTop(false)
}

// Windows: Ein Fenster kann seinen Topmost-Status trotzdem verlieren, bekannte
// Auslöser sind Standby, Sperren/Entsperren, Änderungen an der Anzeige und
// Apps, die sich nachdrücklich nach vorn holen. Electron setzt den Status
// danach nicht neu. Deshalb nach jedem Songstart, bei Fokusverlust, an den
// genannten Stellen und einmal pro Minute neu setzen. Erst aus, dann an: Mit
// unverändertem Wert ruft Electron Windows gar nicht erst auf. moveTop()
// schiebt das Fenster danach an die Spitze der Topmost-Fenster.
function reassertAlwaysOnTop () {
  if (platform !== 'win32' || !windowSettings.alwaysOnTop) return
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMinimized()) return
  mainWindow.setAlwaysOnTop(false)
  mainWindow.setAlwaysOnTop(true, TOPMOST_LEVEL)
  mainWindow.moveTop()
}

// Windows: Spotify holt sein Fenster beim Songstart nach vorn, teils erst mit
// Verzögerung, und nimmt Hitster dabei den Fokus. Hatte Hitster ihn vorher,
// holen wir ihn zurück, damit Spotify im Hintergrund spielt (wie unter Linux
// beim MPRIS-Weg). Gilt auch ohne "Immer im Vordergrund". Nur wenn der Fokus
// noch nicht wieder bei Hitster liegt; minimiert bleibt minimiert.
function reclaimFocus () {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMinimized()) return
  reassertAlwaysOnTop()
  if (mainWindow.isFocused()) return
  mainWindow.moveTop()
  mainWindow.focus()
}

let topmostInterval = null
function startTopmostWatch () {
  if (platform !== 'win32' || topmostInterval) return
  topmostInterval = setInterval(reassertAlwaysOnTop, 60 * 1000)
  for (const ev of ['resume', 'unlock-screen']) {
    powerMonitor.on(ev, () => setTimeout(reassertAlwaysOnTop, 1000))
  }
  for (const ev of ['display-added', 'display-removed', 'display-metrics-changed']) {
    screen.on(ev, () => setTimeout(reassertAlwaysOnTop, 500))
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
// gefüllt. Bei Updates bekommen nur die Standard-Dateien und CSV-Abschnitte den
// neuen Seed, die der Nutzer nicht verändert hat; eigene Editionen und eigene
// Änderungen bleiben erhalten (siehe song-seed.js).
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
  // Im Dev-Modus (`npm run dev:electron`) zeigt app.getAppPath() auf den
  // Build-Ordner .quasar/electron, dort liegen keine Song-Daten. Der Abgleich
  // scheiterte dann still, und der Songs-Ordner behielt den alten Stand.
  // Deshalb den ersten Ordner nehmen, der die Assets tatsächlich enthält.
  const kandidaten = [app.getAppPath(), process.cwd(), path.resolve(__dirname, '..', '..')]
  const root = kandidaten.find((dir) => fs.existsSync(path.join(dir, 'src', 'assets', 'songs'))) ||
    app.getAppPath()
  return {
    base: path.join(root, 'src', 'assets', 'songs'),
    covers: path.join(root, 'src', 'assets', 'versions')
  }
}

// Ordner anlegen und mit dem Seed abgleichen. Die Logik steckt in song-seed.js,
// damit sie sich ohne Electron testen lässt.
function ensureSeeded (folder) {
  abgleichSeed(folder, resolveSeedDirs(), { appVersion: app.getVersion(), log })
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

// Letzter Update-Status für den Renderer. Liegt das Update schon fertig im
// Cache (beim Start davor heruntergeladen), feuert `update-downloaded` kurz
// nach dem Start, oft bevor die Oberfläche geladen ist und zuhört. Dann ging
// die Meldung verloren und die Installationsaufforderung kam nie. Der
// Renderer fragt diesen Stand deshalb beim Einhängen zusätzlich ab.
let lastUpdateEvent = null

function sendUpdateEvent (data) {
  if (data?.status !== 'checking') lastUpdateEvent = data
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
    webPreferences: {
      contextIsolation: true,
      // Nicht drosseln, wenn das Fenster verdeckt oder minimiert ist. Unter
      // Windows liegt Spotify beim Spielen oft vor Hitster, Chromium erkennt
      // das Fenster dann als verdeckt, bremst Timer und Verbindung und nach
      // 5 Minuten noch stärker. Beobachtet: ein Windows-Spieler flog etwa
      // alle 5 Minuten aus dem Raum, unter Linux (keine Verdeckungs-
      // erkennung) blieb die Verbindung stabil.
      backgroundThrottling: false,
      // More info: https://v2.quasar.dev/quasar-cli-vite/developing-electron-apps/electron-preload-script
      preload: path.resolve(__dirname, process.env.QUASAR_ELECTRON_PRELOAD)
    }
  })

  // Erst nach dem Anlegen setzen: Die Option `alwaysOnTop` im Konstruktor
  // kennt keine Ebene und landete unter Windows hinter der Taskleiste.
  applyAlwaysOnTop(windowSettings.alwaysOnTop)

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

  // Windows: nach dem Wiederherstellen und wenn ein anderes Fenster den Fokus
  // nimmt (etwa Spotify beim Songwechsel), den Topmost-Status auffrischen.
  mainWindow.on('restore', reassertAlwaysOnTop)
  mainWindow.on('blur', () => setTimeout(reassertAlwaysOnTop, 300))
  startTopmostWatch()

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
  // Nur Spotify-Links gehen an den Browser. Song-Links kommen auch vom Host
  // eines Raums (geteilte Versionen), eine beliebige Adresse soll so nicht
  // auf allen Rechnern der Gäste aufgehen.
  const httpsUrl = /^https:\/\/open\.spotify\.com\//i.test(s)
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
    // --print-reply ist nötig: Ohne wartet dbus-send nicht auf die Antwort und
    // endet auch dann mit 0, wenn Spotify gar nicht läuft (der Bus antwortet
    // dann mit ServiceUnknown, das sieht aber niemand). So kam der Rückfall
    // auf spotify:track: bzw. den Browser unten nie zum Zug. Mit Antwort endet
    // dbus-send bei einem Fehler mit 1. Die Zeitgrenze verhindert, dass ein
    // hängender Client den Songstart blockiert (Standard wären 25 Sekunden).
    const base =
      'dbus-send --print-reply --reply-timeout=2000 --type=method_call ' +
      '--dest=org.mpris.MediaPlayer2.spotify ' +
      '/org/mpris/MediaPlayer2 org.mpris.MediaPlayer2.Player'
    // Aktuelle Spotify-Versionen (etwa das Flatpak 1.2.95) holen ihr Fenster
    // beim OpenUri nach vorn. Hatte Hitster vorher den Fokus, holen wir ihn
    // danach zurück, damit Spotify im Hintergrund weiterspielt.
    const hatteFokus = !!(mainWindow && !mainWindow.isDestroyed() && mainWindow.isFocused())
    // Über den Rückfall entscheidet nur OpenUri: Ist der Track geladen, darf
    // ein gescheitertes Play nicht noch einmal per spotify:-Link öffnen. Play
    // kommt danach, sonst setzt es den alten Track fort.
    if (await run(`${base}.OpenUri string:'spotify:track:${id}'`)) {
      await new Promise((resolve) => setTimeout(resolve, 400))
      await run(`${base}.Play`)
      if (hatteFokus) {
        setTimeout(() => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.moveTop()
            mainWindow.focus()
          }
        }, 600)
      }
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
    //
    // 1.0.5: Der Weblink hing davon ab, dass Windows `open.spotify.com` an
    // die Spotify-App weiterreicht (Einstellungen → Apps → Apps für
    // Websites). Ist das aus, etwa nach einer Neuinstallation von Spotify,
    // landete jeder Song im Browser. Deshalb jetzt zuerst direkt das
    // Protokoll: `spotify:track:XXX?autoplay=true` lädt den Track UND
    // startet ihn, auch wenn Spotify schon läuft und vorher ein anderer
    // Song lief. Der Weblink bleibt nur noch für den Fall, dass kein
    // Programm `spotify:` übernimmt.
    //
    // 1.0.7: In 1.0.5/1.0.6 stand hier der Zusatz `:play`. Der startet unter
    // Linux, die Windows-App lädt damit aber nur den Song, der alte spielt
    // weiter. Auf einem Windows-11-PC mit Spotify-Desktop (nicht Store)
    // durchprobiert: `?autoplay=true` am spotify:-Link spielt ab, ebenso der
    // Weblink mit `?autoplay=true` per --protocol-uri. `?play=true` und
    // `:play` laden nur, Spotify.exe mit dem Weblink ohne --protocol-uri
    // holt nur das Fenster nach vorn.
    let spotifyApp = ''
    try {
      spotifyApp = app.getApplicationNameForProtocol('spotify://')
    } catch {
      // Abfrage nicht möglich -> wie ohne App behandeln.
    }
    // Fokus vor dem Öffnen merken, Spotify nimmt ihn gleich weg.
    const hatteFokus = !!(mainWindow && !mainWindow.isDestroyed() && mainWindow.isFocused())
    const nachSpotify = hatteFokus ? reclaimFocus : reassertAlwaysOnTop
    if (spotifyApp) {
      try {
        await shell.openExternal(`spotify:track:${id}?autoplay=true`)
        // Spotify holt sich beim Öffnen nach vorn, teils mit Verzögerung.
        setTimeout(nachSpotify, 800)
        setTimeout(nachSpotify, 2500)
        return { via: 'win-protocol' }
      } catch {
        // Weiter mit dem Weblink.
      }
    }
    try {
      // `https://open.spotify.com/track/XXX?autoplay=true` – Spotify
      // hat sich für `open.spotify.com` als Handler registriert. Der
      // Standard-Browser leitet direkt weiter, der `autoplay=true`-
      // Parameter kommt mit und Spotify wechselt automatisch auf den
      // neuen Track (auch wenn vorher ein anderer lief).
      await shell.openExternal(
        `https://open.spotify.com/track/${id}?autoplay=true`
      )
      setTimeout(nachSpotify, 800)
      setTimeout(nachSpotify, 2500)
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
  applyAlwaysOnTop(on)
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

// Letzter Update-Status (siehe lastUpdateEvent).
ipcMain.handle('hitster:getUpdateStatus', () => lastUpdateEvent)

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

// „Beenden" aus dem Hauptmenü. app.quit() statt nur das Fenster zu schließen:
// Unter macOS liefe die App sonst ohne Fenster im Dock weiter, und der Knopf
// täte für den Nutzer scheinbar nichts.
ipcMain.handle('hitster:quit', () => {
  app.quit()
  return { ok: true }
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
