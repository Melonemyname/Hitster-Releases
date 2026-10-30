import { ref, computed, watch } from "vue";
import { resolveCover } from "../utils/versionsCatalog";
import { getStandardVersions, getSongFileText } from "../utils/songDataProvider";
import {
  readCustomVersions,
  writeCustomVersions,
  removeSyncedCustomVersions,
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
import { isLoggedIn, loggedInState, getUserId } from "../utils/authService";

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

// Lokale Markierung „geändert, aber noch nicht auf dem Server": Scheitert das
// Hochladen einer synchronisierten Version, bleibt die Änderung lokal stehen
// und `loadVersions` lädt sie beim nächsten Mal nach, statt sie mit dem alten
// Serverstand zu überschreiben. Die Markierung selbst geht nie an den Server.
const PENDING_FLAG = "pendingPush";
// Zusätzlich zu PENDING_FLAG: Die Version war noch nie auf dem Server (beim
// Anlegen offline). Fehlt sie dort, wird sie angelegt. Ohne diese Markierung
// heißt „fehlt auf dem Server", dass sie auf einem anderen Gerät gelöscht
// wurde; dann wird sie hier entfernt statt neu angelegt.
const CREATE_FLAG = "pendingCreate";
// Konto, dem eine synchronisierte Version gehört. Nur lokal; verhindert, dass
// Vormerkungen eines Kontos in ein anderes hochgeladen werden.
const OWNER_FLAG = "ownerId";
const LOCAL_FLAGS = [PENDING_FLAG, CREATE_FLAG, OWNER_FLAG];

// Gelöschte synchronisierte Versionen, deren Löschen auf dem Server noch
// aussteht (z. B. beim Freigeben, wenn der Server kurz weg war). Einträge
// { id, ownerId }; `loadVersions` holt das Löschen nach und blendet sie bis
// dahin aus, damit die Kopie nicht vom Server zurückkommt.
const PENDING_DELETES_KEY = "hitster-custom-pending-deletes-v1";

function withoutPendingFlag(version) {
  const rest = { ...version };
  delete rest[PENDING_FLAG];
  delete rest[CREATE_FLAG];
  return rest;
}

// Fassung für den Server: ohne alle nur lokalen Markierungen.
function forServer(version) {
  const rest = { ...version };
  for (const flag of LOCAL_FLAGS) delete rest[flag];
  return rest;
}

function nowIso() {
  return new Date().toISOString();
}

// Ist die lokale Fassung neuer als die vom Server? Ohne lokalen Zeitstempel
// (Vormerkung aus einer älteren App-Version) gewinnt wie bisher die lokale,
// ohne Zeitstempel auf dem Server ebenso. Gleich alt heißt: dieselbe Fassung
// ist schon oben (etwa ein Hochladen, dessen Antwort nur nicht ankam).
function isNewerThan(local, remote) {
  const l = Date.parse(local?.updatedAt);
  if (!Number.isFinite(l)) return true;
  const r = Date.parse(remote?.updatedAt);
  return !Number.isFinite(r) || l > r;
}

// Fehler, der sich durch erneutes Versuchen nicht erledigt: der Server hat die
// Anfrage gesehen und abgelehnt (4xx, außer Zeitüberschreitung und Drosselung).
// Netzwerkfehler haben keinen Status und gelten als vorübergehend.
function isPermanentError(err) {
  const status = err?.status;
  return (
    typeof status === "number" &&
    status >= 400 &&
    status < 500 &&
    status !== 408 &&
    status !== 429
  );
}

function ownedByCurrentUser(version) {
  const owner = version?.[OWNER_FLAG];
  return !owner || owner === getUserId();
}

function readPendingDeletes() {
  return loadList(PENDING_DELETES_KEY).filter((d) => d && d.id);
}

function addPendingDelete(id) {
  const list = readPendingDeletes().filter((d) => d.id !== id);
  saveList(PENDING_DELETES_KEY, [...list, { id, ownerId: getUserId() }]);
}

// Nach erfolgreichem Hochladen: eine ältere Vormerkung zum Löschen derselben
// id ist überholt (sonst löschte der nächste Abgleich die Version wieder).
function clearPendingDelete(id) {
  const list = readPendingDeletes();
  const rest = list.filter((d) => d.id !== id);
  if (rest.length !== list.length) saveList(PENDING_DELETES_KEY, rest);
}

// Ausstehende Löschungen des angemeldeten Kontos nachholen. Liefert die ids,
// die (noch) als gelöscht gelten, auch wenn der Server erneut nicht erreichbar
// war. Einträge anderer Konten bleiben unberührt liegen.
async function flushPendingDeletes() {
  const uid = getUserId();
  const mine = readPendingDeletes().filter((d) => !d.ownerId || d.ownerId === uid);
  const done = new Set();
  for (const entry of mine) {
    try {
      await deleteSyncedVersion(entry.id);
      done.add(entry.id);
    } catch {
      /* beim nächsten Laden erneut */
    }
  }
  if (done.size) {
    saveList(
      PENDING_DELETES_KEY,
      readPendingDeletes().filter((d) => !done.has(d.id)),
    );
  }
  return new Set(mine.map((d) => d.id));
}

// Serverstand und lokalen Stand zusammenführen und dabei Konflikte auflösen.
//
// Regeln für eine vorgemerkte (pendingPush) Version:
//  - liegt sie auf dem Server und ist die lokale Fassung neuer: hochladen
//  - liegt sie auf dem Server und ist sie dort neuer oder gleich: Server gilt
//  - fehlt sie auf dem Server und wurde offline angelegt: hochladen
//  - fehlt sie auf dem Server und war schon einmal oben: anderswo gelöscht,
//    deshalb hier entfernen statt neu anlegen
// Vormerkungen eines anderen Kontos werden nie hochgeladen.
async function syncWithServer() {
  const uid = getUserId();
  // Was ab jetzt lokal angelegt oder geändert wird, kann im gleich geholten
  // Serverstand noch fehlen und darf deshalb nicht als „anderswo gelöscht"
  // gelten (siehe unten).
  const startedAt = Date.now();
  const deleted = await flushPendingDeletes();
  const serverVersions = (await fetchSyncedVersions()).filter(
    (v) => v && v.id && !deleted.has(v.id),
  );
  const serverById = new Map(serverVersions.map((v) => [v.id, v]));

  // Schnappschüsse (JSON) der entschiedenen lokalen Fassungen. Wird eine
  // Version während des Abgleichs erneut bearbeitet, passt der Schnappschuss
  // nicht mehr, und die neuere Fassung bleibt vorgemerkt.
  const pushed = new Set();
  const dropped = new Set();
  const pending = readCustomVersions().filter(
    (v) =>
      v.synced && v[PENDING_FLAG] && ownedByCurrentUser(v) && !deleted.has(v.id),
  );
  for (const version of pending) {
    const remote = serverById.get(version.id);
    const shouldPush = remote ? isNewerThan(version, remote) : !!version[CREATE_FLAG];
    if (!shouldPush) {
      dropped.add(JSON.stringify(version));
      continue;
    }
    try {
      await pushSyncedVersion(forServer(version));
      pushed.add(JSON.stringify(version));
    } catch {
      /* bleibt vorgemerkt */
    }
  }

  // Frisch lesen: Während der Serveraufrufe kann sich die Liste geändert haben.
  const local = readCustomVersions();
  const localSynced = new Map(
    local
      .filter((v) => v.synced && ownedByCurrentUser(v) && !deleted.has(v.id))
      .map((v) => [v.id, v]),
  );
  const resolve = (localVersion, remote) => {
    const key = JSON.stringify(localVersion);
    if (pushed.has(key)) {
      return { ...withoutPendingFlag(localVersion), [OWNER_FLAG]: uid };
    }
    if (dropped.has(key)) {
      return remote
        ? { ...forServer(remote), synced: true, [OWNER_FLAG]: uid }
        : null;
    }
    return { ...localVersion, [OWNER_FLAG]: uid };
  };

  const merged = [];
  const seenIds = new Set();
  const add = (v) => {
    if (!v || seenIds.has(v.id)) return;
    seenIds.add(v.id);
    merged.push(v);
  };
  // Server ist Quelle der Wahrheit für synchronisierte Versionen; nicht
  // vorgemerkte lokale Fassungen werden durch die vom Server ersetzt.
  for (const remote of serverVersions) {
    const localVersion = localSynced.get(remote.id);
    add(
      localVersion && localVersion[PENDING_FLAG]
        ? resolve(localVersion, remote)
        : { ...forServer(remote), synced: true, [OWNER_FLAG]: uid },
    );
  }
  // Vorgemerkte, die (noch) nicht auf dem Server liegen, sowie solche, die
  // erst während des Abgleichs entstanden sind.
  for (const localVersion of localSynced.values()) {
    if (serverById.has(localVersion.id)) continue;
    if (localVersion[PENDING_FLAG]) {
      add(resolve(localVersion, null));
    } else if (Date.parse(localVersion.updatedAt) >= startedAt) {
      add({ ...localVersion, [OWNER_FLAG]: uid });
    }
  }
  // Gerätespezifische (synced:false) bleiben unangetastet. Gibt es dieselbe
  // id schon vom Server (frühere Doppelung nach einem Hochladen, dessen
  // Antwort ausblieb), gilt die synchronisierte Fassung.
  for (const v of local) if (!v.synced) add(v);
  // Reihenfolge wie bisher: gerätespezifische zuerst.
  writeCustomVersions([
    ...merged.filter((v) => !v.synced),
    ...merged.filter((v) => v.synced),
  ]);
}

function refreshRestricted() {
  restrictedVersions.value = readRestrictedVersions();
}

// Beim Abmelden räumt der authService synchronisierte und freigegebene
// Versionen vom Gerät. Die Anzeige liest aber die Refs hier, deshalb sofort
// nachziehen statt erst beim nächsten `loadVersions`.
watch(loggedInState, (loggedIn) => {
  if (!loggedIn) {
    refreshCustom();
    refreshRestricted();
  }
});

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

  // Eingeschränkte Versionen erscheinen nur mit Anmeldung (Begründung unten
  // bei allVersions).
  const shownRestricted = computed(() =>
    loggedInState.value ? restrictedVersions.value : [],
  );

  // Eingeschränkte Versionen gehen vor: Taucht derselbe value auch als eigene
  // Version auf (etwa eine freigegebene Version, deren Custom-Kopie auf dem
  // Server noch nicht gelöscht ist), zählt nur die freigegebene. Gleiches gilt
  // für doppelte values unter den eigenen; es gewinnt die erste.
  const shownCustom = computed(() => {
    const taken = new Set(shownRestricted.value.map((v) => v.value));
    return customVersions.value.filter((v) => {
      if (taken.has(v.value)) return false;
      taken.add(v.value);
      return true;
    });
  });

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
    const custom = shownCustom.value.map((v) => ({
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
    const restricted = shownRestricted.value.map((v) => ({
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
    shownCustom.value.some((v) => v.value === value);

  // Löschbar: importierte Versionen sowie gebündelte custom-Versionen.
  const isDeletable = (value) =>
    isImported(value) || bundledCustomValues.has(value);

  const isSynced = (value) => {
    const v = shownCustom.value.find((x) => x.value === value);
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
  //
  // Scheitert das Löschen auf dem Server, bricht es ab und wirft den Fehler,
  // ohne lokal etwas zu ändern. Früher wurde lokal trotzdem entfernt, und
  // `loadVersions` holte die Version beim nächsten Mal vom Server zurück.
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
      // Der Server löscht idempotent; ein Fehler heißt also wirklich „nicht
      // gelöscht" (offline, Serverneustart, abgelaufene Sitzung).
      try {
        await deleteSyncedVersion(entry.id);
      } catch (err) {
        // Offline angelegt und vermutlich nie oben angekommen: lokal löschen
        // und das Löschen auf dem Server vormerken, statt zu blockieren.
        if (!entry[CREATE_FLAG]) throw err;
        addPendingDelete(entry.id);
      }
    }
    // Frisch lesen: Während des Serveraufrufs kann sich die Liste geändert haben.
    writeCustomVersions(readCustomVersions().filter((v) => v.value !== value));
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
  //
  // Synchronisiert und Server nicht erreichbar: Die Version gilt trotzdem als
  // angelegt, liegt lokal und ist zum Hochladen vorgemerkt (`pendingPush` in
  // der Rückgabe). Früher wurde sie lokal als „nur Gerät" gespeichert und der
  // Fehler geworfen; der Dialog meldete dann einen Fehlschlag, und ein zweiter
  // Versuch legte eine Doppelung an. Lehnt der Server die Version dagegen ab
  // (4xx, etwa abgelaufene Sitzung), wird lokal nichts gespeichert und der
  // Fehler geworfen, ein erneuter Versuch ist dann gefahrlos.
  const createCustomVersion = async ({ label, tracks, cover, synced, film }) => {
    const id = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const now = nowIso();
    let version = {
      id,
      value: `custom-${id}`,
      label: (label || "Eigene Version").trim(),
      cover: cover || { kind: "preset", ref: "custom" },
      custom: true,
      synced: !!synced,
      film: !!film,
      tracks: tracks || [],
      createdAt: now,
      updatedAt: now,
    };

    if (version.synced) {
      version = { ...version, [OWNER_FLAG]: getUserId() };
      try {
        await pushSyncedVersion(forServer(version));
      } catch (err) {
        if (isPermanentError(err)) throw err;
        version = { ...version, [PENDING_FLAG]: true, [CREATE_FLAG]: true };
      }
    }
    writeCustomVersions([...readCustomVersions(), version]);
    refreshCustom();
    // Der Metadaten-Zwischenspeicher merkt sich auch negative Treffer. Ohne
    // dieses Leeren bliebe ein Song, der vorher einmal unbekannt war, bis zum
    // Neustart ohne Titel und Jahr, obwohl die neue Version ihn mitbringt.
    resetMetadataIndex();
    return version;
  };

  // Synchronisierung einer Version umschalten (Server <-> nur Gerät).
  //
  // In beide Richtungen gilt: Scheitert der Server, wirft es und lässt die
  // Version lokal unverändert. Beim Abschalten wurde der Fehler früher
  // verschluckt; die Version lag danach lokal als „nur Gerät" vor und kam beim
  // nächsten `loadVersions` als synchronisierte Fassung ein zweites Mal dazu.
  const toggleSync = async (value) => {
    const entry = readCustomVersions().find((v) => v.value === value);
    if (!entry) return;
    // Eine vorgemerkte Änderung geht beim Einschalten ohnehin mit hoch, beim
    // Abschalten wird sie gegenstandslos.
    let next = {
      ...forServer(entry),
      synced: !entry.synced,
      updatedAt: nowIso(),
    };
    if (next.synced) {
      await pushSyncedVersion(next);
      clearPendingDelete(next.id);
      next = { ...next, [OWNER_FLAG]: getUserId() };
    } else {
      try {
        await deleteSyncedVersion(entry.id);
      } catch (err) {
        // Offline angelegt und vermutlich nie oben angekommen: nicht
        // blockieren, das Löschen auf dem Server nur vormerken (falls das
        // Hochladen doch angekommen war).
        if (!entry[CREATE_FLAG]) throw err;
        addPendingDelete(entry.id);
      }
    }
    writeCustomVersions(
      readCustomVersions().map((v) => (v.value === value ? next : v)),
    );
    refreshCustom();
  };

  // Eine Custom-Version lokal aktualisieren (z. B. Filmtitel pro Song aus dem
  // Film-Eintrag-Dialog). Speichert lokal und – falls synchronisiert – auf dem
  // Server. Leert den Metadaten-Cache, damit Korrekturen sofort greifen.
  //
  // Rückgabe `{ pending }`: true, wenn der Server nicht erreichbar war. Die
  // Änderung ist dann lokal gespeichert und zum Nachladen vorgemerkt (siehe
  // PENDING_FLAG); der Aufrufer sollte das melden statt reinen Erfolg.
  const updateCustomVersion = async (value, patch = {}) => {
    const entry = readCustomVersions().find((v) => v.value === value);
    if (!entry) throw new Error("Version nicht gefunden");
    let next = {
      ...withoutPendingFlag(entry),
      label: patch.label !== undefined ? patch.label : entry.label,
      cover: patch.cover !== undefined ? patch.cover : entry.cover,
      film: patch.film !== undefined ? !!patch.film : !!entry.film,
      tracks: patch.tracks !== undefined ? patch.tracks : entry.tracks,
      // Zeitstempel für den Abgleich: Eine vorgemerkte Fassung wird später nur
      // hochgeladen, wenn sie neuer ist als die auf dem Server.
      updatedAt: nowIso(),
    };
    let pending = false;
    if (next.synced) {
      try {
        await pushSyncedVersion(forServer(next));
      } catch {
        // Offline oder Server startet neu: lokal behalten und vormerken. War
        // die Version noch nie oben, bleibt das auch so vermerkt.
        pending = true;
        next = {
          ...next,
          [PENDING_FLAG]: true,
          ...(entry[CREATE_FLAG] ? { [CREATE_FLAG]: true } : {}),
        };
      }
    }
    writeCustomVersions(
      readCustomVersions().map((v) => (v.value === value ? next : v)),
    );
    refreshCustom();
    resetMetadataIndex();
    return { pending };
  };

  // Eine Custom-Version an Accounts freigeben: legt sie als eingeschränkte
  // (Restricted-)Version auf dem Server an (aktueller Nutzer = Ersteller) und
  // entfernt die lokale Custom-Fassung (geht in die Restricted-Fassung über).
  //
  // Den `value` vergibt am Ende der Server: Ist der bisherige schon belegt,
  // bekommt die geteilte Version einen neuen. Die Funktion liefert deshalb den
  // tatsächlichen value zurück, und gerätelokale Filter des alten werden
  // aufgeräumt (die Custom-Fassung dazu gibt es nicht mehr).
  const shareCustomVersion = async (value, allowedUserIds = []) => {
    const entry = readCustomVersions().find((v) => v.value === value);
    if (!entry) throw new Error("Version nicht gefunden");
    const created = await createSharedVersion({
      value: entry.value,
      label: entry.label,
      cover: entry.cover || { kind: "preset", ref: "custom" },
      film: !!entry.film,
      tracks: entry.tracks || [],
      allowedUserIds: Array.isArray(allowedUserIds) ? allowedUserIds : [],
    });
    const sharedValue = created?.version?.value || entry.value;
    // Lokale Custom-Fassung entfernen (Server ist ab jetzt die Quelle).
    // Scheitert das Löschen auf dem Server, wird es vorgemerkt und beim
    // nächsten `loadVersions` nachgeholt. Bis dahin blendet der Abgleich die
    // Kopie aus; früher kam sie vom Server zurück und stand doppelt da.
    if (entry.synced) {
      try {
        await deleteSyncedVersion(entry.id);
      } catch {
        addPendingDelete(entry.id);
      }
    }
    writeCustomVersions(
      readCustomVersions().filter((v) => v.value !== value),
    );
    refreshCustom();
    // Neuer value: Ausblenden-Eintrag des alten mitnehmen, sonst bliebe er als
    // Leiche liegen. Ob die neue Version danach sichtbar ist, entscheidet wie
    // bei jeder frisch freigegebenen Version reconcileRestrictedFilters.
    if (sharedValue !== value && hiddenVersions.value.includes(value)) {
      hiddenVersions.value = hiddenVersions.value.map((v) =>
        v === value ? sharedValue : v,
      );
      saveList(HIDDEN_STORAGE_KEY, hiddenVersions.value);
    }
    // Frisch ausgelieferte Restricted-Versionen holen (inkl. der neuen).
    try {
      await fetchRestrictedVersions();
    } catch {
      /* offline – Cache behalten */
    }
    refreshRestricted();
    reconcileRestrictedFilters();
    resetMetadataIndex();
    return sharedValue;
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
        // Ausstehende Löschungen und vorgemerkte Änderungen nachholen und mit
        // dem Serverstand zusammenführen (Konfliktregeln siehe syncWithServer).
        await syncWithServer();
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
      // Token ließ sie liegen. Dasselbe gilt für die mit einem Konto
      // synchronisierten eigenen Versionen (samt Vormerkungen), sonst gingen
      // sie beim nächsten Anmelden in das dann angemeldete Konto.
      clearRestrictedVersions();
      removeSyncedCustomVersions();
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
