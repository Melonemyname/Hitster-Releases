<template>
  <!-- aria-labelledby landet bei QDialog direkt auf dem role="dialog"-Element
       und gibt dem Dialog den sichtbaren Titel als zugänglichen Namen.
       Ein Klick daneben schließt nicht (no-backdrop-dismiss), sonst wäre die
       Arbeit mit einem Fehlklick weg. Esc, Schließen-Kreuz und Abbrechen laufen
       alle über onDialogModel und fragen bei ungespeicherten Änderungen nach.
       Bewusst nicht `persistent`: Das würde Esc ganz schlucken (nur ein
       Wackeln), ohne dass sich der Dialog überhaupt schließen ließe. -->
  <q-dialog
    :model-value="modelValue"
    :aria-labelledby="titleId"
    no-backdrop-dismiss
    @update:model-value="onDialogModel"
  >
    <q-card class="editor-card">
      <q-card-section class="row items-center q-pb-none">
        <q-icon name="edit" size="22px" class="q-mr-sm" />
        <div :id="titleId" class="text-h6">Version bearbeiten</div>
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
        <q-input
          v-model="label"
          dense
          outlined
          label="Name der Version"
          class="q-mb-sm"
        />
        <!-- Cover lässt sich auch nachträglich ändern; gespeichert wird es wie
             alles andere erst mit „Speichern". -->
        <CoverPicker v-model="cover" class="q-mb-sm" />
        <q-toggle
          v-model="film"
          label="Ist eine Film-/Serien-Version"
          class="q-mb-md"
        />

        <q-separator class="q-mb-md" />

        <!-- ── Songs aus einer weiteren CSV ergaenzen ──────────────────────
             Vor dem Anhaengen zeigt ImportPreviewDialog alle Songs der CSV
             samt Abgleich gegen die Version, und man waehlt aus, was dazu
             soll. Gleiche Links sind gesperrt, gleicher Titel und Kuenstler
             unter anderem Link ist als moeglicherweise doppelt markiert. -->
        <div class="row items-center q-mb-xs">
          <q-icon name="playlist_add" size="20px" class="q-mr-xs" />
          <div class="text-subtitle2">Songs aus CSV ergänzen</div>
        </div>
        <!-- text-muted statt opacity: Die gedämpfte Flächenschrift hält auf
             jedem Theme 4,5:1, eine halbtransparente Schrift nicht immer. -->
        <div class="text-caption text-muted q-mb-sm">
          Neue Playlist mit
          <a
            class="text-link"
            href="https://exportify.net"
            target="_blank"
            rel="noopener"
            >Exportify</a
          >
          als CSV exportieren. Vor dem Anhängen siehst du alle Songs der CSV
          und wählst aus, welche übernommen werden.
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
          class="text-caption text-muted q-mb-sm"
        >
          {{ lastImport }}
        </div>

        <q-separator class="q-mb-md" />

        <div class="row items-center q-gutter-sm q-mb-sm">
          <div class="col text-caption text-muted">
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
          <!-- Prüft alle Songs der Version gegen MusicBrainz: füllt fehlendes
               Band/Solo und listet abweichende Erstjahre und Merkmale (Live,
               Cover …) zum Entscheiden auf. Geändert wird erst mit Speichern.
               Braucht den Server, deshalb nur angemeldet. -->
          <q-btn
            v-if="loggedIn && tracks.length > 0"
            outline
            dense
            no-caps
            size="sm"
            icon="fact_check"
            label="Mit MusicBrainz prüfen"
            :disable="mbRunning"
            @click="onCheckVersion"
          />
        </div>

        <MusicBrainzPanel
          v-if="
            mbRunning || mbSummaryText || mbItems.length || mbFilledItems.length
          "
          class="q-mb-md"
          :running="mbRunning"
          :done="mbDone"
          :total="mbTotal"
          :summary="mbSummaryText"
          :items="mbItems"
          :filled="mbFilledItems"
          :original-count="mbOriginalCount"
          @skip="mbSkip"
          @accept="onMbAcceptKey"
          @keep="onMbKeepKey"
          @accept-all-original="onMbAcceptAllOriginal"
          @undo-ensemble="onMbUndoEnsembleKey"
        />

        <SongMetadataEditor
          v-if="modelValue"
          v-model:tracks="tracks"
          :fields="fields"
          allow-remove
        />
      </q-card-section>

      <q-card-actions align="right" class="q-pa-md">
        <q-btn v-close-popup flat label="Abbrechen" />
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

  <ImportPreviewDialog
    v-model="previewOpen"
    :file-name="previewFile"
    :candidates="previewCandidates"
    :mb-running="mbRunning"
    :mb-done="mbDone"
    :mb-total="mbTotal"
    :mb-summary="mbSummaryText"
    :hint-of="mbOpenHint"
    @confirm="onImportConfirm"
    @mb-skip="mbSkip"
    @mb-accept="onMbAcceptCandidate"
    @mb-keep="onMbKeepCandidate"
    @mb-undo-ensemble="onMbUndoEnsembleCandidate"
    @mb-accept-all-original="onMbAcceptAllOriginalCandidates"
  />
