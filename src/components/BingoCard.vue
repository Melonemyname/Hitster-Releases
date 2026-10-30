<template>
  <!-- Zugaenglichkeit: Die kompakte Gegner-Vorschau ist fuer Screenreader ein
       einziges Bild mit Zusammenfassung (25 Einzelfelder waeren dort nur
       Laerm). Die grosse Karte ist eine Gruppe, deren Felder Position, Farbe
       und Kreuz ansagen; anklickbare Felder sind Knoepfe und per Tastatur
       (Enter/Leertaste) bedienbar. -->
  <div
    class="bingo-card"
    :class="{
      'bingo-card--compact': compact,
      'bingo-card--picking': isPicking,
    }"
    :role="compact ? 'img' : 'group'"
    :aria-label="compact ? summaryLabel : label"
  >
    <div
      v-for="(color, idx) in normalizedCells"
      :key="idx"
      class="bingo-card__cell"
      :style="{
        '--cell-color': colorHex(color),
        '--cell-text': textHex(color),
      }"
      :class="{
        'bingo-card__cell--marked': normalizedMarks[idx],
        'bingo-card__cell--bingo': bingoIndices.has(idx),
        'bingo-card__cell--pickable': isClickable(idx, color),
        'bingo-card__cell--just-marked': justMarked.has(idx),
        'bingo-card__cell--just-removed': justRemoved.has(idx),
      }"
      :role="compact ? undefined : isClickable(idx, color) ? 'button' : 'img'"
      :tabindex="!compact && isClickable(idx, color) ? 0 : undefined"
      :aria-label="compact ? undefined : cellLabel(idx, color)"
      @click="onCellClick(idx, color)"
      @keydown.enter.prevent="onCellClick(idx, color)"
      @keydown.space.prevent="onCellClick(idx, color)"
    >
      <span
        v-if="normalizedMarks[idx]"
        class="bingo-card__mark"
        aria-hidden="true"
        >✕</span
      >
      <!-- Entferntes Kreuz: das ✕ bleibt kurz als „Geist" stehen und fliegt
           sichtbar heraus, statt einfach zu verschwinden. -->
      <span
        v-else-if="justRemoved.has(idx)"
        class="bingo-card__mark bingo-card__mark--ghost"
        aria-hidden="true"
        >✕</span
      >
    </div>
  </div>
</template>

<script>
import { computed, ref, watch, onBeforeUnmount } from "vue";
import {
  BINGO_CELL_COUNT,
  BINGO_COLORS,
  getCompletedLines,
} from "../composables/useBingo";
import { readableTextOn } from "../utils/themeColors";

// Farbnamen fuer Screenreader (die Felder unterscheiden sich sonst nur durch
// die Farbe). Exportiert, damit Legende und Bonus-Dialog dieselben Namen
// ansagen.
export const BINGO_COLOR_NAMES = Object.freeze({
  green: "Grün",
  pink: "Pink",
  yellow: "Gelb",
  purple: "Lila",
  blue: "Blau",
});

