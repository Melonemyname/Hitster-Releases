<template>
  <q-page class="login-page flex flex-center">
    <q-card class="login-card">
      <q-card-section class="text-center q-pb-none">
        <q-icon name="music_note" color="primary" size="56px" />
        <div class="text-h5 q-mt-sm">Hitster Multiplayer</div>
        <div class="text-subtitle2 text-grey q-mb-md">Login erforderlich</div>
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
            :type="showPassword ? 'text' : 'password'"
            outlined
            dark
            class="q-mb-lg"
            :rules="[(val) => !!val || 'Passwort erforderlich']"
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
          color="grey"
          label="Passwort vergessen?"
          icon="lock_reset"
          class="full-width q-mb-sm"
          @click="$router.push('/forgot')"
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
import { login, getServerUrl } from "../utils/authService";
import { isDesktopApp } from "../utils/platform";
import { useTheme } from "../composables/useTheme";
import ServerDialog from "../components/ServerDialog.vue";

export default {
  name: "LoginPage",
  components: { ServerDialog },

  setup() {
    const router = useRouter();
    const { syncFromServer } = useTheme();
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
      loading,
      handleLogin,
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
