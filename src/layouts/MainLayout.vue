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

    <!-- Globaler Zugang zum Konto: ein Button mit Menü (Profil bzw. Anmelden,
         Rangliste, Nutzerverwaltung, Abmelden). Design, Versionen und die
         Einstellungen der Desktop-App liegen im Hauptmenü unter „Versionen"
         und „Optionen". -->
    <div class="top-fabs">
      <q-btn
        round
        color="primary"
        size="sm"
        class="top-fab"
        :padding="avatarSrc ? 'none' : 'xs'"
        aria-label="Konto"
      >
        <q-avatar v-if="avatarSrc" size="32px">
          <img :src="avatarSrc" alt="Profilbild" />
        </q-avatar>
        <q-icon v-else name="account_circle" />
        <!-- ARIA-Struktur: QMenu trägt role="menu", das verlangt Menüpunkte
             als direkte Kinder. QList (role="list") und QItem (role="listitem")
             passen da nicht hinein. Deshalb ist die Liste hier rein optisch
             (role="none") und jeder Eintrag ein role="menuitem". Der Trenner
             vor „Abmelden" bleibt role="separator", das ist in Menüs erlaubt. -->
        <q-menu anchor="bottom right" self="top right">
          <q-list role="none" style="min-width: 190px">
            <q-item
              v-if="loggedIn"
              v-close-popup
              role="menuitem"
              clickable
              @click="goToProfile"
            >
              <q-item-section avatar><q-icon name="person" /></q-item-section>
              <q-item-section>Mein Profil</q-item-section>
            </q-item>
            <q-item v-else v-close-popup role="menuitem" clickable @click="goToLogin">
              <q-item-section avatar><q-icon name="login" /></q-item-section>
              <q-item-section>Anmelden</q-item-section>
            </q-item>

            <!-- Optionen (Design, Server, Songs-Ordner, Nutzerverwaltung) auch
                 im Spiel erreichbar, nicht nur über das Hauptmenü. Rangliste
                 und Nutzerverwaltung stehen nicht mehr hier: Die Rangliste hat
                 ihr Symbol im Hauptmenü, die Nutzerverwaltung liegt unter
                 Optionen. -->
            <q-item
              v-close-popup
              role="menuitem"
              clickable
              @click="showOptionsDialog = true"
            >
              <q-item-section avatar><q-icon name="settings" /></q-item-section>
              <q-item-section>Optionen</q-item-section>
            </q-item>

            <!-- „Immer im Vordergrund“ bleibt hier und nicht unter Optionen im
                 Hauptmenü: Man schaltet es gerade während eines Spiels um,
                 wenn Spotify sich davorschiebt. Es hält NUR das Hauptfenster
                 oben. Kein v-close-popup, damit das Menü beim Umschalten offen
                 bleibt. -->
            <q-item v-if="isDesktopApp" role="menuitem">
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
              <q-item v-close-popup role="menuitem" clickable @click="handleLogout">
                <!-- Rot nur am Symbol: Die Quasar-Negativfarbe erreicht als
                     Schrift auf der dunklen Menüfläche keine 4,5:1. Die
                     Beschriftung folgt deshalb der normalen Flächenschrift. -->
                <q-item-section avatar>
                  <q-icon name="logout" color="negative" />
                </q-item-section>
                <q-item-section>Abmelden</q-item-section>
              </q-item>
            </template>
          </q-list>
        </q-menu>
      </q-btn>
    </div>

    <OptionsDialog v-model="showOptionsDialog" />
  </q-layout>
</template>

<script>
import { ref, computed, watch, onMounted, onBeforeUnmount } from "vue";
import { useQuasar } from "quasar";
import { useRouter } from "vue-router";
import { useTheme } from "../composables/useTheme";
import { useProfile } from "../composables/useProfile";
import { useVersions } from "../composables/useVersions";
import {
  isLoggedIn,
  loggedInState,
  logout,
  verifyStoredToken,
} from "../utils/authService";
import { avatarUrl } from "../utils/profileService";
import { disconnect } from "../utils/socketService";
import { readCustomVersions } from "../utils/customVersionsStore";
import { isDesktopApp as detectDesktopApp } from "../utils/platform";
import OptionsDialog from "../components/OptionsDialog.vue";

