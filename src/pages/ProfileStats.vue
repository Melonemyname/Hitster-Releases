<template>
  <q-page class="stats-page">
    <div class="stats-container">
      <div class="row items-center q-mb-lg">
        <q-btn flat round icon="arrow_back" @click="goBack" />
        <div class="text-h5 q-ml-sm">Profil</div>
        <q-space />
        <q-btn flat round icon="refresh" :loading="loading" @click="load">
          <q-tooltip>Aktualisieren</q-tooltip>
        </q-btn>
      </div>

      <q-inner-loading :showing="loading">
        <q-spinner size="42px" color="primary" />
      </q-inner-loading>

      <div v-if="error" class="text-negative q-mb-md">{{ error }}</div>

      <template v-if="!loading && data">
        <q-card class="stats-card q-mb-md">
          <q-card-section class="row items-center no-wrap">
            <q-avatar size="72px" color="grey-9" text-color="white">
              <img
                v-if="avatarUrl(data.avatar)"
                :src="avatarUrl(data.avatar)"
                :alt="data.username"
              />
              <q-icon v-else name="person" size="40px" />
            </q-avatar>
            <div class="text-h5 q-ml-md">{{ data.username }}</div>
          </q-card-section>
        </q-card>

        <div class="stats-grid q-mb-md">
          <div class="stat-tile">
            <div class="stat-tile__value">{{ s.totalPoints }}</div>
            <div class="stat-tile__label">Punkte gesamt</div>
            <div class="stat-tile__sub">
              {{ s.pointsSolo }} allein · {{ s.pointsTeam }} im Team
            </div>
          </div>
          <div class="stat-tile">
            <div class="stat-tile__value">{{ s.wins }}</div>
            <div class="stat-tile__label">Siege</div>
            <div class="stat-tile__sub">
              {{ s.winsSolo }} allein · {{ s.winsTeam }} im Team
            </div>
          </div>
          <div class="stat-tile">
            <div class="stat-tile__value">{{ s.gamesPlayed }}</div>
            <div class="stat-tile__label">Spiele</div>
          </div>
        </div>

        <q-card class="stats-card">
          <q-list separator>
            <q-item>
              <q-item-section>
                <q-item-label>Meistgespielter Modus</q-item-label>
              </q-item-section>
              <q-item-section side>
                <q-item-label class="stats-value">
                  {{ modeLabel(mostPlayedMode.key) }}
                </q-item-label>
              </q-item-section>
            </q-item>
            <q-item>
              <q-item-section>
                <q-item-label>Meistgespielte Version</q-item-label>
              </q-item-section>
              <q-item-section side>
                <q-item-label class="stats-value">
                  {{ versionLabel(mostPlayedVersion.key) }}
                </q-item-label>
              </q-item-section>
            </q-item>
            <q-item>
              <q-item-section>
                <q-item-label>Modus mit meisten Punkten</q-item-label>
              </q-item-section>
              <q-item-section side>
                <q-item-label class="stats-value">
                  {{ modeLabel(modeMostPoints.key) }}
                </q-item-label>
              </q-item-section>
            </q-item>
            <q-item>
              <q-item-section>
                <q-item-label>Version mit meisten Punkten</q-item-label>
              </q-item-section>
              <q-item-section side>
                <q-item-label class="stats-value">
                  {{ versionLabel(versionMostPoints.key) }}
                </q-item-label>
              </q-item-section>
            </q-item>
            <q-item>
              <q-item-section>
                <q-item-label>Modus mit meisten Siegen</q-item-label>
              </q-item-section>
              <q-item-section side>
                <q-item-label class="stats-value">
                  {{ modeLabel(modeMostWins.key) }}
                </q-item-label>
              </q-item-section>
            </q-item>
            <q-item>
              <q-item-section>
                <q-item-label>Version mit meisten Siegen</q-item-label>
              </q-item-section>
              <q-item-section side>
                <q-item-label class="stats-value">
                  {{ versionLabel(versionMostWins.key) }}
                </q-item-label>
              </q-item-section>
            </q-item>
          </q-list>
        </q-card>
      </template>
    </div>
  </q-page>
</template>

