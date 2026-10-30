<template>
  <!-- aria-labelledby landet bei QDialog direkt auf dem role="dialog"-Element
       und gibt dem Dialog den sichtbaren Titel als zugänglichen Namen. -->
  <q-dialog
    :model-value="modelValue"
    :aria-labelledby="titleId"
    @update:model-value="(v) => $emit('update:modelValue', v)"
  >
    <q-card class="share-card">
      <q-card-section class="row items-center q-pb-none">
        <q-icon name="group_add" size="22px" class="q-mr-sm" />
        <div :id="titleId" class="text-h6">
          {{ mode === "create" ? "An Accounts freigeben" : "Freigaben verwalten" }}
        </div>
        <q-space />
        <q-btn
          v-close-popup
          icon="close"
          flat
          round
          dense
          aria-label="Schließen"
        />
      </q-card-section>

      <q-card-section>
        <div class="text-body2 q-mb-sm">
          <strong>{{ versionLabel }}</strong>
        </div>
        <div
          v-if="mode === 'create'"
          class="text-caption text-muted q-mb-md"
        >
          Beim Freigeben wird diese Version zu einer eingeschränkten Version und
          liegt danach nur noch auf dem Server. Die berechtigten Accounts
          bekommen sie automatisch; beim Abmelden verschwindet sie wieder von
          ihren Geräten.
        </div>

        <div v-if="loading" class="text-center q-py-md">
          <q-spinner
            color="primary"
            size="28px"
            role="status"
            aria-label="Accounts werden geladen"
          />
        </div>
        <template v-else>
          <div
            v-if="loadFailed"
            class="text-caption text-muted q-py-md"
            role="status"
          >
            Accounts konnten nicht geladen werden. Zum erneuten Versuch den
            Dialog schließen und wieder öffnen.
          </div>
          <div
            v-else-if="!users.length"
            class="text-caption text-muted q-py-md"
          >
            Keine weiteren Accounts vorhanden.
          </div>
          <q-list v-else dense class="account-list">
            <!-- Der Ersteller bleibt serverseitig immer freigegeben. Bearbeitet
                 ein Admin eine fremde Version, steht der Ersteller deshalb
                 angehakt und gesperrt in der Liste statt wählbar. -->
            <q-item
              v-for="u in users"
              :key="u.id"
              tag="label"
              :clickable="u.id !== creatorId"
            >
              <q-item-section avatar>
                <q-checkbox
                  v-model="selected"
                  :val="u.id"
                  color="primary"
                  :disable="u.id === creatorId"
                />
              </q-item-section>
              <q-item-section>
                <q-item-label class="ellipsis" :title="u.username">
                  {{ u.username }}
                </q-item-label>
                <q-item-label v-if="u.id === creatorId" caption class="text-muted">
                  Ersteller, immer freigegeben
                </q-item-label>
                <q-item-label v-else-if="u.id === myId" caption class="text-muted">
                  Du
                </q-item-label>
              </q-item-section>
            </q-item>
          </q-list>
        </template>
      </q-card-section>

      <q-card-actions align="right" class="q-pa-md">
        <q-btn v-close-popup flat label="Abbrechen" />
        <!-- Gesperrt, solange die Accounts laden oder das Laden scheiterte:
             Sonst ginge eine leere Auswahl an den Server und nähme allen
             bisherigen Accounts die Freigabe. -->
        <q-btn
          color="primary"
          :icon="mode === 'create' ? 'group_add' : 'save'"
          :label="mode === 'create' ? 'Freigeben' : 'Speichern'"
          :loading="saving"
          :disable="loading || loadFailed"
          @click="onConfirm"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script>
import { ref, watch, useId } from "vue";
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
    // Eindeutige ID für den Dialogtitel (aria-labelledby).
    const titleId = `share-version-title-${useId()}`;
    const { shareCustomVersion, setRestrictedAccess } = useVersions();
    const users = ref([]);
    const selected = ref([]);
    const loading = ref(false);
    const loadFailed = ref(false);
    const saving = ref(false);
    const myId = ref(null);
    // Ersteller der Version (beim Teilen man selbst, bei Seeds null).
    const creatorId = ref(null);

    watch(
      () => props.modelValue,
      async (open) => {
        if (!open) return;
        selected.value = [];
        users.value = [];
        loadFailed.value = false;
        loading.value = true;
        myId.value = getUserId();
        const rv =
          props.mode === "access"
            ? getRestrictedVersion(props.versionValue)
            : null;
        creatorId.value =
          props.mode === "create" ? myId.value : rv?.creatorId || null;
        try {
          const list = await fetchAssignableUsers();
          // Sich selbst nur ausblenden, wenn man der Ersteller ist: Den hält
          // der Server ohnehin in der Liste. Ein Admin, der eine fremde Version
          // verwaltet, ist dagegen ein gewöhnlicher Eintrag; ihn auszufiltern
          // hieße, sich beim Speichern selbst die Freigabe zu entziehen.
          const hideSelf = !!myId.value && creatorId.value === myId.value;
          users.value = hideSelf
            ? list.filter((u) => u.id !== myId.value)
            : list;
          if (props.mode === "access") {
            const allowed = Array.isArray(rv?.allowedUserIds)
              ? rv.allowedUserIds
              : [];
            selected.value = hideSelf
              ? allowed.filter((id) => id !== myId.value)
              : [...allowed];
            // Der Ersteller ist immer freigegeben, auch wenn die Liste ihn
            // einmal nicht führt.
            if (
              !hideSelf &&
              creatorId.value &&
              !selected.value.includes(creatorId.value)
            ) {
              selected.value.push(creatorId.value);
            }
          }
        } catch (e) {
          loadFailed.value = true;
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
      if (loading.value || loadFailed.value) return;
      saving.value = true;
      try {
        if (props.mode === "create") {
          // Der Server kann der geteilten Version einen neuen value geben.
          const sharedValue = await shareCustomVersion(
            props.versionValue,
            selected.value,
          );
          Notify.create({
            type: "positive",
            message: "Version freigegeben.",
            timeout: 2000,
          });
          emit("shared", { mode: props.mode, value: sharedValue });
        } else {
          await setRestrictedAccess(props.versionValue, selected.value);
          Notify.create({
            type: "positive",
            message: "Freigaben gespeichert.",
            timeout: 2000,
          });
          emit("shared", { mode: props.mode, value: props.versionValue });
        }
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

    return {
      titleId,
      users,
      selected,
      loading,
      loadFailed,
      saving,
      myId,
      creatorId,
      onConfirm,
    };
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
