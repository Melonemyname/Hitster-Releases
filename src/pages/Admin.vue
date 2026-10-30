<template>
  <q-page class="admin-page">
    <div class="admin-shell">
      <div class="row items-center justify-between q-mb-md admin-head">
        <div class="row items-center no-wrap admin-title">
          <q-btn
            flat
            round
            icon="arrow_back"
            aria-label="Zurück"
            class="q-mr-sm"
            @click="goBack"
          />
          <div>
            <!-- Seitenüberschrift als h1; Optik bleibt über text-h5. -->
            <h1 class="text-h5 q-my-none">
              <q-icon name="admin_panel_settings" class="q-mr-xs" />
              Nutzerverwaltung
            </h1>
            <!-- Ohne opacity: Der Text liegt direkt auf dem Seitenhintergrund,
                 jede Abschwächung kostet dort Kontrast. -->
            <div class="text-caption">
              Nur für den Serverbesitzer (Admin) sichtbar. Nutzer anlegen und
              löschen, in Bestenliste/Statistik ein- oder ausblenden und den
              Besitz übertragen.
            </div>
          </div>
        </div>
        <q-btn
          color="primary"
          icon="person_add"
          label="Nutzer anlegen"
          class="admin-create-btn"
          @click="openCreateDialog"
        />
      </div>

      <q-card class="admin-card">
        <q-card-section>
          <div v-if="loading" class="text-center q-py-lg" role="status">
            <q-spinner color="primary" size="32px" />
            <div class="q-mt-sm text-caption text-muted">
              Nutzer werden geladen …
            </div>
          </div>
          <template v-else>
            <div
              v-if="!users.length"
              class="text-center text-caption text-muted q-py-lg"
            >
              Keine Nutzer vorhanden.
            </div>
            <q-list v-else separator>
              <q-item v-for="u in users" :key="u.id">
                <q-item-section avatar>
                  <q-avatar size="40px">
                    <!-- Leeres alt: Der Name steht direkt daneben als Text. -->
                    <img
                      v-if="avatarUrl(u.avatar)"
                      :src="avatarUrl(u.avatar)"
                      alt=""
                    />
                    <q-icon v-else name="person" />
                  </q-avatar>
                </q-item-section>
                <q-item-section>
                  <!-- Name und Abzeichen bleiben in EINER Zeile: ein langer
                       Name wird abgeschnitten statt umgebrochen. Sonst wuchs
                       die Zeile (gemessen 80px -> 107px) und die Aktionen der
                       Nutzerzeilen sassen unterschiedlich tief. -->
                  <q-item-label class="row items-center no-wrap admin-user-line">
                    <span class="ellipsis" :title="u.username">
                      {{ u.username }}
                    </span>
                    <q-badge v-if="u.isAdmin" color="primary" class="q-ml-xs">
                      Admin
                    </q-badge>
                    <q-badge
                      v-if="!u.hasSecurityQuestion"
                      color="warning"
                      class="q-ml-xs"
                    >
                      Ohne Sicherheitsfrage
                    </q-badge>
                  </q-item-label>
                  <q-item-label caption>
                    {{ u.gamesPlayed }} Spiele · {{ u.wins }} Siege
                  </q-item-label>
                </q-item-section>
                <q-item-section side class="admin-actions">
                  <q-toggle
                    :model-value="!u.hidden"
                    dense
                    color="primary"
                    :disable="togglingHidden === u.id"
                    :aria-label="`${u.username} in Bestenliste und Statistik anzeigen`"
                    @update:model-value="(val) => onToggleHidden(u, val)"
                  >
                    <q-tooltip>
                      In Bestenliste &amp; Statistik
                      {{ u.hidden ? "ausgeblendet" : "sichtbar" }}
                    </q-tooltip>
                  </q-toggle>
                  <q-btn
                    v-if="!u.isAdmin"
                    flat
                    round
                    dense
                    icon="admin_panel_settings"
                    :loading="transferring === u.id"
                    :aria-label="`Besitz an ${u.username} übertragen`"
                    @click="confirmTransfer(u)"
                  >
                    <q-tooltip>Besitz (Admin) übertragen</q-tooltip>
                  </q-btn>
                  <q-btn
                    v-if="!u.isAdmin"
                    flat
                    round
                    dense
                    color="negative"
                    icon="delete"
                    :loading="deletingUser === u.username"
                    :aria-label="`Nutzer ${u.username} löschen`"
                    @click="confirmDelete(u)"
                  >
                    <q-tooltip>Nutzer löschen</q-tooltip>
                  </q-btn>
                  <q-icon v-else name="lock" size="20px" style="opacity: 0.5">
                    <q-tooltip
                      >Besitzer-/Admin-Account kann nicht gelöscht werden</q-tooltip
                    >
                  </q-icon>
                </q-item-section>
              </q-item>
            </q-list>
          </template>
        </q-card-section>
      </q-card>

      <q-card class="admin-card q-mt-md">
        <q-card-section>
          <div class="text-subtitle1 q-mb-xs">
            <q-icon name="lock" class="q-mr-xs" />
            Eingeschränkte Versionen
          </div>
          <div class="text-caption text-muted q-mb-md">
            Diese Versionen sind nicht im App-Bundle (z. B. Hitster 1 &amp; 2).
            Wähle je Version die Accounts, die sie sehen und spielen dürfen.
          </div>
          <div v-if="restrictedLoading" class="text-center q-py-md">
            <q-spinner color="primary" size="28px" />
          </div>
          <template v-else>
            <div
              v-if="!restrictedVersions.length"
              class="text-caption text-muted q-py-md"
            >
              Keine eingeschränkten Versionen vorhanden.
            </div>
            <!-- role="none": Die Kopfzeilen der Ausklapp-Einträge sind Knöpfe
                 (role="button"), ihr Inhalt enthält eine eigene Liste. Beides
                 ist als direktes Kind einer role="list" unzulässig; die äußere
                 Liste dient hier nur der Optik (Trennlinien). -->
            <q-list v-else separator role="none">
              <q-expansion-item
                v-for="rv in restrictedVersions"
                :key="rv.id"
                icon="lock"
                :label="rv.label"
                :caption="`${rv.trackCount} Songs · ${rv.allowedUserIds.length} freigegeben`"
              >
                <div class="q-px-md q-pb-md">
                  <div class="text-caption text-muted q-mb-xs">
                    Freigegebene Accounts
                  </div>
                  <q-list dense>
                    <q-item
                      v-for="u in users"
                      :key="u.id"
                      tag="label"
                      clickable
                    >
                      <q-item-section avatar>
                        <q-checkbox
                          :model-value="rv.allowedUserIds.includes(u.id)"
                          color="primary"
                          :disable="savingAccess === rv.id"
                          @update:model-value="(val) => onToggleAccess(rv, u.id, val)"
                        />
                      </q-item-section>
                      <q-item-section>{{ u.username }}</q-item-section>
                    </q-item>
                  </q-list>
                </div>
              </q-expansion-item>
            </q-list>
          </template>
        </q-card-section>
      </q-card>
    </div>

    <!-- Nutzer anlegen -->
    <!-- aria-labelledby landet bei QDialog direkt auf dem role="dialog"-
         Element und gibt dem Dialog den sichtbaren Titel als Namen. -->
    <q-dialog
      v-model="showCreate"
      persistent
      aria-labelledby="admin-create-title"
    >
      <q-card style="min-width: 380px; max-width: 92vw">
        <q-card-section>
          <div id="admin-create-title" class="text-h6">
            <q-icon name="person_add" class="q-mr-xs" />
            Neuen Nutzer anlegen
          </div>
        </q-card-section>
        <q-card-section class="q-pt-none">
          <q-input
            v-model="newUsername"
            label="Benutzername"
            autocomplete="off"
            outlined
            autofocus
            :rules="[
              (val) => (val && val.trim().length >= 2) || 'Min. 2 Zeichen',
            ]"
          />
          <q-input
            v-model="newPassword"
            label="Passwort"
            autocomplete="new-password"
            :type="showPassword ? 'text' : 'password'"
            outlined
            class="q-mt-sm"
            :rules="[(val) => (val && val.length >= 6) || 'Min. 6 Zeichen']"
          >
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
          <div class="text-caption text-muted q-mt-sm">
            Die Sicherheitsfrage kann der Nutzer im Profil selbst hinterlegen.
            Solange sie fehlt, ist keine Passwort-Wiederherstellung möglich.
          </div>
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Abbrechen" @click="showCreate = false" />
          <q-btn
            color="primary"
            icon="check"
            label="Anlegen"
            :loading="creating"
            :disable="!canCreate"
            @click="submitCreate"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script>
