<template>
  <q-page class="register-page flex flex-center">
    <q-card class="register-card">
      <q-btn
        flat
        round
        dense
        icon="arrow_back"
        class="register-back"
        aria-label="Zurück"
        @click="goBack"
      >
        <q-tooltip>Zurück</q-tooltip>
      </q-btn>
      <q-card-section class="text-center q-pb-none">
        <q-icon name="person_add" color="primary" size="56px" />
        <!-- Seitenüberschrift als h1; Optik bleibt über text-h5. -->
        <h1 class="text-h5 q-mt-sm q-mb-none">Account erstellen</h1>
        <div class="text-subtitle2 text-muted q-mb-md">
          Für Online-Spiele und gespeicherte Einstellungen
        </div>
      </q-card-section>

      <q-card-section>
        <!-- Desktop-App ohne Server: Registrieren unmöglich, erst verbinden. -->
        <div v-if="needsServer" class="server-hint q-pa-md q-mb-md">
          <div class="row items-center no-wrap">
            <q-icon name="dns" size="22px" class="q-mr-sm" />
            <div>
              Kein Server verbunden. Zum Erstellen eines Accounts musst du dich
              zuerst mit einem Server verbinden.
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

        <q-form @submit.prevent="handleRegister">
          <q-input
            v-model="username"
            label="Benutzername"
            autocomplete="username"
            outlined
            dark
            autofocus
            class="q-mb-md"
            :rules="[
              (val) => !!val || 'Benutzername erforderlich',
              (val) => (val && val.trim().length >= 2) || 'Mindestens 2 Zeichen',
            ]"
          >
            <template #prepend>
              <q-icon name="person" />
            </template>
          </q-input>

          <q-input
            v-model="password"
            label="Passwort"
            autocomplete="new-password"
            :type="showPassword ? 'text' : 'password'"
            outlined
            dark
            class="q-mb-md"
            :rules="[
              (val) => !!val || 'Passwort erforderlich',
              (val) => (val && val.length >= 6) || 'Mindestens 6 Zeichen',
            ]"
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

          <q-input
            v-model="passwordConfirm"
            label="Passwort bestätigen"
            autocomplete="new-password"
            :type="showPassword ? 'text' : 'password'"
            outlined
            dark
            class="q-mb-md"
            :rules="[
              (val) => !!val || 'Bitte Passwort bestätigen',
              (val) => val === password || 'Passwörter stimmen nicht überein',
            ]"
          >
            <template #prepend>
              <q-icon name="lock" />
            </template>
          </q-input>

          <div class="text-caption text-muted q-mb-xs">
            Sicherheitsfrage (für Passwort-Wiederherstellung)
          </div>
          <SecurityQuestionFields
            v-model:question="securityQuestion"
            v-model:answer="securityAnswer"
            answer-label="Deine Antwort"
            class="q-mb-md"
          />

          <q-btn
            type="submit"
            color="primary"
            label="Account erstellen"
            icon="how_to_reg"
            class="full-width q-mb-sm"
            size="lg"
            :loading="loading"
          />
        </q-form>

        <q-btn
          flat
          color="primary"
          label="Ich habe schon einen Account"
          icon="login"
          class="full-width q-mb-sm"
          @click="$router.push('/login')"
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
import { useRouter } from "vue-router";
import { Notify } from "quasar";
import { register } from "../utils/profileService";
import { getServerUrl } from "../utils/authService";
import { isDesktopApp } from "../utils/platform";
import { useTheme } from "../composables/useTheme";
import SecurityQuestionFields from "../components/SecurityQuestionFields.vue";
import ServerDialog from "../components/ServerDialog.vue";

export default {
  name: "RegisterPage",
  components: { SecurityQuestionFields, ServerDialog },

  setup() {
    const router = useRouter();
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

    const { syncFromServer } = useTheme();
    const username = ref("");
    const password = ref("");
    const passwordConfirm = ref("");
    const securityQuestion = ref("");
    const securityAnswer = ref("");
    const loading = ref(false);
    const showPassword = ref(false);
    const showServerDialog = ref(false);
    const needsServer = ref(isDesktopApp() && !getServerUrl());

    const onServerDialogToggle = (open) => {
      if (!open) needsServer.value = isDesktopApp() && !getServerUrl();
    };

    const handleRegister = async () => {
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
      if (!securityQuestion.value || !securityAnswer.value.trim()) {
        Notify.create({
          type: "negative",
          message: "Bitte Sicherheitsfrage und Antwort ausfüllen",
          timeout: 3000,
        });
        return;
      }
      loading.value = true;
      try {
        const data = await register({
          username: username.value,
          password: password.value,
          securityQuestion: securityQuestion.value,
          securityAnswer: securityAnswer.value,
        });
        // Neuer Account: ggf. (leeres) Server-Theme laden.
        await syncFromServer();
        Notify.create({
          type: "positive",
          message: `Willkommen, ${data.username}!`,
          timeout: 2000,
        });
        router.push("/");
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
      goBack,
      username,
      password,
      passwordConfirm,
      securityQuestion,
      securityAnswer,
      loading,
      showPassword,
      handleRegister,
      showServerDialog,
      needsServer,
      onServerDialogToggle,
    };
  },
};
</script>

<style scoped>
.register-page {
  min-height: 100vh;
  background: var(--app-bg, #121212);
}
.register-card {
  position: relative;
  width: 100%;
  max-width: 420px;
  /* Flächenschrift über das Token statt fest #fff (Theming-Regel). */
  color: var(--app-on-surface);
  border-radius: 12px;
}
/* Über dem ersten Kartenabschnitt: Der liegt im DOM danach und hätte den
   Knopf sonst überdeckt, Klicks kamen nicht an. */
.register-back {
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
