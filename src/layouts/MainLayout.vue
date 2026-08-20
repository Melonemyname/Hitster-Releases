<template>
  <q-layout view="hHh lpR fFf">
    <q-page-container>
      <!-- `:key` erzwingt ein sauberes Remount der Ziel-Component, wenn
           sich der Spielmodus zwischen zwei /game-Aufrufen ändert (z. B.
           Host wechselt in der Lobby von Bingo zu Normal). Ohne diesen
           Key würde Vue Router bei gleicher Route mit anderem Query
           dieselbe Component behalten – die `gameMode`-Ref in
           useGameState wird aber nur beim Setup aus `route.query.mode`
           gelesen, sodass Gäste sonst im alten Modus hängen bleiben. -->
      <router-view :key="$route.path + ':' + ($route.query.mode || '')" />
    </q-page-container>

    <!-- Globaler Zugang zu Profil & Theming: ein Button mit Menü.
         (Theming gehört ohnehin zum Konto; ein Button vermeidet die frühere
         Überlappung mit dem Abmelden-Button auf der Profilseite.) -->
    <div class="top-fabs">
      <q-btn
        round
        color="primary"
        size="sm"
        class="top-fab"
        :padding="avatarSrc ? 'none' : 'xs'"
        aria-label="Konto & Design"
      >
        <q-avatar v-if="avatarSrc" size="32px">
          <img :src="avatarSrc" alt="Profilbild" />
        </q-avatar>
        <q-icon v-else name="account_circle" />
        <q-menu anchor="bottom right" self="top right">
          <q-list style="min-width: 190px">
            <q-item
              v-if="loggedIn"
              v-close-popup
              clickable
              @click="goToProfile"
            >
              <q-item-section avatar><q-icon name="person" /></q-item-section>
              <q-item-section>Mein Profil</q-item-section>
            </q-item>
            <q-item v-else v-close-popup clickable @click="goToLogin">
              <q-item-section avatar><q-icon name="login" /></q-item-section>
              <q-item-section>Anmelden</q-item-section>
            </q-item>

            <q-item
              v-if="loggedIn"
              v-close-popup
              clickable
              @click="goToLeaderboard"
            >
              <q-item-section avatar
                ><q-icon name="leaderboard"
              /></q-item-section>
              <q-item-section>Rangliste</q-item-section>
            </q-item>

            <!-- Nutzerverwaltung: nur für den Server-Owner (Admin), erkannt am
                 vom Server gelieferten isAdmin-Flag. Der Server prüft final
                 selbst; der Menüpunkt wird für alle anderen ausgeblendet. -->
            <q-item
              v-if="loggedIn && isAdmin"
              v-close-popup
              clickable
              @click="goToAdmin"
            >
              <q-item-section avatar>
                <q-icon name="admin_panel_settings" />
              </q-item-section>
              <q-item-section>Nutzerverwaltung</q-item-section>
            </q-item>

            <q-item v-close-popup clickable @click="showThemeDialog = true">
              <q-item-section avatar><q-icon name="palette" /></q-item-section>
              <q-item-section>Design anpassen</q-item-section>
            </q-item>

            <q-item v-close-popup clickable @click="showVersionsDialog = true">
              <q-item-section avatar><q-icon name="tune" /></q-item-section>
              <q-item-section>Versionen verwalten</q-item-section>
            </q-item>

            <!-- Nur in der Desktop-App relevant; im Browser läuft alles über
                 die aufgerufene Adresse (same-origin). -->
            <q-item
              v-if="isDesktopApp"
              v-close-popup
              clickable
              @click="showServerDialog = true"
            >
              <q-item-section avatar><q-icon name="dns" /></q-item-section>
              <q-item-section>Server-Verbindung</q-item-section>
            </q-item>

            <!-- Songs-Ordner: nur in der Desktop-App; dort liegen die
                 bearbeitbaren Song-Daten (Editionen, Links, Metadaten, Cover). -->
            <q-item
              v-if="isDesktopApp"
              v-close-popup
              clickable
              @click="showSongFolderDialog = true"
            >
              <q-item-section avatar><q-icon name="folder_open" /></q-item-section>
              <q-item-section>Songs-Ordner</q-item-section>
            </q-item>

            <!-- "Immer im Vordergrund": hält NUR das Hauptfenster oben; das
                 App-eigene Song-Fenster bleibt normal und darf sich davorlegen.
                 Kein v-close-popup, damit das Menü beim Umschalten offen bleibt. -->
            <q-item v-if="isDesktopApp">
              <q-item-section avatar>
                <q-icon name="flip_to_front" />
              </q-item-section>
              <q-item-section>Immer im Vordergrund</q-item-section>
              <q-item-section side>
                <q-toggle
                  :model-value="alwaysOnTop"
                  dense
                  aria-label="Immer im Vordergrund"
                  @update:model-value="onToggleAlwaysOnTop"
                />
              </q-item-section>
            </q-item>

            <template v-if="loggedIn">
              <q-separator />
              <q-item v-close-popup clickable @click="handleLogout">
                <q-item-section avatar>
                  <q-icon name="logout" color="negative" />
                </q-item-section>
                <q-item-section class="text-negative">Abmelden</q-item-section>
              </q-item>
            </template>
          </q-list>
        </q-menu>
      </q-btn>
    </div>

    <ThemeDialog v-model="showThemeDialog" />
    <VersionsDialog v-model="showVersionsDialog" />
    <ServerDialog v-model="showServerDialog" />
    <SongFolderDialog v-model="showSongFolderDialog" />
  </q-layout>
