/**
 * Lädt die dem eingeloggten Nutzer freigegebenen eingeschränkten Versionen vom
 * Server und spiegelt sie in den lokalen Store. Wird beim Login und beim Laden
 * der Versionsübersicht aufgerufen; beim Logout leert der authService den Store.
 */
import { SERVER_URL, getToken } from "./authService";
import {
  readRestrictedVersions,
  writeRestrictedVersions,
} from "./restrictedVersionsStore";

export async function fetchRestrictedVersions() {
  const token = getToken();
  if (!token) return [];
  try {
    const res = await fetch(`${SERVER_URL}/api/restricted-versions`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      // Netz-/Serverfehler: bestehenden Cache behalten (Offline-Spielbarkeit).
      return readRestrictedVersions();
    }
    const data = await res.json().catch(() => ({}));
    const versions = Array.isArray(data.versions) ? data.versions : [];
    // Leere Antwort = keine (mehr) freigegeben -> Store wird geleert.
    writeRestrictedVersions(versions);
    return versions;
  } catch {
    return readRestrictedVersions();
  }
}

// ── Ersteller-Selbstverwaltung eigener geteilter Versionen ────────────────────
// Diese Endpoints prüft der Server per Eigentümer-Recht (Ersteller oder Admin).

function authHeaders(extra = {}) {
  return {
    Authorization: `Bearer ${getToken()}`,
    ...extra,
  };
}

async function handle(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || data.error || `Fehler (${res.status})`);
  }
  return data;
}

// Schlanke Nutzerliste (id + Name) für die Account-Auswahl beim Freigeben.
export async function fetchAssignableUsers() {
  const data = await handle(
    await fetch(`${SERVER_URL}/api/users/basic`, { headers: authHeaders() }),
  );
  return Array.isArray(data.users) ? data.users : [];
}

// Eine (Custom-)Version teilen: legt sie als eingeschränkte Version an, mit dem
// aktuellen Nutzer als Ersteller.
export async function createSharedVersion(version) {
  return handle(
    await fetch(`${SERVER_URL}/api/my/restricted-versions`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ version }),
    }),
  );
}

// Inhalt/Metadaten einer eigenen geteilten Version aktualisieren (Editor).
export async function updateSharedVersion(id, version) {
  return handle(
    await fetch(
      `${SERVER_URL}/api/my/restricted-versions/${encodeURIComponent(id)}`,
      {
        method: "PUT",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ version }),
      },
    ),
  );
}

// Freigegebene Accounts einer eigenen geteilten Version setzen.
export async function setSharedAccess(id, userIds) {
  return handle(
    await fetch(
      `${SERVER_URL}/api/my/restricted-versions/${encodeURIComponent(id)}/access`,
      {
        method: "PATCH",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ userIds }),
      },
    ),
  );
}

// Eigene geteilte Version löschen.
export async function deleteSharedVersion(id) {
  return handle(
    await fetch(
      `${SERVER_URL}/api/my/restricted-versions/${encodeURIComponent(id)}`,
      { method: "DELETE", headers: authHeaders() },
    ),
  );
}
