<template>
  <!--
    HITSTER-Logo als reines SVG (theme-adaptiv). Farbe folgt der CSS-Custom-
    Property `--logo-color`; default = `--app-accent`. Neon-Effekt via
    doppeltem Text-Stroke + mehrfach gestapelten `drop-shadow`-Filtern.
    Skaliert per `width`/`height` bzw. font-size (viewBox erhält Aspect).
  -->
  <svg
    class="hitster-logo"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 -40 900 300"
    role="img"
    aria-label="HITSTER"
  >
    <defs>
      <!-- Neon-Glow: mehrere gestufte Blur-Layer, additiv gemischt. -->
      <filter id="hitster-neon" x="-15%" y="-40%" width="130%" height="180%">
        <feGaussianBlur stdDeviation="1.4" result="b1" />
        <feGaussianBlur stdDeviation="4" result="b2" />
        <feGaussianBlur stdDeviation="10" result="b3" />
        <feMerge>
          <feMergeNode in="b3" />
          <feMergeNode in="b2" />
          <feMergeNode in="b1" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
    <!-- Äußerer, dickerer Stroke = Röhren-Aussenkontur -->
    <text
      class="hitster-logo__outer"
      x="50%"
      y="70%"
      text-anchor="middle"
      font-family="Impact, 'Arial Narrow', 'Helvetica Inserat', 'Bebas Neue', sans-serif"
      font-weight="900"
      font-size="200"
      letter-spacing="6"
      filter="url(#hitster-neon)"
    >
      HITSTER
    </text>
    <!-- Innerer, dünnerer Stroke = helle Röhren-Innenlinie -->
    <text
      class="hitster-logo__inner"
      x="50%"
      y="70%"
      text-anchor="middle"
      font-family="Impact, 'Arial Narrow', 'Helvetica Inserat', 'Bebas Neue', sans-serif"
      font-weight="900"
      font-size="200"
      letter-spacing="6"
    >
      HITSTER
    </text>
  </svg>
</template>

<script>
export default {
  name: "HitsterLogo",
};
</script>

<style scoped>
.hitster-logo {
  /* Farbe kommt aus dem Theme; per --logo-color pro Einsatzort überschreibbar. */
  --logo-color: var(--app-accent, #ff2b8a);
  display: block;
  width: 100%;
  height: auto;
  color: var(--logo-color);
  /* Zusätzlicher Außen-Glow, damit auch der SourceGraphic-Layer leuchtet. */
  filter: drop-shadow(0 0 6px var(--logo-color))
    drop-shadow(0 0 14px var(--logo-color));
}
.hitster-logo__outer {
  fill: none;
  stroke: currentColor;
  stroke-width: 7;
  stroke-linejoin: round;
  paint-order: stroke;
  opacity: 0.9;
}
.hitster-logo__inner {
  fill: none;
  stroke: color-mix(in srgb, currentColor 20%, white);
  stroke-width: 2.5;
  stroke-linejoin: round;
  paint-order: stroke;
}
</style>