</template>

<script>
import { ref, computed, watch, onMounted, onBeforeUnmount } from "vue";
import { useQuasar } from "quasar";
import { useRouter } from "vue-router";
import ThemeDialog from "../components/ThemeDialog.vue";
import VersionsDialog from "../components/VersionsDialog.vue";
import ServerDialog from "../components/ServerDialog.vue";
import SongFolderDialog from "../components/SongFolderDialog.vue";
import { useTheme } from "../composables/useTheme";
import { useProfile } from "../composables/useProfile";
import { useVersions } from "../composables/useVersions";
import {
  adminState,
  isLoggedIn,
  loggedInState,
  logout,
  verifyStoredToken,
} from "../utils/authService";
import { avatarUrl } from "../utils/profileService";
import { disconnect } from "../utils/socketService";
import { isDesktopApp as detectDesktopApp } from "../utils/platform";

const LOBBY_ROOM_KEY = "hitster-lobby-room";

export default {
  name: "MainLayout",
  components: { ThemeDialog, VersionsDialog, ServerDialog, SongFolderDialog },
  setup() {
    // Die App ist durchgehend dunkel gestaltet (dunkle Karten, heller Text).
    // Dark-Mode fest aktivieren, damit Flächen unabhängig vom OS korrekt
    // rendern und der Theme-Hintergrund sauber darauf sitzt.
    const $q = useQuasar();
    $q.dark.set(true);

    const { initTheme } = useTheme();
    // Gespeichertes Theme laden und anwenden (einmalig).
    initTheme();

    const router = useRouter();
    // Anmelde- und Admin-Status kommen direkt aus dem authService und sind dort
    // reaktiv. Vorher wurde beides bei jedem Routenwechsel neu aus localStorage
    // gelesen – das griff zu spät bzw. gar nicht, weshalb das Profilbild im FAB
    // nach dem Anmelden leer blieb, bis man einmal die Profilseite aufrief.
    const loggedIn = loggedInState;
    const isAdmin = adminState;

    // Profilbild des angemeldeten Nutzers für das FAB-Icon. Der Profil-Zustand
    // ist app-weit geteilt (useProfile), damit ein im Profil geändertes Bild
    // hier sofort erscheint – nicht erst nach einem Neustart.
    const { avatar, ensureProfile, clearProfile } = useProfile();
    const avatarSrc = computed(() => avatarUrl(avatar.value));
    // Beim Login (bzw. beim Start als bereits eingeloggt) das Profil laden und
    // zugleich die account-gebundenen (eingeschränkten) Versionen holen, damit
    // sie sofort app-weit in den Versionslisten auftauchen – nicht erst, wenn
    // zufällig ein Versions-Picker geöffnet wird.
    const { loadVersions } = useVersions();
    // `loadVersions` läuft in beiden Fällen: angemeldet holt es die
    // account-gebundenen Versionen, ohne Anmeldung räumt es sie vom Gerät.
    //
    // Reihenfolge mit Absicht: erst das Profil, dann die Versionen. Das Profil
    // ist eine winzige Antwort und sofort sichtbar, die Versionen bringen
    // mehrere hundert Songs pro Edition mit. Liefen beide gleichzeitig los,
    // geriet ausgerechnet der kleine Aufruf beim Start ins Hintertreffen.
    watch(
      loggedIn,
      async (isIn) => {
        if (!isIn) {
          clearProfile();
          loadVersions();
          return;
        }
        await ensureProfile();
        loadVersions();
      },
      { immediate: true },
    );

    // Sitzung pruefen und dabei das Token erneuern lassen. Der Server stellt ab
    // einer gewissen Restlaufzeit ein frisches aus, dadurch bleibt man dauerhaft
    // angemeldet. Ohne diesen Aufruf lief die Erneuerung ins Leere, und ein
    // laengst ungueltiges Token fiel gar nicht auf: Die App hielt sich fuer
    // angemeldet, waehrend jeder Serveraufruf still mit 401 scheiterte.
    //
    // Ein `false` allein heisst nicht abgemeldet (offline liefert ebenfalls
    // false, behaelt die Sitzung aber). Deshalb entscheidet danach isLoggedIn().
    const pruefeSitzung = async () => {
      if (!isLoggedIn()) return;
      await verifyStoredToken();
      if (!isLoggedIn()) {
        if (router.currentRoute.value.meta?.requiresAuth) router.push("/login");
        return;
      }
      // Sitzung steht wieder: Fehlt das Profilbild noch, weil der Server beim
      // Start nicht erreichbar war, jetzt nachholen.
      if (!avatar.value) ensureProfile(1);
    };

    // Beim Start und danach in Abstaenden: Die Desktop-App laeuft mitunter
    // wochenlang durch, ohne je neu zu starten.
    const SITZUNG_PRUEF_INTERVALL_MS = 6 * 60 * 60 * 1000;
    let sitzungsTimer = null;
    onMounted(() => {
      pruefeSitzung();
      sitzungsTimer = setInterval(pruefeSitzung, SITZUNG_PRUEF_INTERVALL_MS);
    });
    onBeforeUnmount(() => {
      if (sitzungsTimer) clearInterval(sitzungsTimer);
    });

    const goToProfile = () => router.push("/profile");
    const goToLogin = () => router.push("/login");
    const goToLeaderboard = () => router.push("/leaderboard");
    const goToAdmin = () => router.push("/admin");
    const handleLogout = () => {
      // Lobby-Zustand aufräumen, damit nach erneutem Login kein alter Raum
      // automatisch wieder beigetreten wird.
      try {
        sessionStorage.removeItem(LOBBY_ROOM_KEY);
      } catch {
        /* Speicher nicht verfügbar – ignorieren */
      }
      disconnect();
      logout();
      router.push("/login");
    };

    const showThemeDialog = ref(false);
    const showVersionsDialog = ref(false);
    const showServerDialog = ref(false);
    const showSongFolderDialog = ref(false);
    // Desktop-App (Electron): dort wird die Server-Adresse gebraucht; im Browser
    // nicht (same-origin). MODE wird zur Buildzeit gesetzt; file:// als Fallback.
    const isDesktopApp = detectDesktopApp();

    // "Immer im Vordergrund" (nur Hauptfenster). Startwert aus dem Main-Prozess
    // laden (persistiert), damit der Toggle den tatsächlichen Fensterzustand zeigt.
    const alwaysOnTop = ref(false);
    onMounted(async () => {
      if (!window.hitster?.getAlwaysOnTop) return;
      try {
        alwaysOnTop.value = await window.hitster.getAlwaysOnTop();
      } catch {
        alwaysOnTop.value = false;
      }
    });
    const onToggleAlwaysOnTop = async (value) => {
      if (!window.hitster?.setAlwaysOnTop) return;
      try {
        alwaysOnTop.value = await window.hitster.setAlwaysOnTop(value);
      } catch {
        // Bei Fehler den zuletzt bekannten Zustand beibehalten.
      }
    };

    // Auto-Update sichtbar machen: informieren, wenn im Hintergrund eine neue
    // Version geladen wird bzw. bereit ist. Fehler werden bewusst NICHT als
    // Toast gezeigt (rpm/deb erzeugen bei jedem Start einen erwarteten Fehler).
    let unsubscribeUpdate = null;
    onMounted(() => {
      if (typeof window === "undefined" || !window.hitster?.onUpdateEvent)
        return;
      unsubscribeUpdate = window.hitster.onUpdateEvent((data) => {
        if (!data) return;
        if (data.status === "available") {
          $q.notify({
            type: "info",
            message: `Neue Version ${data.version || ""} wird im Hintergrund geladen…`,
            timeout: 3000,
          });
        } else if (data.status === "downloaded") {
          // Wichtig: ohne expliziten `quitAndInstall` startet Windows den
          // NSIS-Installer manchmal nicht selbst beim regulären Quit -
          // deshalb einen Aktionsknopf anbieten. `timeout: 0` = bleibt
          // stehen bis der Nutzer entscheidet.
          $q.notify({
            type: "positive",
            message: `Update ${data.version || ""} ist bereit. Jetzt installieren?`,
            timeout: 0,
            position: "top",
            actions: [
              {
                label: "Jetzt installieren",
                color: "white",
                handler: () => {
                  try {
                    window.hitster?.installUpdate?.();
                  } catch (err) {
                    console.warn("[update] installUpdate fehlgeschlagen:", err);
                  }
                },
              },
              { label: "Später", color: "white", handler: () => {} },
            ],
          });
        }
      });
    });
    onBeforeUnmount(() => {
      if (unsubscribeUpdate) unsubscribeUpdate();
    });

    return {
      showThemeDialog,
      showVersionsDialog,
      showServerDialog,
      showSongFolderDialog,
      isDesktopApp,
      alwaysOnTop,
      onToggleAlwaysOnTop,
      loggedIn,
      isAdmin,
      avatarSrc,
      goToProfile,
      goToLogin,
      goToLeaderboard,
      goToAdmin,
      handleLogout,
    };
  },
};
</script>

<style scoped>
.top-fabs {
  position: fixed;
  top: 12px;
  right: 12px;
  z-index: 4000;
  display: flex;
  gap: 8px;
}
.top-fab {
  opacity: 0.85;
}
.top-fab:hover {
  opacity: 1;
}
</style>
