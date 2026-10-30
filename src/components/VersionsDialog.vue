<template>
  <!-- aria-labelledby landet bei QDialog (inheritAttrs: false) direkt auf dem
       Element mit role="dialog"; so liest ein Screenreader den sichtbaren Titel
       als Namen des Dialogs vor. -->
  <q-dialog
    :model-value="modelValue"
    :aria-labelledby="titleId"
    @update:model-value="(v) => $emit('update:modelValue', v)"
  >
    <q-card class="versions-dialog-card">
      <q-card-section class="row items-center q-pb-none">
        <div :id="titleId" class="text-h6">Einstellungen · Versionen</div>
        <q-space />
        <q-btn
          v-close-popup
          icon="close"
          flat
          round
          dense
          aria-label="Schließen"
        />
      </q-card-section>

      <q-card-section>
        <div class="text-body2 q-mb-md">
          <q-icon name="visibility" size="18px" class="q-mr-xs" />
          Ausblenden entfernt eine Version aus der Auswahl (umkehrbar).
          <br />
          <q-icon name="delete" size="18px" class="q-mr-xs" />
          Löschen: selbst hinzugefügte Versionen; Standardversionen nur
          ausblendbar.
        </div>

        <div class="version-grid">
          <div
            v-for="v in allVersions"
            :key="v.value"
            class="version-manage-item"
            :class="{ 'version-manage-item--hidden': isHidden(v.value) }"
          >
            <q-card class="timeline-look-card">
              <q-card-section class="timeline-look-content">
                <!-- Leeres alt: Der Name steht direkt darunter als Text, ein
                     Screenreader würde ihn sonst doppelt vorlesen. -->
                <img class="version-icon" :src="v.icon" alt="" />
              </q-card-section>
            </q-card>
            <div class="version-name" :title="v.label">{{ v.label }}</div>
            <!-- Die Zeile bleibt auch ohne Songzahl stehen (leer), sonst sitzt
                 die Aktionsreihe je nach Versionsart unterschiedlich tief und
                 die Knöpfe einer Rasterreihe fluchten nicht. -->
            <div class="version-track-count text-caption text-muted">
              <template v-if="v.imported">{{ v.trackCount }} Songs</template>
            </div>
            <div class="version-manage-actions">
              <q-btn
                flat
                round
                dense
                :icon="isHidden(v.value) ? 'visibility_off' : 'visibility'"
                :aria-label="
                  isHidden(v.value)
                    ? `${v.label} wieder einblenden`
                    : `${v.label} ausblenden`
                "
                @click="toggleHidden(v.value)"
              >
                <q-tooltip>{{
                  isHidden(v.value) ? "Wieder einblenden" : "Ausblenden"
                }}</q-tooltip>
              </q-btn>

              <!-- Sync-Toggle nur für eigene Versionen (und eingeloggt) -->
              <q-btn
                v-if="v.imported && loggedIn"
                flat
                round
                dense
                :color="v.synced ? 'primary' : undefined"
                :icon="v.synced ? 'cloud_done' : 'cloud_off'"
                :aria-label="
                  v.synced
                    ? `${v.label}: mit Konto synchronisiert, nur auf diesem Gerät speichern`
                    : `${v.label}: nur auf diesem Gerät, mit Konto synchronisieren`
                "
                :loading="busyValue === v.value"
                @click="onToggleSync(v.value)"
              >
                <q-tooltip>{{
                  v.synced
                    ? "Mit Konto synchronisiert. Klicken für nur dieses Gerät"
                    : "Nur auf diesem Gerät. Klicken zum Synchronisieren"
                }}</q-tooltip>
              </q-btn>

              <!-- Eigene Version bearbeiten: Name, Metadaten pro Song (auch
                   Film/Serie) und Songs aus einer weiteren CSV ergänzen. Der
                   frühere zweite Knopf nur für Filme ist entfallen, seit der
                   Editor auch für eigene Versionen gilt. -->
              <q-btn
                v-if="v.imported"
                flat
                round
                dense
                icon="edit"
                :aria-label="`${v.label} bearbeiten`"
                @click="openEditor(v, 'custom')"
              >
                <q-tooltip>
                  {{ v.film ? "Bearbeiten / Filme eintragen" : "Version bearbeiten" }}
                </q-tooltip>
              </q-btn>

              <!-- Eigene Version: an Accounts freigeben (wird zu Restricted) -->
              <q-btn
                v-if="v.imported && loggedIn"
                flat
                round
                dense
                icon="group_add"
                :aria-label="`${v.label} an Accounts freigeben`"
                @click="openShare(v, 'create')"
              >
                <q-tooltip>An Accounts freigeben</q-tooltip>
              </q-btn>

              <!-- Eingeschränkte Version, verwaltbar (Ersteller/Admin) -->
              <template v-if="v.restricted && v.canManage">
                <q-btn
                  flat
                  round
                  dense
                  icon="edit"
                  :aria-label="`${v.label} bearbeiten`"
                  @click="openEditor(v)"
                >
                  <q-tooltip>Version bearbeiten</q-tooltip>
                </q-btn>
                <q-btn
                  flat
                  round
                  dense
                  icon="group"
                  :aria-label="`Freigaben von ${v.label} verwalten`"
                  @click="openShare(v, 'access')"
                >
                  <q-tooltip>Freigaben verwalten</q-tooltip>
                </q-btn>
                <q-btn
                  flat
                  round
                  dense
                  color="negative"
                  icon="delete"
                  :aria-label="`${v.label} löschen`"
                  :loading="busyValue === v.value"
                  @click="askDeleteRestricted(v)"
                >
                  <q-tooltip>Version löschen</q-tooltip>
                </q-btn>
              </template>

              <q-btn
                v-if="isDeletable(v.value)"
                flat
                round
                dense
                color="negative"
                icon="delete"
                :aria-label="
                  v.imported
                    ? `${v.label} löschen`
                    : `${v.label} von diesem Gerät löschen`
                "
                :loading="busyValue === v.value"
                @click="askDelete(v)"
              >
                <q-tooltip>{{
                  v.imported ? "Löschen" : "Von diesem Gerät löschen"
                }}</q-tooltip>
              </q-btn>
              <q-chip
                v-else-if="v.restricted && !v.canManage"
                dense
                square
                class="standard-chip"
              >
                Freigegeben
              </q-chip>
              <q-chip
                v-else-if="!v.restricted && !v.imported"
                dense
                square
                class="standard-chip"
              >
                Standard
              </q-chip>
            </div>
          </div>
        </div>

        <div v-if="hasDeleted" class="q-mt-sm">
          <q-btn
            flat
            dense
            icon="restore"
            label="Gelöschte wiederherstellen"
            @click="resetDeleted"
          />
        </div>
      </q-card-section>

      <q-separator />

      <!-- ── Version erstellen ─────────────────────────────────────────── -->
      <q-card-section>
        <div class="row items-center q-mb-sm">
          <q-icon name="add_circle" size="20px" class="q-mr-xs" />
          <div class="text-subtitle1">Version erstellen</div>
        </div>

        <div class="text-body2 q-mb-sm">
          Playlist mit
          <a
            class="text-link"
            href="https://exportify.net"
            target="_blank"
            rel="noopener"
            >Exportify</a
          >
          als CSV exportieren und hier hochladen.
          <q-btn
            flat
            dense
            no-caps
            size="sm"
            color="primary"
            icon="open_in_new"
            label="Exportify öffnen"
            type="a"
            href="https://exportify.net"
            target="_blank"
            rel="noopener"
            class="q-ml-xs"
          />
        </div>

        <div class="row items-center q-gutter-sm q-mb-sm">
          <q-btn
            outline
            no-caps
            icon="upload_file"
            :label="csvFile ? csvFile.name : 'CSV auswählen'"
            :loading="parsingCsv"
            class="col"
            @click="triggerCsv"
          />
          <input
            ref="csvInput"
            type="file"
            accept=".csv,text/csv"
            style="display: none"
            @change="onCsvSelected"
          />
        </div>
        <div
          v-if="csvTracks.length > 0"
          class="text-caption text-muted q-mb-sm"
        >
          {{ csvTracks.length }} Songs erkannt<template v-if="csvOhneEnsemble > 0"
            >, bei {{ csvOhneEnsemble }} fehlt noch Band/Solo</template
          >
        </div>
        <!-- MusicBrainz prüft im Hintergrund (nur angemeldet). Erstellen geht
             jederzeit; was bis dahin angekommen ist, steckt in der Version. -->
        <MusicBrainzPanel
          v-if="mbRunning || mbSummary || mbItems.length || mbFilledItems.length"
          class="q-mb-sm"
          :running="mbRunning"
          :done="mbDone"
          :total="mbTotal"
          :summary="mbSummary"
          :items="mbItems"
          :filled="mbFilledItems"
          :original-count="mbOriginalCount"
          @skip="mbSkip"
          @accept="onMbAccept"
          @keep="onMbKeep"
          @accept-all-original="onMbAcceptAllOriginal"
          @undo-ensemble="onMbUndoEnsemble"
        />

        <q-input
          v-model="newLabel"
          outlined
          dense
          label="Name der Version"
          class="q-mb-sm"
        />

        <CoverPicker v-model="selectedCover" class="q-mb-sm" />

        <q-toggle
          v-model="syncNew"
          :disable="!loggedIn"
          label="Mit Konto synchronisieren (auf allen Geräten verfügbar)"
          class="q-mb-xs"
        />
        <div
          v-if="!loggedIn"
          class="text-caption text-muted q-mb-sm"
        >
          Zum Synchronisieren anmelden, sonst nur auf diesem Gerät.
        </div>

        <q-toggle
          v-model="newIsFilm"
          label="Ist eine Film-/Serien-Version"
          class="q-mb-xs"
        />
        <div
          v-if="newIsFilm"
          class="text-caption text-muted q-mb-sm"
        >
          Nach dem Erstellen kannst du direkt die Filme pro Song eintragen
          (nötig, damit die Version im Film-Modus wählbar ist).
        </div>

        <div class="row justify-end">
          <q-btn
            color="primary"
            icon="add"
            label="Version erstellen"
            :loading="creating"
            :disable="!canCreate"
            @click="createVersion"
          />
        </div>
      </q-card-section>
    </q-card>
  </q-dialog>

  <!-- Löschen bestätigen -->
  <q-dialog v-model="showConfirm" :aria-labelledby="confirmTitleId">
    <q-card class="confirm-card">
      <q-card-section class="row items-center">
        <q-icon name="warning" color="negative" size="28px" class="q-mr-sm" />
        <div :id="confirmTitleId" class="text-h6">Version löschen?</div>
      </q-card-section>
      <q-card-section class="q-pt-none">
        <strong>{{ pendingDelete?.label }}</strong>
        <template v-if="pendingDelete?.imported">
          wird entfernt<template v-if="pendingDelete?.synced">
            (auch aus deinem Konto)</template
          >.
        </template>
        <template v-else>
          wird von diesem Gerät entfernt (über „Gelöschte wiederherstellen"
          zurückholbar).
        </template>
      </q-card-section>
      <q-card-actions align="right">
        <q-btn v-close-popup flat label="Abbrechen" />
        <q-btn
          color="negative"
          icon="delete"
          label="Löschen"
          @click="confirmDelete"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>

  <!-- Teilen / Freigaben (Custom -> Restricted bzw. Freigaben ändern) -->
  <ShareVersionDialog
    v-model="showShare"
    :version-value="shareValue"
    :version-label="shareLabel"
    :mode="shareMode"
    @shared="onShared"
  />

  <!-- Editor (eigene und freigegebene Versionen) -->
  <VersionEditor
    v-model="showEditor"
    :version-value="editorValue"
    :kind="editorKind"
    @saved="onSubDialogChanged"
  />
