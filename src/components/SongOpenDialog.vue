<template>
  <!-- aria-labelledby landet bei QDialog direkt auf dem role="dialog"-Element
       und gibt dem Dialog den sichtbaren Titel als zugänglichen Namen. -->
  <q-dialog
    :model-value="modelValue"
    :aria-labelledby="titleId"
    @update:model-value="(v) => $emit('update:modelValue', v)"
  >
    <q-card class="song-open-dialog-card">
      <q-card-section class="row items-center q-pb-none">
        <div :id="titleId" class="text-h6">Song öffnen</div>
        <q-space />
        <q-btn
          v-close-popup
          icon="close"
          flat
          round
          dense
          aria-label="Schließen"
        />
      </q-card-section>

      <q-card-section>
        <div class="text-body2 q-mb-md">
          Legt fest, wie ein Song auf <strong>diesem Gerät</strong> abgespielt
          wird. Die Einstellung gilt nur hier, jedes Gerät kann also seinen
          eigenen Weg haben.
        </div>

        <!-- Als Radiogruppe ausgezeichnet, damit ein Screenreader die drei
             Optionen als zusammengehörige Auswahl ansagt. Die Beschreibung
             hängt per aria-describedby an der jeweiligen Option. -->
        <div role="radiogroup" aria-label="Wiedergabe auf diesem Gerät">
          <div
            v-for="opt in options"
            :key="opt.value"
            class="song-open-option"
            :class="{ 'song-open-option--active': mode === opt.value }"
          >
            <q-radio
              v-model="mode"
              :val="opt.value"
              :label="opt.label"
              :aria-describedby="`${titleId}-${opt.value}`"
              color="primary"
              dense
            />
            <div :id="`${titleId}-${opt.value}`" class="song-open-option__desc">
              {{ opt.description }}
            </div>
          </div>
        </div>

        <div class="song-open-hint">
          <q-icon name="info" size="18px" />
          <span>
            Dass Spotify dabei in den Vordergrund springt, lässt sich nicht
            verhindern: Eine Webseite darf den Fokus weder behalten noch später
            zurückholen. Nur „Immer im Browser“ lässt die Spotify-App zu.
          </span>
        </div>
      </q-card-section>

      <q-card-actions align="right">
        <q-btn v-close-popup flat label="Schließen" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script>
import { ref, watch, useId } from "vue";
import { getSongOpenMode, setSongOpenMode } from "../utils/songTabManager";

export default {
  name: "SongOpenDialog",
  props: {
    modelValue: { type: Boolean, default: false },
  },
  emits: ["update:modelValue"],
  setup(props) {
    // Eindeutige ID für den Dialogtitel (aria-labelledby) und als Präfix der
    // Options-Beschreibungen (aria-describedby).
    const titleId = `song-open-title-${useId()}`;
    const mode = ref(getSongOpenMode());

    const options = [
      {
        label: "Automatisch (Standard)",
        value: "auto",
        description:
          "Erst die Spotify-App versuchen, meldet sich keine, dann der " +
          "Web-Player in einem Tab.",
      },
      {
        label: "Immer die Spotify-App",
        value: "app",
        description:
          "Ohne Rückfall. Sinnvoll, wenn der automatische Weg gelegentlich " +
          "zusätzlich einen Tab öffnet.",
      },
      {
        label: "Immer im Browser",
        value: "browser",
        description:
          "Web-Player in einem Tab, der beim nächsten Song wieder " +
          "geschlossen wird. Die Spotify-App bleibt zu.",
      },
    ];

    // Beim Öffnen den tatsächlich gespeicherten Stand zeigen; ein anderer Tab
    // könnte ihn zwischenzeitlich geändert haben.
    watch(
      () => props.modelValue,
      (open) => {
        if (open) mode.value = getSongOpenMode();
      },
    );

    watch(mode, (val) => setSongOpenMode(val));

    return { titleId, mode, options };
  },
};
</script>

<style scoped>
.song-open-dialog-card {
  width: 520px;
  max-width: 92vw;
}
.song-open-option {
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid transparent;
}
.song-open-option + .song-open-option {
  margin-top: 4px;
}
.song-open-option--active {
  border-color: color-mix(in srgb, var(--app-accent) 45%, transparent);
  background: color-mix(in srgb, var(--app-accent) 12%, transparent);
}
.song-open-option__desc {
  margin-left: 34px;
  font-size: 0.78rem;
  line-height: 1.35;
  /* Gedämpfte Flächenschrift statt opacity: hält auf jedem Theme 4,5:1. */
  color: var(--app-on-surface-muted);
}
.song-open-hint {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin-top: 16px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--surface-bg-weak, rgba(255, 255, 255, 0.05));
  font-size: 0.8rem;
  line-height: 1.4;
  color: var(--app-on-surface);
}
</style>
