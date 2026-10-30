<template>
  <div class="main-menu">
    <!-- Das Logo steht nur auf der Startebene und ist dort die
         Seitenüberschrift (das SVG trägt role="img" mit aria-label
         „HITSTER“). In den Untermenüs fällt es weg, damit die Knöpfe höher
         rücken; die Überschrift bleibt dort für Screenreader erhalten. -->
    <h1 v-if="menu === 'main'" class="main-menu-heading">
      <HitsterLogo class="page-logo" />
    </h1>
    <h1 v-else class="sr-only">Hitster</h1>

    <!-- Welche Ebene offen ist, steht in der Adresse (?menu=…). So führt die
         Zurück-Geste am Handy eine Ebene nach oben statt aus der App. -->
    <nav ref="navRef" class="main-menu-stack" :aria-label="navLabel">
      <template v-if="menu === 'main'">
        <q-btn
          class="main-menu-btn"
          @click="openMenu('local')"
        >
          <span class="main-menu-btn-inner">
            <q-icon name="person" />
            <span>Lokal spielen</span>
          </span>
        </q-btn>
        <q-btn
          class="main-menu-btn"
          @click="openMenu('online')"
        >
          <span class="main-menu-btn-inner">
            <q-icon name="groups" />
            <span>Online spielen</span>
          </span>
        </q-btn>
        <q-btn
          class="main-menu-btn"
          @click="showVersionsDialog = true"
        >
          <span class="main-menu-btn-inner">
            <q-icon name="library_music" />
            <span>Versionen</span>
          </span>
        </q-btn>

        <!-- Untere Reihe wie im Vorbild: links und rechts je ein quadratischer
             Symbolknopf, dazwischen zwei halbe Knöpfe. Ohne „Beenden" (Browser)
             nimmt „Optionen" den freien Platz ein. -->
        <div class="main-menu-row">
          <q-btn
            icon="bar_chart"
            class="main-menu-square"
            aria-label="Statistik"
            @click="openStats"
          >
            <q-tooltip>Statistik</q-tooltip>
          </q-btn>
          <q-btn
            icon="settings"
            label="Optionen"
            class="main-menu-btn main-menu-half"
            stack
            no-wrap
            @click="showOptionsDialog = true"
          />
          <q-btn
            v-if="canQuit"
            icon="power_settings_new"
            label="Beenden"
            class="main-menu-btn main-menu-half"
            stack
            no-wrap
            @click="quitApp"
          />
          <q-btn
            :icon="mdiPodium"
            class="main-menu-square"
            aria-label="Rangliste"
            @click="openLeaderboard"
          >
            <q-tooltip>Rangliste</q-tooltip>
          </q-btn>
        </div>
      </template>

      <template v-else-if="menu === 'local'">
        <h2 class="main-menu-subtitle">Lokal spielen</h2>
        <q-btn
          class="main-menu-btn"
          @click="startNewLocalGame"
        >
          <span class="main-menu-btn-inner">
            <q-icon name="add" />
            <span>Neues Spiel</span>
          </span>
        </q-btn>
        <q-btn
          class="main-menu-btn"
          @click="openMenu('local-saves')"
        >
          <span class="main-menu-btn-inner">
            <q-icon name="folder_open" />
            <span>Spielstand laden</span>
          </span>
        </q-btn>
        <!-- „Zurück“ ist keine Menüauswahl, sondern Navigation: mittig statt
             im ausgerichteten Block der Auswahlknöpfe. -->
        <q-btn
          icon="arrow_back"
          label="Zurück"
          class="main-menu-btn btn-unselected"
          @click="goUp"
        />
      </template>

      <template v-else-if="menu === 'online'">
        <h2 class="main-menu-subtitle">Online spielen</h2>
        <!-- Liegt direkt auf dem Theme-Hintergrund und erbt damit dessen
             Schriftfarbe (On-Background), nicht die Flächenschrift. -->
        <p v-if="!loggedIn" class="main-menu-hint">
          Für das Online-Spiel musst du angemeldet sein.
        </p>
        <q-btn
          class="main-menu-btn"
          @click="goToLobby({ view: 'create' })"
        >
          <span class="main-menu-btn-inner">
            <q-icon name="add_circle" />
            <span>Raum erstellen</span>
          </span>
        </q-btn>
        <q-btn
          class="main-menu-btn"
          @click="goToLobby({ view: 'join' })"
        >
          <span class="main-menu-btn-inner">
            <q-icon name="meeting_room" />
            <span>Raum beitreten</span>
          </span>
        </q-btn>
        <q-btn
          class="main-menu-btn"
          @click="openMenu('online-saves')"
        >
          <span class="main-menu-btn-inner">
            <q-icon name="folder_open" />
            <span>Spielstand laden</span>
          </span>
        </q-btn>
        <!-- „Zurück“ ist keine Menüauswahl, sondern Navigation: mittig statt
             im ausgerichteten Block der Auswahlknöpfe. -->
        <q-btn
          icon="arrow_back"
          label="Zurück"
          class="main-menu-btn btn-unselected"
          @click="goUp"
        />
      </template>

      <SavedGamesPanel
        v-else
        :target="menu === 'online-saves' ? 'online' : 'local'"
        @back="goUp"
        @load="onLoadSavedGame"
      />
    </nav>

    <VersionsDialog v-model="showVersionsDialog" />
    <OptionsDialog v-model="showOptionsDialog" />
  </div>
