<template>
  <q-page class="profile-page">
    <div class="profile-container">
      <div class="row items-center q-mb-lg">
        <q-btn flat round icon="arrow_back" @click="goBack" />
        <div class="text-h5 q-ml-sm">Mein Profil</div>
      </div>

      <q-inner-loading :showing="initialLoading">
        <q-spinner size="42px" color="primary" />
      </q-inner-loading>

      <template v-if="!initialLoading">
        <!-- Avatar -->
        <q-card class="profile-card q-mb-md">
          <q-card-section class="row items-center no-wrap">
            <q-avatar size="88px" color="grey-9" text-color="white">
              <img v-if="avatarSrc" :src="avatarSrc" alt="Profilbild" />
              <q-icon v-else name="person" size="52px" />
            </q-avatar>
            <div class="q-ml-md col">
              <div class="text-subtitle1 q-mb-sm">Profilbild</div>
              <q-btn
                color="primary"
                icon="upload"
                label="Bild wählen"
                :loading="avatarLoading"
                dense
                no-caps
                @click="pickAvatar"
              />
              <q-btn
                v-if="profile.avatar"
                flat
                color="grey"
                icon="delete"
                label="Entfernen"
                :disable="avatarLoading"
                dense
                no-caps
                class="q-ml-sm"
                @click="onRemoveAvatar"
              />
              <input
                ref="fileInput"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                class="hidden"
                @change="onAvatarSelected"
              />
            </div>
          </q-card-section>
        </q-card>

        <!-- Benutzername -->
        <q-card class="profile-card q-mb-md">
          <q-card-section>
            <div class="text-subtitle1 q-mb-sm">Benutzername</div>
            <q-form @submit.prevent="onSaveUsername">
              <q-input
                v-model="usernameInput"
                outlined
                dark
                dense
                :rules="[
                  (val) => !!val || 'Benutzername erforderlich',
                  (val) => (val && val.trim().length >= 2) || 'Mindestens 2 Zeichen',
                ]"
              >
                <template #prepend><q-icon name="person" /></template>
              </q-input>
              <q-btn
                type="submit"
                color="primary"
                label="Benutzername speichern"
                :loading="usernameLoading"
                :disable="usernameInput.trim() === profile.username"
                no-caps
                class="q-mt-sm"
              />
            </q-form>
          </q-card-section>
        </q-card>

        <!-- Passwort -->
        <q-card class="profile-card q-mb-md">
          <q-card-section>
            <div class="text-subtitle1 q-mb-sm">Passwort ändern</div>
            <q-form @submit.prevent="onChangePassword">
              <q-input
                v-model="oldPassword"
                type="password"
                outlined
                dark
                dense
                label="Aktuelles Passwort"
                class="q-mb-sm"
                :rules="[(val) => !!val || 'Aktuelles Passwort erforderlich']"
              >
                <template #prepend><q-icon name="lock" /></template>
              </q-input>
              <q-input
                v-model="newPassword"
                type="password"
                outlined
                dark
                dense
                label="Neues Passwort"
                class="q-mb-sm"
                :rules="[
                  (val) => !!val || 'Neues Passwort erforderlich',
                  (val) => (val && val.length >= 6) || 'Mindestens 6 Zeichen',
                ]"
              >
                <template #prepend><q-icon name="lock_reset" /></template>
              </q-input>
              <q-input
                v-model="newPasswordConfirm"
                type="password"
                outlined
                dark
                dense
                label="Neues Passwort bestätigen"
                :rules="[
                  (val) => val === newPassword || 'Passwörter stimmen nicht überein',
                ]"
              >
                <template #prepend><q-icon name="lock_reset" /></template>
              </q-input>
              <q-btn
                type="submit"
                color="primary"
                label="Passwort ändern"
                :loading="passwordLoading"
                no-caps
                class="q-mt-sm"
              />
            </q-form>
          </q-card-section>
        </q-card>

        <!-- Sicherheitsfrage -->
        <q-card class="profile-card q-mb-md">
          <q-card-section>
            <div class="text-subtitle1 q-mb-sm">Sicherheitsfrage</div>
            <div v-if="profile.securityQuestion" class="text-caption text-grey q-mb-sm">
              Aktuell hinterlegt: {{ profile.securityQuestion }}
            </div>
            <q-banner v-else dense class="q-mb-sm rounded-borders">
              <template #avatar><q-icon name="warning" color="orange" /></template>
              Noch keine Sicherheitsfrage hinterlegt – ohne sie ist keine
              Passwort-Wiederherstellung möglich.
            </q-banner>
            <q-form ref="securityForm" @submit.prevent="onSaveSecurity">
              <SecurityQuestionFields
                v-model:question="secQuestion"
                v-model:answer="secAnswer"
                answer-label="Antwort"
                answer-hint="Beim Ändern bitte Frage und Antwort neu eingeben"
              />
              <q-btn
                type="submit"
                color="primary"
                label="Sicherheitsfrage speichern"
                :loading="securityLoading"
                no-caps
                class="q-mt-sm"
              />
            </q-form>
          </q-card-section>
        </q-card>
      </template>
    </div>
  </q-page>
</template>

<script>
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { Notify } from "quasar";
import {
  fetchProfile,
  updateUsername,
  updatePassword,
  updateSecurity,
  uploadAvatar,
  deleteAvatar,
  fileToAvatarDataUri,
  avatarUrl,
} from "../utils/profileService";
import SecurityQuestionFields from "../components/SecurityQuestionFields.vue";
import { useProfile } from "../composables/useProfile";

