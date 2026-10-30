<template>
  <div class="song-meta-editor">
    <!-- Suchleiste: Song innerhalb der Version finden -->
    <q-input
      v-model="search"
      dense
      outlined
      clearable
      label="Song suchen (Titel oder Künstler)"
      class="q-mb-md"
    >
      <template #prepend><q-icon name="search" /></template>
    </q-input>

    <div
      v-if="filtered.length === 0"
      class="text-caption text-muted q-py-md text-center"
      role="status"
    >
      Kein Song gefunden.
    </div>

    <template v-else>
      <!-- Aktueller Song mit Vor/Zurück-Navigation -->
      <div class="song-nav row items-center no-wrap q-mb-md">
        <q-btn
          flat
          round
          dense
          icon="chevron_left"
          :disable="pos <= 0"
          aria-label="Vorheriger Song"
          @click="prev"
        />
        <!-- aria-live: Beim Blättern sagt ein Screenreader den neuen Song samt
             Position an, sonst bekäme man vom Wechsel nichts mit. -->
        <div class="col text-center overflow-hidden" aria-live="polite">
          <div class="text-subtitle1 ellipsis">{{ currentDisplayName }}</div>
          <div class="text-caption text-muted">
            {{ pos + 1 }} / {{ filtered.length }}
          </div>
        </div>
        <q-btn
          flat
          round
          dense
          icon="chevron_right"
          :disable="pos >= filtered.length - 1"
          aria-label="Nächster Song"
          @click="next"
        />
      </div>

      <!-- Eingabefelder untereinander, Reihenfolge wie in den Metadaten -->
      <div class="q-gutter-sm">
        <template v-for="f in fields" :key="f.key">
          <q-select
            v-if="f.type === 'select'"
            :model-value="currentValue(f.key)"
            :options="f.options"
            emit-value
            map-options
            dense
            outlined
            :label="f.label"
            @update:model-value="(val) => setField(f.key, val)"
          />
          <q-input
            v-else
            :model-value="currentValue(f.key)"
            :type="f.type === 'number' ? 'number' : 'text'"
            dense
            outlined
            :label="f.label"
            :hint="f.hint"
            @update:model-value="(val) => setField(f.key, val)"
          />
        </template>
      </div>

      <div v-if="allowRemove" class="row justify-end q-mt-sm">
        <q-btn
          flat
          dense
          no-caps
          color="negative"
          icon="delete"
          label="Song entfernen"
          @click="removeCurrent"
        />
      </div>
    </template>
  </div>
</template>

<script>
import { ref, computed, watch } from "vue";

export default {
  name: "SongMetadataEditor",
  props: {
    // Arbeitskopie der Tracks (v-model:tracks). Der Editor gibt bei jeder
    // Änderung ein neues Array zurück; das Speichern macht die Elternkomponente.
    tracks: { type: Array, default: () => [] },
    // Feld-Konfiguration: [{ key, label, type:'text'|'number'|'select', options }]
    fields: { type: Array, required: true },
    allowRemove: { type: Boolean, default: false },
  },
  emits: ["update:tracks"],
  setup(props, { emit }) {
    const search = ref("");
    const pos = ref(0);

    // Original-Indizes der Songs, die zur Suche passen. Bewusst eingefroren
    // und nur neu ermittelt, wenn sich der Suchbegriff oder die Anzahl der
    // Songs ändert, nicht bei jeder Eingabe: Ändert man Titel oder Künstler so,
    // dass der Song nicht mehr zur Suche passt, fiele er sonst aus der Liste,
    // dieselbe Position zeigte auf einen anderen Song, und die nächsten
    // Tastendrücke landeten dort.
    const matchIndices = ref([]);
    const computeMatches = () => {
      const q = String(search.value || "")
        .trim()
        .toLowerCase();
      const out = [];
      (props.tracks || []).forEach((t, i) => {
        if (q) {
          const title = String(t.title || "").toLowerCase();
          const artist = String(t.artist || "").toLowerCase();
          if (!title.includes(q) && !artist.includes(q)) return;
        }
        out.push(i);
      });
      matchIndices.value = out;
    };
    computeMatches();

    // Gefilterte Songs mit ihrem Original-Index (für gezieltes Bearbeiten).
    const filtered = computed(() =>
      matchIndices.value
        .map((i) => ({ t: (props.tracks || [])[i], i }))
        .filter((entry) => entry.t),
    );

    // Neuer Suchbegriff: neu filtern und vorne anfangen.
    watch(search, () => {
      computeMatches();
      pos.value = 0;
    });
    // Song entfernt oder per CSV ergänzt: Die Indizes haben sich verschoben,
    // deshalb neu filtern und die Position gültig halten.
    watch(
      () => (props.tracks || []).length,
      () => {
        computeMatches();
        const len = filtered.value.length;
        if (pos.value > len - 1) pos.value = Math.max(0, len - 1);
      },
    );

    const current = computed(() => filtered.value[pos.value] || null);

    const currentDisplayName = computed(() => {
      const t = current.value?.t;
      if (!t) return "";
      const title = String(t.title || "").trim();
      const artist = String(t.artist || "").trim();
      if (title && artist) return `${title} · ${artist}`;
      return title || artist || "(ohne Titel)";
    });

    const currentValue = (key) => {
      const t = current.value?.t;
      if (!t) return "";
      const val = t[key];
      return val === undefined || val === null ? "" : val;
    };

    const setField = (key, rawVal) => {
      const entry = current.value;
      if (!entry) return;
      let val = rawVal;
      if (key === "year") {
        // Ein einzelnes Jahr bleibt eine Zahl wie bisher. Mehrere Jahre mit
        // `;` („1975;2011") bleiben Text, sonst schnitte parseInt sie ab.
        const text = String(rawVal ?? "").trim();
        if (/^\d+$/.test(text)) val = parseInt(text, 10);
        else val = text;
      }
      const nextTracks = (props.tracks || []).map((t, i) =>
        i === entry.i ? { ...t, [key]: val } : t,
      );
      emit("update:tracks", nextTracks);
    };

    const removeCurrent = () => {
      const entry = current.value;
      if (!entry) return;
      const nextTracks = (props.tracks || []).filter((_, i) => i !== entry.i);
      emit("update:tracks", nextTracks);
    };

    const prev = () => {
      if (pos.value > 0) pos.value -= 1;
    };
    const next = () => {
      if (pos.value < filtered.value.length - 1) pos.value += 1;
    };

    return {
      search,
      pos,
      filtered,
      currentDisplayName,
      currentValue,
      setField,
      removeCurrent,
      prev,
      next,
    };
  },
};
</script>

<style scoped>
.song-meta-editor {
  min-height: 220px;
}
.song-nav {
  gap: 4px;
}
</style>
