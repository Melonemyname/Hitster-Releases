<template>
  <q-page class="index-page">
    <div class="start-shell">
      <HitsterLogo class="index-logo q-mb-md" />

      <div class="text-center q-mb-md">
        <q-btn
          color="primary"
          icon="groups"
          label="Multiplayer Lobby"
          @click="goToLobby"
        />
      </div>

      <div class="text-center q-mb-lg">
        <q-btn
          color="secondary"
          icon="folder_open"
          label="Spielstand laden"
          outline
          @click="openLoadDialog"
        />
      </div>

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
                class="text-caption q-mb-md"
                style="opacity: 0.8"
              >
                Film/Serie-Modus: zusätzliches Ratefeld + eigenes Punktesystem.
                Es wird ausschließlich die Soundtracks-Edition gespielt.
              </div>
              <div
                v-if="gameMode === 'battle'"
                class="text-caption q-mb-md"
                style="opacity: 0.8"
              >
                Am besten mit den drei „Battle of the Generations"-Editionen
                spielen (die Empfehlung passt naturgemäß für bis zu 3 Spieler).
              </div>

              <template v-if="gameMode !== 'battle'">
                <div class="text-subtitle1 q-mb-sm">
                  Mit welchen Versionen soll gespielt werden?
                </div>
                <!-- Weiter zusaetzlich oben, damit man bei vielen Versionen nicht
                   erst bis ans Ende scrollen muss. -->
                <div class="row items-center wizard-top-nav">
                  <div class="text-caption" style="opacity: 0.8">
                    {{ selectedSongPools.length }} ausgewählt
                  </div>
                  <q-space />
                  <q-btn
                    color="primary"
                    label="Weiter"
                    :disable="!hasSelectedSongPools"
                    @click="goToStep('count')"
                  />
                </div>
                <div v-if="gameMode === 'film' && modeFilteredVersions.length === 0" class="text-caption q-mb-md" style="opacity: 0.8">
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
                    @click="toggleSongPool(option.value)"
                  >
                    <q-card class="timeline-look-card">
                      <q-card-section class="timeline-look-content">
                        <img
                          class="version-icon"
                          :src="option.icon"
                          :alt="option.label"
                        />
                      </q-card-section>
                    </q-card>
                    <div class="version-name">
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
                class="row justify-end wizard-top-nav"
              >
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
                <div class="text-caption" style="opacity: 0.8">
                  Spieler {{ battleCurrentPlayerIdx + 1 }} / {{ playerCount }}
                </div>
              </div>
              <div class="text-caption q-mb-md" style="opacity: 0.8">
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
                  @click="
                    selectBattleVersion(battleCurrentPlayerIdx, option.value)
                  "
                >
                  <q-card class="timeline-look-card">
                    <q-card-section class="timeline-look-content">
                      <img
                        class="version-icon"
                        :src="option.icon"
                        :alt="option.label"
                      />
                    </q-card-section>
                  </q-card>
                  <div class="version-name">
                    {{ option.label }}
                    <span
                      v-if="option.trackCount"
                      class="text-caption"
                      style="opacity: 0.7; font-weight: 400"
                    >
                      · {{ option.trackCount }}
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

    <q-dialog v-model="showLoadDialog" persistent>
      <q-card style="min-width: 420px">
        <q-card-section class="bg-primary">
          <div class="text-h6">Spielstand laden</div>
        </q-card-section>
        <q-card-section>
          <div class="q-mb-md text-body2">Hast du eine gespeicherte Datei?</div>
          <div v-if="savedSessionMeta">
            <div><strong>Lokaler Stand:</strong></div>
            <div>
              <strong>Gespeichert am:</strong>
              {{ savedSessionMeta.savedAtDisplay }}
            </div>
            <div>
              <strong>Spieler:</strong> {{ savedSessionMeta.playerCount }}
            </div>
            <div>
              <strong>Songs gespielt:</strong>
              {{ savedSessionMeta.playedSongsCount }}
            </div>
          </div>
          <div v-else>Kein lokaler Spielstand gefunden.</div>
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn
            flat
            color="grey-7"
            label="Abbrechen"
            @click="showLoadDialog = false"
          />
          <q-btn
            color="secondary"
            label="Aus Browser laden"
            :disable="!savedSessionMeta"
            @click="loadSavedSession"
          />
          <q-btn
            color="primary"
            label="Datei auswählen"
            @click="openSessionFilePicker"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
    <input
      ref="sessionFileInput"
      type="file"
      accept=".json,application/json"
      style="display: none"
      @change="handleSessionFileSelected"
    />
  </q-page>
</template>