import { ref, computed, onMounted } from "vue";
import { Notify, Dialog } from "quasar";
import { useRouter } from "vue-router";
import {
  fetchAdminUsers,
  createAdminUser,
  deleteAdminUser,
  setUserHidden,
  transferOwner,
  fetchAdminRestrictedVersions,
  setRestrictedAccess,
  isCurrentUserAdmin,
} from "../utils/adminService";
import { avatarUrl } from "../utils/profileService";
import { setIsAdmin } from "../utils/authService";

export default {
  name: "AdminPage",
  setup() {
    const router = useRouter();

    // Frontend-Guard zusätzlich zum Server-Guard: Nicht-Admins landen sofort
    // auf der Startseite (Menüpunkt sollte gar nicht sichtbar sein, aber
    // URL-Direktaufruf wird hier abgefangen).
    if (!isCurrentUserAdmin()) {
      router.replace("/");
    }

    const users = ref([]);
    const loading = ref(false);
    const deletingUser = ref(null);
    const togglingHidden = ref(null);
    const transferring = ref(null);
    const restrictedVersions = ref([]);
    const restrictedLoading = ref(false);
    const savingAccess = ref(null);

    const showCreate = ref(false);
    const newUsername = ref("");
    const newPassword = ref("");
    const showPassword = ref(false);
    const creating = ref(false);

    const canCreate = computed(
      () =>
        newUsername.value.trim().length >= 2 && newPassword.value.length >= 6,
    );

    const reload = async () => {
      loading.value = true;
      try {
        users.value = await fetchAdminUsers();
      } catch (err) {
        Notify.create({
          type: "negative",
          message: err.message || "Nutzer konnten nicht geladen werden",
          timeout: 3500,
        });
      } finally {
        loading.value = false;
      }
    };

    const openCreateDialog = () => {
      newUsername.value = "";
      newPassword.value = "";
      showPassword.value = false;
      showCreate.value = true;
    };

    const submitCreate = async () => {
      if (!canCreate.value) return;
      creating.value = true;
      try {
        await createAdminUser({
          username: newUsername.value.trim(),
          password: newPassword.value,
        });
        Notify.create({
          type: "positive",
          message: `Nutzer „${newUsername.value.trim()}" angelegt`,
          timeout: 2500,
        });
        showCreate.value = false;
        await reload();
      } catch (err) {
        Notify.create({
          type: "negative",
          message: err.message || "Anlegen fehlgeschlagen",
          timeout: 3500,
        });
      } finally {
        creating.value = false;
      }
    };

    const confirmDelete = (user) => {
      Dialog.create({
        title: "Nutzer löschen",
        message: `Soll „${user.username}" wirklich gelöscht werden? Diese Aktion kann nicht rückgängig gemacht werden.`,
        cancel: { label: "Abbrechen", flat: true, color: "grey-7" },
        ok: { label: "Löschen", color: "negative", icon: "delete" },
        persistent: true,
      }).onOk(async () => {
        deletingUser.value = user.username;
        try {
          await deleteAdminUser(user.id);
          Notify.create({
            type: "positive",
            message: `Nutzer „${user.username}" gelöscht`,
            timeout: 2500,
          });
          await reload();
        } catch (err) {
          Notify.create({
            type: "negative",
            message: err.message || "Löschen fehlgeschlagen",
            timeout: 3500,
          });
        } finally {
          deletingUser.value = null;
        }
      });
    };

    // In Bestenliste/Statistik ein-/ausblenden (val = sichtbar).
    const onToggleHidden = async (user, val) => {
      togglingHidden.value = user.id;
      try {
        await setUserHidden(user.id, !val);
        await reload();
      } catch (err) {
        Notify.create({
          type: "negative",
          message: err.message || "Änderung fehlgeschlagen",
          timeout: 3500,
        });
      } finally {
        togglingHidden.value = null;
      }
    };

    // Ownership (= Admin) auf einen anderen Account übertragen. Der aktuelle
    // Admin verliert dabei seine Rechte und landet auf der Startseite.
    const confirmTransfer = (user) => {
      Dialog.create({
        title: "Besitz übertragen",
        message: `Soll „${user.username}" neuer Besitzer (Admin) dieses Servers werden? Du verlierst damit deine Admin-Rechte.`,
        cancel: { label: "Abbrechen", flat: true, color: "grey-7" },
        ok: { label: "Übertragen", color: "negative", icon: "admin_panel_settings" },
        persistent: true,
      }).onOk(async () => {
        transferring.value = user.id;
        try {
          await transferOwner(user.id);
          setIsAdmin(false);
          Notify.create({
            type: "positive",
            message: `„${user.username}" ist jetzt Besitzer des Servers.`,
            timeout: 2500,
          });
          router.replace("/");
        } catch (err) {
          Notify.create({
            type: "negative",
            message: err.message || "Übertragung fehlgeschlagen",
            timeout: 3500,
          });
          transferring.value = null;
        }
      });
    };

    const loadRestricted = async () => {
      restrictedLoading.value = true;
      try {
        restrictedVersions.value = await fetchAdminRestrictedVersions();
      } catch (err) {
        Notify.create({
          type: "negative",
          message: err.message || "Eingeschränkte Versionen konnten nicht geladen werden",
          timeout: 3500,
        });
      } finally {
        restrictedLoading.value = false;
      }
    };

    // Freigabe eines Accounts für eine eingeschränkte Version umschalten.
    const onToggleAccess = async (rv, userId, val) => {
      const nextIds = val
        ? [...new Set([...rv.allowedUserIds, userId])]
        : rv.allowedUserIds.filter((id) => id !== userId);
      savingAccess.value = rv.id;
      try {
        const res = await setRestrictedAccess(rv.id, nextIds);
        rv.allowedUserIds = res.allowedUserIds || nextIds;
      } catch (err) {
        Notify.create({
          type: "negative",
          message: err.message || "Freigabe fehlgeschlagen",
          timeout: 3500,
        });
      } finally {
        savingAccess.value = null;
      }
    };

    // Zurück zur vorherigen Seite (Fallback: Startseite, falls keine Historie).
    const goBack = () => {
      if (window.history.length > 1) router.back();
      else router.push("/");
    };

    onMounted(() => {
      reload();
      loadRestricted();
    });

    return {
      goBack,
      users,
      loading,
      deletingUser,
      togglingHidden,
      transferring,
      restrictedVersions,
      restrictedLoading,
      savingAccess,
      onToggleAccess,
      showCreate,
      newUsername,
      newPassword,
      showPassword,
      creating,
      canCreate,
      openCreateDialog,
      submitCreate,
      confirmDelete,
      onToggleHidden,
      confirmTransfer,
      avatarUrl,
    };
  },
};
</script>