</template>

<script>
import { ref, computed, watch, useId } from "vue";
import { Notify, Dialog } from "quasar";
import { useVersions } from "../composables/useVersions";
import { parseExportifyFile } from "../utils/exportifyCsv";
import { isLoggedIn } from "../utils/authService";
import ShareVersionDialog from "./ShareVersionDialog.vue";
import VersionEditor from "./VersionEditor.vue";
import MusicBrainzPanel from "./MusicBrainzPanel.vue";
import CoverPicker from "./CoverPicker.vue";
import {
  useMusicBrainzCheck,
  trackKey,
  displayTrack,
} from "../utils/musicbrainzService";

export default {
  name: "VersionsDialog",
  components: {
    ShareVersionDialog,
    VersionEditor,
    MusicBrainzPanel,
    CoverPicker,
  },
  props: {
    modelValue: { type: Boolean, default: false },
  },
  emits: ["update:modelValue"],
  setup(props) {
    // Eindeutige IDs für die Dialogtitel (aria-labelledby), auch falls die
    // Komponente einmal mehrfach im DOM steckt.
    const titleId = `versions-title-${useId()}`;
    const confirmTitleId = `versions-confirm-title-${useId()}`;

    const {
      allVersions,
      hasDeleted,
      isHidden,
      isDeletable,
      toggleHidden,
      deleteVersion,
      deleteRestrictedVersion,
      resetDeleted,
      createCustomVersion,
      toggleSync,
      loadVersions,
    } = useVersions();

    const loggedIn = ref(isLoggedIn());

    // Löschen / Sync
    const showConfirm = ref(false);
    const pendingDelete = ref(null);
    const busyValue = ref(null);

    // Erstellen
    const csvInput = ref(null);
    const csvFile = ref(null);
    const csvTracks = ref([]);
    const parsingCsv = ref(false);
    const newLabel = ref("");
    const selectedCover = ref({ kind: "preset", ref: "custom" });
    const syncNew = ref(false);
    const newIsFilm = ref(false);
    const creating = ref(false);

    // Zustand der Unter-Dialoge (Teilen, Editor, Film-Eintrag).
    const showShare = ref(false);
    const shareMode = ref("create");
    const shareValue = ref("");
    const shareLabel = ref("");
    const shareIsFilm = ref(false);
    const showEditor = ref(false);
    const editorValue = ref("");
    // 'custom' = eigene Version (lokal/Konto), 'restricted' = freigegebene
    // Version (Server). Der Editor liest und speichert je nach Art woanders.
    const editorKind = ref("restricted");

    const openShare = (version, mode) => {
      shareValue.value = version.value;
      shareLabel.value = version.label;
      shareMode.value = mode;
      shareIsFilm.value = !!version.film;
      showShare.value = true;
    };
    const openEditor = (version, kind = "restricted") => {
      editorValue.value = version.value;
      editorKind.value = kind;
      showEditor.value = true;
    };
    const onSubDialogChanged = () => {
      // Nach Teilen/Editor/Freigabe die Versionsliste frisch spiegeln.
      loadVersions();
    };
    const onShared = (info) => {
      loadVersions();
      // Wurde eine Film-Version gerade freigegeben (jetzt Restricted), kann der
      // leichte Custom-Film-Dialog nicht mehr genutzt werden -> Hinweis auf den
      // Editor (Bearbeiten-Stift der Version).
      if (info?.mode === "create" && shareIsFilm.value) {
        Notify.create({
          type: "info",
          message:
            "Film-Version freigegeben. Die Filme trägst du jetzt über den Bearbeiten-Stift (Editor) der Version ein.",
          timeout: 5000,
        });
      }
    };

    const canCreate = computed(
      () => !!newLabel.value.trim() && csvTracks.value.length > 0,
    );

    // Band/Solo wird beim Import aus dem bekannten Bestand ergaenzt. Was offen
    // bleibt, traegt man nach dem Erstellen ueber den Bearbeiten-Stift nach.
    const csvOhneEnsemble = computed(
      () =>
        csvTracks.value.filter((t) => !String(t.ensemble || "").trim()).length,
    );

    // MusicBrainz-Abgleich der gerade gewählten CSV. Ergebnisse, die nach dem
    // Erstellen oder Schließen eintreffen, verwirft useMusicBrainzCheck.
    const mb = useMusicBrainzCheck();

    // Paket eingetroffen: fehlendes Band/Solo nachtragen (nie überschreiben).
    // mb merkt sich, was es gefüllt hat (Anzeige und Zurücknehmen).
    const applyBatch = (batch) => {
      let changed = false;
      const next = csvTracks.value.map((t) => {
        const key = trackKey(t);
        if (!(key in batch)) return t;
        const n = mb.fillEnsemble(t, batch[key]);
        if (n !== t) changed = true;
        return n;
      });
      if (changed) csvTracks.value = next;
    };

    const mbItems = computed(() => {
      const seen = new Set();
      const out = [];
      for (const t of csvTracks.value) {
        const key = trackKey(t);
        if (seen.has(key)) continue;
        seen.add(key);
        const hint = mb.openHint(t);
        if (hint) out.push({ key, ...displayTrack(t), ...hint });
      }
      return out;
    });

    // Songs, deren Band/Solo von MusicBrainz kommt.
    const mbFilledItems = computed(() => {
      const seen = new Set();
      const out = [];
      for (const t of csvTracks.value) {
        const key = trackKey(t);
        if (seen.has(key)) continue;
        const ensemble = mb.filledEnsemble(t);
        if (!ensemble) continue;
        seen.add(key);
        const d = displayTrack(t);
        out.push({ key, title: d.title, artist: d.artist, ensemble });
      }
      return out;
    });

    const mbOriginalCount = computed(
      () => mbItems.value.filter((it) => it.originalYear).length,
    );

    // Gewähltes Jahr ('original' oder 'recording') als Hauptjahr vorn, das
    // bisherige bleibt als weiteres Jahr.
    const onMbAccept = (key, which = "recording") => {
      let marked = null;
      csvTracks.value = csvTracks.value.map((t) => {
        if (trackKey(t) !== key) return t;
        marked = t;
        return mb.applyYear(t, which);
      });
      if (marked) mb.markHandled(marked);
    };
    const onMbKeep = (key) => {
      const t = csvTracks.value.find((x) => trackKey(x) === key);
      if (t) mb.markHandled(t);
    };
    const onMbAcceptAllOriginal = () => {
      const keys = new Set(
        mbItems.value.filter((it) => it.originalYear).map((it) => it.key),
      );
      if (!keys.size) return;
      const done = [];
      csvTracks.value = csvTracks.value.map((t) => {
        if (!keys.has(trackKey(t))) return t;
        done.push(t);
        return mb.applyYear(t, "original");
      });
      done.forEach((t) => mb.markHandled(t));
    };
    // Band/Solo wieder leeren, wie es vor der Prüfung war.
    const onMbUndoEnsemble = (key) => {
      let found = null;
      csvTracks.value = csvTracks.value.map((t) => {
        if (trackKey(t) !== key || !mb.filledEnsemble(t)) return t;
        found = t;
        return { ...t, ensemble: "" };
      });
      if (found) mb.forgetFilled(found);
    };

    const resetCreateForm = () => {
      mb.reset();
      csvFile.value = null;
      csvTracks.value = [];
      newLabel.value = "";
      selectedCover.value = { kind: "preset", ref: "custom" };
      syncNew.value = loggedIn.value;
      newIsFilm.value = false;
    };

    watch(
      () => props.modelValue,
      (open) => {
        if (!open) {
          mb.reset();
          return;
        }
        loggedIn.value = isLoggedIn();
        syncNew.value = loggedIn.value;
        loadVersions();
      },
      { immediate: true },
    );

    const triggerCsv = () => csvInput.value?.click();

    const onCsvSelected = async (event) => {
      const file = event?.target?.files?.[0];
      if (!file) return;
      parsingCsv.value = true;
      try {
        const tracks = await parseExportifyFile(file);
        csvFile.value = file;
        csvTracks.value = tracks;
        if (!newLabel.value.trim()) {
          newLabel.value = file.name.replace(/\.csv$/i, "");
        }
        if (tracks.length === 0) {
          mb.reset();
          Notify.create({
            type: "warning",
            message: "Keine gültigen Songs in der CSV gefunden.",
            timeout: 3000,
          });
        } else {
          // Im Hintergrund, das Formular bleibt bedienbar.
          mb.start(tracks, { onBatch: applyBatch }).catch(() => {});
        }
      } catch (e) {
        mb.reset();
        csvFile.value = null;
        csvTracks.value = [];
        Notify.create({
          type: "negative",
          message: `CSV konnte nicht gelesen werden: ${e.message}`,
          timeout: 3500,
        });
      } finally {
        parsingCsv.value = false;
        if (event.target) event.target.value = "";
      }
    };

    const createVersion = async () => {
      if (!canCreate.value) return;
      creating.value = true;
      try {
        const created = await createCustomVersion({
          label: newLabel.value,
          tracks: csvTracks.value,
          cover: selectedCover.value,
          synced: syncNew.value && loggedIn.value,
          film: newIsFilm.value,
        });
        // Server nicht erreichbar: Die Version ist trotzdem angelegt (lokal,
        // zum Hochladen vorgemerkt). Formular schließen wie bei Erfolg, sonst
        // legt ein zweiter Klick eine Doppelung an.
        Notify.create(
          created?.pendingPush
            ? {
                type: "warning",
                message: `„${newLabel.value.trim()}" lokal gespeichert, wird hochgeladen, sobald der Server erreichbar ist.`,
                timeout: 4000,
              }
            : {
                type: "positive",
                message: `„${newLabel.value.trim()}" erstellt (${csvTracks.value.length} Songs).`,
                timeout: 2500,
              },
        );
        const wasFilm = newIsFilm.value;
        resetCreateForm();
        // Film-Version: direkt in den Editor, damit die Filme pro Song
        // hinterlegt werden können (sonst ist sie im Film-Modus nicht wählbar).
        if (wasFilm && created?.value) {
          openEditor(created, "custom");
        }
      } catch (e) {
        Notify.create({
          type: "negative",
          message: `Erstellen fehlgeschlagen: ${e.message}`,
          timeout: 3500,
        });
      } finally {
        creating.value = false;
      }
    };

    const askDelete = (version) => {
      pendingDelete.value = version;
      showConfirm.value = true;
    };

    const confirmDelete = async () => {
      const version = pendingDelete.value;
      if (!version) return;
      busyValue.value = version.value;
      try {
        await deleteVersion(version.value);
        Notify.create({
          type: "positive",
          message: `„${version.label}" gelöscht.`,
          timeout: 2000,
        });
      } catch (e) {
        Notify.create({
          type: "negative",
          // Bei einer synchronisierten Version bricht das Löschen ab, wenn der
          // Server nicht mitspielt; lokal bleibt dann alles, wie es war.
          message: `Löschen fehlgeschlagen, die Version bleibt erhalten: ${e.message}`,
          timeout: 4000,
        });
      } finally {
        busyValue.value = null;
        showConfirm.value = false;
        pendingDelete.value = null;
      }
    };

    const onToggleSync = async (value) => {
      busyValue.value = value;
      try {
        await toggleSync(value);
      } catch (e) {
        Notify.create({
          type: "negative",
          message: `Synchronisierung fehlgeschlagen, nichts geändert: ${e.message}`,
          timeout: 4000,
        });
      } finally {
        busyValue.value = null;
      }
    };

    // Eingeschränkte (geteilte) Version löschen – nur für Verwalter sichtbar.
    const askDeleteRestricted = (version) => {
      Dialog.create({
        title: "Version löschen",
        message: `Soll „${version.label}" wirklich gelöscht werden? Sie verschwindet damit für alle freigegebenen Accounts.`,
        cancel: { label: "Abbrechen", flat: true, color: "grey-7" },
        ok: { label: "Löschen", color: "negative", icon: "delete" },
        persistent: true,
      }).onOk(async () => {
        busyValue.value = version.value;
        try {
          await deleteRestrictedVersion(version.value);
          Notify.create({
            type: "positive",
            message: `„${version.label}" gelöscht.`,
            timeout: 2000,
          });
        } catch (e) {
          Notify.create({
            type: "negative",
            message: `Löschen fehlgeschlagen: ${e.message}`,
            timeout: 3000,
          });
        } finally {
          busyValue.value = null;
        }
      });
    };

    return {
      titleId,
      confirmTitleId,
      allVersions,
      hasDeleted,
      isHidden,
      isDeletable,
      toggleHidden,
      resetDeleted,
      loggedIn,
      showConfirm,
      pendingDelete,
      busyValue,
      askDelete,
      confirmDelete,
      askDeleteRestricted,
      onToggleSync,
      csvInput,
      csvFile,
      csvTracks,
      csvOhneEnsemble,
      parsingCsv,
      newLabel,
      selectedCover,
      syncNew,
      newIsFilm,
      creating,
      canCreate,
      triggerCsv,
      onCsvSelected,
      createVersion,
      showShare,
      shareMode,
      shareValue,
      shareLabel,
      showEditor,
      editorValue,
      editorKind,
      openShare,
      openEditor,
      onSubDialogChanged,
      onShared,
      mbRunning: mb.running,
      mbDone: mb.done,
      mbTotal: mb.total,
      mbSummary: mb.summary,
      mbItems,
      mbFilledItems,
      mbOriginalCount,
      mbSkip: mb.skip,
      onMbAccept,
      onMbKeep,
      onMbAcceptAllOriginal,
      onMbUndoEnsemble,
    };
  },
};
</script>

