<template>
  <!-- Aktive Versionen einer Runde: Chip mit Name bzw. Anzahl, ein Klick
       öffnet die Liste mit Cover und Namen. Unter 600px nur das Symbol, sonst
       werden die Kopfzeilen zu breit. Weitere Chip-Props (size, dense,
       square, class) reicht die Komponente an den q-chip durch. Laut
       CLAUDE.md muss diese Anzeige in jeder Ansicht einer Runde stehen. -->
  <q-chip
    v-if="versions.length"
    icon="library_music"
    clickable
    :aria-label="`Aktive Versionen anzeigen (${versions.length})`"
  >
    <span class="gt-xs">{{
      versions.length === 1 ? versions[0].label : `${versions.length} Versionen`
    }}</span>
    <q-menu anchor="bottom middle" self="top middle">
      <div class="q-pa-sm active-versions-menu">
        <div class="text-subtitle2 q-mb-xs">Aktive Versionen</div>
        <div class="active-pools-row">
          <div v-for="pool in versions" :key="pool.value" class="pool-chip">
            <!-- Dekorativ: Der Name steht direkt daneben als Text. -->
            <img
              v-if="pool.icon"
              :src="pool.icon"
              alt=""
              class="pool-chip-icon"
            />
            <span class="pool-chip-name">{{ pool.label }}</span>
          </div>
        </div>
      </div>
    </q-menu>
  </q-chip>
</template>

<script>
export default {
  name: "ActiveVersionsChip",
  props: {
    // [{ value, label, icon }]
    versions: { type: Array, default: () => [] },
  },
};
</script>

<style scoped>
/* Nicht breiter als ein Handy-Schirm, die Kacheln brechen um. */
.active-versions-menu {
  max-width: min(360px, 90vw);
}
</style>
