<template>
  <q-page class="index-page">
    <!-- Ohne Einstiegsparameter zeigt "/" das Hauptmenü. Die Neustart-Dialoge
         im Spiel springen dagegen mit Spielern, Modus usw. in der Adresse
         direkt in die Einrichtung, dort an den passenden Schritt. -->
    <MainMenu v-if="!isSetupView" />

    <div v-else class="start-shell">
      <!-- Kein Logo in der Einrichtung (nur auf der Startebene des
           Hauptmenüs); die Überschrift bleibt für Screenreader. -->
      <h1 class="sr-only">Lokales Spiel einrichten</h1>

      <q-card class="game-start-card">
        <q-card-section>
          <q-stepper
            ref="stepper"
            v-model="step"
            class="start-stepper"
            color="primary"
            animated
          >
            <q-step
              name="mode"
              title="Versionen"
              icon="style"
              :done="stepIndex > 0"
            >
              <div class="text-subtitle1 q-mb-sm">Spielmodus</div>
              <q-btn-toggle
                v-model="gameMode"
                class="q-mb-xs"
                spread
                no-caps
                :options="[
                  { label: 'Normal', value: 'normal' },
                  { label: 'Film / Serie', value: 'film' },
                  { label: 'Battle', value: 'battle' },
                ]"
              />
              <div
                v-if="gameMode === 'film'"
                class="text-caption text-muted q-mb-md"
              >
                Film/Serie-Modus: zusätzliches Ratefeld und eigenes
                Punktesystem. Spielbar sind nur Versionen mit Film- oder
                Serienangaben.
              </div>
              <div
                v-if="gameMode === 'battle'"
                class="text-caption text-muted q-mb-md"
              >
                Am besten mit den drei „Battle of the Generations"-Versionen
                spielen (die Empfehlung passt naturgemäß für bis zu 3 Spieler).
              </div>

              <template v-if="gameMode !== 'battle'">
                <div class="text-subtitle1 q-mb-sm">
                  Mit welchen Versionen soll gespielt werden?
                </div>
                <!-- Auswahl auf einen Blick wie in der Online-Lobby, damit man
                     bei vielen Versionen nicht das ganze Raster absuchen muss. -->
                <div class="selected-pools-box">
                  <div class="text-subtitle2 q-mb-xs">
                    Ausgewählte Versionen ({{ selectedSongPools.length }})
                  </div>
                  <div
                    v-if="selectedSongPoolOptions.length"
                    class="active-pools-row"
                  >
                    <div
                      v-for="pool in selectedSongPoolOptions"
                      :key="pool.value"
                      class="pool-chip"
                    >
                      <!-- Dekorativ: Der Name steht direkt daneben als Text. -->
                      <img :src="pool.icon" alt="" class="pool-chip-icon" />
                      <span class="pool-chip-name">{{ pool.label }}</span>
                    </div>
                  </div>
                  <div v-else class="text-caption text-muted">
                    Keine Version ausgewählt
                  </div>
                </div>
                <!-- Weiter zusaetzlich oben, damit man bei vielen Versionen nicht
                   erst bis ans Ende scrollen muss. -->
                <div class="row items-center wizard-top-nav">
                  <q-btn
                    flat
                    color="primary"
                    label="Zurück"
                    @click="leaveSetup"
                  />
                  <q-space />
                  <q-btn
                    color="primary"
                    label="Weiter"
                    :disable="!hasSelectedSongPools"
                    @click="goToStep('count')"
                  />
                </div>
                <div v-if="gameMode === 'film' && modeFilteredVersions.length === 0" class="text-caption text-muted q-mb-md">
                  Noch keine Film-/Serien-Version vorhanden. Erstelle eine
                  Version mit aktivem „Film-/Serien"-Schalter und trage die Filme
                  ein.
                </div>
                <div class="version-grid q-mb-md">
                  <button
                    v-for="option in modeFilteredVersions"
                    :key="option.value"
                    type="button"
                    class="version-card-btn"
                    :class="{
                      selected: selectedSongPools.includes(option.value),
                      disabled: isFilmBlocked(option),
                    }"
                    :disabled="isFilmBlocked(option)"
                    :aria-pressed="
                      selectedSongPools.includes(option.value) ? 'true' : 'false'
                    "
                    @click="toggleSongPool(option.value)"
                  >
                    <q-card class="timeline-look-card">
                      <q-card-section class="timeline-look-content">
                        <!-- Leeres alt: Der Name steht darunter als Text und
                             gibt dem Knopf seinen Namen. -->
                        <img class="version-icon" :src="option.icon" alt="" />
                      </q-card-section>
                    </q-card>
                    <div class="version-name" :title="option.label">
                      {{ option.label }}
                      <span
                        v-if="isFilmBlocked(option)"
                        class="text-caption"
                        style="opacity: 0.7; font-weight: 400"
                      >
                        · keine Filme eingetragen
                      </span>
                    </div>
                  </button>
                </div>
              </template>

              <!-- Im Battle-Modus gibt es kein Grid in Schritt 1 (Auswahl
                   passiert spaeter pro Spieler); Weiter-Button steht am
                   Anfang, damit er ohne Scrollen erreichbar ist. -->
              <div
                v-if="gameMode === 'battle'"
                class="row items-center wizard-top-nav"
              >
                <q-btn
                  flat
                  color="primary"
                  label="Zurück"
                  @click="leaveSetup"
                />
                <q-space />
                <q-btn
                  color="primary"
                  label="Weiter"
                  @click="goToStep('count')"
                />
              </div>
            </q-step>

            <q-step
              name="count"
              title="Spieleranzahl"
              icon="groups"
              :done="stepIndex > 1"
            >
              <div class="row items-center wizard-top-nav">
                <q-btn
                  flat
                  color="primary"
                  label="Zurück"
                  @click="goToStep('mode')"
                />
                <q-space />
                <q-btn
                  color="primary"
                  label="Weiter"
                  :disable="!isValidCount"
                  @click="confirmPlayerCount"
                />
              </div>

              <q-input
                v-model.number="playerCount"
                type="number"
                label="Anzahl der Spieler"
                outlined
                :min="GAME_CONSTANTS.MIN_PLAYERS"
                :max="GAME_CONSTANTS.MAX_PLAYERS"
                :rules="[
                  (val) =>
                    (val !== null && val !== '') ||
                    'Bitte Spieleranzahl eingeben',
                  (val) =>
                    val >= GAME_CONSTANTS.MIN_PLAYERS ||
                    `Mindestens ${GAME_CONSTANTS.MIN_PLAYERS} Spieler erforderlich`,
                  (val) =>
                    val <= GAME_CONSTANTS.MAX_PLAYERS ||
                    `Maximal ${GAME_CONSTANTS.MAX_PLAYERS} Spieler möglich`,
                ]"
              />
            </q-step>

            <q-step
              name="names"
              title="Spielernamen"
              icon="badge"
              :done="stepIndex > 2"
            >
              <div class="row items-center wizard-top-nav">
                <q-btn
                  flat
                  color="primary"
                  label="Zurück"
                  @click="goToStep('count')"
                />
                <q-space />
                <q-btn
                  color="primary"
                  label="Weiter"
                  :disable="!areNamesValid"
                  @click="
                    goToStep(
                      gameMode === 'battle' ? 'battle-versions' : 'starting',
                    )
                  "
                />
              </div>

              <div class="q-gutter-md">
                <q-input
                  v-for="(name, index) in playerNames"
                  :key="index"
                  v-model="playerNames[index]"
                  :label="`Spieler ${index + 1} Name`"
                  outlined
                  :rules="[
                    (val) => (val && val.length > 0) || 'Name erforderlich',
                  ]"
                >
                  <template #prepend>
                    <q-icon name="person" />
                  </template>
                </q-input>
              </div>
            </q-step>

            <q-step
              v-if="gameMode === 'battle'"
              name="battle-versions"
              title="Versionen"
              icon="style"
              :done="stepIndex > 3"
            >
              <div class="row items-center wizard-top-nav">
                <q-btn
                  flat
                  color="primary"
                  label="Zurück"
                  @click="battlePrev"
                />
                <q-space />
                <q-btn
                  v-if="battleCurrentPlayerIdx < playerCount - 1"
                  color="primary"
                  label="Nächster Spieler"
                  icon-right="arrow_forward"
                  :disable="!battleVersions[battleCurrentPlayerIdx]"
                  @click="battleNext"
                />
                <q-btn
                  v-else
                  color="primary"
                  label="Weiter"
                  :disable="!isBattleSelectionComplete"
                  @click="goToStep('starting')"
                />
              </div>

              <div class="row items-center q-mb-sm">
                <q-icon name="person" class="q-mr-sm" />
                <div class="text-subtitle1">
                  Version für
                  <strong>{{ currentBattlePlayerName }}</strong>
                </div>
                <q-space />
                <div class="text-caption text-muted">
                  Spieler {{ battleCurrentPlayerIdx + 1 }} / {{ playerCount }}
                </div>
              </div>
              <div class="text-caption text-muted q-mb-md">
                Bereits vergebene Versionen sowie Versionen mit stark
                abweichender Songanzahl (±10 zur zuerst gewählten) sind
                ausgegraut.
              </div>

              <div class="version-grid q-mb-md">
                <button
                  v-for="option in modeFilteredVersions"
                  :key="option.value"
                  type="button"
                  class="version-card-btn"
                  :class="{
                    selected:
                      battleVersions[battleCurrentPlayerIdx] === option.value,
                    disabled: isBattleOptionDisabledForPlayer(
                      option,
                      battleCurrentPlayerIdx,
                    ),
                  }"
                  :disabled="
                    isBattleOptionDisabledForPlayer(
                      option,
                      battleCurrentPlayerIdx,
                    )
                  "
                  :aria-pressed="
                    battleVersions[battleCurrentPlayerIdx] === option.value
                      ? 'true'
                      : 'false'
                  "
                  @click="
                    selectBattleVersion(battleCurrentPlayerIdx, option.value)
                  "
                >
                  <q-card class="timeline-look-card">
                    <q-card-section class="timeline-look-content">
                      <img class="version-icon" :src="option.icon" alt="" />
                    </q-card-section>
                  </q-card>
                  <div class="version-name" :title="option.label">
                    {{ option.label }}
                    <span
                      v-if="option.trackCount"
                      class="text-caption text-muted"
                      style="font-weight: 400"
                    >
                      · {{ option.trackCount
                      }}<span class="sr-only"> Songs</span>
                    </span>
                  </div>
                </button>
              </div>
            </q-step>

            <q-step
              name="starting"
              title="Startspieler"
              icon="play_circle"
              :done="stepIndex > 4"
            >
              <div class="row items-center wizard-top-nav">
                <q-btn
                  flat
                  color="primary"
                  label="Zurück"
                  @click="
                    goToStep(
                      gameMode === 'battle' ? 'battle-versions' : 'names',
                    )
                  "
                />
                <q-space />
                <q-btn
                  color="positive"
                  label="Spiel starten"
                  icon="play_arrow"
                  :disable="!canStartGame"
                  @click="startGame"
                />
              </div>

              <div class="text-subtitle1 q-mb-md">Wähle den Startspieler:</div>

              <div class="q-gutter-sm">
                <q-btn
                  v-for="(name, index) in playerNames"
                  :key="index"
                  :label="name"
                  color="primary"
                  class="full-width"
                  :class="{ 'btn-unselected': startingPlayer !== index }"
                  icon="person"
                  @click="startingPlayer = index"
                />

                <q-separator class="q-my-md" />

                <q-btn
                  label="Zufällig wählen"
                  color="orange"
                  icon="casino"
                  class="full-width"
                  @click="randomizeStartingPlayer"
                />
              </div>
            </q-step>
          </q-stepper>
        </q-card-section>
      </q-card>
    </div>

  </q-page>
