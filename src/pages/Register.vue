<template>
  <q-page class="register-page flex flex-center">
    <q-card class="register-card">
      <q-card-section class="text-center q-pb-none">
        <q-icon name="person_add" color="primary" size="56px" />
        <div class="text-h5 q-mt-sm">Account erstellen</div>
        <div class="text-subtitle2 text-grey q-mb-md">
          Für Multiplayer & gespeicherte Einstellungen
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
            <template #append>
              <q-icon
                :name="showPassword ? 'visibility_off' : 'visibility'"
                class="cursor-pointer"
                @click="showPassword = !showPassword"
              />
            </template>
          </q-input>

          <q-input
            v-model="passwordConfirm"
            label="Passwort bestätigen"
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

          <div class="text-caption text-grey q-mb-xs">
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
          color="grey"
          label="Lokal ohne Login spielen"
          icon="person_off"
          class="full-width"
          @click="$router.push('/')"
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
  width: 100%;
  max-width: 420px;
  color: #fff;
  border-radius: 12px;
}
.server-hint {
  background: var(--surface-bg-weak);
  border-radius: var(--surface-radius);
}
</style>
