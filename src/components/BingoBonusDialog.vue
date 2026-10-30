<template>
  <!-- Quasar legt `aria-labelledby` auf das role="dialog"-Element, der Name
       kommt so aus der sichtbaren Ueberschrift. -->
  <q-dialog
    :model-value="modelValue"
    persistent
    aria-labelledby="bingo-bonus-title"
    @update:model-value="onUpdate"
  >
    <q-card class="bingo-bonus-dialog">
      <q-card-section class="bg-primary">
        <div id="bingo-bonus-title" class="text-h6">
          <q-icon name="workspace_premium" class="q-mr-sm" />
          Bonus: Kreuz entfernen
        </div>
        <div class="text-subtitle2">
          Ihr habt das Jahr exakt getroffen. Wählt ein Kreuz eines anderen
          Teams, das entfernt werden soll. Kreuze in bereits vollen 5er-Reihen
          sind gesperrt (grau markiert).
        </div>
      </q-card-section>

      <q-card-section>
        <div v-if="opponentTeams.length === 0" class="text-caption">
          Es gibt keine anderen Teams, der Bonus entfällt.
        </div>
        <div v-else class="bingo-bonus-teams">
          <div
            v-for="team in opponentTeams"
            :key="team.slotId"
            class="bingo-bonus-team"
            :class="{
              'bingo-bonus-team--active': team.slotId === selectedSlotId,
            }"
          >
            <div class="bingo-bonus-team__name">
              <q-radio
                :model-value="selectedSlotId"
                :val="team.slotId"
                :label="team.name"
                dense
                @update:model-value="onSelectTeam"
              />
            </div>
            <!-- Die Feld-Knoepfe hatten keinen zugaenglichen Namen (nur Farbe
                 und ein Kreuz-Zeichen). Jetzt sagen sie Position, Farbe und
                 Zustand an, die Auswahl zusaetzlich ueber aria-pressed. -->
            <div
              class="bingo-bonus-team__grid"
              role="group"
              :aria-label="`Karte von ${team.name}`"
            >
              <button
                v-for="(color, idx) in team.cells"
                :key="idx"
                type="button"
                class="bingo-bonus-cell"
                :class="cellClasses(team, idx)"
                :style="{
                  '--cell-color': colorHex(color),
                  '--cell-text': textHex(color),
                }"
                :disabled="!isCellPickable(team, idx)"
                :aria-label="cellLabel(team, idx, color)"
                :aria-pressed="isCellSelected(team, idx) ? 'true' : 'false'"
                @click="onPickCell(team.slotId, idx)"
              >
                <span
                  v-if="team.marks[idx]"
                  class="bingo-bonus-cell__mark"
                  aria-hidden="true"
                >
                  ✕
                </span>
              </button>
            </div>
          </div>
        </div>
      </q-card-section>

      <q-card-actions align="right" class="q-pa-md">
        <!-- Gedaempfte Theme-Schrift statt Quasar-Grau (rund 3:1). -->
        <q-btn flat class="text-muted" label="Überspringen" @click="skip" />
        <q-btn
          color="positive"
          icon="check"
          label="Kreuz entfernen"
          :disable="!canConfirm"
          @click="confirm"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script>
import { computed, ref, watch } from "vue";
import { BINGO_COLORS, getBingoLines } from "../composables/useBingo";
import { readableTextOn } from "../utils/themeColors";
import { BINGO_COLOR_NAMES } from "./BingoCard.vue";

// Zellen, die Teil einer bereits vollen Bingo-Linie sind, dürfen nicht
// entfernt werden. Wir berechnen die Sperr-Menge pro Team lokal (der
// Server prüft ebenfalls und akzeptiert den Bonus sonst nicht).
function computeLockedIndices(marks) {
  const locked = new Set();
  for (const line of getBingoLines()) {
    if (line.every((idx) => marks[idx])) {
      for (const idx of line) locked.add(idx);
    }
  }
  return locked;
}

