<template>
  <!-- Vorschau vor dem Ergänzen einer bestehenden Version: Alle Songs der CSV
       stehen hier mit ihrem Abgleich gegen die Version, und man hakt an, was
       übernommen werden soll. Erst „Übernehmen" hängt sie an die Arbeitskopie
       im Editor an; gespeichert wird weiterhin erst dort.
       aria-labelledby gibt dem Dialog den sichtbaren Titel als Namen. -->
  <q-dialog
    :model-value="modelValue"
    :aria-labelledby="titleId"
    @update:model-value="(v) => $emit('update:modelValue', v)"
  >
    <q-card class="import-card">
      <q-card-section class="row items-center q-pb-none">
        <q-icon name="playlist_add_check" size="22px" class="q-mr-sm" />
        <div :id="titleId" class="text-h6">Import prüfen</div>
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

      <q-card-section class="q-pb-sm">
        <div class="text-body2 ellipsis" :title="fileName">
          <strong>{{ fileName }}</strong>
        </div>
        <div class="text-caption text-muted">
          {{ candidates.length }} Songs in der CSV:
          {{ counts.neu }} neu<template v-if="counts.aehnlich > 0"
            >, {{ counts.aehnlich }} möglicherweise doppelt</template
          ><template v-if="counts.vorhanden > 0"
            >, {{ counts.vorhanden }} bereits vorhanden</template
          >.
        </div>
        <div v-if="counts.aehnlich > 0" class="text-caption text-muted q-mt-xs">
          „Möglicherweise doppelt" heißt: Titel und Künstler gibt es schon, aber
          unter einem anderen Spotify-Link (etwa eine Remaster- oder
          Deluxe-Fassung). Diese Songs sind nicht vorausgewählt.
        </div>
        <!-- MusicBrainz-Prüfung läuft im Hintergrund weiter; übernehmen kann
             man jederzeit. Was nach dem Übernehmen noch eintrifft, trägt der
             Editor nach. -->
        <MusicBrainzPanel
          v-if="mbRunning || mbSummary || originalCount > 0"
          class="q-mt-sm"
          :running="mbRunning"
          :done="mbDone"
          :total="mbTotal"
          :summary="mbSummary"
          :original-count="originalCount"
          @skip="$emit('mb-skip')"
          @accept-all-original="$emit('mb-accept-all-original')"
        />
      </q-card-section>

      <q-card-section class="q-py-none">
        <div class="row items-center q-gutter-sm">
          <q-btn
            flat
            dense
            no-caps
            size="sm"
            icon="done_all"
            label="Alle"
            @click="selectAll"
          />
          <q-btn
            flat
            dense
            no-caps
            size="sm"
            icon="fiber_new"
            label="Nur neue"
            @click="selectNew"
          />
          <q-btn
            flat
            dense
            no-caps
            size="sm"
            icon="remove_done"
            label="Keine"
            @click="selectNone"
          />
        </div>
      </q-card-section>

      <q-card-section class="q-pt-sm">
        <!-- Virtuell gescrollt: Eine Playlist kann tausend Songs haben, die
             alle als Zeile mit Checkbox zu rendern macht den Dialog träge. -->
        <q-virtual-scroll
          v-slot="{ item }"
          :items="rows"
          class="import-list"
          separator
        >
          <q-item-label
            v-if="item.header"
            :key="item.key"
            header
            class="text-muted"
          >
            {{ item.header }}
          </q-item-label>
          <q-item
            v-else
            :key="item.key"
            dense
            :tag="item.status === 'vorhanden' ? 'div' : 'label'"
            :clickable="item.status !== 'vorhanden'"
          >
            <q-item-section avatar>
              <q-checkbox
                :model-value="
                  item.status !== 'vorhanden' && !!checked[item.index]
                "
                color="primary"
                :disable="item.status === 'vorhanden'"
                :aria-label="`${item.title} übernehmen`"
                @update:model-value="(v) => setChecked(item.index, v)"
              />
            </q-item-section>
            <q-item-section>
              <q-item-label class="ellipsis" :title="item.title">
                {{ item.title }}
              </q-item-label>
              <q-item-label caption class="text-muted ellipsis">
                {{ item.artist }} · {{ item.year }}
              </q-item-label>
              <q-item-label
                v-if="item.note"
                caption
                class="text-warning ellipsis"
                :title="item.note"
              >
                {{ item.note }}
              </q-item-label>
              <!-- Nur bei Songs, zu denen es etwas zu sagen gibt: Jahreswahl,
                   Merkmale oder ein gefülltes Band/Solo. Gefunden und
                   übereinstimmend bleibt ohne Zeile. -->
              <MusicBrainzHint
                v-if="item.hint"
                :first-year="item.hint.firstYear"
                :can-take-first="item.hint.canTakeFirst"
                :original-year="item.hint.originalYear"
                :original-title="item.hint.originalTitle"
                :recording-note="item.hint.recordingNote"
                :flags="item.hint.flags || []"
                :ensemble="item.hint.ensemble"
                :title="item.title"
                @accept="(which) => $emit('mb-accept', item.index, which)"
                @keep="$emit('mb-keep', item.index)"
                @undo-ensemble="$emit('mb-undo-ensemble', item.index)"
              />
            </q-item-section>
          </q-item>
        </q-virtual-scroll>
      </q-card-section>

      <q-card-actions align="right" class="q-pa-md">
        <q-btn v-close-popup flat label="Abbrechen" />
        <q-btn
          color="primary"
          icon="playlist_add"
          :label="`${selectedCount} übernehmen`"
          :disable="selectedCount === 0"
          @click="onConfirm"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script>
