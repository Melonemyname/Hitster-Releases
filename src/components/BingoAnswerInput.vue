<template>
  <div class="bingo-answer">
    <!-- Solo oder Gruppe -->
    <template v-if="category.id === 'solo-group'">
      <div class="bingo-answer__buttons">
        <q-btn
          unelevated
          color="primary"
          label="Solo"
          class="bingo-answer__btn"
          :class="{ 'btn-unselected': modelValue !== 'solo' }"
          :disable="disabled"
          @click="update('solo')"
        />
        <q-btn
          unelevated
          color="primary"
          label="Gruppe"
          class="bingo-answer__btn"
          :class="{ 'btn-unselected': modelValue !== 'group' }"
          :disable="disabled"
          @click="update('group')"
        />
      </div>
    </template>

    <!-- Vor 2000? -->
    <template v-else-if="category.id === 'before-2000'">
      <div class="bingo-answer__buttons">
        <q-btn
          unelevated
          color="primary"
          label="Vor 2000"
          class="bingo-answer__btn"
          :class="{ 'btn-unselected': modelValue !== 'before' }"
          :disable="disabled"
          @click="update('before')"
        />
        <q-btn
          unelevated
          color="primary"
          label="Ab 2000"
          class="bingo-answer__btn"
          :class="{ 'btn-unselected': modelValue !== 'after' }"
          :disable="disabled"
          @click="update('after')"
        />
      </div>
    </template>

    <!-- Titel -->
    <template v-else-if="category.id === 'title'">
      <q-input
        :model-value="modelValue"
        label="Song-Titel"
        outlined
        dense
        autofocus
        :disable="disabled"
        @update:model-value="update"
      />
    </template>

    <!-- Künstler / Band -->
    <template v-else-if="category.id === 'artist'">
      <q-input
        :model-value="modelValue"
        label="Band / Künstler"
        outlined
        dense
        autofocus
        :disable="disabled"
        @update:model-value="update"
      />
    </template>

    <!-- Jahrzehnt (Dropdown) -->
    <template v-else-if="category.id === 'decade'">
      <q-select
        :model-value="modelValue !== '' ? Number(modelValue) : null"
        :options="decadeOptions"
        label="Jahrzehnt"
        outlined
        dense
        emit-value
        map-options
        :disable="disabled"
        @update:model-value="(v) => update(v === null ? '' : String(v))"
      />
    </template>

    <!-- Zahleneingabe (exakt / ±) -->
    <template v-else>
      <q-input
        :model-value="modelValue"
        type="number"
        :label="numberLabel"
        outlined
        dense
        autofocus
        :disable="disabled"
        @update:model-value="
          (v) => update(v === null || v === undefined ? '' : String(v))
        "
      />
    </template>
  </div>
</template>

<script>
import { computed } from "vue";

export default {
  name: "BingoAnswerInput",
  props: {
    modelValue: {
      type: String,
      default: "",
    },
    /** Kategorie-Objekt (id, color, bonusYearRange, …) */
    category: {
      type: Object,
      required: true,
    },
    disabled: {
      type: Boolean,
      default: false,
    },
  },
  emits: ["update:modelValue"],
  setup(props, { emit }) {
    const decadeOptions = Array.from({ length: 8 }, (_, i) => {
      const decade = 1950 + i * 10;
      return { label: `${decade}er`, value: decade };
    });

    const numberLabel = computed(() => {
      switch (props.category.id) {
        case "exact-year":
          return "Genaues Jahr";
        case "year-4":
          return "Jahr (±4)";
        case "year-3":
          return "Jahr (±3)";
        case "year-2":
          return "Jahr (±2)";
        default:
          return "Jahr";
      }
    });

    const update = (value) => emit("update:modelValue", value);

    return { decadeOptions, numberLabel, update };
  },
};
</script>

<style scoped>
.bingo-answer {
  width: 100%;
}
.bingo-answer__buttons {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: center;
}
.bingo-answer__btn {
  min-width: 160px;
}
</style>
