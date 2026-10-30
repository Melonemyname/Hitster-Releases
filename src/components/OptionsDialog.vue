<template>
  <!-- „Optionen“ aus dem Hauptmenü und dem Konto-Menü oben rechts, aufgebaut
       wie der Optionen-Bildschirm bei Minecraft: Titel oben, die Einträge als
       Knöpfe in zwei Spalten, darunter mittig „Fertig“. Bildschirmfüllend,
       damit es wie ein eigener Bildschirm wirkt und nicht wie ein Pop-up.
       Profil und Abmelden bleiben im Konto-Menü. aria-labelledby landet bei
       QDialog direkt auf dem role="dialog"-Element und gibt ihm den Namen. -->
  <q-dialog
    :model-value="modelValue"
    maximized
    transition-show="fade"
    transition-hide="fade"
    aria-labelledby="options-dialog-title"
    @update:model-value="(v) => $emit('update:modelValue', v)"
  >
    <div class="options-screen">
      <h2 id="options-dialog-title" class="options-title">Optionen</h2>

      <div class="options-grid">
        <q-btn
          icon="palette"
          label="Design …"
          class="options-btn"
          @click="showThemeDialog = true"
        />
        <!-- Nur in der Desktop-App relevant; im Browser läuft alles über
             die aufgerufene Adresse (same-origin). -->
        <q-btn
          v-if="isDesktopApp"
          icon="dns"
          label="Server-Verbindung …"
          class="options-btn"
          @click="showServerDialog = true"
        />
        <!-- Songs-Ordner: nur in der Desktop-App; dort liegen die
             bearbeitbaren Song-Daten (Editionen, Links, Metadaten, Cover). -->
        <q-btn
          v-if="isDesktopApp"
          icon="folder_open"
          label="Songs-Ordner …"
          class="options-btn"
          @click="showSongFolderDialog = true"
        />
        <!-- Song öffnen: nur im Browser. Die Desktop-App steuert den
             Spotify-Client nativ (siehe hitster:openSong im Main-Prozess)
             und ignoriert diese Einstellung deshalb. -->
        <q-btn
          v-if="!isDesktopApp"
          icon="play_circle"
          label="Song öffnen …"
          class="options-btn"
          @click="showSongOpenDialog = true"
        />
        <!-- Nur für den Serverbesitzer (isAdmin vom Server), der Server
             prüft beim Aufruf selbst noch einmal. -->
        <q-btn
          v-if="loggedIn && isAdmin"
          icon="admin_panel_settings"
          label="Nutzerverwaltung …"
          class="options-btn"
          @click="openAdmin"
        />
      </div>

      <q-btn
        v-close-popup
        label="Fertig"
        class="options-btn options-done"
      />
    </div>
  </q-dialog>

  <ThemeDialog v-model="showThemeDialog" />
  <ServerDialog v-if="isDesktopApp" v-model="showServerDialog" />
  <SongFolderDialog v-if="isDesktopApp" v-model="showSongFolderDialog" />
  <SongOpenDialog v-if="!isDesktopApp" v-model="showSongOpenDialog" />
</template>

<script>
import { ref } from "vue";
import { useRouter } from "vue-router";
import { adminState, loggedInState } from "../utils/authService";
import ThemeDialog from "./ThemeDialog.vue";
import ServerDialog from "./ServerDialog.vue";
import SongFolderDialog from "./SongFolderDialog.vue";
import SongOpenDialog from "./SongOpenDialog.vue";
import { isDesktopApp as detectDesktopApp } from "../utils/platform";

export default {
  name: "OptionsDialog",
  components: { ThemeDialog, ServerDialog, SongFolderDialog, SongOpenDialog },
  props: {
    modelValue: { type: Boolean, default: false },
  },
  emits: ["update:modelValue"],
  setup(_props, { emit }) {
    const isDesktopApp = detectDesktopApp();
    const router = useRouter();
    const openAdmin = () => {
      emit("update:modelValue", false);
      router.push("/admin");
    };
    const showThemeDialog = ref(false);
    const showServerDialog = ref(false);
    const showSongFolderDialog = ref(false);
    const showSongOpenDialog = ref(false);

    return {
      loggedIn: loggedInState,
      isAdmin: adminState,
      openAdmin,
      isDesktopApp,
      showThemeDialog,
      showServerDialog,
      showSongFolderDialog,
      showSongOpenDialog,
    };
  },
};
</script>

<style scoped>
/* Bildschirmfüllend auf dem Theme-Hintergrund, Inhalt mittig in der Höhe
   wie im Hauptmenü. */
.options-screen {
  min-height: 100%;
  width: 100%;
  background: var(--app-bg, #121212);
  color: var(--app-on-bg);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 28px;
  padding: 32px 16px;
}
.options-title {
  margin: 0;
  font-size: 1.6rem;
  line-height: 1.3;
  font-weight: 500;
}
/* Zwei Spalten wie im Vorbild, auf dem Handy eine. */
.options-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  width: 100%;
  max-width: 760px;
}
.options-btn {
  width: 100%;
  min-height: 64px;
  font-size: 1.15rem;
}
/* „Fertig“ halb so breit wie die Fläche, mittig darunter. */
.options-done {
  max-width: 374px;
}
/* Sichtbarer Tastaturfokus in der Schriftfarbe des Hintergrunds, wie im
   Hauptmenü. */
.options-screen :deep(.q-btn:focus-visible) {
  outline: 3px solid var(--app-on-bg);
  outline-offset: 3px;
}
@media (max-width: 599px) {
  .options-grid {
    grid-template-columns: 1fr;
  }
  .options-done {
    max-width: none;
  }
}
</style>
