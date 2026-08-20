<template>
  <q-dialog
    :model-value="modelValue"
    @update:model-value="(v) => $emit('update:modelValue', v)"
  >
    <q-card class="song-folder-dialog-card">
      <q-card-section class="row items-center q-pb-none">
        <div class="text-h6">Songs-Ordner</div>
        <q-space />
        <q-btn v-close-popup icon="close" flat round dense />
      </q-card-section>

      <q-card-section>
        <div class="text-body2 q-mb-md">
          <strong>Nur in der Desktop-App.</strong> Aus diesem Ordner liest die App
          ihre Editionen, Link-Listen, die Metadaten-CSV und die Cover. Du kannst
          die Dateien dort bearbeiten oder eigene Editionen als weitere
          <code>.txt</code> ablegen. Beim ersten Start wird der Ordner automatisch
          mit den mitgelieferten Daten gefüllt.
          <br /><br />
          Nach einem Wechsel wird die App neu geladen, damit sie aus dem neuen
          Ordner liest.
        </div>

        <div class="text-caption q-mb-xs" style="opacity: 0.7">Aktueller Ordner</div>
        <div class="folder-path">{{ currentPath || "(wird bestimmt …)" }}</div>
      </q-card-section>

      <q-card-actions align="right">
        <q-btn v-close-popup flat label="Schließen" />
        <q-btn
          color="primary"
          icon="folder_open"
          label="Ordner wählen"
          :loading="working"
          @click="pickFolder"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script>
import { ref, watch } from "vue";
import { Notify } from "quasar";

export default {
  name: "SongFolderDialog",
  props: {
    modelValue: { type: Boolean, default: false },
  },
  emits: ["update:modelValue"],
  setup(props, { emit }) {
    const currentPath = ref("");
    const working = ref(false);

    const refresh = async () => {
      if (!window.hitster?.getSongFolder) return;
      try {
        const res = await window.hitster.getSongFolder();
        currentPath.value = res?.path || "";
      } catch {
        currentPath.value = "";
      }
    };

    watch(
      () => props.modelValue,
      (open) => {
        if (open) refresh();
      },
      { immediate: true },
    );

    const pickFolder = async () => {
      if (!window.hitster?.pickSongFolder || !window.hitster?.setSongFolder) return;
      working.value = true;
      try {
        const picked = await window.hitster.pickSongFolder();
        if (picked?.canceled || !picked?.path) {
          working.value = false;
          return;
        }
        const res = await window.hitster.setSongFolder(picked.path);
        if (!res?.ok) {
          Notify.create({
            type: "negative",
            message: res?.message || "Ordner konnte nicht gesetzt werden.",
            timeout: 3500,
          });
          working.value = false;
          return;
        }
        currentPath.value = res.path;
        emit("update:modelValue", false);
        Notify.create({
          type: "positive",
          message: "Songs-Ordner gesetzt – App wird neu geladen.",
          timeout: 1500,
        });
        setTimeout(() => window.location.reload(), 800);
      } catch (err) {
        Notify.create({
          type: "negative",
          message: err?.message || "Ordnerwahl fehlgeschlagen.",
          timeout: 3500,
        });
        working.value = false;
      }
    };

    return { currentPath, working, pickFolder };
  },
};
</script>

<style scoped>
.song-folder-dialog-card {
  width: 520px;
  max-width: 92vw;
}
.folder-path {
  font-family: monospace;
  font-size: 0.85rem;
  word-break: break-all;
  padding: 8px 10px;
  border-radius: var(--surface-radius, 10px);
  background: var(--surface-bg, rgba(255, 255, 255, 0.06));
}
</style>
