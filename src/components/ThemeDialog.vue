<template>
  <q-dialog
    :model-value="modelValue"
    @update:model-value="(v) => $emit('update:modelValue', v)"
  >
    <q-card class="theme-dialog-card">
      <q-card-section class="row items-center q-pb-none">
        <div class="text-h6">Design anpassen</div>
        <q-space />
        <q-btn v-close-popup icon="close" flat round dense />
      </q-card-section>

      <!-- Live-Vorschau -->
      <q-card-section>
        <div class="theme-preview" :style="{ background: previewBg }">
          <div class="theme-preview__text" :style="{ color: preview.onBg }">
            Beispieltext auf dem Hintergrund
          </div>
          <div class="theme-preview__buttons">
            <div
              class="theme-preview__btn"
              :style="{ background: preview.accent, color: preview.onAccent }"
            >
              Button
            </div>
            <div
              class="theme-preview__btn theme-preview__btn--disabled"
              :style="{
                color: preview.onAccent,
                background: `color-mix(in srgb, ${preview.accent} 32%, transparent)`,
                borderColor: `color-mix(in srgb, ${preview.onAccent} 60%, transparent)`,
              }"
              :title="'So sehen deaktivierte Buttons aus'"
            >
              Deaktiviert
            </div>
            <div
              class="theme-preview__card"
              :style="
                draft.cardColors === 'theme' && !isDraftDefault
                  ? {
                      background: preview.accent,
                      color: preview.onAccent,
                      border: 'none',
                    }
                  : { background: '#8e24aa', color: '#fff', border: 'none' }
              "
            >
              {{
                draft.cardColors === "theme" && !isDraftDefault
                  ? "Karte (Theme)"
                  : "Karte (Original)"
              }}
            </div>
          </div>
        </div>
      </q-card-section>

      <q-card-section class="q-pt-none">
        <q-tabs
          v-model="tab"
          dense
          align="justify"
          active-color="primary"
          indicator-color="primary"
        >
          <q-tab name="gradient" label="Verläufe" icon="gradient" />
          <q-tab name="solid" label="Einfarbig" icon="format_color_fill" />
          <q-tab name="custom" label="Eigenes" icon="palette" />
        </q-tabs>

        <q-separator class="q-mb-md" />

        <q-tab-panels v-model="tab" animated class="theme-panels">
          <!-- Verläufe ------------------------------------------------ -->
          <q-tab-panel name="gradient" class="q-pa-none">
            <div class="swatch-grid">
              <button
                v-for="p in presets"
                :key="p.id"
                type="button"
                class="swatch"
                :class="{ selected: isGradientPresetSelected(p.id) }"
                :style="{ background: gradientCss(p) }"
                :title="p.name"
                @click="selectGradientPreset(p)"
              >
                <span class="swatch__label">{{ p.name }}</span>
              </button>
            </div>

            <div class="text-subtitle2 q-mt-md q-mb-sm">Ausrichtung</div>
            <div class="direction-row">
              <q-btn
                v-for="d in directions"
                :key="d.value"
                :icon="d.icon"
                round
                dense
                :color="draft.direction === d.value ? 'primary' : 'grey-8'"
                :title="d.label"
                @click="draft.direction = d.value"
              />
            </div>
          </q-tab-panel>

          <!-- Einfarbig ----------------------------------------------- -->
          <q-tab-panel name="solid" class="q-pa-none">
            <div class="swatch-grid">
              <button
                v-for="p in solidPresets"
                :key="p.id"
                type="button"
                class="swatch"
                :class="{ selected: isSolidPresetSelected(p.id) }"
                :style="{ background: p.color }"
                :title="p.name"
                @click="selectSolidPreset(p)"
              >
                <span class="swatch__label">{{ p.name }}</span>
              </button>
            </div>
          </q-tab-panel>

          <!-- Eigenes ------------------------------------------------- -->
          <q-tab-panel name="custom" class="q-pa-none">
            <q-btn-toggle
              v-model="customType"
              spread
              no-caps
              class="q-mb-md"
              toggle-color="primary"
              :options="[
                { label: 'Verlauf', value: 'gradient', icon: 'gradient' },
                {
                  label: 'Einfarbig',
                  value: 'solid',
                  icon: 'format_color_fill',
                },
              ]"
            />

            <div v-if="customType === 'gradient'" class="row q-col-gutter-md">
              <div class="col-6">
                <div class="text-caption q-mb-xs">Farbe 1</div>
                <q-color
                  v-model="draft.from"
                  no-header-tabs
                  default-view="palette"
                  format-model="hex"
                  class="theme-color"
                />
              </div>
              <div class="col-6">
                <div class="text-caption q-mb-xs">Farbe 2</div>
                <q-color
                  v-model="draft.to"
                  no-header-tabs
                  default-view="palette"
                  format-model="hex"
                  class="theme-color"
                />
              </div>
            </div>

            <div v-else>
              <div class="text-caption q-mb-xs">Farbe</div>
              <q-color
                v-model="draft.color"
                no-header-tabs
                default-view="palette"
                format-model="hex"
                class="theme-color"
              />
            </div>

            <div v-if="customType === 'gradient'">
              <div class="text-subtitle2 q-mt-md q-mb-sm">Ausrichtung</div>
              <div class="direction-row">
                <q-btn
                  v-for="d in directions"
                  :key="d.value"
                  :icon="d.icon"
                  round
                  dense
                  :color="draft.direction === d.value ? 'primary' : 'grey-8'"
                  :title="d.label"
                  @click="draft.direction = d.value"
                />
              </div>
            </div>

            <q-separator class="q-my-md" />

            <div class="text-subtitle2 q-mb-sm">
              Schrift &amp; Buttons
              <span class="text-caption text-grey"
                >— automatisch generiert, anpassbar</span
              >
            </div>

            <div class="row q-col-gutter-md items-start">
              <div class="col-6">
                <div class="text-caption q-mb-xs row items-center">
                  Buttonfarbe
                  <q-space />
                  <q-btn
                    v-if="draft.overrides.accent"
                    dense
                    flat
                    size="sm"
                    label="Auto"
                    color="primary"
                    @click="draft.overrides.accent = null"
                  />
                </div>
                <q-color
                  :model-value="preview.accent"
                  no-header-tabs
                  default-view="palette"
                  format-model="hex"
                  class="theme-color"
                  @update:model-value="(v) => (draft.overrides.accent = v)"
                />
              </div>
              <div class="col-6">
                <div class="text-caption q-mb-xs row items-center">
                  Schriftfarbe (Hintergrund)
                  <q-space />
                  <q-btn
                    v-if="draft.overrides.onBg"
                    dense
                    flat
                    size="sm"
                    label="Auto"
                    color="primary"
                    @click="draft.overrides.onBg = null"
                  />
                </div>
                <q-color
                  :model-value="preview.onBg"
                  no-header-tabs
                  default-view="palette"
                  format-model="hex"
                  class="theme-color"
                  @update:model-value="(v) => (draft.overrides.onBg = v)"
                />
              </div>
            </div>
          </q-tab-panel>
        </q-tab-panels>
      </q-card-section>

      <!-- Spielkarten-Farben: original oder ans Theme angepasst -->
      <q-card-section class="q-pt-none">
        <div class="text-subtitle2 q-mb-sm">Spielkarten-Farben</div>
        <q-btn-toggle
          v-model="draft.cardColors"
          spread
          no-caps
          :disable="isDraftDefault"
          toggle-color="primary"
          :options="[
            { label: 'Original', value: 'original', icon: 'palette' },
            { label: 'Theme', value: 'theme', icon: 'format_color_fill' },
          ]"
        />
        <div v-if="isDraftDefault" class="text-caption text-grey q-mt-xs">
          Beim Standard-Theme sind nur die originalen Kartenfarben verfügbar.
        </div>
      </q-card-section>

      <q-card-actions align="between" class="q-px-md q-pb-md">
        <q-btn flat label="Zurücksetzen" color="grey" @click="onReset" />
        <div>
          <q-btn v-close-popup flat label="Abbrechen" class="q-mr-sm" />
          <q-btn
            unelevated
            label="Übernehmen"
            color="primary"
            @click="onApply"
          />
        </div>
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script>
import { reactive, ref, computed, watch } from "vue";
import { useTheme } from "../composables/useTheme";
import { GRADIENT_DIRECTIONS, DEFAULT_THEME } from "../utils/themePresets";