export default {
  name: "BingoBonusDialog",
  props: {
    modelValue: {
      type: Boolean,
      default: false,
    },
    opponentTeams: {
      // [{ slotId, name, cells: string[25], marks: boolean[25] }]
      type: Array,
      default: () => [],
    },
  },
  emits: ["update:modelValue", "confirm", "skip"],
  setup(props, { emit }) {
    const selectedSlotId = ref(null);
    const selectedCellIndex = ref(null);

    watch(
      () => props.modelValue,
      (open) => {
        if (open) {
          selectedSlotId.value = null;
          selectedCellIndex.value = null;
        }
      },
    );

    const colorHex = (color) => BINGO_COLORS[color] || "#666";
    // Kreuz-Farbe je Feldfarbe (Weiss lag auf Gruen, Gelb, Blau unter 2,5:1).
    const textHex = (color) => readableTextOn(colorHex(color));

    const isCellPickable = (team, idx) => {
      if (!team.marks[idx]) return false;
      const locked = computeLockedIndices(team.marks);
      return !locked.has(idx);
    };

    const cellClasses = (team, idx) => {
      const locked = computeLockedIndices(team.marks);
      return {
        "bingo-bonus-cell--marked": team.marks[idx],
        "bingo-bonus-cell--locked": team.marks[idx] && locked.has(idx),
        "bingo-bonus-cell--selected":
          selectedSlotId.value === team.slotId &&
          selectedCellIndex.value === idx,
      };
    };

    const isCellSelected = (team, idx) =>
      selectedSlotId.value === team.slotId && selectedCellIndex.value === idx;

    const cellLabel = (team, idx, color) => {
      const row = Math.floor(idx / 5) + 1;
      const col = (idx % 5) + 1;
      const name = BINGO_COLOR_NAMES[color] || color;
      if (!team.marks[idx]) return `Reihe ${row}, Spalte ${col}: ${name}, frei`;
      const locked = computeLockedIndices(team.marks).has(idx);
      return `Reihe ${row}, Spalte ${col}: ${name}, angekreuzt${
        locked ? ", gesperrt (volle Reihe)" : ""
      }`;
    };

    const onSelectTeam = (slotId) => {
      selectedSlotId.value = slotId;
      selectedCellIndex.value = null;
    };

    const onPickCell = (slotId, idx) => {
      const team = props.opponentTeams.find((t) => t.slotId === slotId);
      if (!team) return;
      if (!isCellPickable(team, idx)) return;
      selectedSlotId.value = slotId;
      selectedCellIndex.value = idx;
    };

    const canConfirm = computed(
      () => selectedSlotId.value !== null && selectedCellIndex.value !== null,
    );

    const confirm = () => {
      if (!canConfirm.value) return;
      emit("confirm", {
        targetSlotId: selectedSlotId.value,
        cellIndex: selectedCellIndex.value,
      });
      emit("update:modelValue", false);
    };

    const skip = () => {
      emit("skip");
      emit("update:modelValue", false);
    };

    const onUpdate = (val) => emit("update:modelValue", val);

    return {
      selectedSlotId,
      selectedCellIndex,
      colorHex,
      textHex,
      isCellSelected,
      cellLabel,
      isCellPickable,
      cellClasses,
      onSelectTeam,
      onPickCell,
      canConfirm,
      confirm,
      skip,
      onUpdate,
    };
  },
};
</script>

<style scoped>
.bingo-bonus-dialog {
  min-width: 380px;
  max-width: 640px;
}
.bingo-bonus-teams {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.bingo-bonus-team {
  border: 1px solid var(--surface-border, transparent);
  border-radius: 10px;
  padding: 10px;
  transition: border-color 0.15s ease;
}
.bingo-bonus-team--active {
  border-color: var(--app-accent, #999);
}
.bingo-bonus-team__name {
  margin-bottom: 8px;
}
.bingo-bonus-team__grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 3px;
  max-width: 220px;
}
.bingo-bonus-cell {
  aspect-ratio: 1 / 1;
  background: var(--cell-color, #666);
  border-radius: 4px;
  border: 1px solid rgba(0, 0, 0, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  cursor: default;
  transition:
    transform 0.1s ease,
    box-shadow 0.15s ease;
}
.bingo-bonus-cell--marked {
  cursor: pointer;
}
.bingo-bonus-cell--marked:not(.bingo-bonus-cell--locked):hover {
  transform: scale(1.06);
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.5);
}
/* Sichtbarer Tastaturfokus (WCAG 2.4.7) in der Flaechen-Schriftfarbe. */
.bingo-bonus-cell:focus-visible {
  outline: 3px solid var(--app-on-surface, #f5f5f5);
  outline-offset: 2px;
}
.bingo-bonus-cell--locked {
  cursor: not-allowed;
  opacity: 0.45;
}
.bingo-bonus-cell--selected {
  box-shadow:
    0 0 0 3px #fff,
    0 0 0 5px var(--app-accent, #fff);
}
.bingo-bonus-cell__mark {
  color: var(--cell-text, #fff);
  font-weight: 700;
  font-size: 0.95rem;
  line-height: 1;
  text-shadow: 0 0 3px rgba(0, 0, 0, 0.7);
}
</style>
