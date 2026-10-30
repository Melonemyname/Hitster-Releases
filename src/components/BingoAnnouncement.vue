<template>
  <!-- Einblendung groß in der Mitte: „XY hat ein Bingo!" (kurz) bzw. der Sieg
       (bleibt stehen, `large`). Der Hintergrund fängt keine Klicks ab, das
       Spiel darunter bleibt bedienbar; nur Knöpfe im Slot sind klickbar. Ein-
       und Ausblenden steuert die übergeordnete Seite über `message`. -->
  <transition name="bingo-announce">
    <div v-if="message" class="bingo-announce" role="status" aria-live="polite">
      <div
        class="bingo-announce__card"
        :class="{ 'bingo-announce__card--large': large }"
      >
        <div class="bingo-announce__title">
          <q-icon v-if="icon" :name="icon" class="bingo-announce__icon" />
          {{ title }}
        </div>
        <div class="bingo-announce__text">{{ message }}</div>
        <div v-if="$slots.default" class="bingo-announce__actions">
          <slot />
        </div>
      </div>
    </div>
  </transition>
</template>

<script>
export default {
  name: "BingoAnnouncement",
  props: {
    // null = ausgeblendet
    message: {
      type: String,
      default: null,
    },
    title: {
      type: String,
      default: "BINGO!",
    },
    icon: {
      type: String,
      default: null,
    },
    // Größere Variante für den Sieg
    large: {
      type: Boolean,
      default: false,
    },
  },
};
</script>

<style scoped>
.bingo-announce {
  position: fixed;
  inset: 0;
  /* Über Kopfzeile/Seitenleiste (Quasar bis 3000), unter Dialogen (6000):
     „Zur Lobby" öffnet beim Host den Speichern-Dialog, der muss oben liegen. */
  z-index: 5000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  pointer-events: none;
}
.bingo-announce__card {
  background: var(--surface-bg);
  backdrop-filter: blur(var(--surface-blur, 18px));
  -webkit-backdrop-filter: blur(var(--surface-blur, 18px));
  border-radius: var(--surface-radius, 12px);
  /* Die Fläche ist immer dunkel getönt: helle Flächen-Schrift statt der
     Seiten-Schrift --app-on-bg (auf hellen Themes dunkel auf dunkel). */
  color: var(--app-on-surface, #f5f5f5);
  text-shadow: none;
  box-shadow:
    0 0 0 3px var(--app-accent),
    0 0 24px var(--app-accent);
  padding: 28px 40px;
  max-width: min(90vw, 720px);
  text-align: center;
}
.bingo-announce__card--large {
  padding: 40px 56px;
  max-width: min(94vw, 960px);
}
/* Standard-/kein Theme: Regenbogen-Ring wie bei der Versionsauswahl
   (Keyframes `rainbow-ring` aus app.scss, Flag setzt useTheme.js). */
:root[data-default-theme="true"] .bingo-announce__card {
  animation: rainbow-ring 8s linear infinite;
}
.bingo-announce__title {
  font-size: clamp(3rem, 12vw, 6rem);
  font-weight: 900;
  line-height: 1;
  letter-spacing: 0.04em;
  /* Textvariante des Akzents: auf der Fläche immer >= 4,5:1. Der reine Akzent
     lag bei manchen Themes bei 1,1:1. Der Ring bleibt im Akzent. */
  color: var(--app-accent-text, #47c1d1);
}
.bingo-announce__card--large .bingo-announce__title {
  font-size: clamp(3.5rem, 16vw, 8.5rem);
}
.bingo-announce__icon {
  font-size: 0.8em;
  vertical-align: -0.08em;
  margin-right: 0.15em;
}
.bingo-announce__text {
  margin-top: 12px;
  font-size: clamp(1.25rem, 5vw, 2.25rem);
  font-weight: 700;
  line-height: 1.2;
  overflow-wrap: anywhere;
}
.bingo-announce__card--large .bingo-announce__text {
  margin-top: 18px;
  font-size: clamp(1.5rem, 7vw, 3.25rem);
}
.bingo-announce__actions {
  margin-top: 24px;
  pointer-events: auto;
}

.bingo-announce-enter-active {
  transition:
    opacity 0.35s ease,
    transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.bingo-announce-leave-active {
  transition:
    opacity 0.6s ease,
    transform 0.6s ease;
}
.bingo-announce-enter-from {
  opacity: 0;
  transform: scale(0.6);
}
.bingo-announce-leave-to {
  opacity: 0;
  transform: scale(1.08);
}
@media (prefers-reduced-motion: reduce) {
  .bingo-announce-enter-active,
  .bingo-announce-leave-active {
    transition: opacity 0.3s ease;
  }
  .bingo-announce-enter-from,
  .bingo-announce-leave-to {
    transform: none;
  }
}
</style>
