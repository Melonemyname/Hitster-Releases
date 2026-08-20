import { ref, computed } from "vue";
import { resolveCover } from "../utils/versionsCatalog";
import { getStandardVersions, getSongFileText } from "../utils/songDataProvider";
import {
  readCustomVersions,
  writeCustomVersions,
} from "../utils/customVersionsStore";
import {
  readRestrictedVersions,
  getRestrictedVersion,
  clearRestrictedVersions,
} from "../utils/restrictedVersionsStore";
import {
  fetchRestrictedVersions,
  createSharedVersion,
  updateSharedVersion,
  setSharedAccess,
  deleteSharedVersion,
} from "../utils/restrictedVersionsService";
import {
  fetchSyncedVersions,
  pushSyncedVersion,
  deleteSyncedVersion,
} from "../utils/customVersionsService";
import { resetMetadataIndex } from "../utils/spotifyCsvService";
import { isLoggedIn, loggedInState } from "../utils/authService";

// Hat eine Version mit eingebetteten Tracks (Custom/Restricted) mindestens einen
// Film-/Serientitel? Nur dann darf sie im Film-Modus gewählt werden.
function tracksHaveFilm(tracks) {
  return (tracks || []).some((t) => String(t.movie || "").trim().length > 0);
}

// Anzahl Song-Links in einer gebündelten Songliste zählen (nur Spotify-Tracks).
// Ergebnisse werden gecached, damit die computed nicht bei jedem Zugriff neu zählt.
const BUNDLED_TRACK_COUNT_CACHE = new Map();
function countBundledTracks(filename) {
  if (!filename) return 0;
  if (BUNDLED_TRACK_COUNT_CACHE.has(filename))
    return BUNDLED_TRACK_COUNT_CACHE.get(filename);
  const raw = getSongFileText(filename);
  if (!raw) {
    BUNDLED_TRACK_COUNT_CACHE.set(filename, 0);
    return 0;
  }
  let count = 0;
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.includes("open.spotify.com") && trimmed.includes("/track/")) {
      count++;
    }
  }
  BUNDLED_TRACK_COUNT_CACHE.set(filename, count);
  return count;
}

/**
 * Gemeinsamer Zustand für alle Song-Versionen (app-weit ein Singleton).
 *
 * Quellen:
 *  - STANDARD_VERSIONS: gebündelter Katalog (Standard + „selbst hinzugefügt")
 *  - eigene, importierte Versionen (customVersionsStore, localStorage) – teils
 *    gerätespezifisch (synced:false), teils account-synchronisiert (synced:true)
 *
 * Gerätelokale Filter (localStorage):
 *  - hidden:  ausgeblendete Werte (alle Versionen, umkehrbar)
 *  - deleted: gelöschte gebündelte custom-Versionen (Staffel 1/2)
 *
 * Importierte Versionen werden echt gelöscht (aus Cache + ggf. Server).
 */

const HIDDEN_STORAGE_KEY = "hitster-hidden-versions-v1";
const DELETED_STORAGE_KEY = "hitster-deleted-versions-v1";
// Einmal-Migration: Werte, für die die alten gerätelokalen Ausblenden/Löschen-
// Filter bereits bereinigt wurden. Hitster 1 & 2 waren früher gebündelte
// Versionen (Werte „staffel1"/„staffel2") und device-lokal ausblend-/löschbar.
// Jetzt kommen dieselben Werte als eingeschränkte (freigegebene) Versionen –
// ein alter „ausgeblendet"-Eintrag würde sie sonst weiter aus der Auswahl
// filtern. Beim ersten Auftauchen als eingeschränkte Version einmalig
// bereinigen (danach ist Aus-/Einblenden wieder normal möglich).
const RESTRICTED_MIGRATED_KEY = "hitster-restricted-unfiltered-v1";

function loadList(key) {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveList(key, list) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    /* Speicher nicht verfügbar – ignorieren */
  }
}

// Modul-Singletons (über alle Komponenten geteilt).
const hiddenVersions = ref(loadList(HIDDEN_STORAGE_KEY));
const deletedVersions = ref(loadList(DELETED_STORAGE_KEY));
const customVersions = ref(readCustomVersions());
const restrictedVersions = ref(readRestrictedVersions());

function refreshCustom() {
  customVersions.value = readCustomVersions();
}

function refreshRestricted() {
  restrictedVersions.value = readRestrictedVersions();
}

