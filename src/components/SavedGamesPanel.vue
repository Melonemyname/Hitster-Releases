<template>
  <section class="saved-games-panel" aria-labelledby="saved-games-title">
    <h2 id="saved-games-title" class="saved-games-title" tabindex="-1">Spielstand laden</h2>
    <p class="saved-games-subtitle">
      {{
        target === "online"
          ? "Wähle einen Spielstand, um damit einen Raum zu erstellen."
          : "Wähle einen Spielstand, um das lokale Spiel fortzusetzen."
      }}
    </p>

    <div v-if="entries.length === 0" class="saved-games-empty">
      Noch keine Spielstände gespeichert. Ein Spielstand entsteht, wenn du im
      Spiel speicherst. Eine gespeicherte Datei kannst du unten auswählen.
    </div>

    <!-- Als Liste ausgezeichnet, damit Screenreader die Anzahl ansagen. -->
    <ul v-else class="saved-games-list">
      <li v-for="entry in entries" :key="entry.id">
        <q-card class="saved-game-card">
          <q-card-section class="q-pb-sm">
            <div class="row items-center no-wrap q-gutter-x-sm">
              <div class="saved-game-date">
                {{ formatDate(entry.savedAt) }}
              </div>
              <q-space />
              <span class="saved-game-tag">
                <q-icon
                  :name="entry.source === 'online' ? 'public' : 'computer'"
                  size="14px"
                  aria-hidden="true"
                />
                {{ entry.source === "online" ? "online" : "lokal" }}
              </span>
              <span v-if="modeLabel(entry.summary.mode)" class="saved-game-tag">
                {{ modeLabel(entry.summary.mode) }}
              </span>
            </div>
          </q-card-section>

          <q-card-section class="q-py-none">
            <div class="text-caption text-muted">
              {{ entry.summary.mode === "bingo" ? "Teams" : "Spieler" }}
            </div>
            <ul
              v-if="entry.summary.players && entry.summary.players.length"
              class="saved-game-players"
            >
              <li
                v-for="(player, idx) in entry.summary.players"
                :key="idx"
                class="saved-game-player"
              >
                <span class="ellipsis" :title="player.name">
                  {{ player.name || `Spieler ${idx + 1}` }}
                </span>
                <span class="saved-game-player-stats">
                  <template v-if="player.points !== null && player.points !== undefined">
                    {{ player.points }}
                    {{ player.points === 1 ? "Punkt" : "Punkte" }}
                  </template>
                  <template v-if="player.cards !== null && player.cards !== undefined">
                    <template
                      v-if="player.points !== null && player.points !== undefined"
                    >
                      ·
                    </template>
                    {{ player.cards }}
                    {{ player.cards === 1 ? "Karte" : "Karten" }}
                  </template>
                </span>
              </li>
            </ul>
            <div v-else class="text-caption text-muted">Keine Angaben</div>

            <div
              v-if="entry.summary.versions && entry.summary.versions.length"
              class="active-pools-row q-mt-sm"
            >
              <div
                v-for="pool in resolveVersions(entry.summary.versions)"
                :key="pool.value"
                class="pool-chip"
              >
                <!-- Dekorativ: Der Name steht direkt daneben als Text. -->
                <img v-if="pool.icon" :src="pool.icon" alt="" class="pool-chip-icon" />
                <q-icon v-else name="help_outline" size="20px" aria-hidden="true" />
                <span class="pool-chip-name">{{ pool.label }}</span>
              </div>
            </div>

            <div
              v-if="entry.summary.playedCount !== null && entry.summary.playedCount !== undefined"
              class="text-caption text-muted q-mt-xs"
            >
              {{ entry.summary.playedCount }}
              {{ entry.summary.playedCount === 1 ? "Song" : "Songs" }} gespielt
            </div>
          </q-card-section>

          <q-card-actions align="right" class="q-pa-md q-gutter-sm">
            <q-btn
              color="negative"
              icon="delete"
              label="Löschen"
              :aria-label="`Spielstand vom ${formatDate(entry.savedAt)} löschen`"
              @click="confirmDelete(entry)"
            />
            <q-btn
              color="primary"
              icon="play_arrow"
              label="Fortsetzen"
              :disable="!canContinue(entry)"
              :aria-label="`Spielstand vom ${formatDate(entry.savedAt)} fortsetzen`"
              @click="continueEntry(entry)"
            />
          </q-card-actions>
          <div
            v-if="!canContinue(entry)"
            class="text-caption text-muted q-px-md q-pb-md"
          >
            Bingo gibt es nur online.
          </div>
        </q-card>
      </li>
    </ul>

    <div class="saved-games-actions">
      <q-btn
        icon="upload_file"
        label="Spielstand-Datei auswählen"
        class="full-width"
        @click="fileInput && fileInput.click()"
      />
      <q-btn
        icon="arrow_back"
        label="Zurück"
        class="full-width btn-unselected"
        @click="$emit('back')"
      />
    </div>

    <input
      ref="fileInput"
      type="file"
      accept=".json,application/json"
      class="hidden"
      aria-hidden="true"
      tabindex="-1"
      @change="onFileSelected"
    />
  </section>
</template>

