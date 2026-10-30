<template>
  <!-- Hinweise von MusicBrainz zu einem Song: eine Jahreswahl (wird nie still
       übernommen, sondern hier angeboten), Merkmale der Aufnahme wie Live oder
       Cover und ein von MusicBrainz gefülltes Band/Solo zum Zurücknehmen. -->
  <div class="mb-hint">
    <template v-if="hasYear">
      <!-- Gefundene Aufnahme ist eine eigene Fassung (Remaster, Compilation
           …): beide Jahre zeigen, das Original ist der Vorschlag. -->
      <div
        v-if="originalYear"
        class="text-caption text-warning"
        :title="originalTitle ? `Original: ${originalTitle}` : undefined"
      >
        <q-icon name="history" size="14px" class="q-mr-xs" />{{ yearLine }}
      </div>
      <div v-else class="text-caption text-warning">
        <q-icon name="history" size="14px" class="q-mr-xs" />MusicBrainz:
        zuerst erschienen {{ firstYear }}
      </div>
    </template>
    <div v-if="flags.length" class="text-caption text-muted">
      <q-icon name="info" size="14px" class="q-mr-xs" />{{ flags.join(", ") }}
    </div>
    <div v-if="hasYear || flags.length" class="row q-gutter-xs q-mt-xs">
      <q-btn
        v-if="originalYear"
        dense
        no-caps
        size="sm"
        label="Original übernehmen"
        :aria-label="`Original ${originalYear} als Hauptjahr für ${title} übernehmen, das bisherige Jahr bleibt als weiteres`"
        @click="(e) => fire(e, 'accept', 'original')"
      />
      <q-btn
        v-if="canTakeFirst"
        dense
        no-caps
        size="sm"
        :class="{ 'btn-unselected': !!originalYear }"
        :label="originalYear ? 'Aufnahme übernehmen' : 'Übernehmen'"
        :aria-label="`${firstYear} als Hauptjahr für ${title} übernehmen, das bisherige Jahr bleibt als weiteres`"
        @click="(e) => fire(e, 'accept', 'recording')"
      />
      <q-btn
        dense
        no-caps
        size="sm"
        :class="{ 'btn-unselected': !!originalYear }"
        label="Behalten"
        :aria-label="`${title} unverändert lassen`"
        @click="(e) => fire(e, 'keep')"
      />
    </div>
    <div
      v-if="ensemble"
      class="row items-center no-wrap q-gutter-x-xs text-caption text-muted q-mt-xs"
    >
      <q-icon name="groups" size="14px" />
      <span>Band/Solo: {{ ensemble }} (von MusicBrainz)</span>
      <q-btn
        dense
        no-caps
        size="sm"
        class="btn-unselected"
        label="Zurücknehmen"
        :aria-label="`Band/Solo für ${title} wieder leeren`"
        @click="(e) => fire(e, 'undo-ensemble')"
      />
    </div>
  </div>
</template>

<script>
import { computed } from "vue";

export default {
  name: "MusicBrainzHint",
  props: {
    // Jahr der gefundenen Aufnahme, solange eine Jahreswahl offen ist.
    firstYear: { type: Number, default: null },
    // Ob „Aufnahme übernehmen" etwas ändert (Jahr weicht vom Hauptjahr ab).
    canTakeFirst: { type: Boolean, default: false },
    // Jahr der Originalaufnahme, wenn es vom Hauptjahr abweicht.
    originalYear: { type: Number, default: null },
    originalTitle: { type: String, default: "" },
    // „Remaster", „Neuaufnahme" … zur gefundenen Aufnahme.
    recordingNote: { type: String, default: "" },
    // Merkmale in Worten („Live-Aufnahme", „Cover" …).
    flags: { type: Array, default: () => [] },
    // Von MusicBrainz gefülltes Band/Solo, sonst null.
    ensemble: { type: String, default: null },
    // Songtitel, nur für die zugänglichen Namen der Knöpfe.
    title: { type: String, default: "" },
  },
  emits: ["accept", "keep", "undo-ensemble"],
  setup(props, { emit }) {
    const hasYear = computed(() => !!(props.originalYear || props.firstYear));
    // „Diese Aufnahme: 2011 (Remaster) · Original: 1975"
    const yearLine = computed(() => {
      const parts = [];
      if (props.firstYear) {
        const note = props.recordingNote ? ` (${props.recordingNote})` : "";
        parts.push(`Diese Aufnahme: ${props.firstYear}${note}`);
      }
      parts.push(`Original: ${props.originalYear}`);
      return parts.join(" · ");
    });
    // Die Zeile steckt in der Importvorschau in einem <label> mit Checkbox.
    // Ohne Stoppen würde der Klick dort zusätzlich den Haken umschalten.
    const fire = (evt, name, arg) => {
      evt?.stopPropagation?.();
      evt?.preventDefault?.();
      if (arg === undefined) emit(name);
      else emit(name, arg);
    };
    return { hasYear, yearLine, fire };
  },
};
</script>

<style scoped>
.mb-hint {
  margin-top: 2px;
}
</style>
