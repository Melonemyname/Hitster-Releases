<template>
  <q-page class="login-page flex flex-center">
    <q-card class="login-card">
      <!-- Zurück: oben links in der Karte, wie man es von Dialogen kennt.
           Führt dorthin, wo man herkam, sonst ins Hauptmenü. -->
      <q-btn
        flat
        round
        dense
        icon="arrow_back"
        class="login-back"
        aria-label="Zurück"
        @click="goBack"
      >
        <q-tooltip>Zurück</q-tooltip>
      </q-btn>
      <q-card-section class="text-center q-pb-none">
        <q-icon name="music_note" color="primary" size="56px" />
        <!-- Seitenüberschrift als h1; Optik bleibt über text-h5. -->
        <h1 class="text-h5 q-mt-sm q-mb-none">Hitster online</h1>
        <div class="text-subtitle2 text-muted q-mb-md">Login erforderlich</div>
      </q-card-section>

      <q-card-section>
        <!-- Desktop-App ohne Server: Login unmöglich, erst verbinden. -->
        <div v-if="needsServer" class="server-hint q-pa-md q-mb-md">
          <div class="row items-center no-wrap">
            <q-icon name="dns" size="22px" class="q-mr-sm" />
            <div>
              Kein Server verbunden. Zum Anmelden musst du dich zuerst mit einem
              Server verbinden.
            </div>
          </div>
          <q-btn
            color="primary"
            icon="dns"
            label="Server verbinden"
            class="full-width q-mt-sm"
            @click="showServerDialog = true"
          />
        </div>

        <q-form @submit.prevent="handleLogin">
          <q-input
            v-model="username"
            label="Benutzername"
            autocomplete="username"
            outlined
            dark
            autofocus
            class="q-mb-md"
            :rules="[(val) => !!val || 'Benutzername erforderlich']"
          >
            <template #prepend>
              <q-icon name="person" />
            </template>
          </q-input>

          <q-input
            v-model="password"
            label="Passwort"
            autocomplete="current-password"
            :type="showPassword ? 'text' : 'password'"
            outlined
            dark
            class="q-mb-lg"
            :rules="[(val) => !!val || 'Passwort erforderlich']"
          >
            <template #prepend>
              <q-icon name="lock" />
            </template>
            <!-- Als Knopf statt klickbarem Symbol: per Tastatur erreichbar und
                 mit Namen für Screenreader. -->
            <template #append>
              <q-btn
                flat
                round
                dense
                :icon="showPassword ? 'visibility_off' : 'visibility'"
                :aria-label="
                  showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'
                "
                @click="showPassword = !showPassword"
              />
            </template>
          </q-input>

          <q-btn
            type="submit"
            color="primary"
            label="Einloggen"
            icon="login"
            class="full-width q-mb-sm"
            size="lg"
            :loading="loading"
          />
        </q-form>

        <q-btn
          flat
          color="primary"
          label="Neuen Account erstellen"
          icon="person_add"
          class="full-width q-mb-sm"
          @click="$router.push('/register')"
        />

        <q-btn
          flat
          label="Passwort vergessen?"
          icon="lock_reset"
          class="full-width q-mb-sm"
          @click="$router.push('/forgot')"
        />

        <q-separator class="q-my-md" />

        <q-btn
          flat
          label="Abbrechen"
          icon="close"
          class="full-width"
          @click="goBack"
        />
      </q-card-section>
    </q-card>

    <ServerDialog
      v-model="showServerDialog"
      @update:model-value="onServerDialogToggle"
    />
  </q-page>
</template>

<script>
import { ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Notify } from "quasar";
import { login, getServerUrl } from "../utils/authService";
import { isDesktopApp } from "../utils/platform";
import { useTheme } from "../composables/useTheme";
import ServerDialog from "../components/ServerDialog.vue";

export default {
  name: "LoginPage",
  components: { ServerDialog },

  setup() {
    const router = useRouter();
    const route = useRoute();
    const { syncFromServer } = useTheme();
    // Zurück: dorthin, wo man herkam (Hauptmenü, Lobby-Versuch …), sonst ins
    // Hauptmenü. Vorher gab es auf der Seite keinen Weg zurück außer
    // „Lokal ohne Login spielen“.
    // Liegt hinter der Anmeldeseite eine Seite, die selbst eine Anmeldung
    // verlangt (etwa Statistik nach abgelaufener Sitzung), führte „Zurück“
    // sofort wieder hierher. Dann ins Hauptmenü.
    const goBack = () => {
      const back = window.history.state?.back;
      if (back && !router.resolve(back).meta?.requiresAuth) router.back();
      else router.replace("/");
    };

    // Nach der Anmeldung zum ursprünglichen Ziel: `redirect` setzt der
    // Router-Wächter (geschützte Seite) bzw. das Hauptmenü. „@stats“ ist die
    // eigene Statistik, deren Adresse erst mit dem Namen feststeht. Nur
    // interne Pfade, nie die Anmeldeseite selbst.
    const goAfterLogin = (name) => {
      const ziel = String(route.query.redirect || "");
      if (ziel === "@stats" && name) {
        router.replace({ name: "user-stats", params: { username: name } });
      } else if (ziel.startsWith("/") && !ziel.startsWith("//") && !ziel.startsWith("/login")) {
        router.replace(ziel);
      } else {
        router.push("/");
      }
    };
    const username = ref("");
    const password = ref("");
    const loading = ref(false);
    const showPassword = ref(false);
    const showServerDialog = ref(false);
    // In der Desktop-App ist Login ohne hinterlegten Server unmöglich.
    const needsServer = ref(isDesktopApp() && !getServerUrl());

    const onServerDialogToggle = (open) => {
      if (!open) needsServer.value = isDesktopApp() && !getServerUrl();
    };

    const handleLogin = async () => {
      // Ohne Server-Verbindung (Desktop-App) erst zum Verbinden auffordern.
      if (isDesktopApp() && !getServerUrl()) {
        needsServer.value = true;
        showServerDialog.value = true;
        Notify.create({
          type: "warning",
          message:
            "Kein Server verbunden. Bitte zuerst eine Server-Adresse eintragen.",
          timeout: 3500,
        });
        return;
      }
      loading.value = true;
      try {
        const data = await login(username.value, password.value);
        // Account-gekoppeltes Theme des Nutzers laden und anwenden.
        await syncFromServer();
        Notify.create({
          type: "positive",
          message: `Willkommen, ${data.username}!`,
          timeout: 2000,
        });
        goAfterLogin(data.username);
      } catch (err) {
        Notify.create({
          type: "negative",
          message: err.message,
          timeout: 3500,
        });
      } finally {
        loading.value = false;
      }
    };

    return {
      username,
      password,
      loading,
      handleLogin,
      goBack,
      showPassword,
      showServerDialog,
      needsServer,
      onServerDialogToggle,
    };
  },
};
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  background: var(--app-bg, #121212);
}
.login-card {
  position: relative;
  width: 100%;
  max-width: 420px;
  /* Flächenschrift über das Token statt fest #fff (Theming-Regel). */
  color: var(--app-on-surface);
  border-radius: 12px;
}
/* Über dem ersten Kartenabschnitt: Der liegt im DOM danach und hätte den
   Knopf sonst überdeckt, Klicks kamen nicht an. */
.login-back {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 1;
}
.server-hint {
  background: var(--surface-bg-weak);
  border-radius: var(--surface-radius);
}
</style>