<script>
import { ref } from "vue";
import { useQuasar } from "quasar";
import { useVersions } from "../composables/useVersions";
import {
  listSavedGames,
  getSavedGame,
  deleteSavedGame,
  addSavedGame,
  readSnapshotFile,
} from "../utils/savedGames";

const MODE_LABELS = {
  normal: "Normal",
  film: "Film / Serie",
  battle: "Battle",
  bingo: "Bingo",
};

export default {
  name: "SavedGamesPanel",
  props: {
    // "local": Fortsetzen startet das lokale Spiel,
    // "online": Fortsetzen erstellt einen Raum mit dem Stand.
    target: { type: String, default: "local" },
  },
  emits: ["load", "back"],
  setup(props, { emit }) {
    const $q = useQuasar();
    const { allVersions } = useVersions();
    const entries = ref([]);
    const fileInput = ref(null);

    const refresh = () => {
      try {
        entries.value = listSavedGames() || [];
      } catch {
        entries.value = [];
      }
    };
    refresh();

    const formatDate = (value) => {
      const d = value ? new Date(value) : null;
      if (!d || Number.isNaN(d.getTime())) return "Unbekanntes Datum";
      return d.toLocaleString("de-DE", {
        dateStyle: "medium",
        timeStyle: "short",
      });
    };

    const modeLabel = (mode) => (mode ? MODE_LABELS[mode] || mode : "");

    // Namen und Bilder wie in der Lobby aus der zentralen Versionsliste.
    // Eine inzwischen gelöschte Version bleibt sichtbar, damit klar ist,
    // dass der Stand auf etwas zeigt, das es nicht mehr gibt.
    const resolveVersions = (values) =>
      (values || []).map((value) => {
        const found = allVersions.value.find((v) => v.value === value);
        return found
          ? { value, label: found.label, icon: found.icon }
          : { value, label: "Nicht mehr verfügbar", icon: null };
      });

    // Lokal gibt es keinen Bingo-Modus, ein solcher Stand ließe sich dort
    // nicht sinnvoll fortsetzen.
    const canContinue = (entry) =>
      !(props.target === "local" && entry.summary?.mode === "bingo");

    const continueEntry = (entry) => {
      const snapshot = getSavedGame(entry.id);
      if (!snapshot) {
        $q.notify({
          type: "negative",
          message: "Dieser Spielstand ließ sich nicht mehr lesen.",
        });
        refresh();
        return;
      }
      emit("load", snapshot);
    };

    const confirmDelete = (entry) => {
      $q.dialog({
        title: "Spielstand löschen?",
        message: `Der Spielstand vom ${formatDate(entry.savedAt)} wird von diesem Gerät entfernt.`,
        cancel: { label: "Abbrechen", flat: true },
        ok: { label: "Löschen", color: "negative" },
        persistent: true,
      }).onOk(() => {
        deleteSavedGame(entry.id);
        refresh();
      });
    };

    const onFileSelected = async (event) => {
      try {
        const file = event?.target?.files?.[0];
        if (!file) return;
        const snapshot = await readSnapshotFile(file);
        // In die Liste übernehmen, damit der Stand beim nächsten Mal ohne
        // Datei bereitsteht. Scheitert das (Speicher voll), lädt er trotzdem.
        try {
          addSavedGame(snapshot, { source: props.target });
        } catch {
          /* nur die Liste fehlt, das Laden geht weiter */
        }
        emit("load", snapshot);
      } catch (error) {
        $q.notify({
          type: "negative",
          message: `Fehler beim Laden der Datei: ${error.message}`,
          timeout: 3500,
        });
      } finally {
        if (event?.target) event.target.value = "";
      }
    };

    return {
      entries,
      fileInput,
      formatDate,
      modeLabel,
      resolveVersions,
      canContinue,
      continueEntry,
      confirmDelete,
      onFileSelected,
    };
  },
};
</script>

<style scoped>
.saved-games-panel {
  width: 100%;
}
.saved-games-title {
  margin: 0 0 4px;
  font-size: 1.4rem;
  line-height: 1.3;
  font-weight: 500;
  text-align: center;
}
.saved-games-subtitle {
  margin: 0 0 16px;
  text-align: center;
}
/* Der Hinweis liegt auf einer Fläche statt direkt auf dem Hintergrund,
   damit er in jedem Theme lesbar bleibt. */
.saved-games-empty {
  margin-bottom: 16px;
  padding: 12px 14px;
  background: var(--surface-bg);
  border: 1px solid var(--surface-border);
  border-radius: var(--surface-radius);
  color: var(--app-on-surface);
  text-shadow: none;
}
.saved-games-list {
  list-style: none;
  margin: 0 0 16px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.saved-game-date {
  font-weight: 500;
}
/* Kennzeichen „lokal/online" und Modus: Akzentfläche mit passender
   Akzentschrift, wie bei den gefüllten Knöpfen. */
.saved-game-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: none;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 0.75rem;
  background: var(--app-accent);
  color: var(--app-on-accent);
}
.saved-game-players {
  list-style: none;
  margin: 2px 0 0;
  padding: 0;
}
.saved-game-player {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}
.saved-game-player .ellipsis {
  flex: 1 1 auto;
  min-width: 0;
}
.saved-game-player-stats {
  flex: none;
  color: var(--app-on-surface-muted);
  font-size: 0.85rem;
}
.saved-games-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
</style>