export default {
  name: "ThemeDialog",
  props: {
    modelValue: { type: Boolean, default: false },
  },
  emits: ["update:modelValue"],
  setup(props, { emit }) {
    const {
      theme,
      presets,
      solidPresets,
      setTheme,
      resetTheme,
      previewColors,
      previewBackground,
    } = useTheme();

    const tab = ref("gradient");

    const draft = reactive({
      type: "gradient",
      source: "preset",
      presetId: null,
      color: "#121212",
      from: "#FFAA00",
      to: "#E8003A",
      direction: DEFAULT_THEME.direction,
      cardColors: "original",
      overrides: { accent: null, onBg: null },
    });

    // Standard-/kein Theme -> nur originale Kartenfarben (Option gesperrt).
    const isDraftDefault = computed(
      () =>
        draft.source === "preset" &&
        draft.type === "solid" &&
        draft.presetId === "onyx" &&
        !draft.overrides.accent &&
        !draft.overrides.onBg,
    );

    function loadDraftFromTheme() {
      const t = theme;
      draft.type = t.type;
      draft.source = t.source;
      draft.presetId = t.presetId;
      draft.color = t.color;
      draft.from = t.from;
      draft.to = t.to;
      draft.direction = t.direction;
      draft.cardColors = t.cardColors === "theme" ? "theme" : "original";
      draft.overrides.accent = t.overrides ? t.overrides.accent : null;
      draft.overrides.onBg = t.overrides ? t.overrides.onBg : null;
      // Passenden Tab wählen
      if (t.source === "custom") tab.value = "custom";
      else if (t.type === "solid") tab.value = "solid";
      else tab.value = "gradient";
    }

    // Beim Öffnen den aktuellen Zustand in den Entwurf laden.
    watch(
      () => props.modelValue,
      (open) => {
        if (open) loadDraftFromTheme();
      },
      { immediate: true },
    );

    // Untertyp im Custom-Tab (Verlauf/Einfarbig).
    const customType = computed({
      get: () => draft.type,
      set: (v) => {
        draft.type = v;
      },
    });

    // Wechsel des Haupt-Tabs setzt Quelle/Typ passend, damit die Vorschau
    // sofort den richtigen Modus zeigt.
    watch(tab, (t) => {
      if (t === "custom") {
        draft.source = "custom";
      } else if (t === "solid") {
        draft.source = "preset";
        draft.type = "solid";
      } else if (t === "gradient") {
        draft.source = "preset";
        draft.type = "gradient";
      }
    });

    function gradientCss(p) {
      return `linear-gradient(135deg, ${p.from}, ${p.to})`;
    }

    function selectGradientPreset(p) {
      draft.type = "gradient";
      draft.source = "preset";
      draft.presetId = p.id;
      draft.from = p.from;
      draft.to = p.to;
    }

    function selectSolidPreset(p) {
      draft.type = "solid";
      draft.source = "preset";
      draft.presetId = p.id;
      draft.color = p.color;
    }

    function isGradientPresetSelected(id) {
      return (
        draft.source === "preset" &&
        draft.type === "gradient" &&
        draft.presetId === id
      );
    }

    function isSolidPresetSelected(id) {
      return (
        draft.source === "preset" &&
        draft.type === "solid" &&
        draft.presetId === id
      );
    }

    // Für preset-Tabs die Overrides ignorieren (nur Custom nutzt sie).
    const effectiveDraft = computed(() => {
      const d = JSON.parse(JSON.stringify(draft));
      if (d.source !== "custom") d.overrides = { accent: null, onBg: null };
      // Beim Standard-Theme immer originale Kartenfarben erzwingen.
      if (isDraftDefault.value) d.cardColors = "original";
      return d;
    });

    const preview = computed(() => previewColors(effectiveDraft.value));
    const previewBg = computed(() => previewBackground(effectiveDraft.value));

    function onApply() {
      setTheme(effectiveDraft.value);
      emit("update:modelValue", false);
    }

    function onReset() {
      resetTheme();
      loadDraftFromTheme();
    }

    return {
      tab,
      draft,
      customType,
      presets,
      solidPresets,
      directions: GRADIENT_DIRECTIONS,
      gradientCss,
      selectGradientPreset,
      selectSolidPreset,
      isGradientPresetSelected,
      isSolidPresetSelected,
      isDraftDefault,
      preview,
      previewBg,
      onApply,
      onReset,
    };
  },
};
</script>