// Einmalige Bereinigung stale gewordener Ausblenden/Löschen-Filter für Werte,
// die jetzt als eingeschränkte Version freigegeben sind (siehe Kommentar oben).
// Läuft pro Wert genau einmal; danach kann der Nutzer sie wieder normal
// aus-/einblenden, ohne dass es bei jedem Laden zurückgesetzt wird.
function reconcileRestrictedFilters() {
  const restricted = readRestrictedVersions();
  if (!restricted.length) return;
  const migrated = new Set(loadList(RESTRICTED_MIGRATED_KEY));
  const fresh = restricted
    .map((v) => v.value)
    .filter((value) => value && !migrated.has(value));
  if (!fresh.length) return;

  const hidden = loadList(HIDDEN_STORAGE_KEY).filter((v) => !fresh.includes(v));
  const deleted = loadList(DELETED_STORAGE_KEY).filter(
    (v) => !fresh.includes(v),
  );
  saveList(HIDDEN_STORAGE_KEY, hidden);
  saveList(DELETED_STORAGE_KEY, deleted);
  saveList(RESTRICTED_MIGRATED_KEY, [...migrated, ...fresh]);

  hiddenVersions.value = hidden;
  deletedVersions.value = deleted;
}

export function useVersions() {
  // Gebündelte custom-Versionen (aktuell Staffel 1/2) sind gerätelokal löschbar.
  const bundledCustomValues = new Set(
    getStandardVersions().filter((v) => v.custom).map((v) => v.value),
  );

  // Alle bekannten Versionen: Katalog (ohne gerätelokal gelöschte gebündelte)
  // + eigene importierte Versionen (mit aufgelöstem Cover).
  const allVersions = computed(() => {
    const bundled = getStandardVersions()
      .filter((v) => !deletedVersions.value.includes(v.value))
      .map((v) => ({
        ...v,
        trackCount: countBundledTracks(v.file),
        // Gebündelte Film-Editionen (z. B. Soundtracks) haben ihre Filmtitel in
        // der Metadaten-CSV; sie gelten pauschal als film-bereit.
        filmReady: !!v.film,
      }));
    const custom = customVersions.value.map((v) => ({
      value: v.value,
      label: v.label,
      icon: resolveCover(v.cover),
      custom: true,
      synced: !!v.synced,
      imported: true,
      film: !!v.film,
      filmReady: !!v.film && tracksHaveFilm(v.tracks),
      trackCount: (v.tracks || []).length,
    }));
    // Eingeschränkte (freigegebene) Versionen: erscheinen nur, solange der Server
    // sie dem Account freigibt. Bearbeit-/verwaltbar nur, wenn canManage (der
    // Server liefert das Flag nur an Ersteller/Admin).
    //
    // Ohne Anmeldung bleiben sie außen vor. Der Server gibt sie zwar nur an
    // berechtigte Konten heraus, die Anzeige las aber allein den gerätelokalen
    // Zwischenspeicher. Der überlebt alles außer einem ausdrücklichen Abmelden,
    // dadurch standen fremde Editionen auch ohne Konto in der Auswahl.
    const restricted = (loggedInState.value ? restrictedVersions.value : []).map((v) => ({
      value: v.value,
      label: v.label,
      icon: resolveCover(v.cover),
      custom: false,
      restricted: true,
      canManage: !!v.canManage,
      film: !!v.film,
      filmReady: !!v.film && tracksHaveFilm(v.tracks),
      trackCount: (v.tracks || []).length,
    }));
    return [...bundled, ...custom, ...restricted];
  });

  // Für die Auswahl: ohne die ausgeblendeten.
  const visibleVersions = computed(() =>
    allVersions.value.filter((v) => !hiddenVersions.value.includes(v.value)),
  );

  const isHidden = (value) => hiddenVersions.value.includes(value);

  const isImported = (value) =>
    customVersions.value.some((v) => v.value === value);

  // Löschbar: importierte Versionen sowie gebündelte custom-Versionen.
  const isDeletable = (value) =>
    isImported(value) || bundledCustomValues.has(value);

  const isSynced = (value) => {
    const v = customVersions.value.find((x) => x.value === value);
    return !!(v && v.synced);
  };

  const toggleHidden = (value) => {
    hiddenVersions.value = hiddenVersions.value.includes(value)
      ? hiddenVersions.value.filter((v) => v !== value)
      : [...hiddenVersions.value, value];
    saveList(HIDDEN_STORAGE_KEY, hiddenVersions.value);
  };

  // Version löschen. Gebündelte custom -> gerätelokaler Filter; importierte ->
  // aus Cache entfernen (+ Server, falls synchronisiert).
  const deleteVersion = async (value) => {
    if (bundledCustomValues.has(value) && !isImported(value)) {
      if (!deletedVersions.value.includes(value)) {
        deletedVersions.value = [...deletedVersions.value, value];
        saveList(DELETED_STORAGE_KEY, deletedVersions.value);
      }
      if (hiddenVersions.value.includes(value)) {
        hiddenVersions.value = hiddenVersions.value.filter((v) => v !== value);
        saveList(HIDDEN_STORAGE_KEY, hiddenVersions.value);
      }
      return true;
    }

    const list = readCustomVersions();
    const entry = list.find((v) => v.value === value);
    if (!entry) return false;
    if (entry.synced) {
      try {
        await deleteSyncedVersion(entry.id);
      } catch {
        /* Server-Fehler ignorieren – lokal trotzdem entfernen */
      }
    }
    writeCustomVersions(list.filter((v) => v.value !== value));
    refreshCustom();
    resetMetadataIndex();
    return true;
  };

  // Gerätelokal gelöschte gebündelte Versionen wiederherstellen.
  const resetDeleted = () => {
    deletedVersions.value = [];
    saveList(DELETED_STORAGE_KEY, deletedVersions.value);
  };

  const hasDeleted = computed(() => deletedVersions.value.length > 0);

  // Eigene Version anlegen (aus geparsten Tracks). `film` markiert sie als
  // Film-/Serien-Version (dann werden die Filmtitel pro Song lokal gepflegt).
  const createCustomVersion = async ({ label, tracks, cover, synced, film }) => {
    const id = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const version = {
      id,
      value: `custom-${id}`,
      label: (label || "Eigene Version").trim(),
      cover: cover || { kind: "preset", ref: "custom" },
      custom: true,
      synced: !!synced,
      film: !!film,
      tracks: tracks || [],
      createdAt: new Date().toISOString(),
    };

    if (version.synced) {
      // Erst Server, dann lokal – schlägt der Server fehl, bleibt sie lokal.
      try {
        await pushSyncedVersion(version);
      } catch (err) {
        version.synced = false;
        writeCustomVersions([...readCustomVersions(), version]);
        refreshCustom();
        resetMetadataIndex();
        throw err;
      }
    }
    writeCustomVersions([...readCustomVersions(), version]);
    refreshCustom();
    // Der Metadaten-Zwischenspeicher merkt sich auch negative Treffer. Ohne
    // dieses Leeren bliebe ein Song, der vorher einmal unbekannt war, bis zum
    // Neustart ohne Titel und Jahr - obwohl die neue Version ihn mitbringt.
    resetMetadataIndex();
    return version;
  };

  // Synchronisierung einer Version umschalten (Server <-> nur Gerät).
  const toggleSync = async (value) => {
    const list = readCustomVersions();
    const entry = list.find((v) => v.value === value);
    if (!entry) return;
    const next = { ...entry, synced: !entry.synced };
    if (next.synced) {
      await pushSyncedVersion(next);
    } else {
      try {
        await deleteSyncedVersion(entry.id);
      } catch {
        /* schon weg / Serverfehler – lokal trotzdem als nicht-synchron führen */
      }
    }
    writeCustomVersions(list.map((v) => (v.value === value ? next : v)));
    refreshCustom();
  };

  // Eine Custom-Version lokal aktualisieren (z. B. Filmtitel pro Song aus dem
  // Film-Eintrag-Dialog). Speichert lokal und – falls synchronisiert – auf dem
  // Server. Leert den Metadaten-Cache, damit Korrekturen sofort greifen.
  const updateCustomVersion = async (value, patch = {}) => {
    const list = readCustomVersions();
    const entry = list.find((v) => v.value === value);
    if (!entry) throw new Error("Version nicht gefunden");
    const next = {
      ...entry,
      label: patch.label !== undefined ? patch.label : entry.label,
      cover: patch.cover !== undefined ? patch.cover : entry.cover,
      film: patch.film !== undefined ? !!patch.film : !!entry.film,
      tracks: patch.tracks !== undefined ? patch.tracks : entry.tracks,
    };
    if (next.synced) {
      try {
        await pushSyncedVersion(next);
      } catch {
        /* offline: lokal trotzdem übernehmen */
      }
    }
    writeCustomVersions(list.map((v) => (v.value === value ? next : v)));
    refreshCustom();
    resetMetadataIndex();
  };

  // Eine Custom-Version an Accounts freigeben: legt sie als eingeschränkte
  // (Restricted-)Version auf dem Server an (aktueller Nutzer = Ersteller) und
  // entfernt die lokale Custom-Fassung (geht in die Restricted-Fassung über).
  const shareCustomVersion = async (value, allowedUserIds = []) => {
    const entry = readCustomVersions().find((v) => v.value === value);
    if (!entry) throw new Error("Version nicht gefunden");
    await createSharedVersion({
      value: entry.value,
      label: entry.label,
      cover: entry.cover || { kind: "preset", ref: "custom" },
      film: !!entry.film,
      tracks: entry.tracks || [],
      allowedUserIds: Array.isArray(allowedUserIds) ? allowedUserIds : [],
    });
    // Lokale Custom-Fassung entfernen (Server ist ab jetzt die Quelle).
    if (entry.synced) {
      try {
        await deleteSyncedVersion(entry.id);
      } catch {
        /* schon weg / offline – lokal trotzdem entfernen */
      }
    }
    writeCustomVersions(
      readCustomVersions().filter((v) => v.value !== value),
    );
    refreshCustom();
    // Frisch ausgelieferte Restricted-Versionen holen (inkl. der neuen).
    try {
      await fetchRestrictedVersions();
    } catch {
      /* offline – Cache behalten */
    }
    refreshRestricted();
    reconcileRestrictedFilters();
    resetMetadataIndex();
  };

  // Inhalt/Metadaten einer eingeschränkten Version bearbeiten (Restricted-Editor,
  // nur für Ersteller/Admin). Speichert auf dem Server, wirkt für alle Accounts.
  const updateRestrictedVersion = async (value, patch = {}) => {
    const rv = getRestrictedVersion(value);
    if (!rv || !rv.id) throw new Error("Version nicht gefunden");
    await updateSharedVersion(rv.id, {
      value: rv.value,
      label: patch.label !== undefined ? patch.label : rv.label,
      cover: patch.cover !== undefined ? patch.cover : rv.cover,
      film: patch.film !== undefined ? !!patch.film : !!rv.film,
      tracks: patch.tracks !== undefined ? patch.tracks : rv.tracks,
    });
    try {
      await fetchRestrictedVersions();
    } catch {
      /* offline – Cache behalten */
    }
    refreshRestricted();
    resetMetadataIndex();
  };

  // Freigegebene Accounts einer eingeschränkten Version setzen (Ersteller/Admin).
  const setRestrictedAccess = async (value, userIds) => {
    const rv = getRestrictedVersion(value);
    if (!rv || !rv.id) throw new Error("Version nicht gefunden");
    await setSharedAccess(rv.id, userIds);
    // Man kann sich selbst zwar nicht entfernen (Server hält den Ersteller
    // drin), trotzdem frisch laden, damit die Anzeige stimmt.
    try {
      await fetchRestrictedVersions();
    } catch {
      /* offline – Cache behalten */
    }
    refreshRestricted();
  };

  // Eine eingeschränkte Version löschen (Ersteller/Admin).
  const deleteRestrictedVersion = async (value) => {
    const rv = getRestrictedVersion(value);
    if (!rv || !rv.id) return false;
    await deleteSharedVersion(rv.id);
    try {
      await fetchRestrictedVersions();
    } catch {
      /* offline – Cache behalten */
    }
    refreshRestricted();
    resetMetadataIndex();
    return true;
  };

  // Alle gerätelokalen Filter/Versionen frisch einlesen und – falls eingeloggt –
  // die account-synchronisierten Versionen vom Server spiegeln.
  const loadVersions = async () => {
    hiddenVersions.value = loadList(HIDDEN_STORAGE_KEY);
    deletedVersions.value = loadList(DELETED_STORAGE_KEY);

    if (isLoggedIn()) {
      try {
        const serverVersions = await fetchSyncedVersions();
        const local = readCustomVersions();
        // Server ist Quelle der Wahrheit für synchronisierte Versionen;
        // gerätespezifische (synced:false) bleiben unangetastet.
        const deviceOnly = local.filter((v) => !v.synced);
        const merged = [
          ...deviceOnly,
          ...serverVersions.map((v) => ({ ...v, synced: true })),
        ];
        writeCustomVersions(merged);
      } catch {
        /* offline / nicht erreichbar – lokalen Cache behalten */
      }
      // Freigegebene, eingeschränkte Versionen (z. B. Hitster 1 & 2) laden.
      try {
        await fetchRestrictedVersions();
      } catch {
        /* offline – lokalen Cache behalten */
      }
    } else {
      // Ohne Anmeldung gehören fremde Editionen nicht auf das Gerät. Bisher
      // räumte nur ein ausdrückliches Abmelden auf, ein einfach verworfenes
      // Token ließ sie liegen.
      clearRestrictedVersions();
    }
    refreshCustom();
    refreshRestricted();
    // Stale „ausgeblendet/gelöscht"-Filter für jetzt freigegebene Werte einmalig
    // bereinigen, damit frisch freigegebene Editionen sicher auftauchen.
    reconcileRestrictedFilters();
    return allVersions.value;
  };

  return {
    allVersions,
    visibleVersions,
    hiddenVersions,
    deletedVersions,
    customVersions,
    hasDeleted,
    isHidden,
    isDeletable,
    isImported,
    isSynced,
    toggleHidden,
    deleteVersion,
    resetDeleted,
    createCustomVersion,
    updateCustomVersion,
    shareCustomVersion,
    updateRestrictedVersion,
    setRestrictedAccess,
    deleteRestrictedVersion,
    toggleSync,
    loadVersions,
  };
}
