<template>
  <q-page class="forgot-page flex flex-center">
    <q-card class="forgot-card">
      <q-card-section class="text-center q-pb-none">
        <q-icon name="lock_reset" color="primary" size="56px" />
        <div class="text-h5 q-mt-sm">Passwort zurücksetzen</div>
        <div class="text-subtitle2 text-grey q-mb-md">
          Über deine Sicherheitsfrage
        </div>
      </q-card-section>

      <q-card-section>
        <!-- Schritt 1: Benutzername -->
        <q-form v-if="step === 1" @submit.prevent="loadQuestion">
          <q-input
            v-model="username"
            label="Benutzername"
            outlined
            dark
            autofocus
            class="q-mb-md"
            :rules="[(val) => !!val || 'Benutzername erforderlich']"
          >
            <template #prepend><q-icon name="person" /></template>
          </q-input>
          <q-btn
            type="submit"
            color="primary"
            label="Weiter"
            icon="arrow_forward"
            class="full-width q-mb-sm"
            size="lg"
            :loading="loading"
          />
        </q-form>

        <!-- Schritt 2: Frage beantworten + neues Passwort -->
        <q-form v-else @submit.prevent="doReset">
          <q-banner dense class="q-mb-md rounded-borders">
            <template #avatar><q-icon name="help" color="primary" /></template>
            {{ question }}
          </q-banner>

          <q-input
            v-model="answer"
            label="Deine Antwort"
            outlined
            dark
            autofocus
            class="q-mb-md"
            :rules="[(val) => !!val || 'Antwort erforderlich']"
          >
            <template #prepend><q-icon name="vpn_key" /></template>
          </q-input>

          <q-input
            v-model="newPassword"
            label="Neues Passwort"
            :type="showPassword ? 'text' : 'password'"
            outlined
            dark
            class="q-mb-md"
            :rules="[
              (val) => !!val || 'Neues Passwort erforderlich',
              (val) => (val && val.length >= 6) || 'Mindestens 6 Zeichen',
            ]"
          >
            <template #prepend><q-icon name="lock" /></template>
            <template #append>
              <q-icon
                :name="showPassword ? 'visibility_off' : 'visibility'"
                class="cursor-pointer"
                @click="showPassword = !showPassword"
              />
            </template>
          </q-input>

          <q-input
            v-model="newPasswordConfirm"
            label="Neues Passwort bestätigen"
            :type="showPassword ? 'text' : 'password'"
            outlined
            dark
            class="q-mb-lg"
            :rules="[
              (val) => val === newPassword || 'Passwörter stimmen nicht überein',
            ]"
          >
            <template #prepend><q-icon name="lock" /></template>
          </q-input>

          <q-btn
            type="submit"
            color="primary"
            label="Passwort zurücksetzen"
            icon="lock_reset"
            class="full-width q-mb-sm"
            size="lg"
            :loading="loading"
          />
          <q-btn
            flat
            color="grey"
            label="Anderer Benutzername"
            class="full-width"
            @click="step = 1"
          />
        </q-form>

        <q-separator class="q-my-md" />

        <q-btn
          flat
          color="primary"
          label="Zurück zum Login"
          icon="login"
          class="full-width"
          @click="$router.push('/login')"
        />
      </q-card-section>
    </q-card>
  </q-page>
</template>

<script>
import { ref } from "vue";
import { useRouter } from "vue-router";
import { Notify } from "quasar";
import { fetchRecoveryQuestion, resetPassword } from "../utils/profileService";
import { useTheme } from "../composables/useTheme";

export default {
  name: "ForgotPasswordPage",

  setup() {
    const router = useRouter();
    const { syncFromServer } = useTheme();

    const step = ref(1);
    const username = ref("");
    const question = ref("");
    const answer = ref("");
    const newPassword = ref("");
    const newPasswordConfirm = ref("");
    const loading = ref(false);
    const showPassword = ref(false);

    const loadQuestion = async () => {
      loading.value = true;
      try {
        const data = await fetchRecoveryQuestion(username.value.trim());
        question.value = data.question;
        step.value = 2;
      } catch (err) {
        Notify.create({ type: "negative", message: err.message, timeout: 3500 });
      } finally {
        loading.value = false;
      }
    };

    const doReset = async () => {
      loading.value = true;
      try {
        const data = await resetPassword({
          username: username.value.trim(),
          answer: answer.value,
          newPassword: newPassword.value,
        });
        await syncFromServer();
        Notify.create({
          type: "positive",
          message: `Passwort geändert. Willkommen, ${data.username}!`,
          timeout: 2500,
        });
        router.push("/");
      } catch (err) {
        Notify.create({ type: "negative", message: err.message, timeout: 3500 });
      } finally {
        loading.value = false;
      }
    };

    return {
      step,
      username,
      question,
      answer,
      newPassword,
      newPasswordConfirm,
      loading,
      showPassword,
      loadQuestion,
      doReset,
    };
  },
};
</script>

<style scoped>
.forgot-page {
  min-height: 100vh;
  background: var(--app-bg, #121212);
}
.forgot-card {
  width: 100%;
  max-width: 420px;
  color: #fff;
  border-radius: 12px;
}
</style>