<script>
import { ref, computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { GAME_CONSTANTS, validatePlayerCount } from "../utils/gameConstants";
import { useVersions } from "../composables/useVersions";
import HitsterLogo from "../components/HitsterLogo.vue";

// Reihenfolge der Wizard-Schritte. "battle-versions" wird nur im Battle-Modus
// tatsaechlich angezeigt (v-if im Template), bleibt aber in der Reihenfolge
// verankert, damit die `stepIndex`-Ableitung stimmt.
const STEP_ORDER = ["mode", "count", "names", "battle-versions", "starting"];
// Toleranz fuer die "aehnliche Songanzahl"-Regel im Battle-Modus.
const BATTLE_TRACKCOUNT_TOLERANCE = 10;

export default {
  name: "IndexPage",

  components: { HitsterLogo },

  setup() {
    const SESSION_STORAGE_KEY = "hitster-session-save-v1";
    const route = useRoute();
    const router = useRouter();
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
    const playerCount = ref(null);
    const playerNames = ref([]);
    const startingPlayer = ref(null);
    const showLoadDialog = ref(false);
    const sessionFileInput = ref(null);
    const savedSessionMeta = ref(null);
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
        names: playerNames.value.join(","),
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
      }

      router.push({
        name: "game",
        query,
      });
    };

    const readSavedSessionMeta = () => {
      try {
        const raw = localStorage.getItem(SESSION_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        const players = Array.isArray(parsed.players) ? parsed.players : [];
        const songs = Array.isArray(parsed.playedLinksHistory)
          ? parsed.playedLinksHistory
          : [];
        const savedAt = parsed.savedAt ? new Date(parsed.savedAt) : null;
        return {
          playerCount: players.length,
          playedSongsCount: songs.length,
          savedAtDisplay:
            savedAt && !Number.isNaN(savedAt.getTime())
              ? savedAt.toLocaleString()
              : "Unbekannt",
        };
      } catch {
        return null;
      }
    };

    const goToLobby = () => {
      router.push({ name: "lobby" });
    };

    const openLoadDialog = () => {
      savedSessionMeta.value = readSavedSessionMeta();
      showLoadDialog.value = true;
    };

    const loadSavedSession = () => {
      showLoadDialog.value = false;
      router.push({
        name: "game",
        query: {
          loadSession: 1,
        },
      });
    };

    const parseSnapshotFromImport = (text) => {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === "object" && parsed.players) {
        return parsed;
      }
      const rawSession = parsed?.["hitster-session-save-v1"];
      if (typeof rawSession === "string") {
        return JSON.parse(rawSession);
      }
      throw new Error("Datei enthält keinen gültigen Spielstand.");
    };

    const openSessionFilePicker = () => {
      sessionFileInput.value?.click();
    };

    const handleSessionFileSelected = async (event) => {
      try {
        const file = event?.target?.files?.[0];
        if (!file) return;
        const text = await file.text();
        const snapshot = parseSnapshotFromImport(text);
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(snapshot));
        savedSessionMeta.value = readSavedSessionMeta();
        showLoadDialog.value = false;
        router.push({
          name: "game",
          query: {
            loadSession: 1,
          },
        });
      } catch (error) {
        // eslint-disable-next-line no-alert
        alert(`Fehler beim Laden der Datei: ${error.message}`);
      } finally {
        if (event?.target) {
          event.target.value = "";
        }
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

      const songPoolsFromQuery = normalizeSongPools(route.query.songPools);
      const fallbackSinglePool = normalizeSongPools(route.query.songPool);
      const resolvedPools =
        songPoolsFromQuery.length > 0 ? songPoolsFromQuery : fallbackSinglePool;
      selectedSongPools.value = resolvedPools;
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
      showLoadDialog,
      sessionFileInput,
      savedSessionMeta,
      openLoadDialog,
      loadSavedSession,
      openSessionFilePicker,
      handleSessionFileSelected,
      selectedSongPools,
      visibleVersions,
      modeFilteredVersions,
      isFilmBlocked,
      toggleSongPool,
      hasSelectedSongPools,
      goToLobby,
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

/* Nav-Zeile oben in jedem Wizard-Schritt: klare Trennung zum Inhalt darunter,
   damit z. B. Eingabefelder nicht direkt an den Buttons kleben. */
.wizard-top-nav {
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--surface-border, rgba(255, 255, 255, 0.08));
}

/* HITSTER-Logo im Index: Größe passend zur Karten-Breite; Farbe kommt aus
   dem Theme (siehe HitsterLogo.vue). Zusätzlicher oberer Abstand, damit das
   Logo nicht direkt am Seiten-Rand klebt. */
.index-logo {
  max-width: 460px;
  margin: 24px auto 8px;
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

  .index-logo {
    max-width: 320px;
  }

  .start-stepper :deep(.q-stepper__title) {
    display: none;
  }
}
</style>