</template>

<script>
import {
  ref,
  computed,
  watch,
  nextTick,
  onMounted,
  onBeforeUnmount,
} from "vue";
import { useRoute, useRouter } from "vue-router";
import { useQuasar } from "quasar";
import { mdiPodium } from "@quasar/extras/mdi-v7";
import HitsterLogo from "./HitsterLogo.vue";
import SavedGamesPanel from "./SavedGamesPanel.vue";
import VersionsDialog from "./VersionsDialog.vue";
import OptionsDialog from "./OptionsDialog.vue";
import { getUsername, loggedInState } from "../utils/authService";
import { isDesktopApp } from "../utils/platform";
import { activateSavedGame } from "../utils/savedGames";
import { clearStoredScores } from "../composables/useGameState";

const MENUS = ["main", "local", "online", "local-saves", "online-saves"];
// Übergeordnete Ebene je Menü, für „Zurück".
const PARENT = {
  local: "main",
  online: "main",
  "local-saves": "local",
  "online-saves": "online",
};
const NAV_LABELS = {
  main: "Hauptmenü",
  local: "Lokal spielen",
  online: "Online spielen",
  "local-saves": "Spielstand laden",
  "online-saves": "Spielstand laden",
};

// Eigene Kennung für jedes neu gestartete oder geladene lokale Spiel.
// useGameState übernimmt gespeicherte Punkte nur bei passender Kennung, so
// erbt ein neues Spiel keine Punkte aus einem alten.
export const newGameId = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export default {
  name: "MainMenu",
  components: { HitsterLogo, SavedGamesPanel, VersionsDialog, OptionsDialog },
  setup() {
    const route = useRoute();
    const router = useRouter();
    const $q = useQuasar();
    const loggedIn = loggedInState;

    const menu = computed(() => {
      const value = (route.query.menu || "").toString();
      return MENUS.includes(value) ? value : "main";
    });
    const navLabel = computed(() => NAV_LABELS[menu.value]);

    const menuLocation = (name) =>
      name === "main" ? { path: "/" } : { path: "/", query: { menu: name } };

    const openMenu = (name) => {
      router.push(menuLocation(name));
    };

    // Eine Ebene hoch. Kam man von genau dort, wird der Verlauf zurück-
    // gespult, sonst stapelten sich bei jedem Hin und Her neue Einträge.
    const goUp = () => {
      const target = router.resolve(menuLocation(PARENT[menu.value] || "main"));
      if (window.history.state?.back === target.fullPath) {
        router.back();
      } else {
        router.replace(target);
      }
    };

    // Nach einem Ebenenwechsel den Fokus auf den ersten Knopf setzen (in der
    // Spielstand-Liste auf deren Überschrift, nicht auf „Löschen"), damit
    // Tastatur- und Screenreader-Nutzer nicht auf einem verschwundenen
    // Element stehen bleiben.
    const navRef = ref(null);

    // Symbol und Beschriftung der Auswahlknöpfe sollen mittig sitzen und
    // trotzdem untereinander auf einer Linie beginnen. Dafür bekommen alle
    // Blöcke einer Ebene die Breite des längsten. Eine feste Breite war für
    // kurze Beschriftungen zu breit und schob alles nach links.
    const alignButtonLabels = () => {
      const blocks = [
        ...(navRef.value?.querySelectorAll(".main-menu-btn-inner") || []),
      ];
      if (!blocks.length) return;
      blocks.forEach((el) => (el.style.width = "auto"));
      const widest = Math.max(...blocks.map((el) => el.scrollWidth));
      blocks.forEach((el) => (el.style.width = `${widest}px`));
    };
    onMounted(() => {
      alignButtonLabels();
      // Die Schrift kann nachladen und die Breiten ändern.
      document.fonts?.ready?.then(alignButtonLabels).catch(() => {});
      window.addEventListener("resize", alignButtonLabels);
    });
    onBeforeUnmount(() => {
      window.removeEventListener("resize", alignButtonLabels);
    });

    watch(menu, async () => {
      await nextTick();
      alignButtonLabels();
      const first = navRef.value?.querySelector("h2[tabindex='-1'], button");
      first?.focus();
    });

    const showVersionsDialog = ref(false);
    const showOptionsDialog = ref(false);

    // „Beenden" gibt es nur in der Desktop-App; im Browser schließt man den Tab.
    const canQuit =
      isDesktopApp() &&
      typeof window !== "undefined" &&
      typeof window.hitster?.quit === "function";
    const quitApp = () => {
      try {
        window.hitster?.quit?.();
      } catch (err) {
        console.warn("[app] Beenden fehlgeschlagen:", err);
      }
    };

    // `redirect` sagt der Anmeldeseite, wohin es danach geht. „@stats“ steht
    // für die eigene Statistik, deren Adresse erst mit dem Namen feststeht.
    const requireLogin = (message, redirect) => {
      $q.notify({ type: "info", message, timeout: 2500 });
      router.push({ name: "login", query: redirect ? { redirect } : {} });
    };

    const openStats = () => {
      const username = getUsername();
      if (!loggedIn.value || !username) {
        requireLogin("Melde dich an, um deine Statistik zu sehen.", "@stats");
        return;
      }
      router.push({ name: "user-stats", params: { username } });
    };

    const openLeaderboard = () => {
      if (!loggedIn.value) {
        requireLogin("Melde dich an, um die Rangliste zu sehen.", "/leaderboard");
        return;
      }
      router.push({ name: "leaderboard" });
    };

    const startNewLocalGame = () => {
      router.push({ path: "/", query: { setup: "1" } });
    };

    const goToLobby = (query) => {
      router.push({ name: "lobby", query });
    };

    const onLoadSavedGame = (snapshot) => {
      if (!activateSavedGame(snapshot)) {
        $q.notify({
          type: "negative",
          message: "Der Spielstand ließ sich nicht übernehmen (Speicher voll oder gesperrt).",
        });
        return;
      }
      if (menu.value === "online-saves") {
        // Die Lobby liest den eben aktivierten Stand beim Erstellen des Raums.
        goToLobby({ view: "create", session: "1" });
        return;
      }
      // Punkte kommen nur aus dem Spielstand, nicht aus der Vorrunde.
      clearStoredScores();
      router.push({
        name: "game",
        query: { loadSession: 1, gid: newGameId() },
      });
    };

    return {
      // Siegertreppchen als Symbol der Rangliste (SVG, kein eigener Font).
      mdiPodium,
      menu,
      navLabel,
      navRef,
      loggedIn,
      openMenu,
      goUp,
      showVersionsDialog,
      showOptionsDialog,
      canQuit,
      quitApp,
      openStats,
      openLeaderboard,
      startNewLocalGame,
      goToLobby,
      onLoadSavedGame,
    };
  },
};
</script>

