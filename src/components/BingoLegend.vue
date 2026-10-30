<template>
  <!-- Quasar legt `aria-labelledby` auf das role="dialog"-Element, der Name
       kommt so aus der sichtbaren Ueberschrift. -->
  <q-dialog
    :model-value="modelValue"
    aria-labelledby="bingo-legend-title"
    @update:model-value="onUpdate"
  >
    <q-card class="bingo-legend">
      <q-card-section class="bg-primary">
        <div id="bingo-legend-title" class="text-h6">
          <q-icon name="info" class="q-mr-sm" />
          Bingo: Farben und Regeln
        </div>
        <div class="text-subtitle2">
          Schwierigkeit: {{ difficulty === "hard" ? "Schwer" : "Leicht" }}
        </div>
      </q-card-section>

      <q-card-section>
        <div class="text-body2 q-mb-md">
          Gespielt wird in Teams. Pro Runde wird eine Kategorie zufällig
          gewählt. Jedes Team gibt eine Antwort ab, das Spiel prüft sie
          automatisch. Liegt euer Team richtig, markiert ihr ein freies Feld
          der zugehörigen Farbe auf eurer Bingokarte. Punkte gibt es im Bingo
          nicht.
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
              aria-hidden="true"
            />
            <div>
              <!-- Farbname nur fuer Screenreader: Die Felder der Karte
                   sagen ihre Farbe an, hier entsteht die Zuordnung. -->
              <div class="text-subtitle2">
                <span class="sr-only">{{ colorName(cat.color) }}: </span>
                {{ cat.label }}
              </div>
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
          <strong>{{ bingosToWin }} {{ bingosToWin === 1 ? "Bingo" : "Bingos" }}</strong>.
          Erreichen mehrere Teams in derselben Runde das Ziel, gewinnen sie
          geteilt.
        </div>

        <div class="text-body2 q-mt-sm">
          <strong>Bonus:</strong> Trefft ihr in einer Kategorie mit Spielraum
          (zum Beispiel ±2 Jahre) das Jahr exakt, dürft ihr ein Kreuz eines
          anderen Teams entfernen. Ausgenommen sind Kreuze in einer bereits
          vollen 5er-Reihe.
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
import { BINGO_COLOR_NAMES } from "./BingoCard.vue";

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
    const colorName = (colorKey) => BINGO_COLOR_NAMES[colorKey] || colorKey;
    const onUpdate = (val) => emit("update:modelValue", val);
    return { categories, colorHex, colorName, onUpdate };
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
