/**
 * Profil- und Registrierungs-Service: spricht die REST-Endpunkte an.
 * Auth über den in authService verwalteten JWT.
 */

import { SERVER_URL, getToken, setSession } from './authService'

function authHeaders () {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${getToken()}`
  }
}

// Wertet eine Antwort aus und wirft bei Fehler eine Error mit Server-Meldung.
async function handle (res) {
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.message || data.error || 'Anfrage fehlgeschlagen')
  }
  return data
}

// Öffentlichen Avatar-Pfad zu einer absoluten URL machen.
export function avatarUrl (path) {
  if (!path) return null
  return `${SERVER_URL}${path}`
}

// ── Slot-Profilbilder für die Spielansicht ──────────────────────────────
// Beim Spielstart legt die Lobby (bzw. useMultiplayer beim Modus-Wechsel) die
// Mitglieder-Avatare pro Slot in sessionStorage ab, damit Game.vue sie neben
// den Namen anzeigen kann (die In-Game-Spielerobjekte tragen nur Namen).
// Zusätzlich wird bei jedem Update ein Window-Event gefeuert, damit die
// Spielansicht auch nach einem späteren `roomState` (z. B. Rejoin) die
// Bilder aktualisieren kann (sessionStorage-Änderungen im gleichen Tab
// lösen selbst kein Event aus).
const SLOT_AVATARS_KEY = 'hitster-slot-avatars'
export const SLOT_AVATARS_EVENT = 'hitster:slot-avatars-updated'

export function storeSlotAvatars (players = [], memberAvatars = {}) {
  try {
    const bySlot = (players || []).map((p) =>
      (p.members || []).map((username) => ({
        username,
        avatar: (memberAvatars && memberAvatars[username]) || null
      }))
    )
    sessionStorage.setItem(SLOT_AVATARS_KEY, JSON.stringify(bySlot))
    try {
      window.dispatchEvent(new CustomEvent(SLOT_AVATARS_EVENT))
    } catch {
      /* SSR / no window */
    }
  } catch {
    /* ignore quota / serialization errors */
  }
}

export function loadSlotAvatars () {
  try {
    const raw = sessionStorage.getItem(SLOT_AVATARS_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

// Registrierung (offen, Sicherheitsfrage Pflicht). Loggt bei Erfolg automatisch ein.
export async function register ({ username, password, securityQuestion, securityAnswer }) {
  const res = await fetch(`${SERVER_URL}/api/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, securityQuestion, securityAnswer })
  })
  const data = await handle(res)
  setSession(data.token, data.username, data.id, data.isAdmin)
  return data
}

export async function fetchProfile () {
  return handle(await fetch(`${SERVER_URL}/api/me`, { headers: authHeaders() }))
}

// Rangliste der Server-Nutzer (nach Punkten/Siegen sortiert).
export async function fetchLeaderboard () {
  const data = await handle(
    await fetch(`${SERVER_URL}/api/leaderboard`, { headers: authHeaders() })
  )
  return data.leaderboard || []
}

// Öffentliche Profil-/Statistikansicht eines Nutzers.
export async function fetchPublicStats (username) {
  return handle(
    await fetch(
      `${SERVER_URL}/api/users/${encodeURIComponent(username)}/public`,
      { headers: authHeaders() }
    )
  )
}

// Username ändern → neues Token, Session aktualisieren.
export async function updateUsername (username) {
  const res = await fetch(`${SERVER_URL}/api/profile/username`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ username })
  })
  const data = await handle(res)
  setSession(data.token, data.username, data.id)
  return data
}

export async function updatePassword (oldPassword, newPassword) {
  return handle(await fetch(`${SERVER_URL}/api/profile/password`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ oldPassword, newPassword })
  }))
}

// Sicherheitsfrage + Antwort setzen/ändern (eingeloggt).
export async function updateSecurity (question, answer) {
  return handle(await fetch(`${SERVER_URL}/api/profile/security`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ question, answer })
  }))
}

// ─── Passwort-Wiederherstellung (öffentlich, ohne Login) ──────────────────

// Hinterlegte Sicherheitsfrage zu einem Benutzernamen abrufen.
export async function fetchRecoveryQuestion (username) {
  return handle(await fetch(
    `${SERVER_URL}/api/recover/question?username=${encodeURIComponent(username)}`
  ))
}

// Passwort mit korrekter Antwort neu setzen. Loggt bei Erfolg automatisch ein.
export async function resetPassword ({ username, answer, newPassword }) {
  const res = await fetch(`${SERVER_URL}/api/recover/reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, answer, newPassword })
  })
  const data = await handle(res)
  setSession(data.token, data.username, data.id, data.isAdmin)
  return data
}

// Avatar als Data-URI hochladen (Bild wird vorher clientseitig verkleinert).
export async function uploadAvatar (dataUri) {
  return handle(await fetch(`${SERVER_URL}/api/profile/avatar`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ image: dataUri })
  }))
}

export async function deleteAvatar () {
  return handle(await fetch(`${SERVER_URL}/api/profile/avatar`, {
    method: 'DELETE',
    headers: authHeaders()
  }))
}

/**
 * Verkleinert eine Bilddatei clientseitig auf max. `size`px (quadratisch,
 * zentriert zugeschnitten) und liefert eine JPEG-Data-URI. Hält die Uploads
 * klein und einheitlich.
 */
export function fileToAvatarDataUri (file, size = 256) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Bild konnte nicht geladen werden'))
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')
        // Quadratischer, zentrierter Ausschnitt (cover)
        const min = Math.min(img.width, img.height)
        const sx = (img.width - min) / 2
        const sy = (img.height - min) / 2
        ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size)
        resolve(canvas.toDataURL('image/jpeg', 0.85))
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}