<style scoped>
.versions-dialog-card {
  width: 600px;
  max-width: 92vw;
}
.version-manage-item {
  text-align: center;
  transition: opacity 160ms ease;
}
/* Ausgeblendete Versionen: Früher wurde die ganze Kachel auf 40 % Deckkraft
   gesetzt, damit fiel auch der Name unter das Mindestkontrastverhältnis.
   Jetzt tritt nur das Cover zurück, der Name wechselt auf die gedämpfte,
   aber noch lesbare Flächenschrift. Den Zustand nennt zusätzlich der Augen-
   Knopf (Symbol und zugänglicher Name). */
.version-manage-item--hidden .timeline-look-card {
  opacity: 0.4;
}
.version-manage-item--hidden .version-name {
  color: var(--app-on-surface-muted);
}
/* Platzhalter-Höhe, damit Kacheln mit und ohne Songzahl gleich hoch bleiben. */
.version-track-count {
  min-height: 1.25em;
  line-height: 1.25;
}
/* Eine eigene Film-Version bringt es auf sechs Aktionen (Ausblenden, Sync,
   Bearbeiten, Filme, Freigeben, Loeschen). Die passen nicht in eine Spalte des
   Vier-Spalten-Rasters, deshalb umbrechen statt ueber den Rand schieben. */