import { ref, computed, watch, useId } from "vue";
import { firstVariant, displayArtists } from "../utils/songVariants";
import MusicBrainzHint from "./MusicBrainzHint.vue";
import MusicBrainzPanel from "./MusicBrainzPanel.vue";

// Reihenfolge der Abschnitte: Erst das, was eine Entscheidung braucht.
const SECTIONS = [
  { status: "aehnlich", label: "Möglicherweise doppelt" },
  { status: "neu", label: "Neu" },
  {
    status: "vorhanden",
    label: "Schon in der Version (wird nicht übernommen)",
  },
];

export default {
  name: "ImportPreviewDialog",
  components: { MusicBrainzHint, MusicBrainzPanel },
  props: {
    modelValue: { type: Boolean, default: false },
    fileName: { type: String, default: "" },
    // [{ track, status: 'neu' | 'aehnlich' | 'vorhanden', note }]
    candidates: { type: Array, default: () => [] },
    // MusicBrainz-Prüfung (läuft im Editor, hier nur angezeigt).
    mbRunning: { type: Boolean, default: false },
    mbDone: { type: Number, default: 0 },
    mbTotal: { type: Number, default: 0 },
    mbSummary: { type: String, default: "" },
    // track -> null | { firstYear, originalYear, flags, ensemble … }
    // (offener Hinweis und gefülltes Band/Solo zu einem Song)
    hintOf: { type: Function, default: null },
  },
  emits: [
    "update:modelValue",
    "confirm",
    "mb-skip",
    "mb-accept",
    "mb-keep",
    "mb-undo-ensemble",
    "mb-accept-all-original",
  ],
  setup(props, { emit }) {
    const titleId = `import-preview-title-${useId()}`;
    // Haken je Kandidat, Index wie in `candidates`.
    const checked = ref([]);

    const defaultChecked = () =>
      props.candidates.map((c) => c.status === "neu");

    // Nur beim Öffnen auf die Vorauswahl setzen. Während der Dialog offen
    // ist, ersetzt der Editor die Kandidaten, sobald MusicBrainz-Ergebnisse
    // eintreffen (Band/Solo, übernommenes Jahr); die Haken des Nutzers
    // müssen das überstehen.
    watch(
      () => props.modelValue,
      (open) => {
        if (open) checked.value = defaultChecked();
      },
      { immediate: true },
    );

    const counts = computed(() => {
      const out = { neu: 0, aehnlich: 0, vorhanden: 0 };
      for (const c of props.candidates) out[c.status] += 1;
      return out;
    });

    // Flache Zeilenliste für den virtuellen Scroller, Abschnittsköpfe
    // zwischen den Songs.
    const rows = computed(() => {
      const out = [];
      for (const s of SECTIONS) {
        const items = [];
        props.candidates.forEach((c, index) => {
          if (c.status !== s.status) return;
          items.push({
            key: `t${index}`,
            index,
            status: c.status,
            title: firstVariant(c.track.title),
            artist: displayArtists(c.track.artist),
            year: c.track.year,
            note: c.note || "",
            hint:
              c.status !== "vorhanden" && props.hintOf
                ? props.hintOf(c.track)
                : null,
          });
        });
        if (items.length === 0) continue;
        out.push({
          key: `h-${s.status}`,
          header: `${s.label} (${items.length})`,
        });
        out.push(...items);
      }
      return out;
    });

    // Songs, bei denen das Originaljahr zur Wahl steht (für die Sammelaktion).
    const originalCount = computed(
      () => rows.value.filter((r) => r.hint?.originalYear).length,
    );

    const selectedCount = computed(
      () =>
        props.candidates.filter(
          (c, i) => c.status !== "vorhanden" && checked.value[i],
        ).length,
    );

    const setChecked = (index, value) => {
      const next = [...checked.value];
      next[index] = !!value;
      checked.value = next;
    };
    const selectAll = () => {
      checked.value = props.candidates.map((c) => c.status !== "vorhanden");
    };
    const selectNew = () => {
      checked.value = defaultChecked();
    };
    const selectNone = () => {
      checked.value = props.candidates.map(() => false);
    };

    const onConfirm = () => {
      const tracks = props.candidates
        .filter((c, i) => c.status !== "vorhanden" && checked.value[i])
        .map((c) => c.track);
      emit("confirm", tracks);
      emit("update:modelValue", false);
    };

    return {
      titleId,
      checked,
      counts,
      rows,
      originalCount,
      selectedCount,
      setChecked,
      selectAll,
      selectNew,
      selectNone,
      onConfirm,
    };
  },
};
</script>

<style scoped>
.import-card {
  width: 560px;
  max-width: 94vw;
}
.import-list {
  max-height: 50vh;
}
</style>
