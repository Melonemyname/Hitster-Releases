<template>
  <q-dialog :model-value="modelValue" @update:model-value="onUpdate">
    <q-card class="bingo-legend">
      <q-card-section class="bg-primary">
        <div class="text-h6">
          <q-icon name="info" class="q-mr-sm" />
          Bingo – Farben &amp; Regeln
        </div>
        <div class="text-subtitle2">
          Schwierigkeit: {{ difficulty === "hard" ? "Schwer" : "Leicht" }}
        </div>
      </q-card-section>

      <q-card-section>
        <div class="text-body2 q-mb-md">
          Pro Runde wird eine Kategorie zufällig gewählt. Errät dein Team die
          Antwort, markiert es ein freies Feld der zugehörigen Farbe auf eurer
          Bingokarte.
        </div>

        <div class="bingo-legend__list">
          <div
            v-for="cat in categories"
            :key="cat.id"
            class="bingo-legend__row"
          >
            <span
              class="bingo-legend__swatch"
              :style="{ background: colorHex(cat.color) }"
            />
            <div>
              <div class="text-subtitle2">{{ cat.label }}</div>
              <div class="text-caption" style="opacity: 0.85">
                {{ cat.description }}
              </div>
            </div>
          </div>
        </div>

        <q-separator class="q-my-md" />

        <div class="text-body2">
          <strong>Bingo:</strong> 5 markierte Felder in einer Reihe (waagerecht,
          senkrecht oder diagonal). Ziel für dieses Spiel:
          <strong>{{ bingosToWin }} Bingo(s)</strong>. Erreichen mehrere Teams
          in derselben Runde das Ziel, gewinnen sie geteilt.
        </div>
      </q-card-section>

      <q-card-actions align="right">
        <q-btn flat label="Schließen" @click="onUpdate(false)" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script>
import { computed } from "vue";
import { BINGO_CATEGORIES, BINGO_COLORS } from "../composables/useBingo";

export default {
  name: "BingoLegend",
  props: {
    modelValue: {
      type: Boolean,
      default: false,
    },
    /** "easy" | "hard" */
    difficulty: {
      type: String,
      default: "easy",
    },
    bingosToWin: {
      type: Number,
      default: 3,
    },
  },
  emits: ["update:modelValue"],
  setup(props, { emit }) {
    const categories = computed(
      () => BINGO_CATEGORIES[props.difficulty] || BINGO_CATEGORIES.easy,
    );
    const colorHex = (colorKey) => BINGO_COLORS[colorKey] || "#666";
    const onUpdate = (val) => emit("update:modelValue", val);
    return { categories, colorHex, onUpdate };
  },
};
</script>

<style scoped>
.bingo-legend {
  min-width: 380px;
  max-width: 560px;
}
.bingo-legend__list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.bingo-legend__row {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}
.bingo-legend__swatch {
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 2px solid rgba(0, 0, 0, 0.25);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.2);
  margin-top: 4px;
}
</style>