<script>
import { ref, computed, watch, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { fetchPublicStats, avatarUrl } from "../utils/profileService";
import { getStandardVersions } from "../utils/songDataProvider";
import { useVersions } from "../composables/useVersions";

const MODE_LABELS = {
  normal: "Normal",
  film: "Film/Serie",
  battle: "Battle",
  bingo: "Bingo",
};

export default {
  name: "ProfileStatsPage",
  setup() {
    const route = useRoute();
    const router = useRouter();
    const data = ref(null);
    const loading = ref(false);
    const error = ref("");

    // Namen aller bekannten Versionen. `getStandardVersions` liefert den
    // gebündelten Katalog ungefiltert (auch gerätelokal ausgeblendete),
    // `allVersions` steuert die eigenen und die freigegebenen bei. Ohne
    // letztere blieben ausgerechnet die selbst importierten namenlos.
    const { allVersions } = useVersions();
    const versionLabelMap = computed(() => {
      const map = {};
      getStandardVersions().forEach((v) => {
        map[v.value] = v.label;
      });
      allVersions.value.forEach((v) => {
        map[v.value] = v.label;
      });
      return map;
    });

    const load = async () => {
      loading.value = true;
      error.value = "";
      try {
        data.value = await fetchPublicStats(route.params.username);
      } catch (e) {
        error.value = e.message || "Profil konnte nicht geladen werden.";
      } finally {
        loading.value = false;
      }
    };

    const s = computed(() => data.value?.stats || {});

    // Ermittelt den Key mit dem höchsten Wert eines Feldes (points|wins|games).
    // `keep` darf Kandidaten aussortieren, bevor der Spitzenreiter feststeht.
    // Bei Gleichstand entscheidet das Los: Ein Mischpool zählt für jede seiner
    // Versionen gleich hoch, sonst stünde dort immer dieselbe.
    const topOf = (bucket, field, keep = () => true) => {
      const obj = bucket || {};
      let best = 0;
      let bestKeys = [];
      for (const key of Object.keys(obj)) {
        if (!keep(key)) continue;
        const n = Number(obj[key]?.[field] || 0);
        if (n > best) {
          best = n;
          bestKeys = [key];
        } else if (n === best && n > 0) {
          bestKeys.push(key);
        }
      }
      if (bestKeys.length === 0) return { key: null, n: 0 };
      const key = bestKeys[Math.floor(Math.random() * bestKeys.length)];
      return { key, n: best };
    };

    // Versionen, die es nicht mehr gibt (gelöscht, Freigabe entzogen), fallen
    // raus. Sonst stand dort die interne Kennung „custom-1754…" statt eines
    // Namens. Bleibt nichts übrig, zeigt die Zeile einen Strich.
    const isKnownVersion = (key) => !!versionLabelMap.value[key];

    const mostPlayedMode = computed(() => topOf(s.value.byMode, "games"));
    const mostPlayedVersion = computed(() =>
      topOf(s.value.byVersion, "games", isKnownVersion),
    );
    const modeMostPoints = computed(() => topOf(s.value.byMode, "points"));
    const versionMostPoints = computed(() =>
      topOf(s.value.byVersion, "points", isKnownVersion),
    );
    const modeMostWins = computed(() => topOf(s.value.byMode, "wins"));
    const versionMostWins = computed(() =>
      topOf(s.value.byVersion, "wins", isKnownVersion),
    );

    const modeLabel = (key) => (key ? MODE_LABELS[key] || key : "—");
    const versionLabel = (key) => versionLabelMap.value[key] || "—";

    const goBack = () => router.back();

    watch(() => route.params.username, load);
    onMounted(load);

    return {
      data,
      loading,
      error,
      load,
      s,
      mostPlayedMode,
      mostPlayedVersion,
      modeMostPoints,
      versionMostPoints,
      modeMostWins,
      versionMostWins,
      modeLabel,
      versionLabel,
      avatarUrl,
      goBack,
    };
  },
};
</script>

<style scoped>
.stats-page {
  min-height: 100vh;
  background: var(--app-bg, #121212);
}
.stats-container {
  max-width: var(--content-max-width, 1180px);
  margin: 0 auto;
  padding: 24px 16px 48px;
}
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
}
.stat-tile {
  background: var(--surface-bg, rgba(255, 255, 255, 0.04));
  backdrop-filter: blur(var(--surface-blur, 18px)) saturate(150%);
  -webkit-backdrop-filter: blur(var(--surface-blur, 18px)) saturate(150%);
  border: 1px solid var(--surface-border, transparent);
  border-radius: var(--surface-radius, 12px);
  padding: 16px;
  text-align: center;
}
.stat-tile__value {
  font-size: 1.9rem;
  font-weight: 700;
  line-height: 1.1;
  color: var(--app-accent, #1976d2);
}
.stat-tile__label {
  margin-top: 4px;
  font-size: 0.9rem;
  opacity: 0.9;
}
.stat-tile__sub {
  margin-top: 2px;
  font-size: 0.78rem;
  opacity: 0.7;
}
.stats-value {
  font-weight: 600;
  text-align: right;
}
</style>
