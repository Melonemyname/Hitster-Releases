<template>
  <!-- Cover-Auswahl für eigene und freigegebene Versionen: die mitgelieferten
       Cover als Kacheln, dazu eine Kachel zum Hochladen eines eigenen Bildes.
       v-model ist das gespeicherte Cover-Objekt ({ kind, ref }), wie es
       resolveCover() auflöst. Genutzt beim Erstellen (VersionsDialog) und
       beim Bearbeiten (VersionEditor). -->
  <div>
    <div class="text-caption q-mb-xs">Cover</div>
    <div class="cover-picker">
      <button
        v-for="(url, key) in presetIcons"
        :key="key"
        type="button"
        class="cover-option"
        :class="{ 'cover-option--active': isPreset(key) }"
        :aria-label="`Cover ${key}`"
        :aria-pressed="isPreset(key) ? 'true' : 'false'"
        @click="$emit('update:modelValue', { kind: 'preset', ref: key })"
      >
        <img :src="url" alt="" />
      </button>
      <button
        type="button"
        class="cover-option cover-option--upload"
        :class="{ 'cover-option--active': isUpload }"
        aria-label="Eigenes Cover hochladen"
        :aria-pressed="isUpload ? 'true' : 'false'"
        @click="triggerCover"
      >
        <img v-if="isUpload" :src="modelValue.ref" alt="" />
        <q-icon v-else name="upload" size="24px" />
      </button>
      <input
        ref="coverInput"
        type="file"
        accept="image/*"
        style="display: none"
        @change="onCoverSelected"
      />
    </div>
  </div>
</template>

<script>
import { ref, computed } from "vue";
import { Notify } from "quasar";
import { VERSION_ICONS } from "../utils/versionsCatalog";

// Bild -> auf max. 256px verkleinerte Data-URL (für eigene Cover).
function fileToCover(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 256;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas
          .getContext("2d")
          .drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default {
  name: "CoverPicker",
  props: {
    modelValue: {
      type: Object,
      default: () => ({ kind: "preset", ref: "custom" }),
    },
  },
  emits: ["update:modelValue"],
  setup(props, { emit }) {
    const presetIcons = VERSION_ICONS;
    const coverInput = ref(null);

    // Ein unbekannter Preset-Key (etwa aus einer älteren Version) zeigt
    // resolveCover als „custom" an, also wird hier auch „custom" markiert.
    const activePreset = computed(() => {
      const c = props.modelValue;
      if (!c || c.kind === "upload") return null;
      return VERSION_ICONS[c.ref] ? c.ref : "custom";
    });
    const isPreset = (key) => activePreset.value === key;
    const isUpload = computed(() => props.modelValue?.kind === "upload");

    const triggerCover = () => coverInput.value?.click();

    const onCoverSelected = async (event) => {
      const file = event?.target?.files?.[0];
      if (!file) return;
      try {
        const dataUrl = await fileToCover(file);
        emit("update:modelValue", { kind: "upload", ref: dataUrl });
      } catch {
        Notify.create({
          type: "negative",
          message: "Bild konnte nicht geladen werden.",
          timeout: 2500,
        });
      } finally {
        if (event.target) event.target.value = "";
      }
    };

    return {
      presetIcons,
      coverInput,
      isPreset,
      isUpload,
      triggerCover,
      onCoverSelected,
    };
  },
};
</script>

<style scoped>
.cover-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.cover-option {
  width: 52px;
  height: 52px;
  padding: 0;
  border: 2px solid transparent;
  border-radius: var(--surface-radius);
  overflow: hidden;
  background: var(--surface-bg-weak);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.cover-option img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.cover-option--active {
  border-color: var(--app-accent);
}
@media (max-width: 599px) {
  .cover-option {
    width: 44px;
    height: 44px;
  }
}
</style>
