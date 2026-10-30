/**
 * Öffnet den Song extern und sorgt dafür, dass sich kein "alter" Song aufstaut.
 *
 * Drei Wege, je nach Umgebung:
 *
 * 1. Desktop-App (Electron): über die Bridge (hitster.openSong) im nativen
 *    Spotify-Client (spotify:track:ID). Der Client ersetzt die laufende
 *    Wiedergabe, es gibt keine Tabs zum Schließen. Der Main-Prozess startet
 *    die Wiedergabe auch gleich (macOS AppleScript, Linux MPRIS, Windows
 *    `spotify:track:ID?autoplay=true`). Holt sich Spotify unter Linux dabei nach vorn,
 *    nimmt sich Hitster den Fokus danach zurück.
 *
 * 2. Browser mit Wunsch "in der App öffnen" (Standard: automatisch): über das
 *    Protokoll `spotify:`. Wichtig für Handys – ein per `window.open` geöffneter
 *    https-Link löst die App-Verknüpfung von Android/iOS NICHT aus, sondern
 *    landet in einem Browser-Tab. Nur der Protokoll-Link öffnet die App.
 *    Unter Android Chrome wird eine Intent-URL benutzt, die den Rückfall auf
 *    den Web-Player gleich mitliefert.
 *
 * 3. Browser ohne Spotify-App: neuer Tab auf open.spotify.com, der beim
 *    nächsten Song wieder geschlossen wird (wie bisher).
 */

const MODUS_KEY = "hitster-song-open-mode";

// 'auto'    = App versuchen, bei Misserfolg Web-Player (Standard)
// 'app'     = immer die App, kein Rückfall
// 'browser' = immer der Web-Player im Tab
export function getSongOpenMode() {
  try {
    const v = localStorage.getItem(MODUS_KEY);
    return v === "app" || v === "browser" ? v : "auto";
  } catch {
    return "auto";
  }
}

export function setSongOpenMode(mode) {
  try {
    if (mode === "app" || mode === "browser") {
      localStorage.setItem(MODUS_KEY, mode);
    } else {
      localStorage.removeItem(MODUS_KEY);
    }
  } catch {
    /* Speicher nicht verfügbar – dann gilt der Standard */
  }
}

// Gültige Song-Links (dieselbe Regel prüft der Server). Song-Links kommen auch
// vom Host eines Raums (geteilte Versionen). Würden wir sie ungeprüft öffnen,
// könnte ein Host den Gästen etwa einen `javascript:`-Link unterschieben, der
// im Ursprung der App läuft und dort an den Login-Token im localStorage kommt.
const SONG_URL_WEB =
  /^https:\/\/open\.spotify\.com\/(intl-[a-z]{2}(-[a-z]{2})?\/)?track\/[A-Za-z0-9]{10,40}(\?\S*)?$/;
const SONG_URL_URI = /^spotify:track:[A-Za-z0-9]{10,40}$/;
const SONG_URL_MAX = 300;

export function isValidSongUrl(url) {
  if (typeof url !== "string" || url.length > SONG_URL_MAX) return false;
  return SONG_URL_WEB.test(url) || SONG_URL_URI.test(url);
}

// Spotify-Track-Kennung aus einem gültigen Song-Link ziehen. Alles andere
// liefert "", dann wird gar nichts geöffnet.
function trackId(url) {
  if (!isValidSongUrl(url)) return "";
  const m = url.match(/track[/:]([A-Za-z0-9]+)/);
  return m ? m[1] : "";
}

function istAndroid() {
  return /android/i.test(navigator.userAgent || "");
}

function istIOS() {
  const ua = navigator.userAgent || "";
  // iPadOS meldet sich seit Version 13 als Macintosh, deshalb zusätzlich auf
  // Touch prüfen.
  return (
    /iphone|ipad|ipod/i.test(ua) ||
    (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)
  );
}

let lastSongWindow = null;

function oeffneImTab(url) {
  if (lastSongWindow && !lastSongWindow.closed) {
    lastSongWindow.close();
  }
  // noopener/noreferrer weglassen, damit wir eine Referenz zum Schließen behalten
  // (Spotify als vertrauenswürdige Domain hat keinen Zugriff auf window.opener).
  lastSongWindow = window.open(url, "_blank");
  return !!lastSongWindow;
}