.version-manage-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 2px;
  margin-top: 4px;
  min-height: 32px;
}
/* Keine Deckkraft-Absenkung mehr: Mit opacity mischten sich Chip-Fläche und
   Schrift mit dem Untergrund, die Beschriftung kam je nach Theme nur noch auf
   2,7:1 (dunkle Schrift auf abgedunkeltem Akzent). Ohne gilt das reguläre
   Akzent-/On-Accent-Paar der Chips. */
.standard-chip {
  font-size: 0.7rem;
}
/* Link im Fließtext: Akzent als Textfarbe in der lesbaren Variante statt der
   Browser-Standardfarbe (dunkelblau auf dunkler Fläche). */
.text-link {
  color: var(--app-accent-text);
  text-decoration: underline;
}
/* ── Schmale Bildschirme ────────────────────────────────────────────────
   Das Raster geht bereits auf zwei Spalten (app.scss). Hier vor allem die
   Aktionsreihe: Eine eigene Film-Version bringt es auf fuenf Knoepfe, die
   in einer halben Handy-Breite nicht nebeneinander passen. */
@media (max-width: 599px) {
  .version-manage-actions {
    gap: 0;
  }
  .version-manage-actions :deep(.q-btn) {
    padding: 2px;
    min-height: 28px;
  }
  .version-name {
    font-size: 0.82rem;
    line-height: 1.2;
  }
}
</style>