export default {
  name: "ProfilePage",
  components: { SecurityQuestionFields },

  setup() {
    const router = useRouter();
    // App-weiter Profil-Zustand: hier gepflegt, damit das FAB-Icon in der
    // MainLayout ein neues/entferntes Profilbild sofort übernimmt.
    const { applyProfile: applyProfileGlobal } = useProfile();

    const profile = ref({
      username: "",
      avatar: null,
      securityQuestion: null,
    });
    const initialLoading = ref(true);

    const usernameInput = ref("");
    const oldPassword = ref("");
    const newPassword = ref("");
    const newPasswordConfirm = ref("");
    const secQuestion = ref("");
    const secAnswer = ref("");

    const usernameLoading = ref(false);
    const passwordLoading = ref(false);
    const avatarLoading = ref(false);
    const securityLoading = ref(false);

    const fileInput = ref(null);
    const securityForm = ref(null);

    const avatarSrc = computed(() => avatarUrl(profile.value.avatar));

    const applyProfile = (p) => {
      profile.value = p;
      usernameInput.value = p.username;
      // App-weit spiegeln (FAB-Icon), damit Bildwechsel sofort sichtbar ist.
      applyProfileGlobal(p);
    };

    const notifyErr = (err) =>
      Notify.create({ type: "negative", message: err.message, timeout: 3500 });
    const notifyOk = (message) =>
      Notify.create({ type: "positive", message, timeout: 2000 });

    onMounted(async () => {
      try {
        const p = await fetchProfile();
        applyProfile(p);
        secQuestion.value = p.securityQuestion || ""; // Vorbelegung des Formulars
      } catch (err) {
        notifyErr(err);
        router.push("/login");
      } finally {
        initialLoading.value = false;
      }
    });

    const onSaveUsername = async () => {
      usernameLoading.value = true;
      try {
        const data = await updateUsername(usernameInput.value.trim());
        profile.value.username = data.username;
        usernameInput.value = data.username;
        notifyOk("Benutzername aktualisiert");
      } catch (err) {
        notifyErr(err);
      } finally {
        usernameLoading.value = false;
      }
    };

    const onChangePassword = async () => {
      passwordLoading.value = true;
      try {
        await updatePassword(oldPassword.value, newPassword.value);
        oldPassword.value = "";
        newPassword.value = "";
        newPasswordConfirm.value = "";
        notifyOk("Passwort geändert");
      } catch (err) {
        notifyErr(err);
      } finally {
        passwordLoading.value = false;
      }
    };

    const onSaveSecurity = async () => {
      if (!secQuestion.value || !secAnswer.value.trim()) {
        notifyErr(new Error("Bitte Frage und Antwort ausfüllen"));
        return;
      }
      securityLoading.value = true;
      try {
        const p = await updateSecurity(secQuestion.value, secAnswer.value);
        profile.value.securityQuestion = p.securityQuestion;
        secAnswer.value = "";
        // Feld wurde bewusst geleert -> Validierung zurücksetzen, sonst
        // erscheint fälschlich „Antwort erforderlich" (rot).
        securityForm.value && securityForm.value.resetValidation();
        notifyOk("Sicherheitsfrage gespeichert");
      } catch (err) {
        notifyErr(err);
      } finally {
        securityLoading.value = false;
      }
    };

    const pickAvatar = () => fileInput.value && fileInput.value.click();

    const onAvatarSelected = async (event) => {
      const file = event.target.files && event.target.files[0];
      event.target.value = ""; // erlaubt erneutes Wählen derselben Datei
      if (!file) return;
      avatarLoading.value = true;
      try {
        const dataUri = await fileToAvatarDataUri(file);
        applyProfile(await uploadAvatar(dataUri));
        notifyOk("Profilbild aktualisiert");
      } catch (err) {
        notifyErr(err);
      } finally {
        avatarLoading.value = false;
      }
    };

    const onRemoveAvatar = async () => {
      avatarLoading.value = true;
      try {
        applyProfile(await deleteAvatar());
        notifyOk("Profilbild entfernt");
      } catch (err) {
        notifyErr(err);
      } finally {
        avatarLoading.value = false;
      }
    };

    // Zur vorherigen Seite zurück (Fallback: Lobby, falls keine Historie).
    const goBack = () => {
      if (window.history.length > 1) router.back();
      else router.push("/lobby");
    };

    return {
      profile,
      initialLoading,
      usernameInput,
      oldPassword,
      newPassword,
      newPasswordConfirm,
      secQuestion,
      secAnswer,
      usernameLoading,
      passwordLoading,
      avatarLoading,
      securityLoading,
      fileInput,
      securityForm,
      avatarSrc,
      onSaveUsername,
      onChangePassword,
      onSaveSecurity,
      pickAvatar,
      onAvatarSelected,
      onRemoveAvatar,
      goBack,
    };
  },
};
</script>

<style scoped>
.profile-page {
  min-height: 100vh;
  background: var(--app-bg, #121212);
}
.profile-container {
  max-width: var(--content-max-width, 1180px);
  margin: 0 auto;
  padding: 24px 16px 48px;
}
.profile-card {
  color: #fff;
  border-radius: 12px;
}
.hidden {
  display: none;
}
</style>