export default {
  name: "BingoCard",
  props: {
    /** 25 Farb-IDs (siehe BINGO_COLOR_KEYS). */
    cells: {
      type: Array,
      default: () => [],
    },
    /** 25 Booleans (Kreuz-Status). */
    marks: {
      type: Array,
      default: () => [],
    },
    /** Compact = kleine Vorschau (Gegner-Karte). */
    compact: {
      type: Boolean,
      default: false,
    },
    /** Wenn true: Klicks auf `pickableColor`-Zellen emittieren `pick-cell`. */
    interactive: {
      type: Boolean,
      default: false,
    },
    /** Farb-ID, deren freie Zellen klickbar sein sollen. */
    pickableColor: {
      type: String,
      default: null,
    },
    /** Host-Korrektur: JEDE Zelle ist klickbar und toggelt das Kreuz
     *  (unabhängig von Farbe/Phase). Klick emittiert `pick-cell` mit dem Index;
     *  der Parent entscheidet Setzen/Entfernen. */
    hostEdit: {
      type: Boolean,
      default: false,
    },
    /** Zugaenglicher Name der Karte (z. B. „Karte von Team 2"). */
    label: {
      type: String,
      default: "Bingokarte",
    },
  },
  emits: ["pick-cell"],
  setup(props, { emit }) {
    const colorHex = (colorKey) => BINGO_COLORS[colorKey] || "#666";
    // Farbe des Kreuzes: Weiss lag auf Gruen, Gelb und Blau unter 2,5:1,
    // readableTextOn waehlt je Feldfarbe hell oder dunkel.
    const textHex = (colorKey) => readableTextOn(colorHex(colorKey));

    const normalizedCells = computed(() => {
      const arr = Array.isArray(props.cells) ? props.cells.slice(0) : [];
      while (arr.length < BINGO_CELL_COUNT) arr.push("green");
      return arr.slice(0, BINGO_CELL_COUNT);
    });

    const normalizedMarks = computed(() => {
      const arr = Array.isArray(props.marks) ? props.marks.slice(0) : [];
      while (arr.length < BINGO_CELL_COUNT) arr.push(false);
      return arr.slice(0, BINGO_CELL_COUNT).map((v) => !!v);
    });

    // Alle Indizes, die Teil einer vollen Bingo-Reihe sind (für Highlight).
    const bingoIndices = computed(() => {
      const lines = getCompletedLines(normalizedMarks.value);
      const set = new Set();
      lines.forEach((line) => line.forEach((idx) => set.add(idx)));
      return set;
    });

    const isClickable = (idx, color) =>
      props.hostEdit ||
      (props.interactive &&
        props.pickableColor === color &&
        !normalizedMarks.value[idx]);

    const cellLabel = (idx, color) => {
      const row = Math.floor(idx / 5) + 1;
      const col = (idx % 5) + 1;
      const marked = normalizedMarks.value[idx];
      let text = `Reihe ${row}, Spalte ${col}: ${BINGO_COLOR_NAMES[color] || color}, ${
        marked ? "angekreuzt" : "frei"
      }`;
      if (bingoIndices.value.has(idx)) text += ", Teil eines Bingos";
      if (props.hostEdit) {
        text += marked ? " (Kreuz entfernen)" : " (Kreuz setzen)";
      } else if (isClickable(idx, color)) {
        text += " (ankreuzen)";
      }
      return text;
    };

    // Kurzfassung fuer die kompakte Vorschau.
    const summaryLabel = computed(() => {
      const marked = normalizedMarks.value.filter(Boolean).length;
      const bingos = getCompletedLines(normalizedMarks.value).length;
      return `${props.label}: ${marked} von ${BINGO_CELL_COUNT} Feldern angekreuzt, ${bingos} Bingo${
        bingos === 1 ? "" : "s"
      }`;
    });

    // Wählen läuft (eigene Karte, Kategorie-Farbe gesetzt): Dann werden die
    // nicht wählbaren Felder abgedunkelt, damit die wählbaren herausstechen.
    // Nicht bei der Host-Korrektur, dort ist jedes Feld klickbar.
    const isPicking = computed(
      () =>
        !props.compact &&
        !props.hostEdit &&
        props.interactive &&
        !!props.pickableColor &&
        normalizedCells.value.some(
          (c, i) => c === props.pickableColor && !normalizedMarks.value[i],
        ),
    );

    // Gerade gesetzte bzw. entfernte Kreuze für eine kurze Animation merken.
    // Der erste Stand (Laden, Reconnect) löst nichts aus.
    const justMarked = ref(new Set());
    const justRemoved = ref(new Set());
    const timers = new Set();
    const flash = (setRef, idx, ms) => {
      setRef.value = new Set(setRef.value).add(idx);
      const t = setTimeout(() => {
        timers.delete(t);
        const next = new Set(setRef.value);
        next.delete(idx);
        setRef.value = next;
      }, ms);
      timers.add(t);
    };
    let previousMarks = null;
    watch(
      normalizedMarks,
      (now) => {
        if (previousMarks) {
          now.forEach((marked, idx) => {
            if (previousMarks[idx] && !marked) flash(justRemoved, idx, 2200);
            else if (!previousMarks[idx] && marked) flash(justMarked, idx, 900);
          });
        }
        previousMarks = now.slice();
      },
      { immediate: true },
    );
    onBeforeUnmount(() => timers.forEach((t) => clearTimeout(t)));

    const onCellClick = (idx, color) => {
      // Host-Korrektur: jede Zelle togglebar, Parent setzt/entfernt.
      if (props.hostEdit) {
        emit("pick-cell", idx);
        return;
      }
      if (!props.interactive) return;
      if (props.pickableColor !== color) return;
      if (normalizedMarks.value[idx]) return;
      emit("pick-cell", idx);
    };

    return {
      colorHex,
      textHex,
      isClickable,
      cellLabel,
      summaryLabel,
      normalizedCells,
      normalizedMarks,
      bingoIndices,
      isPicking,
      justMarked,
      justRemoved,
      onCellClick,
    };
  },
};
</script>

