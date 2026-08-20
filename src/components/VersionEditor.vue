<template>
  <q-dialog
    :model-value="modelValue"
    @update:model-value="(v) => $emit('update:modelValue', v)"
  >
    <q-card class="editor-card">
      <q-card-section class="row items-center q-pb-none">
        <q-icon name="edit" size="22px" class="q-mr-sm" />
        <div class="text-h6">Version bearbeiten</div>
        <q-space />
        <q-btn v-close-popup icon="close" flat round dense />
      </q-card-section>

      <q-card-section>
        <q-input
          v-model="label"
          dense
          outlined
          label="Name der Version"
          class="q-mb-sm"
        />
        <q-toggle
          v-model="film"
          label="Ist eine Film-/Serien-Version"
          class="q-mb-md"
        />

        <q-separator class="q-mb-md" />

        <!-- ── Songs aus einer weiteren CSV ergaenzen ──────────────────────
             Haengt die neuen Links samt Metadaten an die vorhandenen an.
             Songs, die schon in der Version stecken, werden uebersprungen,
             damit ein erneuter Export derselben Playlist nichts doppelt. -->
        <div class="row items-center q-mb-xs">
          <q-icon name="playlist_add" size="20px" class="q-mr-xs" />
          <div class="text-subtitle2">Songs aus CSV ergänzen</div>
        </div>
        <div class="text-caption q-mb-sm" style="opacity: 0.7">
          Neue Playlist mit
          <a href="https://exportify.net" target="_blank" rel="noopener"
            >Exportify</a
          >
          als CSV exportieren. Links und Metadaten werden an diese Version
          angehängt, bereits vorhandene Songs übersprungen.
        </div>
        <div class="row items-center q-gutter-sm q-mb-sm">
          <q-btn
            outline
            no-caps
            icon="upload_file"
            label="CSV auswählen"
            :loading="importing"
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
          v-if="lastImport"
          class="text-caption q-mb-sm"
          style="opacity: 0.8"
        >
          {{ lastImport }}
        </div>

        <q-separator class="q-mb-md" />

        <div class="row items-center q-gutter-sm q-mb-sm">
          <div class="col text-caption" style="opacity: 0.7">
            {{ tracks.length }} Songs in dieser Version<template
              v-if="ohneEnsemble > 0"
              >, bei {{ ohneEnsemble }} fehlt Band/Solo</template
            >
          </div>
          <!-- Versionen, die vor der automatischen Erkennung importiert wurden,
               haben das Feld durchgehend leer. Hier nachtragbar, ohne die
               bereits gesetzten Werte anzufassen. -->
          <q-btn
            v-if="ohneEnsemble > 0"
            outline
            dense
            no-caps
            size="sm"
            icon="auto_fix_high"
            label="Band/Solo ergänzen"
            :loading="fillingEnsemble"
            @click="onFillEnsemble"
          />
        </div>

        <SongMetadataEditor
          v-if="modelValue"
          v-model:tracks="tracks"
          :fields="fields"
          allow-remove
        />
      </q-card-section>

      <q-card-actions align="right" class="q-pa-md">
        <q-btn v-close-popup flat label="Abbrechen" color="grey-7" />
        <q-btn
          color="primary"
          icon="save"
          label="Speichern"
          :loading="saving"
          @click="onSave"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script>
import { ref, computed, watch } from "vue";
import { Notify } from "quasar";
import SongMetadataEditor from "./SongMetadataEditor.vue";
import { useVersions } from "../composables/useVersions";
import { getRestrictedVersion } from "../utils/restrictedVersionsStore";
import { getCustomVersion } from "../utils/customVersionsStore";
import { parseExportifyFile, fillEnsemble } from "../utils/exportifyCsv";

const FIELDS = [
  { key: "title", label: "Titel" },
  { key: "artist", label: "Künstler" },
  { key: "year", label: "Jahr", type: "number" },
  {
    key: "ensemble",
    label: "Band/Solo",
    type: "select",
    options: [
      { label: "— (nicht gesetzt)", value: "" },
      { label: "Band", value: "Band" },
      { label: "Solo", value: "Solo" },
    ],
  },
  { key: "movie", label: "Film/Serie" },
];

// Erkennungsmerkmal eines Songs beim Ergaenzen: bevorzugt die Spotify-Track-id,
// sonst die URL, sonst Titel+Kuenstler. Ohne diesen Abgleich wuerde eine
// erweiterte Playlist alle alten Songs ein zweites Mal hineinschreiben.
function trackKey(track) {
  const id = String(track?.trackId || "").trim();
  if (id) return `id:${id.toLowerCase()}`;
  const url = String(track?.url || "").trim();
  if (url) return `url:${url.toLowerCase()}`;
  const title = String(track?.title || "")
    .trim()
    .toLowerCase();
  const artist = String(track?.artist || "")
    .trim()
    .toLowerCase();
  return `ta:${title}|${artist}`;
}

