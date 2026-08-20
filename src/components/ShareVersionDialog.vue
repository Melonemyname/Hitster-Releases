<template>
  <q-dialog
    :model-value="modelValue"
    @update:model-value="(v) => $emit('update:modelValue', v)"
  >
    <q-card class="share-card">
      <q-card-section class="row items-center q-pb-none">
        <q-icon name="group_add" size="22px" class="q-mr-sm" />
        <div class="text-h6">
          {{ mode === "create" ? "An Accounts freigeben" : "Freigaben verwalten" }}
        </div>
        <q-space />
        <q-btn v-close-popup icon="close" flat round dense />
      </q-card-section>

      <q-card-section>
        <div class="text-body2 q-mb-sm">
          <strong>{{ versionLabel }}</strong>
        </div>
        <div
          v-if="mode === 'create'"
          class="text-caption q-mb-md"
          style="opacity: 0.8"
        >
          Beim Freigeben wird diese Version zu einer eingeschränkten Version und
          liegt danach nur noch auf dem Server. Die berechtigten Accounts
          bekommen sie automatisch; beim Abmelden verschwindet sie wieder von
          ihren Geräten.
        </div>

        <div v-if="loading" class="text-center q-py-md">
          <q-spinner color="primary" size="28px" />
        </div>
        <template v-else>
          <div
            v-if="!users.length"
            class="text-caption q-py-md"
            style="opacity: 0.7"
          >
            Keine weiteren Accounts vorhanden.
          </div>
          <q-list v-else dense class="account-list">
            <q-item
              v-for="u in users"
              :key="u.id"
              tag="label"
              clickable
            >
              <q-item-section avatar>
                <q-checkbox v-model="selected" :val="u.id" color="primary" />
              </q-item-section>
              <q-item-section>{{ u.username }}</q-item-section>
            </q-item>
          </q-list>
        </template>
      </q-card-section>

      <q-card-actions align="right" class="q-pa-md">
        <q-btn v-close-popup flat label="Abbrechen" color="grey-7" />
        <q-btn
          color="primary"
          :icon="mode === 'create' ? 'group_add' : 'save'"
          :label="mode === 'create' ? 'Freigeben' : 'Speichern'"
          :loading="saving"
          @click="onConfirm"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script>
import { ref, watch } from "vue";
import { Notify } from "quasar";
import { useVersions } from "../composables/useVersions";
import { fetchAssignableUsers } from "../utils/restrictedVersionsService";
import { getRestrictedVersion } from "../utils/restrictedVersionsStore";
import { getUserId } from "../utils/authService";

export default {
  name: "ShareVersionDialog",
  props: {
    modelValue: { type: Boolean, default: false },
    versionValue: { type: String, default: "" },
    versionLabel: { type: String, default: "" },
    // 'create' = Custom-Version teilen (wird Restricted); 'access' = Freigaben
    // einer bestehenden Restricted-Version ändern.
    mode: { type: String, default: "create" },
  },
  emits: ["update:modelValue", "shared"],
  setup(props, { emit }) {
    const { shareCustomVersion, setRestrictedAccess } = useVersions();
    const users = ref([]);
    const selected = ref([]);
    const loading = ref(false);
    const saving = ref(false);

    watch(
      () => props.modelValue,
      async (open) => {
        if (!open) return;
        selected.value = [];
        loading.value = true;
        try {
          const list = await fetchAssignableUsers();
          const myId = getUserId();
          // Sich selbst ausblenden: der Ersteller bekommt seine Version ohnehin.
          users.value = list.filter((u) => u.id !== myId);
          if (props.mode === "access") {
            const rv = getRestrictedVersion(props.versionValue);
            const allowed = Array.isArray(rv?.allowedUserIds)
              ? rv.allowedUserIds
              : [];
            selected.value = allowed.filter((id) => id !== myId);
          }
        } catch (e) {
          Notify.create({
            type: "negative",
            message: `Accounts konnten nicht geladen werden: ${e.message}`,
            timeout: 3500,
          });
        } finally {
          loading.value = false;
        }
      },
      { immediate: true },
    );

    const onConfirm = async () => {
      saving.value = true;
      try {
        if (props.mode === "create") {
          await shareCustomVersion(props.versionValue, selected.value);
          Notify.create({
            type: "positive",
            message: "Version freigegeben.",
            timeout: 2000,
          });
        } else {
          await setRestrictedAccess(props.versionValue, selected.value);
          Notify.create({
            type: "positive",
            message: "Freigaben gespeichert.",
            timeout: 2000,
          });
        }
        emit("shared", { mode: props.mode });
        emit("update:modelValue", false);
      } catch (e) {
        Notify.create({
          type: "negative",
          message: `Fehlgeschlagen: ${e.message}`,
          timeout: 3500,
        });
      } finally {
        saving.value = false;
      }
    };

    return { users, selected, loading, saving, onConfirm };
  },
};
</script>

<style scoped>
.share-card {
  width: 460px;
  max-width: 94vw;
}
.account-list {
  max-height: 40vh;
  overflow-y: auto;
}
</style>
