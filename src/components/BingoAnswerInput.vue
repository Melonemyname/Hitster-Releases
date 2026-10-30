<template>
  <div class="bingo-answer">
    <!-- Solo oder Gruppe. Die Auswahl war nur an der Fuellung erkennbar,
         `aria-pressed` sagt sie auch Screenreadern an; die Gruppe traegt den
         Namen der Frage. -->
    <template v-if="category.id === 'solo-group'">
      <div
        class="bingo-answer__buttons"
        role="group"
        aria-label="Solo oder Gruppe?"
      >
        <q-btn
          unelevated
          color="primary"
          label="Solo"
          class="bingo-answer__btn"
          :class="{ 'btn-unselected': modelValue !== 'solo' }"
          :aria-pressed="modelValue === 'solo' ? 'true' : 'false'"
          :disable="disabled"
          @click="update('solo')"
        />
        <q-btn
          unelevated
          color="primary"
          label="Gruppe"
          class="bingo-answer__btn"
          :class="{ 'btn-unselected': modelValue !== 'group' }"
          :aria-pressed="modelValue === 'group' ? 'true' : 'false'"
          :disable="disabled"
          @click="update('group')"
        />
      </div>
    </template>

    <!-- Vor 2000? -->
    <template v-else-if="category.id === 'before-2000'">
      <div class="bingo-answer__buttons" role="group" aria-label="Vor 2000?">
        <q-btn
          unelevated
          color="primary"
          label="Vor 2000"
          class="bingo-answer__btn"
          :class="{ 'btn-unselected': modelValue !== 'before' }"
          :aria-pressed="modelValue === 'before' ? 'true' : 'false'"
          :disable="disabled"
          @click="update('before')"
        />
        <q-btn
          unelevated
          color="primary"
          label="Ab 2000"
          class="bingo-answer__btn"
          :class="{ 'btn-unselected': modelValue !== 'after' }"
          :aria-pressed="modelValue === 'after' ? 'true' : 'false'"
          :disable="disabled"
          @click="update('after')"
        />
      </div>
    </template>

    <!-- Titel -->
    <template v-else-if="category.id === 'title'">
      <q-input
        :model-value="modelValue"
        label="Songtitel"
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
    // Von den 1900ern bis zum laufenden Jahrzehnt. Die Liste begann früher
    // bei 1950, die Songdaten reichen aber bis 1908 zurück.
    const FIRST_DECADE = 1900;
    const currentDecade = Math.floor(new Date().getFullYear() / 10) * 10;
    const decadeOptions = Array.from(
      { length: (currentDecade - FIRST_DECADE) / 10 + 1 },
      (_, i) => {
        const decade = FIRST_DECADE + i * 10;
        return { label: `${decade}er`, value: decade };
      },
    );

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
  /* Zwei Knoepfe mit je 160px plus 12px Luecke sind 332px breit und passten
     damit knapp nicht in die rund 327px eines 375px-Schirms. `flex: 0 1 160px`
     laesst sie bei Bedarf schrumpfen (statt zu stapeln), auf breiten Fenstern
     bleiben sie unveraendert bei 160px, weil sie nicht wachsen duerfen. */
  flex: 0 1 160px;
  min-width: 0;
}
</style>
