/**
 * Auth-Service: JWT-Token und Benutzername in localStorage verwalten.
 *
 * Server-Adresse (für Online): pro Gerät in localStorage überschreibbar
 * (getServerUrl/setServerUrl), sonst aus VITE_SERVER_URL, sonst leer
 * (= gleiche Herkunft, wie im Web über den eigenen Server-Rechner).
 * In der Desktop-App (Electron) gibt es keine „gleiche Herkunft", daher muss
 * dort die Adresse des Host-Rechners (z. B. No-IP) eingetragen werden.
 */

import { ref } from 'vue'
import { clearRestrictedVersions } from './restrictedVersionsStore'

const TOKEN_KEY = 'hitster-auth-token'
const USERNAME_KEY = 'hitster-auth-username'
const ID_KEY = 'hitster-auth-id'
const IS_ADMIN_KEY = 'hitster-auth-is-admin'
const SERVER_URL_KEY = 'hitster-server-url'

export function getServerUrl () {
  try {
    return (
      localStorage.getItem(SERVER_URL_KEY) ||
      import.meta.env.VITE_SERVER_URL ||
      ''
    ).trim()
  } catch {
    return (import.meta.env.VITE_SERVER_URL || '').trim()
  }
}

export function setServerUrl (url) {
  try {
    const cleaned = (url || '').trim().replace(/\/+$/, '')
    if (cleaned) localStorage.setItem(SERVER_URL_KEY, cleaned)
    else localStorage.removeItem(SERVER_URL_KEY)
  } catch {
    /* Speicher nicht verfügbar – ignorieren */
  }
}

// Zum Ladezeitpunkt aufgelöste Adresse; laufende Requests/Sockets nutzen sie.
// Änderungen greifen nach einem Neustart/Reload der App.
export const SERVER_URL = getServerUrl()

export function getToken () {
  return localStorage.getItem(TOKEN_KEY)
}

export function getUsername () {
  return localStorage.getItem(USERNAME_KEY)
}

// Stabile Nutzer-id (UUID). Identität; der Username ist nur der Anzeigename.
export function getUserId () {
  return localStorage.getItem(ID_KEY)
}

// Ob der aktuelle Account der Server-Owner (= Admin) ist. Quelle ist der Server
// (Login/verify/me); das Flag dient nur der UI-Anzeige, die Rechte prüft der
// Server bei jedem Admin-Request selbst.
export function getIsAdmin () {
  return localStorage.getItem(IS_ADMIN_KEY) === '1'
}

export function setIsAdmin (isAdmin) {
  if (typeof isAdmin === 'boolean') {
    localStorage.setItem(IS_ADMIN_KEY, isAdmin ? '1' : '0')
    adminState.value = isAdmin
  }
}

export function isLoggedIn () {
  return !!getToken()
}

// Reaktive Spiegel des Anmelde- und Admin-Zustands. localStorage selbst ist
// nicht reaktiv, deshalb hat sich die Oberflaeche frueher ueber die aktuelle
// Route beholfen ("bei jedem Routenwechsel neu pruefen"). Das war unzuverlaessig:
// Nach dem Anmelden blieb das Profilbild im FAB leer, bis man einmal die
// Profilseite geoeffnet hatte. Diese beiden Refs werden von setSession,
// setIsAdmin und logout gepflegt und melden den Wechsel sofort.
export const loggedInState = ref(!!getToken())
export const adminState = ref(getIsAdmin())

// Token + Username (+ id/Admin-Flag) persistieren. id/isAdmin sind optional und
// werden nur überschrieben, wenn übergeben (z. B. Username-Änderung ändert die
// Admin-Rolle nicht).
export function setSession (token, username, id, isAdmin) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USERNAME_KEY, username)
  if (id !== undefined && id !== null) localStorage.setItem(ID_KEY, id)
  setIsAdmin(isAdmin)
  loggedInState.value = true
}

export async function login (username, password) {
  const res = await fetch(`${SERVER_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || 'Login fehlgeschlagen')
  }
  setSession(data.token, data.username, data.id, data.isAdmin)
  return data
}

/**
 * Sitzung beim Server pruefen und dabei das Token erneuern lassen.
 *
 * Rueckgabe `false` heisst NICHT zwingend „abgemeldet": Bei einem
 * Netzwerkfehler bleibt die Sitzung absichtlich bestehen (offline soll niemanden
 * hinauswerfen). Ob wirklich abgemeldet wurde, sagt danach `isLoggedIn()`.
 */
export async function verifyStoredToken () {
  const token = getToken()
  if (!token) return false
  try {
    const res = await fetch(`${SERVER_URL}/api/verify`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!res.ok) {
      logout()
      return false
    }
    // Admin-Flag / id frisch übernehmen (falls sich Ownership geändert hat).
    const data = await res.json().catch(() => ({}))
    if (data && data.id) localStorage.setItem(ID_KEY, data.id)
    if (data) setIsAdmin(data.isAdmin)
    // Der Server schickt ein frisches Token mit, sobald das alte in absehbarer
    // Zeit ablaeuft. Uebernehmen wir es hier, bleibt man dauerhaft angemeldet,
    // solange die App ab und zu geoeffnet wird.
    if (data && data.token) localStorage.setItem(TOKEN_KEY, data.token)
    return true
  } catch {
    return false
  }
}

export function logout () {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USERNAME_KEY)
  localStorage.removeItem(ID_KEY)
  localStorage.removeItem(IS_ADMIN_KEY)
  loggedInState.value = false
  adminState.value = false
  // Freigegebene (eingeschränkte) Versionen sind account-gebunden -> beim
  // Abmelden entfernen, damit sie für den nächsten Nutzer nicht sichtbar sind.
  clearRestrictedVersions()
}
