<template>
  <div>
    <q-select
      v-model="selected"
      :options="options"
      emit-value
      map-options
      outlined
      dark
      dense
      label="Sicherheitsfrage"
      class="q-mb-sm"
      :rules="[(val) => !!val || 'Bitte eine Frage wählen']"
    >
      <template #prepend><q-icon name="help" /></template>
    </q-select>

    <q-input
      v-if="selected === CUSTOM_QUESTION"
      v-model="customQuestion"
      outlined
      dark
      dense
      label="Eigene Frage"
      class="q-mb-sm"
      :rules="[(val) => (val && val.trim().length >= 5) || 'Frage ist zu kurz']"
    >
      <template #prepend><q-icon name="edit" /></template>
    </q-input>

    <q-input
      v-model="answerLocal"
      outlined
      dark
      dense
      :label="answerLabel"
      :hint="answerHint"
      :rules="[(val) => (val && val.trim().length >= 1) || 'Antwort erforderlich']"
    >
      <template #prepend><q-icon name="vpn_key" /></template>
    </q-input>
  </div>
</template>

<script>
import { ref, computed, watch, onMounted } from "vue";
import { SECURITY_QUESTIONS, CUSTOM_QUESTION } from "../utils/securityQuestions";

export default {
  name: "SecurityQuestionFields",
  props: {
    question: { type: String, default: "" },
    answer: { type: String, default: "" },
    answerLabel: { type: String, default: "Antwort" },
    answerHint: { type: String, default: "" },
  },
  emits: ["update:question", "update:answer"],
  setup(props, { emit }) {
    const options = SECURITY_QUESTIONS.map((q) => ({ label: q, value: q })).concat({
      label: "Eigene Frage…",
      value: CUSTOM_QUESTION,
    });

    const selected = ref(null);
    const customQuestion = ref("");

    // Aus dem (evtl. vorbelegten) Prop den Auswahlzustand ableiten.
    onMounted(() => {
      const q = props.question || "";
      if (!q) return;
      if (SECURITY_QUESTIONS.includes(q)) {
        selected.value = q;
      } else {
        selected.value = CUSTOM_QUESTION;
        customQuestion.value = q;
      }
    });

    const effectiveQuestion = computed(() =>
      selected.value === CUSTOM_QUESTION
        ? customQuestion.value.trim()
        : selected.value || ""
    );
    watch(effectiveQuestion, (v) => emit("update:question", v));

    const answerLocal = computed({
      get: () => props.answer,
      set: (v) => emit("update:answer", v),
    });

    return { options, selected, customQuestion, answerLocal, CUSTOM_QUESTION };
  },
};
</script>