<style scoped>
.bingo-card {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 6px;
  width: 100%;
  aspect-ratio: 1 / 1;
  max-width: 480px;
  margin: 0 auto;
}
.bingo-card--compact {
  gap: 3px;
  max-width: 160px;
}
.bingo-card__cell {
  aspect-ratio: 1 / 1;
  background: var(--cell-color, #666);
  border-radius: 8px;
  border: 2px solid rgba(0, 0, 0, 0.25);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    transform 0.1s ease,
    box-shadow 0.15s ease;
}
.bingo-card--compact .bingo-card__cell {
  border-width: 1px;
  border-radius: 4px;
}
.bingo-card__cell--pickable {
  cursor: pointer;
  position: relative;
  z-index: 1;
}
/* Wählen läuft: die nicht wählbaren Felder treten zurück, die wählbaren
   pulsieren mit weißem Ring und leichtem Aufzoomen. Vorher gab es nur eine
   leichte Vergrößerung beim Überfahren, das fiel kaum auf. */
.bingo-card--picking .bingo-card__cell:not(.bingo-card__cell--pickable) {
  filter: brightness(0.45) saturate(0.6);
}
.bingo-card--picking .bingo-card__cell--pickable {
  animation: bingo-pick-pulse 1.1s ease-in-out infinite;
}
/* Sichtbarer Tastaturfokus (WCAG 2.4.7) in der Flaechen-Schriftfarbe des
   Themes, damit er auf jeder Feldfarbe und jedem Hintergrund auffaellt. */
.bingo-card__cell--pickable:focus-visible {
  outline: 3px solid var(--app-on-surface, #f5f5f5);
  outline-offset: 2px;
}
.bingo-card__cell--pickable:hover {
  transform: scale(1.03);
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.3),
    0 0 0 3px rgba(255, 255, 255, 0.4);
}
.bingo-card__cell--marked {
  filter: brightness(0.7);
}
/* Kreuz gerade gesetzt: kurzes Aufspringen als Bestätigung. */
.bingo-card__cell--just-marked .bingo-card__mark {
  animation: bingo-mark-pop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
}
/* Kreuz gerade entfernt (z. B. per Bonus eines Gegners): Feld zittert und
   blinkt mit rotem Ring (destruktiv = rot), das ✕ fliegt heraus. */
.bingo-card__cell--just-removed {
  position: relative;
  z-index: 2;
  animation:
    bingo-removed-shake 0.5s ease-in-out,
    bingo-removed-ring 0.7s ease-in-out 3;
}
.bingo-card__mark--ghost {
  color: var(--app-negative-text, #ff5252);
  animation: bingo-mark-out 1.6s ease-in forwards;
}
.bingo-card__cell--bingo {
  outline: 3px solid #fff;
  outline-offset: -3px;
  animation: bingo-pulse 1.4s ease-in-out infinite;
}
.bingo-card--compact .bingo-card__cell--bingo {
  outline-width: 2px;
  outline-offset: -2px;
}
.bingo-card__mark {
  color: var(--cell-text, #fff);
  font-weight: 700;
  font-size: 2.2rem;
  line-height: 1;
  text-shadow: 0 0 6px rgba(0, 0, 0, 0.6);
  pointer-events: none;
}
.bingo-card--compact .bingo-card__mark {
  font-size: 0.9rem;
  text-shadow: 0 0 3px rgba(0, 0, 0, 0.7);
}
@keyframes bingo-pick-pulse {
  0%,
  100% {
    transform: scale(1);
    box-shadow:
      inset 0 0 0 2px rgba(255, 255, 255, 0.5),
      0 0 0 3px rgba(255, 255, 255, 0.85),
      0 0 10px rgba(255, 255, 255, 0.5);
  }
  50% {
    transform: scale(1.07);
    box-shadow:
      inset 0 0 0 2px rgba(255, 255, 255, 0.8),
      0 0 0 5px #fff,
      0 0 22px rgba(255, 255, 255, 0.95);
  }
}
@keyframes bingo-mark-pop {
  0% {
    transform: scale(0.2);
    opacity: 0;
  }
  70% {
    transform: scale(1.35);
    opacity: 1;
  }
  100% {
    transform: scale(1);
  }
}
@keyframes bingo-removed-shake {
  0%,
  100% {
    transform: translateX(0);
  }
  20% {
    transform: translateX(-6px) rotate(-4deg);
  }
  40% {
    transform: translateX(6px) rotate(4deg);
  }
  60% {
    transform: translateX(-4px) rotate(-2deg);
  }
  80% {
    transform: translateX(4px) rotate(2deg);
  }
}
@keyframes bingo-removed-ring {
  0%,
  100% {
    box-shadow:
      inset 0 0 0 1px rgba(255, 255, 255, 0.15),
      0 0 0 0 var(--app-negative-text, #ff5252);
  }
  50% {
    box-shadow:
      inset 0 0 0 2px var(--app-negative-text, #ff5252),
      0 0 0 5px var(--app-negative-text, #ff5252),
      0 0 22px var(--app-negative-text, #ff5252);
  }
}
@keyframes bingo-mark-out {
  0% {
    transform: scale(1);
    opacity: 1;
  }
  35% {
    transform: scale(1.5) rotate(-10deg);
    opacity: 1;
  }
  100% {
    transform: scale(0.2) rotate(45deg);
    opacity: 0;
  }
}
/* Reduzierte Bewegung: Ringe und Ein-/Ausblenden bleiben, kein Zittern,
   Aufzoomen oder Drehen. */
@media (prefers-reduced-motion: reduce) {
  .bingo-card--picking .bingo-card__cell--pickable {
    animation: none;
    box-shadow:
      inset 0 0 0 2px rgba(255, 255, 255, 0.8),
      0 0 0 4px #fff;
  }
  .bingo-card__cell--just-marked .bingo-card__mark {
    animation: none;
  }
  .bingo-card__cell--just-removed {
    animation: bingo-removed-ring 0.7s ease-in-out 3;
  }
  .bingo-card__mark--ghost {
    animation: bingo-fade-out 1.6s ease-in forwards;
  }
}
@keyframes bingo-fade-out {
  to {
    opacity: 0;
  }
}
@keyframes bingo-pulse {
  0%,
  100% {
    box-shadow:
      inset 0 0 0 1px rgba(255, 255, 255, 0.3),
      0 0 12px rgba(255, 255, 255, 0.55);
  }
  50% {
    box-shadow:
      inset 0 0 0 1px rgba(255, 255, 255, 0.3),
      0 0 20px rgba(255, 255, 255, 0.9);
  }
}
</style>
