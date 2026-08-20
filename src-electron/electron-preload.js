/**
 * Preload: stellt dem Renderer eine sichere Plattform-Bridge bereit.
 */
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('hitster', {
  // Installierte App-Version
  appVersion: () => ipcRenderer.invoke('hitster:appVersion'),
  // Externen Link im System-Browser öffnen
  openExternal: (url) => ipcRenderer.invoke('hitster:openExternal', url),
  // Song öffnen (nativer Spotify-Client, Fallback System-Browser)
  openSong: (url) => ipcRenderer.invoke('hitster:openSong', url),
  // "Immer im Vordergrund" (nur Hauptfenster) – Status lesen / setzen
  getAlwaysOnTop: () => ipcRenderer.invoke('hitster:getAlwaysOnTop'),
  setAlwaysOnTop: (value) => ipcRenderer.invoke('hitster:setAlwaysOnTop', value),
  // Update jetzt installieren (nach `downloaded`-Event vom Renderer angestoßen)
  installUpdate: () => ipcRenderer.invoke('hitster:installUpdate'),
  // Songs-Ordner: komplette Song-Daten lesen + Ordner verwalten
  readSongData: () => ipcRenderer.invoke('hitster:readSongData'),
  getSongFolder: () => ipcRenderer.invoke('hitster:getSongFolder'),
  pickSongFolder: () => ipcRenderer.invoke('hitster:pickSongFolder'),
  setSongFolder: (path) => ipcRenderer.invoke('hitster:setSongFolder', path),
  // Auto-Update-Status (checking/available/none/downloading/downloaded/error)
  onUpdateEvent: (cb) => {
    const handler = (_e, data) => cb(data)
    ipcRenderer.on('hitster:updateEvent', handler)
    return () => ipcRenderer.removeListener('hitster:updateEvent', handler)
  }
})