const LOBBY_ROOM_KEY = "hitster-lobby-room";

export default {
  name: "MainLayout",
  components: { OptionsDialog },
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
    const doLogout = () => {
      // Lobby-Zustand aufräumen, damit nach erneutem Login kein alter Raum
      // automatisch wieder beigetreten wird.
      try {
        sessionStorage.removeItem(LOBBY_ROOM_KEY);
      } catch {
        /* Speicher nicht verfügbar, ignorieren */
      }
      disconnect();
      logout();
      router.push("/login");
    };
    // Beim Abmelden verschwinden die mit dem Konto verbundenen Versionen vom
    // Gerät (sonst landeten sie im nächsten Konto). Noch nicht hochgeladene
    // Änderungen gingen dabei still verloren, deshalb vorher nachfragen.
    const handleLogout = () => {
      const offen = readCustomVersions().filter(
        (v) => v.synced && v.pendingPush,
      );
      if (offen.length === 0) {
        doLogout();
        return;
      }
      const namen = offen.map((v) => `„${v.label}“`).join(", ");
      $q.dialog({
        title: "Änderungen noch nicht hochgeladen",
        message:
          offen.length === 1
            ? `Die Version ${namen} hat Änderungen, die noch nicht auf dem Server sind. Beim Abmelden gehen sie verloren.`
            : `Die Versionen ${namen} haben Änderungen, die noch nicht auf dem Server sind. Beim Abmelden gehen sie verloren.`,
        cancel: { label: "Angemeldet bleiben", flat: true },
        ok: { label: "Trotzdem abmelden", color: "negative" },
        persistent: true,
      }).onOk(doLogout);
    };

    // Auto-Update sichtbar machen: informieren, wenn im Hintergrund eine neue
    // Version geladen wird bzw. bereit ist. Fehler werden bewusst NICHT als
    // Toast gezeigt (rpm/deb erzeugen bei jedem Start einen erwarteten Fehler).
    let unsubscribeUpdate = null;
    // Jede Meldung nur einmal zeigen: Derselbe Stand kann live kommen und
    // zusätzlich über getUpdateStatus beim Einhängen.
    let shownAvailable = false;
    let shownDownloaded = false;
    const handleUpdateEvent = (data) => {
      if (!data) return;
      if (data.status === "available") {
        if (shownAvailable) return;
        shownAvailable = true;
        $q.notify({
          type: "info",
          message: `Neue Version ${data.version || ""} wird im Hintergrund geladen…`,
          timeout: 3000,
        });
      } else if (data.status === "downloaded") {
        if (shownDownloaded) return;
        shownDownloaded = true;
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
    };
    onMounted(async () => {
      if (typeof window === "undefined" || !window.hitster?.onUpdateEvent)
        return;
      unsubscribeUpdate = window.hitster.onUpdateEvent(handleUpdateEvent);
      // Kam die Meldung schon, bevor wir zugehört haben (Update lag fertig
      // im Cache), den gemerkten Stand nachholen. Ältere Apps ohne diese
      // Abfrage überspringen das.
      try {
        handleUpdateEvent(await window.hitster.getUpdateStatus?.());
      } catch {
        // Kein Stand abrufbar, die Live-Meldungen reichen dann.
      }
    });
    onBeforeUnmount(() => {
      if (unsubscribeUpdate) unsubscribeUpdate();
    });

    // „Immer im Vordergrund“ (nur Desktop-App): Startwert aus dem
    // Main-Prozess, dort ist die Wahl gespeichert.
    const isDesktopApp = detectDesktopApp();
    const showOptionsDialog = ref(false);
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

    return {
      isDesktopApp,
      showOptionsDialog,
      alwaysOnTop,
      onToggleAlwaysOnTop,
      loggedIn,
      avatarSrc,
      goToProfile,
      goToLogin,
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
