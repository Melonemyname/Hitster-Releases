/**
 * Admin-Service: Nutzerverwaltung (nur der Server-Owner). Alle Endpoints hängen
 * an /api/admin/* und werden serverseitig per `requireAdmin` (Owner-id) geprüft.
 */
import { SERVER_URL, getToken, getIsAdmin } from './authService'

// Ob der aktuelle Account Admin (= Server-Owner) ist. Das Flag kommt vom Server
// (Login/verify/me); die eigentliche Rechteprüfung macht der Server bei jedem
// Admin-Request selbst.
export function isCurrentUserAdmin () {
  return getIsAdmin()
}

function authHeaders (extra = {}) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${getToken()}`,
    ...extra
  }
}

async function handle (res) {
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.message || data.error || 'Anfrage fehlgeschlagen')
  }
  return data
}

// Nutzerliste laden.
export async function fetchAdminUsers () {
  const res = await fetch(`${SERVER_URL}/api/admin/users`, {
    headers: authHeaders()
  })
  const data = await handle(res)
  return data.users || []
}

// Neuen Nutzer anlegen. Sicherheitsfrage/Antwort sind optional.
export async function createAdminUser ({ username, password, securityQuestion, securityAnswer }) {
  const body = { username, password }
  if (securityQuestion) body.securityQuestion = securityQuestion
  if (securityAnswer) body.securityAnswer = securityAnswer
  const res = await fetch(`${SERVER_URL}/api/admin/users`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body)
  })
  return handle(res)
}

// Nutzer löschen (per stabiler id). Server verhindert die Selbstlöschung des Admins.
export async function deleteAdminUser (id) {
  const res = await fetch(
    `${SERVER_URL}/api/admin/users/${encodeURIComponent(id)}`,
    { method: 'DELETE', headers: authHeaders() }
  )
  return handle(res)
}

// Sichtbarkeit eines Nutzers in Bestenliste/Statistik setzen.
export async function setUserHidden (id, hidden) {
  const res = await fetch(
    `${SERVER_URL}/api/admin/users/${encodeURIComponent(id)}`,
    { method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ hidden }) }
  )
  return handle(res)
}

// Ownership (= Admin) auf einen anderen Account übertragen.
export async function transferOwner (userId) {
  const res = await fetch(`${SERVER_URL}/api/admin/owner`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ userId })
  })
  return handle(res)
}

// Eingeschränkte Versionen inkl. Freigaben (Admin-Sicht).
export async function fetchAdminRestrictedVersions () {
  const res = await fetch(`${SERVER_URL}/api/admin/restricted-versions`, {
    headers: authHeaders()
  })
  const data = await handle(res)
  return data.versions || []
}

// Freigegebene Accounts (ids) einer eingeschränkten Version setzen.
export async function setRestrictedAccess (id, userIds) {
  const res = await fetch(
    `${SERVER_URL}/api/admin/restricted-versions/${encodeURIComponent(id)}/access`,
    { method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ userIds }) }
  )
  return handle(res)
}