<style scoped>
/* Theme-Hintergrund wie auf allen anderen Seiten. Fehlte hier: Die Seite lag
   auf dem Quasar-Grundschwarz, bei hellen Themes stand die dunkle
   Seitenschrift darauf (Kontrast 1,01:1). */
.admin-page {
  min-height: 100vh;
  background: var(--app-bg, #121212);
}
.admin-shell {
  max-width: var(--content-max-width, 1180px);
  margin: 0 auto;
  padding: 24px 16px 48px;
}
.admin-actions {
  flex-direction: row;
  align-items: center;
  gap: 4px;
}
/* Der Name gibt nach (wird per `ellipsis` gekuerzt), die Abzeichen behalten
   ihre Breite - sonst quetscht der Browser lieber die Abzeichen zusammen. */
.admin-user-line .q-badge {
  flex: 0 0 auto;
}

/* ── Schmale Bildschirme ────────────────────────────────────────────────
   Kopfzeile und Nutzerzeilen brechen um, statt seitlich hinauszulaufen. */
@media (max-width: 599px) {
  .admin-shell {
    padding: 16px 8px 32px;
  }
  .admin-head {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }
  /* `no-wrap` am Titel wuerde den Erklaertext neben dem Zurueck-Pfeil
     zusammenquetschen; auf dem Handy darf er umbrechen. */
  .admin-title {
    flex-wrap: wrap !important;
  }
  .admin-create-btn {
    width: 100%;
  }
  /* Nutzerzeile: Name oben, Aktionen darunter, statt alles nebeneinander. */
  .admin-card :deep(.q-item) {
    flex-wrap: wrap;
  }
  .admin-card :deep(.admin-actions) {
    width: 100%;
    justify-content: flex-end;
    padding-left: 0;
    margin-top: 4px;
  }
}
.admin-card {
  background: var(--surface-bg, rgba(255, 255, 255, 0.04));
  backdrop-filter: blur(var(--surface-blur, 18px)) saturate(150%);
  -webkit-backdrop-filter: blur(var(--surface-blur, 18px)) saturate(150%);
  border: 1px solid var(--surface-border, transparent);
  border-radius: var(--surface-radius, 12px);
  /* Eigene Schriftfarbe: Ohne sie erbte die Karte die Seiten-Schriftfarbe,
     bei hellen Themes dunkel auf der dunklen Fläche (gemessen 1,1 bis 2,4:1). */
  color: var(--app-on-surface);
}
</style>