<style scoped>
/* Logo und Knöpfe als ein Block mittig in der Höhe, mit kleinem Abstand
   dazwischen. Das Logo gibt es nur auf der Startebene; in den Untermenüs
   stehen die Knöpfe allein mittig und damit höher. */
.main-menu {
  max-width: 520px;
  min-height: 100vh;
  margin: 0 auto;
  padding: 24px 16px 48px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
/* h1 um das Logo: Browser- und Quasar-Vorgaben für Überschriften (Abstand,
   6rem Zeilenhöhe) neutralisieren. */
.main-menu-heading {
  margin: 0;
  font-size: inherit;
  line-height: normal;
  letter-spacing: normal;
}
.main-menu-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  max-width: 480px;
  margin: 0 auto;
}
.main-menu-subtitle {
  margin: 0 0 4px;
  font-size: 1.4rem;
  line-height: 1.3;
  font-weight: 500;
  text-align: center;
}
.main-menu-hint {
  margin: 0;
  text-align: center;
}
.main-menu-btn {
  width: 100%;
  min-height: 64px;
  font-size: 1.15rem;
}
/* Volle Knöpfe: Symbol und Beschriftung stehen in einem Block fester Breite,
   der im Knopf mittig sitzt und innen linksbündig ist. So bleibt alles in
   der Mitte, aber Symbole stehen untereinander auf einer Linie und die
   Beschriftungen beginnen alle an derselben Stelle. Einfach zentriert
   sprangen beide je nach Länge der Beschriftung hin und her. Die Breite
   setzt alignButtonLabels() auf die längste Beschriftung der Ebene;
   umbrechen darf sie nicht. */
.main-menu-btn-inner {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  max-width: 100%;
  text-align: left;
  white-space: nowrap;
}
.main-menu-row {
  display: flex;
  gap: 12px;
  width: 100%;
}
/* Halbe Knöpfe teilen sich den Platz zwischen den beiden Quadraten; fehlt
   „Beenden", streckt sich „Optionen" über die ganze Breite dazwischen. */
.main-menu-half {
  flex: 1 1 0;
  min-width: 0;
  width: auto;
}
/* Halbe Knöpfe gestapelt: Symbol mittig über der Beschriftung. Vorher brach
   der Inhalt bei schmaler Breite um, und das Symbol stand wegen seines
   Abstands nach rechts versetzt über dem Text. */
.main-menu-half :deep(.q-icon) {
  margin: 0;
}
.main-menu-square {
  flex: none;
  width: 64px;
  min-height: 64px;
  font-size: 1.15rem;
  padding: 0;
}
/* Sichtbarer Tastaturfokus: Quasars eigener Fokus ist nur eine leichte
   Aufhellung. Der Ring liegt auf dem Theme-Hintergrund, deshalb in dessen
   Schriftfarbe, die dort den nötigen Kontrast hat. */
.main-menu-stack :deep(.q-btn:focus-visible) {
  outline: 3px solid var(--app-on-bg);
  outline-offset: 3px;
}

@media (max-width: 599px) {
  .main-menu {
    padding: 16px 16px 40px;
  }
}
</style>
