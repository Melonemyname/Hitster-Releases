<template>
  <div class="bingo-card" :class="{ 'bingo-card--compact': compact }">
    <div
      v-for="(color, idx) in normalizedCells"
      :key="idx"
      class="bingo-card__cell"
      :style="{ '--cell-color': colorHex(color) }"
      :class="{
        'bingo-card__cell--marked': normalizedMarks[idx],
        'bingo-card__cell--bingo': bingoIndices.has(idx),
        'bingo-card__cell--pickable':
          (interactive && pickableColor === color && !normalizedMarks[idx]) ||
          hostEdit,
      }"
      @click="onCellClick(idx, color)"
    >
      <span v-if="normalizedMarks[idx]" class="bingo-card__mark">✕</span>
    </div>
  </div>
</template>

<script>
import { computed } from "vue";
import {
  BINGO_CELL_COUNT,
  BINGO_COLORS,
  getCompletedLines,
} from "../composables/useBingo";

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
  },
  emits: ["pick-cell"],
  setup(props, { emit }) {
    const colorHex = (colorKey) => BINGO_COLORS[colorKey] || "#666";

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
      normalizedCells,
      normalizedMarks,
      bingoIndices,
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
  color: #fff;
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