<style scoped>
.theme-dialog-card {
  width: 100%;
  max-width: 560px;
  max-height: 92vh;
  overflow-y: auto;
  color: #fff;
}

.theme-preview {
  border-radius: 12px;
  padding: 18px;
  min-height: 120px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.12);
}
.theme-preview__text {
  font-size: 1.05rem;
  font-weight: 600;
}
.theme-preview__buttons {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}
.theme-preview__btn {
  padding: 8px 20px;
  border-radius: 8px;
  font-weight: 600;
  font-size: 0.9rem;
}
/* Vorschau der deaktivierten Button-Optik – 1:1 wie die app-weiten Regeln in
   app.scss: dezente Theme-Akzent-Füllung, gestrichelter Rand, Text über die
   On-Accent-Farbe des Themes (per :style-Binding oben gesetzt). */
.theme-preview__btn--disabled {
  border-style: dashed;
  border-width: 2px;
  cursor: not-allowed;
  opacity: 0.9;
  filter: saturate(0.55);
}
.theme-preview__card {
  padding: 8px 16px;
  border-radius: 8px;
  background: #1e1e1e;
  color: #fff;
  border: 1px solid #3d3d3d;
  font-size: 0.85rem;
}

.swatch-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
@media (max-width: 599px) {
  .swatch-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
.swatch {
  position: relative;
  height: 62px;
  border-radius: 10px;
  border: 2px solid transparent;
  cursor: pointer;
  padding: 0;
  overflow: hidden;
  transition:
    transform 140ms ease,
    border-color 140ms ease;
}
.swatch:hover {
  transform: translateY(-2px);
}
.swatch.selected {
  border-color: #fff;
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.35);
}
.swatch__label {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 3px 6px;
  font-size: 0.7rem;
  font-weight: 600;
  color: #fff;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.45));
  text-align: left;
}

.direction-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.theme-panels {
  background: transparent;
}
.theme-color {
  max-width: 100%;
}
</style>
