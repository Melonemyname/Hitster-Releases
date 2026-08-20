/**
 * Öffnet den Song extern und sorgt dafür, dass sich kein "alter" Song aufstaut.
 *
 * Desktop-App (Electron): über die Bridge (hitster.openSong) im nativen
 * Spotify-Client öffnen (spotify:track:ID). Der Client ersetzt die laufende
 * Wiedergabe -> der vorherige Song wird automatisch abgelöst, es gibt keine
 * Tabs/Fenster zum Schließen. Fällt im Main-Prozess auf den System-Browser
 * zurück, wenn keine Spotify-App installiert ist.
 *
 * Web (Browser): neuen Tab öffnen und den zuvor geöffneten schließen.
 */

let lastSongWindow = null

export function openSongTab(url) {
  if (!url) return;

  // Desktop-App: nativ öffnen (kein Tab-Wildwuchs, ersetzt die Wiedergabe).
  if (typeof window !== "undefined" && window.hitster?.openSong) {
    window.hitster.openSong(url);
    return;
  }

  // Web: vorherigen Tab schließen, neuen öffnen.
  if (lastSongWindow && !lastSongWindow.closed) {
    lastSongWindow.close();
  }
  // noopener/noreferrer weglassen, damit wir eine Referenz zum Schließen behalten
  // (Spotify als vertrauenswürdige Domain hat keinen Zugriff auf window.opener).
  lastSongWindow = window.open(url, "_blank");
}
