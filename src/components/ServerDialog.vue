<template>
  <q-dialog
    :model-value="modelValue"
    @update:model-value="(v) => $emit('update:modelValue', v)"
  >
    <q-card class="server-dialog-card">
      <q-card-section class="row items-center q-pb-none">
        <div class="text-h6">Server-Verbindung</div>
        <q-space />
        <q-btn v-close-popup icon="close" flat round dense />
      </q-card-section>

      <q-card-section>
        <div class="text-body2 q-mb-md">
          <strong>Nur für die Desktop-App und nur im Online-Modus</strong>
          (Räume erstellen/joinen) nötig. In der <strong>Web-Version</strong>
          wird das <strong>nicht</strong> gebraucht – dort läuft alles bereits
          über die Adresse, unter der die Seite geöffnet wurde.
          <br /><br />
          In der Desktop-App hier die Adresse des Host-Rechners eintragen
          (z. B. deine No-IP-Adresse), damit Online-Spielen funktioniert. Für
          lokales Spiel wird sie nicht gebraucht.
        </div>

        <q-input
          v-model="draft"
          outlined
          clearable
          label="Server-Adresse"
          placeholder="https://deinname.ddns.net:3000"
          hint="Mit http:// bzw. https:// und ggf. Port"
        />

        <div class="text-caption q-mt-sm" style="opacity: 0.7">
          Aktiv: {{ currentUrl || "(gleiche Herkunft)" }}
        </div>
      </q-card-section>

      <q-card-actions align="right">
        <q-btn v-close-popup flat label="Abbrechen" />
        <q-btn color="primary" icon="save" label="Speichern" @click="save" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script>
import { ref, watch } from "vue";
import { Notify } from "quasar";
import { getServerUrl, setServerUrl } from "../utils/authService";

export default {
  name: "ServerDialog",
  props: {
    modelValue: { type: Boolean, default: false },
  },
  emits: ["update:modelValue"],
  setup(props, { emit }) {
    const currentUrl = ref(getServerUrl());
    const draft = ref(currentUrl.value);

    watch(
      () => props.modelValue,
      (open) => {
        if (open) {
          currentUrl.value = getServerUrl();
          draft.value = currentUrl.value;
        }
      },
      { immediate: true },
    );

    const save = () => {
      const next = (draft.value || "").trim();
      if (next && !/^https?:\/\//i.test(next)) {
        Notify.create({
          type: "warning",
          message: "Bitte mit http:// oder https:// angeben.",
          timeout: 3000,
        });
        return;
      }
      setServerUrl(next);
      emit("update:modelValue", false);
      Notify.create({
        type: "positive",
        message: "Server-Adresse gespeichert – App wird neu geladen.",
        timeout: 1500,
      });
      // Neu laden, damit laufende Verbindungen/Requests die neue Adresse nutzen.
      setTimeout(() => window.location.reload(), 800);
    };

    return { currentUrl, draft, save };
  },
};
</script>

<style scoped>
.server-dialog-card {
  width: 460px;
  max-width: 90vw;
}
</style>