/**
 * Versucht, den Song in der Spotify-App zu öffnen.
 *
 * Rückgabe: true, wenn der Versuch abgesetzt wurde. Ob die App wirklich
 * aufgeht, lässt sich nicht direkt abfragen – deshalb im Auto-Modus der
 * Rückfall über einen Timer: Ist die Seite nach kurzer Zeit noch sichtbar,
 * hat offenbar nichts übernommen.
 */
function versucheApp(id, mitRueckfall) {
  const webUrl = `https://open.spotify.com/track/${id}`;

  // Android Chrome: Intent-URL kann den Rückfall selbst übernehmen, das ist
  // zuverlässiger als jede Timer-Heuristik.
  if (istAndroid() && mitRueckfall) {
    const fallback = encodeURIComponent(webUrl);
    window.location.href =
      `intent://track/${id}#Intent;scheme=spotify;` +
      `package=com.spotify.music;S.browser_fallback_url=${fallback};end`;
    return;
  }

  const appUrl = `spotify:track:${id}`;

  if (!mitRueckfall) {
    window.location.href = appUrl;
    return;
  }

  // Auto-Modus: Protokoll anstoßen und beobachten, ob die Seite in den
  // Hintergrund geht. Tut sie das, hat die App übernommen.
  let abgewandert = false;
  const merken = () => {
    if (document.visibilityState === "hidden") abgewandert = true;
  };
  document.addEventListener("visibilitychange", merken);
  window.addEventListener("pagehide", merken);
  window.addEventListener("blur", merken);

  if (istIOS()) {
    // iOS blockiert location-Wechsel auf unbekannte Protokolle teils mit einer
    // Fehlerseite; ein verstecktes iframe ist dort der schonendere Weg.
    const rahmen = document.createElement("iframe");
    rahmen.style.display = "none";
    rahmen.src = appUrl;
    document.body.appendChild(rahmen);
    setTimeout(() => rahmen.remove(), 1500);
  } else {
    window.location.href = appUrl;
  }

  setTimeout(() => {
    document.removeEventListener("visibilitychange", merken);
    window.removeEventListener("pagehide", merken);
    window.removeEventListener("blur", merken);
    if (!abgewandert && document.visibilityState === "visible") {
      oeffneImTab(webUrl);
    }
  }, 1600);
}

// Darf der Song jetzt ohne Klick geöffnet werden? Die Desktop-App öffnet über
// die Bridge und braucht keine Nutzergeste. Im Browser blockieren Chrome und
// Co. `spotify:`-Links und Popups, wenn keine Nutzeraktivierung mehr besteht
// (etwa bei einem Aufruf aus einem Socket-Ereignis). Browser ohne
// `navigator.userActivation` versuchen es; dort zählt die Rückgabe von
// openSongTab.
export function canOpenSongWithoutClick() {
  if (typeof window === "undefined") return false;
  if (window.hitster?.openSong) return true;
  const activation =
    typeof navigator !== "undefined" ? navigator.userActivation : undefined;
  return !(activation && activation.isActive === false);
}

// Rückgabe: false, wenn sicher nichts aufging (kein gültiger Link, Fenster vom
// Browser blockiert). Sonst true; ob Spotify wirklich startet, lässt sich nicht
// prüfen.
export function openSongTab(url) {
  // Geöffnet wird nie der übergebene Link selbst, sondern immer ein aus der
  // Track-Kennung neu gebauter. Ungültige Links (falsche Domain, anderes
  // Protokoll) öffnen gar nichts.
  const id = trackId(url);
  if (!id) return false;
  const webUrl = `https://open.spotify.com/track/${id}`;

  // Desktop-App: nativ öffnen (kein Tab-Wildwuchs, ersetzt die Wiedergabe).
  if (typeof window !== "undefined" && window.hitster?.openSong) {
    window.hitster.openSong(webUrl);
    return true;
  }

  const modus = getSongOpenMode();

  if (modus === "browser") {
    return oeffneImTab(webUrl);
  }

  versucheApp(id, modus === "auto");
  return true;
}
