<template>
  <q-page class="leaderboard-page">
    <div class="leaderboard-container">
      <div class="row items-center q-mb-lg">
        <q-btn flat round icon="arrow_back" @click="goBack" />
        <div class="text-h5 q-ml-sm">Rangliste</div>
        <q-space />
        <q-btn flat round icon="refresh" :loading="loading" @click="load">
          <q-tooltip>Aktualisieren</q-tooltip>
        </q-btn>
      </div>

      <q-inner-loading :showing="loading">
        <q-spinner size="42px" color="primary" />
      </q-inner-loading>

      <div v-if="error" class="text-negative q-mb-md">{{ error }}</div>

      <q-card v-if="!loading && rows.length" class="lb-card">
        <q-list separator>
          <q-item
            v-for="(row, i) in rows"
            :key="row.username"
            clickable
            @click="openProfile(row.username)"
          >
            <q-item-section avatar class="lb-rank-section">
              <div class="lb-rank" :class="`lb-rank--${i + 1}`">{{ i + 1 }}</div>
            </q-item-section>
            <q-item-section avatar>
              <q-avatar size="42px">
                <img
                  v-if="avatarUrl(row.avatar)"
                  :src="avatarUrl(row.avatar)"
                  :alt="row.username"
                />
                <q-icon v-else name="person" />
              </q-avatar>
            </q-item-section>
            <q-item-section>
              <q-item-label>{{ row.username }}</q-item-label>
              <q-item-label caption>{{ row.gamesPlayed }} Spiele</q-item-label>
            </q-item-section>
            <q-item-section side>
              <div class="row items-center no-wrap" style="gap: 6px">
                <q-chip dense square icon="stars">{{ row.totalPoints }}</q-chip>
                <q-chip dense square icon="emoji_events">{{ row.wins }}</q-chip>
              </div>
            </q-item-section>
          </q-item>
        </q-list>
      </q-card>

      <div
        v-else-if="!loading && !error"
        class="text-center q-mt-xl"
        style="opacity: 0.7"
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
</style>