</template>

<script>
import { ref, computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { GAME_CONSTANTS, validatePlayerCount } from "../utils/gameConstants";
import { useVersions } from "../composables/useVersions";
import {
  clearStoredScores,
  encodeNamesQuery,
} from "../composables/useGameState";
import MainMenu, { newGameId } from "../components/MainMenu.vue";

// Reihenfolge der Wizard-Schritte. "battle-versions" wird nur im Battle-Modus
// tatsaechlich angezeigt (v-if im Template), bleibt aber in der Reihenfolge
// verankert, damit die `stepIndex`-Ableitung stimmt.
const STEP_ORDER = ["mode", "count", "names", "battle-versions", "starting"];
// Toleranz fuer die "aehnliche Songanzahl"-Regel im Battle-Modus.
const BATTLE_TRACKCOUNT_TOLERANCE = 10;
// Parameter, mit denen "/" direkt in die Einrichtung springt statt ins
// Hauptmenü: `setup` aus „Neues Spiel", der Rest aus den Neustart-Dialogen.
const SETUP_QUERY_KEYS = [
  "setup",
  "renameOnly",
  "carryScores",
  "players",
  "names",
  "mode",
  "playerSongPools",
  "songPools",
  "songPool",
  "startingPlayer",
];

export default {
  name: "IndexPage",

  components: { MainMenu },

  setup() {
    const route = useRoute();
    const router = useRouter();
    const isSetupView = computed(() =>
      SETUP_QUERY_KEYS.some((key) => route.query[key] !== undefined),
    );
    const step = ref("mode");
    const stepIndex = computed(() => {
      const idx = STEP_ORDER.indexOf(step.value);
      return idx < 0 ? 0 : idx;
    });
    const goToStep = (name) => {
      step.value = name;
    };
    // Spielmodus: "normal", "film" (Extra-Ratefeld + Extra-Scoring) oder
    // "battle" (jeder Spieler waehlt eine eigene Version).
    const gameMode = ref("normal");
    const LOCAL_GAME_MODES = ["normal", "film", "battle"];
    const playerCount = ref(null);
    const playerNames = ref([]);
    const startingPlayer = ref(null);
    const carryScoresFromQuery = ref([]);
    const hasCarryScoresFromQuery = ref(false);
    const selectedSongPools = ref([]);
    // Battle-Modus: Version pro Spieler (Index = Spieler-Index, Wert = Pool-Value
    // oder null wenn noch nicht gewaehlt).
    const battleVersions = ref([]);
    // Aktuell aktiver Spieler im Battle-Versions-Schritt (0-basiert).
    const battleCurrentPlayerIdx = ref(0);

    // Versionen kommen zentral aus dem Server (server-getrieben, damit „Löschen"
    // dauerhaft wirkt). Ausgeblendete Versionen filtert useVersions bereits raus.
    const { allVersions, visibleVersions, loadVersions } = useVersions();
    loadVersions();

    // Sichtbare Versionen zusaetzlich pro Spielmodus filtern.
    // Film-Modus: alle als Film-/Serien-Version markierten Versionen anzeigen.
    const modeFilteredVersions = computed(() => {
      if (gameMode.value === "film") {
        return visibleVersions.value.filter((v) => v.film);
      }
      return visibleVersions.value;
    });

    // Film-Modus: eine Film-Version ohne Filmeintraege (kein Song hat einen
    // Film-/Serientitel) darf nicht gewaehlt werden.
    const isFilmBlocked = (option) =>
      gameMode.value === "film" && !option.filmReady;

    const normalizeSongPools = (rawValue) => {
      const list = Array.isArray(rawValue)
        ? rawValue
        : (rawValue || "").toString().split(",");
      const validSongPoolValues = new Set(
        allVersions.value.map((option) => option.value),
      );

      return [
        ...new Set(
          list
            .map((value) => value.toString().trim().toLowerCase())
            .filter((value) => validSongPoolValues.has(value)),
        ),
      ];
    };

    // Ausgewaehlte Versionen in Klick-Reihenfolge, fuer die Anzeige ueber dem
    // Weiter-Knopf. Unbekannte Werte (z. B. noch nicht geladen) fallen raus.
    const selectedSongPoolOptions = computed(() =>
      selectedSongPools.value
        .map((value) => allVersions.value.find((v) => v.value === value))
        .filter(Boolean),
    );

    const isValidCount = computed(() => validatePlayerCount(playerCount.value));
    const hasSelectedSongPools = computed(
      () => selectedSongPools.value.length > 0,
    );

    const areNamesValid = computed(() => {
      if (playerNames.value.length !== playerCount.value) return false;
      return playerNames.value.every((name) => name && name.trim().length > 0);
    });

    // ── Battle-Modus: Auswahl-Logik ─────────────────────────────────────
    const chosenBattleVersions = computed(() =>
      battleVersions.value.filter(Boolean),
    );
    // Referenz-Trackcount = trackCount der zuerst gewaehlten Version.
    const battleReferenceTrackCount = computed(() => {
      const firstChosen = chosenBattleVersions.value[0];
      if (!firstChosen) return null;
      const found = allVersions.value.find((v) => v.value === firstChosen);
      return found?.trackCount ?? null;
    });
    const getBattleVersionLabel = (value) => {
      const v = allVersions.value.find((x) => x.value === value);
      return v ? v.label : value;
    };
    const isBattleOptionDisabledForPlayer = (option, playerIdx) => {
      // Bereits von einem anderen Spieler gewaehlt -> deaktiviert.
      const otherHasIt = battleVersions.value.some(
        (v, idx) => idx !== playerIdx && v === option.value,
      );
      if (otherHasIt) return true;
      // Aktuell selbst ausgewaehlt -> immer erlaubt (Klick de-/re-selektiert).
      if (battleVersions.value[playerIdx] === option.value) return false;
      // Trackcount-Filter: gilt erst ab der zweiten Auswahl, und die Referenz
      // selbst bleibt natuerlich erlaubt.
      const ref = battleReferenceTrackCount.value;
      if (ref === null) return false;
      const count = option.trackCount || 0;
      if (!count) return false;
      return Math.abs(count - ref) > BATTLE_TRACKCOUNT_TOLERANCE;
    };
    const selectBattleVersion = (playerIdx, poolValue) => {
      // Toggle: nochmal auf dieselbe Karte -> Auswahl entfernen.
      if (battleVersions.value[playerIdx] === poolValue) {
        battleVersions.value = battleVersions.value.map((v, i) =>
          i === playerIdx ? null : v,
        );
        return;
      }
      battleVersions.value = battleVersions.value.map((v, i) =>
        i === playerIdx ? poolValue : v,
      );
    };
    const isBattleSelectionComplete = computed(() => {
      if (playerCount.value === null || playerCount.value <= 0) return false;
      if (battleVersions.value.length !== playerCount.value) return false;
      if (battleVersions.value.some((v) => !v)) return false;
      const unique = new Set(battleVersions.value);
      return unique.size === battleVersions.value.length;
    });

    // ── Battle-Modus: Navigation im Versions-Schritt (ein Spieler nach dem
    // anderen statt langer Scroll-Liste) ────────────────────────────────
    const currentBattlePlayerName = computed(() => {
      const idx = battleCurrentPlayerIdx.value;
      return (
        (playerNames.value[idx] || `Spieler ${idx + 1}`).toString().trim() ||
        `Spieler ${idx + 1}`
      );
    });
    const battleNext = () => {
      if (!battleVersions.value[battleCurrentPlayerIdx.value]) return;
      if (battleCurrentPlayerIdx.value < playerCount.value - 1) {
        battleCurrentPlayerIdx.value += 1;
      }
    };
    const battlePrev = () => {
      if (battleCurrentPlayerIdx.value > 0) {
        battleCurrentPlayerIdx.value -= 1;
        return;
      }
      // Vor dem ersten Spieler zurueck -> zurueck zum Namen-Schritt.
      goToStep("names");
    };
    // Beim Betreten des Battle-Versions-Schritts: mit dem ersten Spieler
    // starten, der noch keine Version gewaehlt hat (sonst mit Spieler 1).
    watch(step, (name) => {
      if (name !== "battle-versions") return;
      const nextEmpty = battleVersions.value.findIndex((v) => !v);
      battleCurrentPlayerIdx.value = nextEmpty >= 0 ? nextEmpty : 0;
    });

    const canStartGame = computed(() => {
      if (startingPlayer.value === null) return false;
      if (gameMode.value === "battle") return isBattleSelectionComplete.value;
      return hasSelectedSongPools.value;
    });

    const confirmPlayerCount = () => {
      if (!isValidCount.value) return;
      playerNames.value = Array(playerCount.value)
        .fill("")
        .map((_, i) => `Spieler ${i + 1}`);
      // Battle-Auswahl an neue Spieleranzahl anpassen (bestehende Werte
      // beibehalten, ueberschuessige Slots entfernen).
      battleVersions.value = Array.from(
        { length: playerCount.value },
        (_, i) => battleVersions.value[i] || null,
      );
      if (!hasCarryScoresFromQuery.value) {
        startingPlayer.value = null;
      }
      goToStep("names");
    };

    const toggleSongPool = (poolValue) => {
      // Im Film-Modus keine Version ohne Filmeintraege auswaehlbar.
      if (gameMode.value === "film") {
        const option = allVersions.value.find((v) => v.value === poolValue);
        if (option && !option.filmReady) return;
      }
      if (selectedSongPools.value.includes(poolValue)) {
        selectedSongPools.value = selectedSongPools.value.filter(
          (value) => value !== poolValue,
        );
        return;
      }
      selectedSongPools.value = [...selectedSongPools.value, poolValue];
    };

    // Beim Wechsel in den Film-Modus die Auswahl auf gueltige (film-bereite)
    // Film-Versionen eindampfen. Wechsel weg vom Film-Modus laesst sie stehen.
    watch(gameMode, (mode) => {
      if (mode === "film") {
        const ready = new Set(
          allVersions.value.filter((v) => v.film && v.filmReady).map((v) => v.value),
        );
        selectedSongPools.value = selectedSongPools.value.filter((val) =>
          ready.has(val),
        );
      }
    });

    const randomizeStartingPlayer = () => {
      startingPlayer.value = Math.floor(Math.random() * playerCount.value);
    };

    const startGame = () => {
      if (!canStartGame.value || !areNamesValid.value) return;

      const isBattle = gameMode.value === "battle";
      // Effektive Pool-Liste: im Battle-Modus die Vereinigung aller Spieler-
      // Pools; sonst die zuvor ausgewaehlten Pools.
      const effectivePools = isBattle
        ? [...new Set(battleVersions.value.filter(Boolean))]
        : selectedSongPools.value;

      const normalizedPools = normalizeSongPools(effectivePools);
      const query = {
        players: playerCount.value,
        names: encodeNamesQuery(playerNames.value),
        startingPlayer: startingPlayer.value,
        songPools: normalizedPools.join(","),
        songPool: normalizedPools[0] || "staffel1",
        mode: gameMode.value,
      };

      if (isBattle) {
        query.playerSongPools = battleVersions.value
          .map((v) => (v || "").toString().trim().toLowerCase())
          .join(",");
      }

      if (hasCarryScoresFromQuery.value) {
        query.carryScores = carryScoresFromQuery.value.join(",");
      } else {
        // Frische Kennung: useGameState übernimmt gespeicherte Punkte nur,
        // wenn sie zur Kennung des laufenden Spiels passen. Mit übernommenen
        // Punkten (carryScores) regelt das Spiel die Kennung selbst.
        query.gid = newGameId();
      }

      // Neues Spiel: keine Punkte aus der Vorrunde erben. Übernommene Punkte
      // kommen ausschließlich über `carryScores`.
      clearStoredScores();

      router.push({
        name: "game",
        query,
      });
    };

    // Zurück aus der Einrichtung ins Untermenü „Lokal spielen". Kam man von
    // dort, wird der Verlauf zurückgespult, sonst stapelten sich Einträge.
    // Übernommene Punkte aus einem Neustart gelten danach nicht mehr: Wer
    // über das Menü ein neues Spiel beginnt, fängt bei null an.
    const leaveSetup = () => {
      carryScoresFromQuery.value = [];
      hasCarryScoresFromQuery.value = false;
      const target = router.resolve({ path: "/", query: { menu: "local" } });
      if (window.history.state?.back === target.fullPath) {
        router.back();
      } else {
        router.replace(target);
      }
    };

    const applyCarrySettingsFromRoute = () => {
      const playersFromQuery = parseInt(route.query.players, 10);
      if (
        !Number.isNaN(playersFromQuery) &&
        validatePlayerCount(playersFromQuery)
      ) {
        playerCount.value = playersFromQuery;
        playerNames.value = Array(playersFromQuery)
          .fill("")
          .map((_, i) => `Spieler ${i + 1}`);
      }

      const starterFromQuery = parseInt(route.query.startingPlayer, 10);
      if (!Number.isNaN(starterFromQuery)) {
        startingPlayer.value = starterFromQuery;
      }

      const carryScoresQuery = (route.query.carryScores || "")
        .toString()
        .trim();
      if (carryScoresQuery && playerCount.value) {
        const parsedScores = carryScoresQuery
          .split(",")
          .map((value) => parseInt(value, 10))
          .map((value) => (Number.isNaN(value) ? 0 : Math.max(0, value)))
          .slice(0, playerCount.value);
        if (parsedScores.length < playerCount.value) {
          while (parsedScores.length < playerCount.value) parsedScores.push(0);
        }
        carryScoresFromQuery.value = parsedScores;
        hasCarryScoresFromQuery.value = true;
      }

      if (route.query.renameOnly && playerCount.value) {
        step.value = "names";
      }

      // Spielmodus aus der Vorrunde übernehmen. Ohne das wurde aus einem
      // Film- oder Battle-Spiel beim Neustart mit neuen Namen ein normales.
      // Bingo gibt es nur online, die Startseite bietet es nicht an.
      const modeFromQuery = (route.query.mode || "").toString().trim();
      if (LOCAL_GAME_MODES.includes(modeFromQuery)) {
        gameMode.value = modeFromQuery;
      }

      const songPoolsFromQuery = normalizeSongPools(route.query.songPools);
      const fallbackSinglePool = normalizeSongPools(route.query.songPool);
      const resolvedPools =
        songPoolsFromQuery.length > 0 ? songPoolsFromQuery : fallbackSinglePool;
      selectedSongPools.value = resolvedPools;

      // Battle: Version pro Spieler in Spieler-Reihenfolge. Leere oder
      // unbekannte Einträge bleiben offen und werden neu gewählt.
      if (gameMode.value === "battle" && playerCount.value) {
        const validPools = new Set(allVersions.value.map((v) => v.value));
        const perPlayer = (route.query.playerSongPools || "")
          .toString()
          .split(",")
          .map((v) => v.trim().toLowerCase());
        battleVersions.value = Array.from(
          { length: playerCount.value },
          (_, i) => (validPools.has(perPlayer[i]) ? perPlayer[i] : null),
        );
      }
    };

    applyCarrySettingsFromRoute();

    return {
      GAME_CONSTANTS,
      step,
      stepIndex,
      goToStep,
      playerCount,
      playerNames,
      startingPlayer,
      isValidCount,
      areNamesValid,
      confirmPlayerCount,
      randomizeStartingPlayer,
      startGame,
      canStartGame,
      gameMode,
      isSetupView,
      leaveSetup,
      selectedSongPools,
      selectedSongPoolOptions,
      visibleVersions,
      modeFilteredVersions,
      isFilmBlocked,
      toggleSongPool,
      hasSelectedSongPools,
      battleVersions,
      battleCurrentPlayerIdx,
      currentBattlePlayerName,
      battleNext,
      battlePrev,
      isBattleOptionDisabledForPlayer,
      isBattleSelectionComplete,
      selectBattleVersion,
      getBattleVersionLabel,
    };
  },
};
</script>

<style scoped>
/* Hülle für Titel + Buttons + Container – Titel/Buttons liegen bewusst
   AUSSERHALB der Karte; Abstand nach unten wie in der Lobby. */
.start-shell {
  max-width: var(--content-max-width, 1180px);
  margin: 0 auto;
  padding: 24px 16px 48px;
}

.game-start-card {
  width: 100%;
  padding: 20px;
}

.q-page {
  background: var(--app-bg, #121212);
}

/* Versionsauswahl-Karten (.version-grid/.version-card-btn/.timeline-look-card/
   .version-icon/.version-name inkl. Hover/Auswahl/Rainbow) sind jetzt zentral
   in src/css/app.scss definiert – hier bewusst NICHT mehr, damit Index und
   Lobby garantiert identisch bleiben. */

.start-stepper :deep(.q-stepper__header) {
  align-items: stretch;
}

.start-stepper :deep(.q-stepper__tab) {
  flex: 1 1 0;
  min-width: 0;
  justify-content: center;
}

.start-stepper :deep(.q-stepper__title) {
  text-align: center;
  width: 100%;
}

/* Kasten mit den ausgewaehlten Versionen ueber dem Weiter-Knopf. Die Chips
   selbst (.active-pools-row/.pool-chip) kommen zentral aus app.scss, damit sie
   genau wie in der Lobby aussehen. */
.selected-pools-box {
  margin-bottom: 12px;
  padding: 10px 12px;
  border: 1px solid var(--surface-border);
  border-radius: var(--surface-radius);
}

/* Nav-Zeile oben in jedem Wizard-Schritt: klare Trennung zum Inhalt darunter,
   damit z. B. Eingabefelder nicht direkt an den Buttons kleben. */
.wizard-top-nav {
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--surface-border, rgba(255, 255, 255, 0.08));
}

@media (max-width: 599px) {
  .start-shell {
    padding: 16px 10px 40px;
  }
  .game-start-card {
    min-width: 0;
    width: 100%;
    padding: 12px;
  }

  .text-h4 {
    font-size: 1.4rem;
  }


  .start-stepper :deep(.q-stepper__title) {
    display: none;
  }
}
</style>