export default {
  name: "VersionEditor",
  components: { SongMetadataEditor },
  props: {
    modelValue: { type: Boolean, default: false },
    // Pool-Wert der zu bearbeitenden Version (eigene oder eingeschränkte).
    versionValue: { type: String, default: "" },
    // 'restricted' = freigegebene Version (Server), 'custom' = eigene Version.
    kind: { type: String, default: "restricted" },
  },
  emits: ["update:modelValue", "saved"],
  setup(props, { emit }) {
    const { updateRestrictedVersion, updateCustomVersion } = useVersions();
    const label = ref("");
    const film = ref(false);
    const tracks = ref([]);
    const saving = ref(false);
    const csvInput = ref(null);
    const importing = ref(false);
    const lastImport = ref("");
    const fillingEnsemble = ref(false);

    const ohneEnsemble = computed(
      () =>
        tracks.value.filter((t) => !String(t.ensemble || "").trim()).length,
    );

    // Beim Öffnen die aktuelle Version aus dem passenden Store in eine
    // Arbeitskopie laden.
    watch(
      () => props.modelValue,
      (open) => {
        if (!open) return;
        const v =
          props.kind === "custom"
            ? getCustomVersion(props.versionValue)
            : getRestrictedVersion(props.versionValue);
        label.value = v?.label || "";
        film.value = !!v?.film;
        tracks.value = (v?.tracks || []).map((t) => ({ ...t }));
        lastImport.value = "";
      },
      { immediate: true },
    );

    const triggerCsv = () => csvInput.value?.click();

    const onCsvSelected = async (event) => {
      const file = event?.target?.files?.[0];
      if (!file) return;
      importing.value = true;
      try {
        const neue = await parseExportifyFile(file);
        const bekannt = new Set(tracks.value.map(trackKey));
        const ergaenzt = [];
        for (const t of neue) {
          const key = trackKey(t);
          if (bekannt.has(key)) continue;
          bekannt.add(key);
          ergaenzt.push(t);
        }
        const uebersprungen = neue.length - ergaenzt.length;
        // Band/Solo wird beim Import aus dem bekannten Bestand ergaenzt; was
        // offen bleibt, traegt man unten pro Song selbst nach.
        const offen = ergaenzt.filter(
          (t) => !String(t.ensemble || "").trim(),
        ).length;
        if (ergaenzt.length > 0) tracks.value = [...tracks.value, ...ergaenzt];
        lastImport.value = `${file.name}: ${ergaenzt.length} neue Songs übernommen${
          uebersprungen > 0 ? `, ${uebersprungen} bereits vorhanden` : ""
        }${
          offen > 0 ? `, bei ${offen} fehlt noch Band/Solo` : ""
        }. Noch nicht gespeichert.`;
        Notify.create({
          type: ergaenzt.length > 0 ? "positive" : "warning",
          message:
            ergaenzt.length > 0
              ? `${ergaenzt.length} Songs ergänzt – zum Übernehmen speichern.`
              : "Keine neuen Songs in der CSV gefunden.",
          timeout: 3000,
        });
      } catch (e) {
        Notify.create({
          type: "negative",
          message: `CSV konnte nicht gelesen werden: ${e.message}`,
          timeout: 3500,
        });
      } finally {
        importing.value = false;
        if (event.target) event.target.value = "";
      }
    };

    // Band/Solo fuer die bereits vorhandenen Songs nachtragen. Fuellt nur, was
    // leer ist, gesetzte Werte (auch von Hand korrigierte) bleiben unberuehrt.
    const onFillEnsemble = async () => {
      fillingEnsemble.value = true;
      try {
        const vorher = ohneEnsemble.value;
        tracks.value = await fillEnsemble(tracks.value);
        const gefuellt = vorher - ohneEnsemble.value;
        Notify.create({
          type: gefuellt > 0 ? "positive" : "warning",
          message:
            gefuellt > 0
              ? `${gefuellt} Songs ergänzt – zum Übernehmen speichern.`
              : "Zu diesen Künstlern ist nichts bekannt.",
          timeout: 3000,
        });
      } catch (e) {
        Notify.create({
          type: "negative",
          message: `Ergänzen fehlgeschlagen: ${e.message}`,
          timeout: 3500,
        });
      } finally {
        fillingEnsemble.value = false;
      }
    };

    const onSave = async () => {
      saving.value = true;
      try {
        const patch = {
          label: label.value.trim() || "Version",
          film: film.value,
          tracks: tracks.value,
        };
        if (props.kind === "custom") {
          await updateCustomVersion(props.versionValue, patch);
        } else {
          await updateRestrictedVersion(props.versionValue, patch);
        }
        Notify.create({
          type: "positive",
          message: "Version gespeichert.",
          timeout: 2000,
        });
        emit("saved");
        emit("update:modelValue", false);
      } catch (e) {
        Notify.create({
          type: "negative",
          message: `Speichern fehlgeschlagen: ${e.message}`,
          timeout: 3500,
        });
      } finally {
        saving.value = false;
      }
    };

    return {
      label,
      film,
      tracks,
      saving,
      csvInput,
      importing,
      lastImport,
      fillingEnsemble,
      ohneEnsemble,
      fields: FIELDS,
      triggerCsv,
      onCsvSelected,
      onFillEnsemble,
      onSave,
    };
  },
};
</script>

<style scoped>
.editor-card {
  width: 560px;
  max-width: 94vw;
}
</style>