</template>

<script>
import { ref, computed, watch, useId } from "vue";
import { Dialog, Notify } from "quasar";
import SongMetadataEditor from "./SongMetadataEditor.vue";
import ImportPreviewDialog from "./ImportPreviewDialog.vue";
import MusicBrainzPanel from "./MusicBrainzPanel.vue";
import CoverPicker from "./CoverPicker.vue";
import { useVersions } from "../composables/useVersions";
import { getRestrictedVersion } from "../utils/restrictedVersionsStore";
import { getCustomVersion } from "../utils/customVersionsStore";
import { parseExportifyFile, fillEnsemble } from "../utils/exportifyCsv";
import { loggedInState } from "../utils/authService";
import {
  useMusicBrainzCheck,
  trackKey,
  displayTrack,
} from "../utils/musicbrainzService";
import {
  splitVariants,
  firstVariant,
  displayArtists,
} from "../utils/songVariants";

// Mehrere Einträge mit `;` (siehe utils/songVariants.js). Jahr deshalb als
// Textfeld, ein Zahlenfeld nimmt kein `;` an.
const FIELDS = [
  {
    key: "title",
    label: "Titel",
    hint: "Mehrere Schreibweisen mit ; trennen, die erste wird angezeigt",
  },
  {
    key: "artist",
    label: "Künstler",
    hint: "Mehrere mit ; trennen, jeder zählt als richtig",
  },
  {
    key: "year",
    label: "Jahr",
    hint: "Mehrere mit ; trennen (z. B. 1975;2011), das erste ist das Hauptjahr",
  },
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
  {
    key: "movie",
    label: "Film/Serie",
    hint: "Mehrere mit ; trennen, die erste wird angezeigt",
  },
];

// Gleicher Link: Spotify-Track-id oder URL. So ein Song steckt sicher schon in
// der Version und wird beim Ergaenzen nicht angeboten.
function linkKeys(track) {
  const keys = [];
  const id = String(track?.trackId || "").trim();
  if (id) keys.push(`id:${id.toLowerCase()}`);
  const url = String(track?.url || "").trim();
  if (url) keys.push(`url:${url.toLowerCase()}`);
  return keys;
}

