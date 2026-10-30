<template>
  <div class="fullscreen error-404 text-center q-pa-md flex flex-center">
    <div>
      <!-- Die große Zahl ist Schmuck, die Meldung darunter die eigentliche
           Seitenüberschrift. Texte auf Deutsch wie der Rest der App; die
           frühere opacity: .4 drückte den Kontrast deutlich unter 4,5:1. -->
      <div
        style="font-size: 30vh"
        aria-hidden="true"
      >
        404
      </div>

      <h1 class="text-h2 q-my-none">
        Seite nicht gefunden
      </h1>

      <q-btn
        class="q-mt-xl"
        color="primary"
        unelevated
        to="/"
        label="Zur Startseite"
        no-caps
      />
    </div>
  </div>
</template>

<script>
export default {
  name: 'Error404'
}
</script>

<style scoped>
.error-404 {
  background: var(--app-bg, #121212);
  color: var(--app-on-bg, #f5f5f5);
}
</style>
