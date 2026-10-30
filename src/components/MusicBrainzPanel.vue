<template>
  <!-- Fortschritt und Ergebnis einer MusicBrainz-Prüfung. Die Prüfung blockiert
       nichts: Man kann währenddessen weiterarbeiten, importieren oder sie mit
       „Überspringen" beenden. Geändert wird nur auf Knopfdruck. -->
  <div class="mb-panel">
    <div
      v-if="running"
      class="row items-center no-wrap q-gutter-x-sm text-caption text-muted"
      role="status"
    >
      <q-spinner size="16px" />
      <div class="col">
        Prüfe Songs mit MusicBrainz … {{ done }}/{{ total }}
      </div>
      <q-btn
        dense
        no-caps
        size="sm"
        label="Überspringen"
        aria-label="MusicBrainz-Prüfung überspringen"
        @click="$emit('skip')"
      />
    </div>
    <div v-else-if="summary" class="text-caption text-muted" role="status">
      {{ summary }}
    </div>

    <!-- Sammelaktion: Bei allen Songs, deren Originalaufnahme früher
         erschien, das Originaljahr vorn einsetzen. -->
    <div v-if="originalCount > 0" class="q-mt-xs">
      <q-btn
        dense
        no-caps
        size="sm"
        icon="history"
        :label="`Alle Originaljahre übernehmen (${originalCount})`"
        :aria-label="`Bei ${originalCount} Songs das Jahr der Originalaufnahme als Hauptjahr übernehmen, das bisherige Jahr bleibt jeweils als weiteres`"
        @click="$emit('accept-all-original')"
      />
    </div>

    <template v-if="items.length">
      <div class="text-caption q-mt-xs">
        Hinweise von MusicBrainz ({{ items.length }})
      </div>
      <q-list dense separator class="mb-list">
        <q-item v-for="it in items" :key="it.key" class="q-px-none">
          <q-item-section>
            <q-item-label class="ellipsis" :title="it.title">
              {{ it.title }}
            </q-item-label>
            <q-item-label caption class="text-muted ellipsis">
              {{ it.artist }} · {{ it.year }}
            </q-item-label>
            <MusicBrainzHint
              :first-year="it.firstYear"
              :can-take-first="it.canTakeFirst"
              :original-year="it.originalYear"
              :original-title="it.originalTitle"
              :recording-note="it.recordingNote"
              :flags="it.flags"
              :title="it.title"
              @accept="(which) => $emit('accept', it.key, which)"
              @keep="$emit('keep', it.key)"
            />
          </q-item-section>
        </q-item>
      </q-list>
    </template>

    <!-- Welche Songs ihr Band/Solo von MusicBrainz bekommen haben. Bei
         wenigen offen, bei vielen zugeklappt. -->
    <q-expansion-item
      v-if="filled.length"
      dense
      dense-toggle
      :default-opened="filled.length <= 5"
      class="q-mt-xs mb-filled"
      header-class="q-px-none text-caption"
      :label="`Band/Solo von MusicBrainz ergänzt (${filled.length})`"
    >
      <q-list dense separator class="mb-list">
        <q-item v-for="it in filled" :key="it.key" class="q-px-none">
          <q-item-section>
            <q-item-label class="ellipsis" :title="it.title">
              {{ it.title }}
            </q-item-label>
            <q-item-label caption class="text-muted ellipsis">
              {{ it.artist }} · {{ it.ensemble }}
            </q-item-label>
          </q-item-section>
          <q-item-section side>
            <q-btn
              dense
              no-caps
              size="sm"
              class="btn-unselected"
              label="Zurücknehmen"
              :aria-label="`Band/Solo für ${it.title} wieder leeren`"
              @click="$emit('undo-ensemble', it.key)"
            />
          </q-item-section>
        </q-item>
      </q-list>
    </q-expansion-item>
  </div>
</template>

<script>
import MusicBrainzHint from "./MusicBrainzHint.vue";

export default {
  name: "MusicBrainzPanel",
  components: { MusicBrainzHint },
  props: {
    running: { type: Boolean, default: false },
    done: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    summary: { type: String, default: "" },
    // [{ key, title, artist, year, ...hintFor() }]
    items: { type: Array, default: () => [] },
    // [{ key, title, artist, ensemble }] Band/Solo von MusicBrainz gefüllt.
    filled: { type: Array, default: () => [] },
    // Songs, bei denen ein abweichendes Originaljahr zur Wahl steht.
    originalCount: { type: Number, default: 0 },
  },
  emits: ["skip", "accept", "keep", "accept-all-original", "undo-ensemble"],
};
</script>

<style scoped>
.mb-list {
  max-height: 30vh;
  overflow-y: auto;
}
</style>
