<template>
  <!--
    HITSTER-Logo als reines SVG (theme-adaptiv). Farbe folgt der CSS-Custom-
    Property `--logo-color`; default = `--app-accent`. Neon-Effekt via
    doppeltem Stroke + mehrfach gestapelten `drop-shadow`-Filtern.
    Skaliert per `width`/`height` (viewBox erhält Aspect).

    Der Schriftzug liegt bewusst als **Pfad** vor, nicht als <text>. Vorher
    stand hier SVG-Text in "Impact, 'Arial Narrow', 'Helvetica Inserat',
    'Bebas Neue'". Keine dieser Schriften gibt es auf Android oder iOS, und
    das Projekt liefert auch keine mit – auf dem Handy landete alles beim
    sans-serif-Rückfall. Impact ist extrem schmal ("HITSTER" misst damit 689
    der 900 viewBox-Einheiten), Roboto oder Helvetica brauchen bei derselben
    Schriftgröße rund 1050 Einheiten. Der Schriftzug lief also seitlich aus
    der viewBox, wurde beschnitten, und weil die äußere Kontur zusätzlich
    durch einen Filter mit eigener Bounding-Box läuft, die innere Linie
    aber nicht, drifteten die beiden Ebenen sichtbar auseinander.

    Als Pfad entfällt die ganze Schriftabhängigkeit: beide Ebenen benutzen
    dieselbe Geometrie und können gar nicht mehr verrutschen. Die Konturen
    stammen aus Impact bei Schriftgröße 200 und letter-spacing 6, auf der
    Grundlinie y=210 – also exakt die bisherige Darstellung.
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
      <!-- Schriftzug als Kontur; beide Ebenen verweisen darauf. -->
      <path
        id="hitster-word"
        d="M208.1 51.9V210H167V143.6H154.7V210H113.6V51.9H154.7V108.4H167V51.9ZM271.7 51.9V210H230.6V51.9ZM377 51.9V83.5H352.6V210H311.5V83.5H287.2V51.9ZM479.5 99.7H441.3V88Q441.3 79.8 439.9 77.6Q438.4 75.3 435 75.3Q431.3 75.3 429.4 78.4Q427.5 81.4 427.5 87.5Q427.5 95.4 429.6 99.5Q431.7 103.5 441.2 109.1Q468.7 125.4 475.8 135.9Q482.9 146.3 482.9 169.6Q482.9 186.5 479 194.5Q475 202.5 463.7 207.9Q452.4 213.3 437.3 213.3Q420.8 213.3 409.2 207.1Q397.5 200.8 393.9 191.2Q390.3 181.5 390.3 163.7V153.4H428.4V172.6Q428.4 181.5 430.1 184Q431.7 186.6 435.8 186.6Q439.9 186.6 441.9 183.3Q443.9 180.1 443.9 173.8Q443.9 159.8 440.1 155.5Q436.2 151.2 420.8 141.2Q405.5 131 400.5 126.4Q395.5 121.8 392.3 113.7Q389 105.6 389 93Q389 74.8 393.6 66.4Q398.3 58 408.6 53.3Q419 48.6 433.6 48.6Q449.6 48.6 460.9 53.8Q472.2 58.9 475.9 66.8Q479.5 74.6 479.5 93.5ZM584.6 51.9V83.5H560.2V210H519.1V83.5H494.8V51.9ZM600 51.9H668.6V83.5H641.1V113.5H666.8V143.6H641.1V178.4H671.3V210H600ZM689.1 51.9H718.2Q747.3 51.9 757.6 54.1Q767.9 56.4 774.4 65.6Q780.9 74.8 780.9 95.1Q780.9 113.5 776.3 119.9Q771.7 126.2 758.3 127.5Q770.5 130.5 774.7 135.6Q778.9 140.7 779.9 144.9Q780.9 149.2 780.9 168.3V210H742.7V157.5Q742.7 144.8 740.7 141.7Q738.7 138.7 730.2 138.7V210H689.1ZM730.2 78.9V114.1Q737.2 114.1 740 112.2Q742.7 110.3 742.7 99.8V91.2Q742.7 83.6 740 81.3Q737.4 78.9 730.2 78.9Z"
      />
    </defs>
    <!-- Äußerer, dickerer Stroke = Röhren-Aussenkontur -->
    <use
      class="hitster-logo__outer"
      href="#hitster-word"
      filter="url(#hitster-neon)"
    />
    <!-- Innerer, dünnerer Stroke = helle Röhren-Innenlinie -->
    <use class="hitster-logo__inner" href="#hitster-word" />
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
/* fill/stroke sind vererbte Eigenschaften und greifen deshalb auch auf dem
   per <use> eingebundenen Pfad. */
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