// Titel/Kuenstler fuer den Vergleich: Zusaetze wie „- Remastered 2011" oder
// „(Deluxe)" weg, Gross-/Kleinschreibung und Satzzeichen egal.
function normTitle(value) {
  return String(value || "")
    .replace(/\s+-\s+.*$/, "")
    .replace(/[([].*?[)\]]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}
// Nur der erste Kuenstler zaehlt, weil Exportify mehrere mal mit Komma, mal
// mit Semikolon trennt und die Version sie von Hand anders fuehren kann.
function normArtist(value) {
  return String(value || "")
    .split(/[,;&+/]|\bfeat\.?\s|\bft\.?\s/i)[0]
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

// Gleicher Song unter womoeglich anderem Link (Album, Deluxe, Remaster). An
// diesem Fall sind die Doppelten in EmoMuse entstanden: andere Track-id,
// gleicher Titel und Kuenstler. Jede Titel-Schreibweise zaehlt.
function songKeys(track) {
  const artist = normArtist(firstVariant(track?.artist));
  return splitVariants(track?.title)
    .map(normTitle)
    .filter(Boolean)
    .map((t) => `ta:${t}|${artist}`);
}

function describe(track) {
  return `${firstVariant(track.title)} – ${displayArtists(track.artist)} (${firstVariant(track.year)})`;
}

// Jeden Song der CSV gegen die Version (und die CSV selbst) einordnen.
function classifyImport(existing, incoming) {
  const links = new Set();
  const songs = new Map();
  existing.forEach((t, i) => {
    linkKeys(t).forEach((k) => links.add(k));
    songKeys(t).forEach((k) => {
      if (!songs.has(k)) songs.set(k, { track: t, pos: i + 1 });
    });
  });
  return incoming.map((track) => {
    let status = "neu";
    let note = "";
    if (linkKeys(track).some((k) => links.has(k))) {
      status = "vorhanden";
    } else {
      const hit = songKeys(track)
        .map((k) => songs.get(k))
        .find(Boolean);
      if (hit) {
        status = "aehnlich";
        note = hit.pos
          ? `Schon an Position ${hit.pos}: ${describe(hit.track)}`
          : `Steht weiter oben schon in der CSV: ${describe(hit.track)}`;
      }
    }
    // Spaetere Zeilen derselben CSV gegen diesen Song pruefen.
    linkKeys(track).forEach((k) => links.add(k));
    songKeys(track).forEach((k) => {
      if (!songs.has(k)) songs.set(k, { track, pos: 0 });
    });
    return { track, status, note };
  });
}

export default {
  name: "VersionEditor",
  components: {
    SongMetadataEditor,
    ImportPreviewDialog,
    MusicBrainzPanel,
    CoverPicker,
  },
  props: {
    modelValue: { type: Boolean, default: false },
    // Pool-Wert der zu bearbeitenden Version (eigene oder eingeschränkte).
    versionValue: { type: String, default: "" },
    // 'restricted' = freigegebene Version (Server), 'custom' = eigene Version.
    kind: { type: String, default: "restricted" },
  },
  emits: ["update:modelValue", "saved"],
  setup(props, { emit }) {
    // Eindeutige ID für den Dialogtitel (aria-labelledby).
    const titleId = `version-editor-title-${useId()}`;
    const { updateRestrictedVersion, updateCustomVersion } = useVersions();
    const label = ref("");
    const cover = ref({ kind: "preset", ref: "custom" });
    const film = ref(false);
    const tracks = ref([]);
    const saving = ref(false);
    const csvInput = ref(null);
    const importing = ref(false);
    const lastImport = ref("");
    const fillingEnsemble = ref(false);
    const previewOpen = ref(false);
    const previewFile = ref("");
    const previewCandidates = ref([]);
    // MusicBrainz-Abgleich: ein Lauf je Editor, für den CSV-Import wie für
    // „Mit MusicBrainz prüfen". Ergebnisse gelten nur, solange der Editor
    // offen ist (siehe useMusicBrainzCheck).
    const mb = useMusicBrainzCheck();
    let importConfirmed = false;
    // Stand beim Öffnen, für die Nachfrage vor dem Verwerfen (siehe isDirty).
    let snapshot = "";

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
        cover.value = v?.cover || { kind: "preset", ref: "custom" };
        film.value = !!v?.film;
        tracks.value = (v?.tracks || []).map((t) => ({ ...t }));
        lastImport.value = "";
        snapshot = currentState();
      },
      { immediate: true },
    );

    // Editor zu: laufende Prüfung abbrechen, späte Ergebnisse verwerfen.
    watch(
      () => props.modelValue,
      () => {
        mb.reset();
      },
    );

    // Ungespeicherte Änderungen erkennen: Stand beim Öffnen gegen den jetzigen.
    // Nur beim Schließen verglichen, nicht laufend, weil eine Version mit
    // tausend Songs bei jedem Tastendruck neu serialisiert würde.
    function currentState() {
      return JSON.stringify({
        label: label.value,
        cover: cover.value,
        film: film.value,
        tracks: tracks.value,
      });
    }
    const isDirty = () => currentState() !== snapshot;

    // Jeder Schließwunsch des Dialogs (Esc, Kreuz, Abbrechen) kommt hier an.
    // Bei Änderungen erst nachfragen, statt die Arbeit still zu verwerfen.
    let confirming = false;
    const onDialogModel = (open) => {
      if (open) {
        emit("update:modelValue", true);
        return;
      }
      if (saving.value || confirming) return;
      if (!isDirty()) {
        emit("update:modelValue", false);
        return;
      }
      confirming = true;
      Dialog.create({
        title: "Änderungen verwerfen?",
        message:
          "Die Version hat ungespeicherte Änderungen. Beim Schließen gehen sie verloren.",
        cancel: { label: "Weiter bearbeiten", flat: true, color: "grey-7" },
        ok: { label: "Verwerfen", color: "negative", icon: "delete" },
        persistent: true,
      })
        .onOk(() => emit("update:modelValue", false))
        .onDismiss(() => {
          confirming = false;
        });
    };

    const triggerCsv = () => csvInput.value?.click();

    // CSV lesen und erst die Vorschau zeigen, statt direkt anzuhaengen.
    const onCsvSelected = async (event) => {
      const file = event?.target?.files?.[0];
      if (!file) return;
      importing.value = true;
      try {
        const neue = await parseExportifyFile(file);
        const candidates = classifyImport(tracks.value, neue);
        if (!candidates.some((c) => c.status !== "vorhanden")) {
          lastImport.value = `${file.name}: alle ${neue.length} Songs sind bereits in der Version.`;
          Notify.create({
            type: "warning",
            message: "Keine neuen Songs in der CSV gefunden.",
            timeout: 3000,
          });
          return;
        }
        previewFile.value = file.name;
        previewCandidates.value = candidates;
        importConfirmed = false;
        previewOpen.value = true;
        // Im Hintergrund prüfen, nur was übernommen werden kann. Die Vorschau
        // wartet nicht darauf.
        startCheck(
          candidates.filter((c) => c.status !== "vorhanden").map((c) => c.track),
        );
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

    // Auswahl aus der Vorschau an die Arbeitskopie haengen.
    const onImportConfirm = (gewaehlt) => {
      const gesamt = previewCandidates.value.length;
      const vorhanden = previewCandidates.value.filter(
        (c) => c.status === "vorhanden",
      ).length;
      const weggelassen = gesamt - vorhanden - gewaehlt.length;
      // Band/Solo wird beim Import aus dem bekannten Bestand ergaenzt; was
      // offen bleibt, traegt man unten pro Song selbst nach.
      const offen = gewaehlt.filter(
        (t) => !String(t.ensemble || "").trim(),
      ).length;
      importConfirmed = true;
      tracks.value = [...tracks.value, ...gewaehlt];
      lastImport.value = `${previewFile.value}: ${gewaehlt.length} Songs übernommen${
        vorhanden > 0 ? `, ${vorhanden} bereits vorhanden` : ""
      }${weggelassen > 0 ? `, ${weggelassen} abgewählt` : ""}${
        offen > 0 ? `, bei ${offen} fehlt noch Band/Solo` : ""
      }. Noch nicht gespeichert.`;
      Notify.create({
        type: "positive",
        message: `${gewaehlt.length} Songs ergänzt. Zum Übernehmen speichern.`,
        timeout: 3000,
      });
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
              ? `${gefuellt} Songs ergänzt. Zum Übernehmen speichern.`
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

    // ── MusicBrainz ────────────────────────────────────────────────────────

    // Eintreffendes Paket: fehlendes Band/Solo nachtragen, in der Vorschau
    // (solange sie offen ist) und in der Arbeitskopie. Was gefüllt wurde,
    // merkt sich mb (Anzeige „von MusicBrainz", Zurücknehmen). Das Jahr
    // bleibt, das entscheidet der Nutzer über die Hinweise.
    const applyBatch = (batch) => {
      const fill = (t) => {
        const key = trackKey(t);
        if (!(key in batch)) return t;
        return mb.fillEnsemble(t, batch[key]);
      };
      if (previewOpen.value) {
        let changed = false;
        const next = previewCandidates.value.map((c) => {
          if (c.status === "vorhanden") return c;
          const t = fill(c.track);
          if (t === c.track) return c;
          changed = true;
          return { ...c, track: t };
        });
        if (changed) previewCandidates.value = next;
      }
      let changed = false;
      const nextTracks = tracks.value.map((t) => {
        const n = fill(t);
        if (n !== t) changed = true;
        return n;
      });
      if (changed) tracks.value = nextTracks;
    };

    // Prüfung für die Songs einer CSV starten, ohne darauf zu warten.
    const startCheck = (list) => {
      mb.start(list, { onBatch: applyBatch }).catch(() => {});
    };

    const onCheckVersion = () => {
      mb.start(tracks.value, {
        onBatch: applyBatch,
        onUnavailable: () =>
          Notify.create({
            type: "warning",
            message:
              "MusicBrainz-Prüfung gerade nicht möglich (Server nicht erreichbar oder zu alt).",
            timeout: 4000,
          }),
      }).catch(() => {});
    };

    // Zusammenfassung samt Zahl der von MusicBrainz gefüllten Band/Solo.
    const mbSummaryText = mb.summary;

    // Offene Hinweise zu den Songs der Arbeitskopie, je Song einmal.
    const mbItems = computed(() => {
      const seen = new Set();
      const out = [];
      for (const t of tracks.value) {
        const key = trackKey(t);
        if (seen.has(key)) continue;
        seen.add(key);
        const hint = mb.openHint(t);
        if (!hint) continue;
        out.push({ key, ...displayTrack(t), ...hint });
      }
      return out;
    });

    // Songs der Arbeitskopie, deren Band/Solo von MusicBrainz kommt.
    const mbFilledItems = computed(() => {
      const seen = new Set();
      const out = [];
      for (const t of tracks.value) {
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

    const mbOpenHint = (track) => mb.trackHint(track);

    // Gewähltes Jahr ('original' oder 'recording') als Hauptjahr vorn
    // einsetzen, das bisherige bleibt dahinter.
    const onMbAcceptKey = (key, which = "recording") => {
      let marked = null;
      tracks.value = tracks.value.map((t) => {
        if (trackKey(t) !== key) return t;
        marked = t;
        return mb.applyYear(t, which);
      });
      if (marked) mb.markHandled(marked);
    };
    const onMbKeepKey = (key) => {
      const t = tracks.value.find((x) => trackKey(x) === key);
      if (t) mb.markHandled(t);
    };
    // Sammelaktion: bei allen offenen Hinweisen mit Originaljahr dieses
    // übernehmen. Die übrigen Hinweise bleiben stehen.
    const onMbAcceptAllOriginal = () => {
      const keys = new Set(
        mbItems.value.filter((it) => it.originalYear).map((it) => it.key),
      );
      if (!keys.size) return;
      const done = [];
      tracks.value = tracks.value.map((t) => {
        if (!keys.has(trackKey(t))) return t;
        done.push(t);
        return mb.applyYear(t, "original");
      });
      done.forEach((t) => mb.markHandled(t));
      Notify.create({
        type: "positive",
        message: `Originaljahr bei ${keys.size} Songs übernommen. Zum Übernehmen speichern.`,
        timeout: 3000,
      });
    };
    // Band/Solo wieder leeren, wie es vor der Prüfung war.
    const onMbUndoEnsembleKey = (key) => {
      let found = null;
      tracks.value = tracks.value.map((t) => {
        if (trackKey(t) !== key || !mb.filledEnsemble(t)) return t;
        found = t;
        return { ...t, ensemble: "" };
      });
      if (found) mb.forgetFilled(found);
    };

    const onMbAcceptCandidate = (index, which = "recording") => {
      const c = previewCandidates.value[index];
      if (!c) return;
      const next = [...previewCandidates.value];
      next[index] = { ...c, track: mb.applyYear(c.track, which) };
      previewCandidates.value = next;
      mb.markHandled(c.track);
    };
    const onMbKeepCandidate = (index) => {
      const c = previewCandidates.value[index];
      if (c) mb.markHandled(c.track);
    };
    const onMbAcceptAllOriginalCandidates = () => {
      let count = 0;
      const next = previewCandidates.value.map((c) => {
        if (c.status === "vorhanden") return c;
        const hint = mb.openHint(c.track);
        if (!hint?.originalYear) return c;
        count += 1;
        mb.markHandled(c.track);
        return { ...c, track: mb.applyYear(c.track, "original") };
      });
      if (count) previewCandidates.value = next;
    };
    const onMbUndoEnsembleCandidate = (index) => {
      const c = previewCandidates.value[index];
      if (!c || !mb.filledEnsemble(c.track)) return;
      const next = [...previewCandidates.value];
      next[index] = { ...c, track: { ...c.track, ensemble: "" } };
      previewCandidates.value = next;
      mb.forgetFilled(c.track);
    };

    // Vorschau ohne Übernehmen geschlossen: Die Prüfung galt nur diesen
    // Songs, also abbrechen. Nach dem Übernehmen läuft sie weiter und trägt
    // in der Arbeitskopie nach.
    watch(previewOpen, (open) => {
      if (!open && !importConfirmed) {
        mb.reset();
      }
    });

    const onSave = async () => {
      saving.value = true;
      try {
        const patch = {
          label: label.value.trim() || "Version",
          cover: cover.value,
          film: film.value,
          tracks: tracks.value,
        };
        let pending = false;
        if (props.kind === "custom") {
          ({ pending } = await updateCustomVersion(props.versionValue, patch));
        } else {
          await updateRestrictedVersion(props.versionValue, patch);
        }
        // Synchronisierte Version, Server aber nicht erreichbar: Die Änderung
        // liegt lokal und wird beim nächsten Laden der Versionen nachgereicht.
        // Das soll man sehen, statt einen reinen Erfolg gemeldet zu bekommen.
        Notify.create(
          pending
            ? {
                type: "warning",
                message:
                  "Lokal gespeichert. Der Server ist gerade nicht erreichbar, das Hochladen wird nachgeholt.",
                timeout: 5000,
              }
            : {
                type: "positive",
                message: "Version gespeichert.",
                timeout: 2000,
              },
        );
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
      titleId,
      label,
      cover,
      film,
      tracks,
      saving,
      csvInput,
      importing,
      lastImport,
      fillingEnsemble,
      ohneEnsemble,
      previewOpen,
      previewFile,
      previewCandidates,
      fields: FIELDS,
      loggedIn: loggedInState,
      mbRunning: mb.running,
      mbDone: mb.done,
      mbTotal: mb.total,
      mbSummaryText,
      mbItems,
      mbFilledItems,
      mbOriginalCount,
      mbSkip: mb.skip,
      mbOpenHint,
      onCheckVersion,
      onMbAcceptKey,
      onMbKeepKey,
      onMbAcceptAllOriginal,
      onMbUndoEnsembleKey,
      onMbAcceptCandidate,
      onMbKeepCandidate,
      onMbAcceptAllOriginalCandidates,
      onMbUndoEnsembleCandidate,
      onDialogModel,
      triggerCsv,
      onCsvSelected,
      onImportConfirm,
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
/* Link im Fließtext: lesbare Akzent-Textfarbe statt Browser-Blau. */
.text-link {
  color: var(--app-accent-text);
  text-decoration: underline;
}

/* Auf dem Handy stehen CSV-Knopf und Song-Zaehler untereinander statt
   nebeneinander, sonst wird der Knopf unlesbar schmal. */
@media (max-width: 599px) {
  .editor-card :deep(.row.items-center.q-gutter-sm) {
    flex-direction: column;
    align-items: stretch;
  }
  .editor-card :deep(.row.items-center.q-gutter-sm > .col) {
    width: 100%;
  }
}
</style>
