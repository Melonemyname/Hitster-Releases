<template>
  <q-dialog
    :model-value="modelValue"
    @update:model-value="(v) => $emit('update:modelValue', v)"
  >
    <q-card class="versions-dialog-card">
      <q-card-section class="row items-center q-pb-none">
        <div class="text-h6">Einstellungen · Versionen</div>
        <q-space />
        <q-btn v-close-popup icon="close" flat round dense />
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
                <img class="version-icon" :src="v.icon" :alt="v.label" />
              </q-card-section>
            </q-card>
            <div class="version-name">{{ v.label }}</div>
            <div v-if="v.imported" class="text-caption" style="opacity: 0.6">
              {{ v.trackCount }} Songs
            </div>
            <div class="version-manage-actions">
              <q-btn
                flat
                round
                dense
                :icon="isHidden(v.value) ? 'visibility_off' : 'visibility'"
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
                :loading="busyValue === v.value"
                @click="onToggleSync(v.value)"
              >
                <q-tooltip>{{
                  v.synced
                    ? "Mit Konto synchronisiert – klicken für nur dieses Gerät"
                    : "Nur auf diesem Gerät – klicken zum Synchronisieren"
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
                  @click="openEditor(v)"
                >
                  <q-tooltip>Version bearbeiten</q-tooltip>
                </q-btn>
                <q-btn
                  flat
                  round
                  dense
                  icon="group"
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
          <a href="https://exportify.net" target="_blank" rel="noopener"
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
          class="text-caption q-mb-sm"
          style="opacity: 0.7"
        >
          {{ csvTracks.length }} Songs erkannt<template v-if="csvOhneEnsemble > 0"
            >, bei {{ csvOhneEnsemble }} fehlt noch Band/Solo</template
          >
        </div>

        <q-input
          v-model="newLabel"
          outlined
          dense
          label="Name der Version"
          class="q-mb-sm"
        />

        <div class="text-caption q-mb-xs">Cover</div>
        <div class="cover-picker q-mb-sm">
          <button
            v-for="(url, key) in presetIcons"
            :key="key"
            type="button"
            class="cover-option"
            :class="{
              'cover-option--active':
                selectedCover.kind === 'preset' && selectedCover.ref === key,
            }"
            @click="selectedCover = { kind: 'preset', ref: key }"
          >
            <img :src="url" :alt="key" />
          </button>
          <button
            type="button"
            class="cover-option cover-option--upload"
            :class="{ 'cover-option--active': selectedCover.kind === 'upload' }"
            @click="triggerCover"
          >
            <img
              v-if="selectedCover.kind === 'upload'"
              :src="selectedCover.ref"
              alt="Eigenes Cover"
            />
            <q-icon v-else name="upload" size="24px" />
          </button>
          <input
            ref="coverInput"
            type="file"
            accept="image/*"
            style="display: none"
            @change="onCoverSelected"
          />
        </div>

        <q-toggle
          v-model="syncNew"
          :disable="!loggedIn"
          label="Mit Konto synchronisieren (auf allen Geräten verfügbar)"
          class="q-mb-xs"
        />
        <div
          v-if="!loggedIn"
          class="text-caption q-mb-sm"
          style="opacity: 0.7"
        >
          Zum Synchronisieren anmelden – sonst nur auf diesem Gerät.
        </div>

        <q-toggle
          v-model="newIsFilm"
          label="Ist eine Film-/Serien-Version"
          class="q-mb-xs"
        />
        <div
          v-if="newIsFilm"
          class="text-caption q-mb-sm"
          style="opacity: 0.7"
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
  <q-dialog v-model="showConfirm">
    <q-card class="confirm-card">
      <q-card-section class="row items-center">
        <q-icon name="warning" color="negative" size="28px" class="q-mr-sm" />
        <div class="text-h6">Version löschen?</div>
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
import { ref, computed, watch } from "vue";
import { Notify, Dialog } from "quasar";
import { useVersions } from "../composables/useVersions";
import { VERSION_ICONS } from "../utils/versionsCatalog";
import { parseExportifyFile } from "../utils/exportifyCsv";
import { isLoggedIn } from "../utils/authService";
import ShareVersionDialog from "./ShareVersionDialog.vue";
import VersionEditor from "./VersionEditor.vue";

// Bild -> auf max. 256px verkleinerte Data-URL (für eigene Cover).
function fileToCover(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 256;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas
          .getContext("2d")
          .drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default {
  name: "VersionsDialog",
  components: { ShareVersionDialog, VersionEditor },
  props: {
    modelValue: { type: Boolean, default: false },
  },
  emits: ["update:modelValue"],
  setup(props) {
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
    const presetIcons = VERSION_ICONS;

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
    const coverInput = ref(null);

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

    const resetCreateForm = () => {
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
        if (!open) return;
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
          Notify.create({
            type: "warning",
            message: "Keine gültigen Songs in der CSV gefunden.",
            timeout: 3000,
          });
        }
      } catch (e) {
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

    const triggerCover = () => coverInput.value?.click();

    const onCoverSelected = async (event) => {
      const file = event?.target?.files?.[0];
      if (!file) return;
      try {
        const dataUrl = await fileToCover(file);
        selectedCover.value = { kind: "upload", ref: dataUrl };
      } catch {
        Notify.create({
          type: "negative",
          message: "Bild konnte nicht geladen werden.",
          timeout: 2500,
        });
      } finally {
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
        Notify.create({
          type: "positive",
          message: `„${newLabel.value.trim()}" erstellt (${csvTracks.value.length} Songs).`,
          timeout: 2500,
        });
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
          message: `Löschen fehlgeschlagen: ${e.message}`,
          timeout: 3000,
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
          message: `Synchronisierung fehlgeschlagen: ${e.message}`,
          timeout: 3000,
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
      allVersions,
      hasDeleted,
      isHidden,
      isDeletable,
      toggleHidden,
      resetDeleted,
      loggedIn,
      presetIcons,
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
      coverInput,
      triggerCsv,
      onCsvSelected,
      triggerCover,
      onCoverSelected,
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
.version-manage-item--hidden {
  opacity: 0.4;
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
.standard-chip {
  opacity: 0.7;
  font-size: 0.7rem;
}
.cover-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.cover-option {
  width: 52px;
  height: 52px;
  padding: 0;
  border: 2px solid transparent;
  border-radius: var(--surface-radius);
  overflow: hidden;
  background: var(--surface-bg-weak);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.cover-option img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.cover-option--active {
  border-color: var(--app-accent);
}
</style>
