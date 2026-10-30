<template>
  <q-page class="leaderboard-page">
    <div class="leaderboard-container">
      <div class="row items-center q-mb-lg head-fab-space">
        <q-btn
          flat
          round
          icon="arrow_back"
          aria-label="Zurück"
          @click="goBack"
        />
        <!-- Seitenüberschrift als h1; Optik bleibt über text-h5. -->
        <h1 class="text-h5 q-ml-sm q-my-none">Rangliste</h1>
        <q-space />
        <q-btn
          flat
          round
          icon="refresh"
          :loading="loading"
          aria-label="Aktualisieren"
          @click="load"
        >
          <q-tooltip>Aktualisieren</q-tooltip>
        </q-btn>
      </div>

      <q-inner-loading :showing="loading">
        <q-spinner size="42px" color="primary" />
      </q-inner-loading>

      <div v-if="error" class="text-negative q-mb-md" role="alert">
        {{ error }}
      </div>

      <q-card v-if="!loading && rows.length" class="lb-card">
        <q-list separator>
          <q-item
            v-for="(row, i) in rows"
            :key="row.username"
            clickable
            @click="openProfile(row.username)"
          >
            <q-item-section avatar class="lb-rank-section">
              <div class="lb-rank" :class="`lb-rank--${i + 1}`">
                <span class="sr-only">Platz </span>{{ i + 1 }}
              </div>
            </q-item-section>
            <q-item-section avatar>
              <q-avatar size="42px">
                <!-- Leeres alt: Der Name steht direkt daneben als Text. -->
                <img
                  v-if="avatarUrl(row.avatar)"
                  :src="avatarUrl(row.avatar)"
                  alt=""
                />
                <q-icon v-else name="person" />
              </q-avatar>
            </q-item-section>
            <q-item-section>
              <!-- Namen duerfen 40 Zeichen lang sein (server/auth.js). Ohne
                   Kuerzung wuchs die Zeile auf drei Zeilen und die Chips
                   rutschten mit nach unten. -->
              <q-item-label class="ellipsis" :title="row.username">
                {{ row.username }}
              </q-item-label>
              <q-item-label caption>{{ row.gamesPlayed }} Spiele</q-item-label>
            </q-item-section>
            <q-item-section side class="lb-stats">
              <div class="row items-center no-wrap" style="gap: 6px">
                <!-- Die Symbole sind für Screenreader stumm (aria-hidden), die
                     unsichtbaren Wörter sagen, wofür die Zahl steht. -->
                <q-chip dense square icon="stars">
                  <span class="sr-only">Punkte: </span>{{ row.totalPoints }}
                </q-chip>
                <q-chip dense square icon="emoji_events">
                  <span class="sr-only">Siege: </span>{{ row.wins }}
                </q-chip>
              </div>
            </q-item-section>
          </q-item>
        </q-list>
      </q-card>

      <div
        v-else-if="!loading && !error"
        class="text-center q-mt-xl"
      >
        Noch keine Statistiken vorhanden. Spielt ein Online-Spiel, um die
        Rangliste zu füllen.
      </div>
    </div>
  </q-page>
</template>

<script>
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { fetchLeaderboard, avatarUrl } from "../utils/profileService";

export default {
  name: "LeaderboardPage",
  setup() {
    const router = useRouter();
    const rows = ref([]);
    const loading = ref(false);
    const error = ref("");

    const load = async () => {
      loading.value = true;
      error.value = "";
      try {
        rows.value = await fetchLeaderboard();
      } catch (e) {
        error.value = e.message || "Rangliste konnte nicht geladen werden.";
      } finally {
        loading.value = false;
      }
    };

    const openProfile = (username) =>
      router.push({ name: "user-stats", params: { username } });
    const goBack = () => router.push("/");

    onMounted(load);

    return { rows, loading, error, load, openProfile, goBack, avatarUrl };
  },
};
</script>

<style scoped>
.leaderboard-page {
  min-height: 100vh;
  background: var(--app-bg, #121212);
}
.leaderboard-container {
  max-width: var(--content-max-width, 1180px);
  margin: 0 auto;
  padding: 24px 16px 48px;
}
.lb-rank-section {
  min-width: auto;
}
.lb-rank {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 0.85rem;
  background: var(--surface-bg-weak, rgba(255, 255, 255, 0.08));
}
/* Podestplätze dezent über die Akzentfarbe hervorheben. */
.lb-rank--1,
.lb-rank--2,
.lb-rank--3 {
  background: var(--app-accent, #1976d2);
  color: var(--app-on-accent, #fff);
}
/* Die Punkte-/Siege-Chips behalten ihre Breite, gekuerzt wird der Name. */
.lb-stats {
  flex-shrink: 0;
}

/* ── Schmale Bildschirme ────────────────────────────────────────────────
   Fuer den Namen blieben von 375px nur rund 50px uebrig (Rang, Avatar-Spalte
   mit Quasars 56px-Mindestmass, Chips). Deshalb die Polster verkleinern und
   die Avatar-Spalte auf ihre echte Breite bringen. */
@media (max-width: 599px) {
  .leaderboard-container {
    padding: 16px 8px 32px;
  }
  .lb-card :deep(.q-item) {
    padding-left: 8px;
    padding-right: 8px;
  }
  .lb-card :deep(.q-item__section--avatar) {
    min-width: 0;
    padding-right: 10px;
  }
  .lb-stats {
    padding-left: 8px;
  }
  .lb-stats :deep(.q-chip) {
    font-size: 0.7rem;
  }
}
</style>
