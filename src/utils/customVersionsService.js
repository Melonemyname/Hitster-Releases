/**
 * Client-Service für die account-synchronisierten eigenen Versionen
 * (Server-Anbindung, JWT-geschützt).
 *
 * Das Parsen der Exportify-CSV passiert clientseitig (siehe utils/exportifyCsv).
 * Ohne Login kann man Versionen nur gerätespezifisch anlegen (kein Server nötig).
 */

import { SERVER_URL, getToken } from "./authService";

function authHeaders(extra = {}) {
  const token = getToken();
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

async function handle(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Fehler (${res.status})`);
  return data;
}

// Account-synchronisierte Versionen laden
export async function fetchSyncedVersions() {
  const res = await fetch(`${SERVER_URL}/api/versions`, {
    headers: authHeaders(),
  });
  const data = await handle(res);
  return Array.isArray(data.versions) ? data.versions : [];
}

// Version account-synchronisieren (anlegen/aktualisieren)
export async function pushSyncedVersion(version) {
  const res = await fetch(
    `${SERVER_URL}/api/versions/${encodeURIComponent(version.id)}`,
    {
      method: "PUT",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ version }),
    },
  );
  return handle(res);
}

// Account-synchronisierte Version entfernen
export async function deleteSyncedVersion(id) {
  const res = await fetch(
    `${SERVER_URL}/api/versions/${encodeURIComponent(id)}`,
    { method: "DELETE", headers: authHeaders() },
  );
  return handle(res);
}
