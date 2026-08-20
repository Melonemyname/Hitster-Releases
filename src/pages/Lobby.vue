<template>
  <q-page class="lobby-page">
    <div class="lobby-container">
      <!-- Header -->
      <div class="row items-center justify-between q-mb-lg">
        <div class="text-h4">
          <q-icon name="sports_esports" class="q-mr-sm" />
          Multiplayer Lobby
        </div>
      </div>

      <!-- Aktiver Raum: wird angezeigt sobald beigetreten oder erstellt -->
      <q-card v-if="activeRoom" class="active-room-card q-mb-xl">
        <q-card-section>
          <div class="row items-center justify-between q-mb-md">
            <div>
              <div class="text-h5 row items-center gap-md">
                Raum
                <span class="room-code">{{ activeRoom.code }}</span>
                <q-btn
                  flat
                  round
                  icon="content_copy"
                  size="sm"
                  color="grey"
                  @click="copyCode"
                >
                  <q-tooltip>Code kopieren</q-tooltip>
                </q-btn>
              </div>
              <div class="text-caption text-grey">
                Host: {{ activeRoom.hostUsername }}
              </div>
            </div>
            <q-chip
              :color="
                activeRoom.audioMode === 'host-only' ? 'blue-grey' : 'teal'
              "
              icon="volume_up"
              text-color="white"
            >
              {{
                activeRoom.audioMode === "host-only"
                  ? "Nur Host hört"
                  : "Alle hören"
              }}
            </q-chip>
          </div>

          <!-- Spielmodus-Badge (Film / Battle / Bingo sichtbar hervorheben) -->
          <div v-if="activeRoomGameMode !== 'normal'" class="q-mb-md">
            <q-chip
              :icon="
                activeRoomGameMode === 'battle'
                  ? 'sports_kabaddi'
                  : activeRoomGameMode === 'bingo'
                    ? 'grid_view'
                    : 'movie'
              "
              color="primary"
              text-color="white"
              square
            >
              {{
                activeRoomGameMode === "battle"
                  ? "Battle-Modus"
                  : activeRoomGameMode === "bingo"
                    ? "Bingo-Modus"
                    : "Film / Serie"
              }}
            </q-chip>
            <template v-if="activeRoomGameMode === 'bingo'">
              <q-chip
                :color="
                  activeRoom.settings?.bingoDifficulty === 'hard'
                    ? 'deep-orange'
                    : 'green'
                "
                text-color="white"
                icon="whatshot"
                square
              >
                {{
                  activeRoom.settings?.bingoDifficulty === "hard"
                    ? "Schwer"
                    : "Leicht"
                }}
              </q-chip>
              <q-chip color="blue-grey" text-color="white" icon="timer" square>
                {{
                  activeRoom.settings?.bingoTimerMode === "wait-all"
                    ? "Warten bis alle fertig"
                    : `${activeRoom.settings?.bingoTimerSeconds || 30}s Timer`
                }}
              </q-chip>
              <q-chip
                color="purple"
                text-color="white"
                icon="emoji_events"
                square
              >
                {{ activeRoom.settings?.bingosToWin || 3 }} Bingo(s) zum Sieg
              </q-chip>
            </template>
          </div>

          <!-- Host: Spielmodus + Modus-Settings im aktiven Raum ändern -->
          <div v-if="isHost" class="q-mb-md">
            <div class="text-subtitle2 q-mb-xs">Spielmodus</div>
            <q-btn-toggle
              :model-value="activeRoomGameMode"
              class="q-mb-sm full-width"
              spread
              no-caps
              :options="[
                { label: 'Normal', value: 'normal' },
                { label: 'Film / Serie', value: 'film' },
                { label: 'Battle', value: 'battle' },
                { label: 'Bingo', value: 'bingo' },
              ]"
              @update:model-value="handleGameModeChange"
            />
            <div
              v-if="activeRoomGameMode === 'bingo'"
              class="q-mt-sm active-bingo-settings"
            >
              <div class="text-subtitle2 q-mb-xs">Schwierigkeit</div>
              <q-btn-toggle
                :model-value="activeRoom.settings?.bingoDifficulty || 'easy'"
                class="q-mb-sm full-width"
                spread
                no-caps
                :options="[
                  { label: 'Leicht', value: 'easy' },
                  { label: 'Schwer', value: 'hard' },
                ]"
                @update:model-value="
                  (v) => handleBingoSettingChange('bingoDifficulty', v)
                "
              />
              <div class="text-subtitle2 q-mb-xs">Antwort-Timer</div>
              <q-btn-toggle
                :model-value="activeRoom.settings?.bingoTimerMode || 'timer'"
                class="q-mb-sm full-width"
                spread
                no-caps
                :options="[
                  { label: '30 Sekunden', value: 'timer' },
                  { label: 'Warten bis alle fertig', value: 'wait-all' },
                ]"
                @update:model-value="
                  (v) => handleBingoSettingChange('bingoTimerMode', v)
                "
              />
              <div class="text-subtitle2 q-mb-xs">
                Bingos zum Sieg:
                <strong>{{ activeRoom.settings?.bingosToWin || 3 }}</strong>
              </div>
              <q-slider
                :model-value="activeRoom.settings?.bingosToWin || 3"
                :min="1"
                :max="12"
                :step="1"
                label
                label-always
                markers
                class="q-mb-sm"
                @update:model-value="
                  (v) => handleBingoSettingChange('bingosToWin', v)
                "
              />
            </div>
          </div>

          <!-- Spielerliste -->
          <div class="text-subtitle2 q-mb-xs">Spieler im Raum</div>
          <q-list bordered rounded class="q-mb-md" dark>
            <q-item v-for="slot in activeRoom.players" :key="slot.slotId">
              <q-item-section avatar>
                <AvatarStack
                  :entries="slotAvatarEntries(slot)"
                  size="36px"
                  :overlap="12"
                  dense
                />
              </q-item-section>
              <q-item-section>
                <q-item-label>{{ slot.slotName }}</q-item-label>
                <q-item-label caption>
                  {{ slot.members.join(" & ") }}
                </q-item-label>
                <!-- Battle-Modus: gewaehlte Version pro Slot als Zeile -->
                <q-item-label
                  v-if="activeRoomGameMode === 'battle'"
                  caption
                  class="q-mt-xs"
                >
                  <span v-if="slot.pool" style="opacity: 0.9">
                    <q-icon name="album" size="xs" class="q-mr-xs" />
                    {{ getVersionLabel(slot.pool) }}
                  </span>
                  <span v-else class="text-warning">
                    <q-icon name="hourglass_empty" size="xs" class="q-mr-xs" />
                    Version noch nicht gewählt
                  </span>
                </q-item-label>
              </q-item-section>
              <q-item-section side>
                <div class="row items-center" style="gap: 4px">
                  <q-badge v-if="slot.members.includes(currentUsername)">
                    Du
                  </q-badge>
                  <q-badge
                    v-if="slot.members.includes(activeRoom.hostUsername)"
                  >
                    Host
                  </q-badge>
                </div>
              </q-item-section>
            </q-item>
          </q-list>

          <!-- Battle-Modus: eigene Version waehlen -->
          <div v-if="activeRoomGameMode === 'battle'" class="q-mb-md">
            <q-btn
              color="primary"
              icon="album"
              :label="
                mySlotPool
                  ? `Meine Version: ${getVersionLabel(mySlotPool)} (ändern)`
                  : 'Meine Version wählen'
              "
              class="full-width"
              @click="openBattlePoolDialog"
            />
            <div
              v-if="battleStartBlocker"
              class="text-caption text-warning q-mt-xs"
            >
              <q-icon name="warning" size="xs" class="q-mr-xs" />
              {{ battleStartBlocker }}
            </div>
          </div>

          <!-- Audio-Modus (nur Host) -->
          <div v-if="isHost" class="q-mb-md">
            <div class="text-subtitle2 q-mb-xs">Audio-Modus</div>
            <q-btn-toggle
              v-model="activeRoom.audioMode"
              :options="audioModeOptions"
              color="primary"
              toggle-color="white"
              toggle-text-color="primary"
              outline
              @update:model-value="handleAudioModeChange"
            />
          </div>

          <!-- Song-Versionen (alle sehen, nur Host kann ändern) - ausser im Battle-Modus -->
          <div v-if="activeRoomGameMode !== 'battle'" class="q-mb-md">
            <div class="row items-center justify-between q-mb-xs">
              <div class="text-subtitle2">Song-Versionen</div>
              <q-btn
                v-if="isHost"
                color="primary"
                icon="edit"
                label="Ändern"
                size="sm"
                @click="openVersionDialog"
              />
            </div>
            <div v-if="activeSongPoolOptions.length" class="active-pools-row">
              <div
                v-for="pool in activeSongPoolOptions"
                :key="pool.value"
                class="pool-chip"
              >
                <img
                  :src="pool.icon"
                  :alt="pool.label"
                  class="pool-chip-icon"
                />
                <span class="pool-chip-name">{{ pool.label }}</span>
              </div>
            </div>
            <div v-else class="text-caption text-grey">
              Keine Version ausgewählt
            </div>
          </div>

          <!-- Startspieler (alle sehen, nur Host kann aendern) -->
          <div class="q-mb-md">
            <div class="text-subtitle2 q-mb-xs">Startspieler</div>
            <!-- Ausgewaehlt = voller Theme-Akzent, nicht ausgewaehlt = die
                 zentrale Klasse `btn-unselected` (gedaempfte Akzent-Toenung).
                 Das `outline`-Prop von Quasar bringt hier nichts: app.scss
                 fuellt jeden rechteckigen Button per !important mit dem
                 Akzent, dadurch sahen alle Buttons gleich aus. -->
            <div v-if="isHost" class="starter-choice">
              <q-btn
                dense
                no-caps
                icon="casino"
                label="Auslosen"
                :class="{ 'btn-unselected': startingPlayerChoice !== null }"
                @click="setStartingPlayer(null)"
              />
              <q-btn
                v-for="(slot, index) in activeRoom.players"
                :key="slot.id || index"
                dense
                no-caps
                :icon="startingPlayerChoice === index ? 'check' : 'person'"
                :class="{ 'btn-unselected': startingPlayerChoice !== index }"
                :label="slotLabel(slot, index)"
                @click="setStartingPlayer(index)"
              />
            </div>
            <div v-else class="text-caption text-grey">
              {{ startingPlayerText }}
            </div>
            <div v-if="isHost" class="text-caption text-grey q-mt-xs">
              {{ startingPlayerText }}
            </div>
          </div>

          <q-separator class="q-mb-md" />

          <!-- Spiel starten (nur Host) -->
          <q-btn
            v-if="isHost"
            color="positive"
            label="Spiel starten"
            icon="play_arrow"
            size="lg"
            class="full-width"
            :disable="!canStartGame"
            @click="handleStartGame"
          />
          <div v-else class="text-center text-grey q-py-sm">
            <q-spinner color="primary" class="q-mr-md" />
            Warte darauf dass der Host das Spiel startet...
          </div>

          <q-btn
            flat
            color="grey"
            label="Raum verlassen"
            icon="logout"
            class="full-width q-mt-md"
            @click="leaveRoom"
          />
        </q-card-section>
      </q-card>

      <!-- Raum erstellen / Raum beitreten (nur wenn noch kein aktiver Raum) -->
      <div v-if="!activeRoom" class="row q-gutter-lg justify-center">
        <!-- ── Raum erstellen ── -->
        <q-card class="lobby-card">
          <q-card-section>
            <div class="text-h6 q-mb-md">
              <q-icon name="add_circle" color="primary" class="q-mr-sm" />
              Raum erstellen
            </div>

            <div class="text-subtitle2 q-mb-xs">Spielmodus</div>
            <q-btn-toggle
              v-model="gameMode"
              class="q-mb-sm full-width"
              spread
              no-caps
              :options="[
                { label: 'Normal', value: 'normal' },
                { label: 'Film / Serie', value: 'film' },
                { label: 'Battle', value: 'battle' },
                { label: 'Bingo', value: 'bingo' },
              ]"
            />
            <div
              v-if="gameMode === 'film'"
              class="text-caption q-mb-md"
              style="opacity: 0.8"
            >
              Film/Serie-Modus: zusätzliches Ratefeld + eigenes Punktesystem. Es
              wird ausschließlich die Soundtracks-Edition gespielt.
            </div>
            <div
              v-if="gameMode === 'battle'"
              class="text-caption q-mb-md"
              style="opacity: 0.8"
            >
              Am besten mit den drei „Battle of the Generations"-Editionen
              spielen (die Empfehlung passt naturgemäß für bis zu 3 Spieler).
              Jeder Spieler wählt seine eigene Version im Raum aus.
            </div>
            <div
              v-if="gameMode === 'bingo'"
              class="text-caption q-mb-md"
              style="opacity: 0.8"
            >
              Bingo-Modus: jedes Team hat eine 5×5-Bingokarte, Kategorien werden
              pro Runde zufällig gewählt, Titel/Künstler/Jahr werden geraten.
              Für die passendste Songauswahl wird die „Bingo
              Deutschland"-Edition empfohlen.
            </div>

            <template v-if="gameMode !== 'battle'">
              <div class="text-subtitle2 q-mb-xs">Song-Versionen</div>
              <div
                v-if="gameMode === 'film' && modeFilteredVersions.length === 0"
                class="text-caption q-mb-md"
                style="opacity: 0.8"
              >
                Noch keine Film-/Serien-Version vorhanden.
              </div>
              <div class="version-grid q-mb-md">
                <button
                  v-for="opt in modeFilteredVersions"
                  :key="opt.value"
                  type="button"
                  class="version-card-btn"
                  :class="{
                    selected: selectedSongPools.includes(opt.value),
                    disabled: isFilmBlocked(opt),
                  }"
                  :disabled="isFilmBlocked(opt)"
                  @click="toggleSongPool(opt.value)"
                >
                  <q-card class="timeline-look-card">
                    <q-card-section class="timeline-look-content">
                      <img
                        class="version-icon"
                        :src="opt.icon"
                        :alt="opt.label"
                      />
                    </q-card-section>
                  </q-card>
                  <div class="version-name">
                    {{ opt.label }}
                    <span
                      v-if="isFilmBlocked(opt)"
                      class="text-caption"
                      style="opacity: 0.7; font-weight: 400"
                    >
                      · keine Filme
                    </span>
                  </div>
                </button>
              </div>
            </template>

            <!-- Bingo-spezifische Konfiguration (nur beim Raum-Erstellen) -->
            <template v-if="gameMode === 'bingo'">
              <div class="text-subtitle2 q-mb-xs">Schwierigkeit</div>
              <q-btn-toggle
                v-model="bingoDifficulty"
                class="q-mb-md full-width"
                spread
                no-caps
                :options="[
                  { label: 'Leicht', value: 'easy' },
                  { label: 'Schwer', value: 'hard' },
                ]"
              />

              <div class="text-subtitle2 q-mb-xs">Antwort-Timer</div>
              <q-btn-toggle
                v-model="bingoTimerMode"
                class="q-mb-md full-width"
                spread
                no-caps
                :options="[
                  { label: '30 Sekunden', value: 'timer' },
                  { label: 'Warten bis alle fertig', value: 'wait-all' },
                ]"
              />
              <div class="text-caption q-mb-md" style="opacity: 0.7">
                Der Host kann den Timer-Modus während des Spiels umschalten.
              </div>

              <div class="text-subtitle2 q-mb-xs">
                Bingos zum Sieg: <strong>{{ bingosToWin }}</strong>
              </div>
              <q-slider
                v-model="bingosToWin"
                :min="1"
                :max="12"
                :step="1"
                label
                label-always
                markers
                class="q-mb-md"
              />
            </template>

            <div class="q-mb-md">
              <q-btn
                outline
                color="secondary"
                icon="folder_open"
                label="Spielstand laden"
                class="full-width"
                @click="openSessionLoadDialog"
              />
              <div
                v-if="savedSessionMeta"
                class="text-caption text-positive q-mt-xs"
              >
                <q-icon name="check_circle" /> Geladen:
                {{ savedSessionMeta.savedAtDisplay }}
              </div>
            </div>

            <div class="text-subtitle2 q-mb-xs">Audio-Modus</div>
            <q-btn-toggle
              v-model="audioMode"
              :options="audioModeOptions"
              color="primary"
              outline
              class="q-mb-sm full-width"
            />
            <q-chip
              :color="audioMode === 'all-clients' ? 'teal' : 'blue-grey'"
              text-color="white"
              :icon="audioMode === 'all-clients' ? 'groups' : 'person'"
              size="sm"
              class="q-mb-md"
            >
              {{
                audioMode === "all-clients"
                  ? "Alle Spieler h\u00f6ren Musik"
                  : "Nur Host h\u00f6rt Musik"
              }}
            </q-chip>

            <!-- Schnellauswahl aus geladenem Spielstand -->
            <div v-if="savedPlayerNames.length > 0" class="q-mb-sm">
              <div class="text-caption text-amber-6 q-mb-xs">
                <q-icon name="manage_history" class="q-mr-xs" />
                Als wer spielst du?
              </div>
              <div class="row q-gutter-xs q-mb-sm">
                <!-- Auswahl ueber `btn-unselected`, nicht ueber `outline`:
                     app.scss fuellt rechteckige Buttons per !important mit dem
                     Akzent, `outline`/`color` bleiben dadurch wirkungslos. -->
                <q-btn
                  v-for="name in savedPlayerNames"
                  :key="name"
                  :class="{ 'btn-unselected': hostSlotName !== name }"
                  size="sm"
                  :label="name"
                  @click="hostSlotName = name"
                />
              </div>
            </div>

            <q-input
              v-model="hostSlotName"
              label="Dein Spielername (Slot)"
              outlined
              dark
              class="q-mb-md"
              :placeholder="currentUsername"
            />

            <q-btn
              color="primary"
              label="Raum erstellen"
              icon="add"
              class="full-width"
              :loading="creatingRoom"
              :disable="!canCreateRoom || creatingRoom"
              @click="handleCreateRoom"
            />
          </q-card-section>
        </q-card>

        <!-- ── Raum beitreten ── -->
        <q-card class="lobby-card">
          <q-card-section>
            <div class="text-h6 q-mb-md">
              <q-icon name="meeting_room" color="primary" class="q-mr-sm" />
              Raum beitreten
            </div>

            <q-input
              v-model="joinCode"
              label="Raumcode (6 Zeichen)"
              outlined
              dark
              maxlength="6"
              class="q-mb-md"
              style="text-transform: uppercase"
              @update:model-value="(val) => (joinCode = val.toUpperCase())"
            >
              <template #prepend>
                <q-icon name="tag" />
              </template>
            </q-input>

            <q-btn
              color="primary"
              label="Raum suchen"
              icon="search"
              class="full-width q-mb-md"
              :loading="lookingUpRoom"
              :disable="joinCode.length < 4"
              @click="handleLookupRoom"
            />

            <!-- Slot-Auswahl nach Lookup -->
            <div v-if="foundRoom">
              <q-separator class="q-mb-md" />
              <div class="text-subtitle2 q-mb-xs">Slot wählen</div>

              <q-list bordered rounded class="q-mb-md" dark>
                <q-item
                  v-for="slot in foundRoom.players"
                  :key="slot.slotId"
                  clickable
                  :active="selectedSlotId === slot.slotId"
                  active-class="item-active-theme"
                  @click="
                    selectedSlotId = slot.slotId;
                    newSlotName = '';
                  "
                >
                  <q-item-section avatar>
                    <AvatarStack
                      :entries="
                        slotAvatarEntries(slot, foundRoom.memberAvatars)
                      "
                      size="34px"
                      :overlap="12"
                      dense
                    />
                  </q-item-section>
                  <q-item-section>
                    <q-item-label>{{ slot.slotName }}</q-item-label>
                    <q-item-label caption>
                      {{ slot.members.join(" & ") }}
                    </q-item-label>
                  </q-item-section>
                  <q-item-section side>
                    <q-badge color="blue"> Als Team beitreten </q-badge>
                  </q-item-section>
                </q-item>

                <!-- Geladene Spieler (wenn Host einen Spielstand geladen hat) -->
                <template
                  v-if="
                    foundRoom.savedPlayers && foundRoom.savedPlayers.length > 0
                  "
                >
                  <q-separator dark />
                  <q-item-label header class="text-caption text-amber-6">
                    <q-icon name="history" class="q-mr-xs" /> Geladene Spieler
                  </q-item-label>
                  <q-item
                    v-for="savedName in foundRoom.savedPlayers"
                    :key="'saved_' + savedName"
                    clickable
                    :active="isSavedPlayerSelected(savedName)"
                    active-class="item-active-theme"
                    @click="selectSavedPlayer(savedName)"
                  >
                    <q-item-section avatar>
                      <q-icon
                        :name="
                          foundRoom.players.find(
                            (s) => s.slotName === savedName,
                          )
                            ? 'group'
                            : 'manage_history'
                        "
                        :color="
                          foundRoom.players.find(
                            (s) => s.slotName === savedName,
                          )
                            ? 'blue'
                            : 'amber-6'
                        "
                      />
                    </q-item-section>
                    <q-item-section>
                      <q-item-label>{{ savedName }}</q-item-label>
                      <q-item-label caption>
                        {{
                          foundRoom.players.find(
                            (s) => s.slotName === savedName,
                          )
                            ? foundRoom.players
                                .find((s) => s.slotName === savedName)
                                .members.join(" & ") + " – Als Team beitreten"
                            : "Gespeicherten Spieler übernehmen"
                        }}
                      </q-item-label>
                    </q-item-section>
                    <q-item-section side>
                      <q-badge
                        :color="
                          foundRoom.players.find(
                            (s) => s.slotName === savedName,
                          )
                            ? 'blue'
                            : 'amber-8'
                        "
                      >
                        {{
                          foundRoom.players.find(
                            (s) => s.slotName === savedName,
                          )
                            ? "Als Team"
                            : "Fortsetzen"
                        }}
                      </q-badge>
                    </q-item-section>
                  </q-item>
                </template>

                <!-- Neuer Slot -->
                <q-item
                  clickable
                  :active="
                    selectedSlotId === null &&
                    !(
                      foundRoom.savedPlayers &&
                      foundRoom.savedPlayers.includes(newSlotName)
                    )
                  "
                  active-class="item-active-theme"
                  @click="
                    selectedSlotId = null;
                    newSlotName = '';
                  "
                >
                  <q-item-section avatar>
                    <q-icon name="person_add" />
                  </q-item-section>
                  <q-item-section>
                    <q-item-label>Neuer Spieler</q-item-label>
                    <q-item-label caption>
                      Eigenen Slot erstellen
                    </q-item-label>
                  </q-item-section>
                </q-item>
              </q-list>

              <q-input
                v-if="selectedSlotId === null"
                v-model="newSlotName"
                label="Dein Spielername"
                outlined
                dark
                class="q-mb-md"
                :placeholder="currentUsername"
              />

              <q-btn
                color="positive"
                label="Beitreten"
                icon="login"
                class="full-width"
                :loading="joiningRoom"
                @click="handleJoinRoom"
              />
            </div>
          </q-card-section>
        </q-card>
      </div>

      <!-- Zurück zum lokalen Spiel: nur anzeigen, wenn NICHT bereits in
           einem Raum – innerhalb einer Lobby ist das kein Verlassen,
           sondern würde nur den Multiplayer-Kontext unerwartet abhängen.
           Zum sauberen Verlassen dient stattdessen der „Raum verlassen"-
           Button in der aktiven-Raum-Karte oben. -->
      <div v-if="!activeRoom" class="text-center q-mt-xl">
        <q-btn
          flat
          color="grey"
          label="Lokal ohne Multiplayer spielen"
          icon="person"
          @click="$router.push('/')"
        />
      </div>
    </div>

    <!-- Spielstand laden Dialog -->
    <q-dialog v-model="showSessionLoadDialog" persistent>
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
            @click="showSessionLoadDialog = false"
          />
          <q-btn
            color="secondary"
            label="Aus Browser laden"
            :disable="!savedSessionMeta"
            @click="confirmLoadFromBrowser"
          />
          <q-btn
            color="primary"
            label="Datei auswählen"
            @click="sessionFileInput.click()"
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

    <!-- Versions-Dialog (nur Host, nur wenn NICHT Battle-Modus) -->
    <q-dialog v-model="showVersionDialog">
      <q-card class="versionen-dialog">
        <q-card-section class="bg-primary">
          <div class="text-h6">
            <q-icon name="library_music" class="q-mr-sm" />
            Song-Versionen wechseln
          </div>
        </q-card-section>
        <q-card-section>
          <div class="text-caption text-grey q-mb-md">
            Wähle eine oder mehrere Versionen aus.
          </div>
          <div class="version-grid version-grid--wide versionen-dialog-grid">
            <button
              v-for="opt in activeRoomVersionOptions"
              :key="opt.value"
              type="button"
              class="version-card-btn"
              :class="{ selected: pendingVersionPools.includes(opt.value) }"
              @click="togglePendingPool(opt.value)"
            >
              <q-card class="timeline-look-card">
                <q-card-section class="timeline-look-content">
                  <img class="version-icon" :src="opt.icon" :alt="opt.label" />
                </q-card-section>
              </q-card>
              <div class="version-name">{{ opt.label }}</div>
            </button>
          </div>
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn
            flat
            color="grey-7"
            label="Abbrechen"
            @click="showVersionDialog = false"
          />
          <q-btn
            color="positive"
            label="Übernehmen"
            icon="check"
            :disable="pendingVersionPools.length === 0"
            @click="confirmVersionChange"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Battle-Modus: eigene Version fuer den aktuellen Nutzer waehlen -->
    <q-dialog v-model="showBattlePoolDialog">
      <q-card style="min-width: 480px; max-width: 92vw">
        <q-card-section class="bg-primary">
          <div class="text-h6">
            <q-icon name="album" class="q-mr-sm" />
            Deine Version wählen
          </div>
        </q-card-section>
        <q-card-section>
          <div class="text-caption text-grey q-mb-md">
            Bereits von anderen Spielern gewählte Versionen sowie Versionen mit
            stark abweichender Songanzahl (±10 zur zuerst gewählten) sind
            ausgegraut.
          </div>
          <div class="version-grid version-grid--wide">
            <button
              v-for="opt in visibleVersions"
              :key="opt.value"
              type="button"
              class="version-card-btn"
              :class="{
                selected: pendingBattlePool === opt.value,
                disabled: isBattlePoolDisabled(opt),
              }"
              :disabled="isBattlePoolDisabled(opt)"
              @click="pendingBattlePool = opt.value"
            >
              <q-card class="timeline-look-card">
                <q-card-section class="timeline-look-content">
                  <img class="version-icon" :src="opt.icon" :alt="opt.label" />
                </q-card-section>
              </q-card>
              <div class="version-name">
                {{ opt.label }}
                <span
                  v-if="opt.trackCount"
                  class="text-caption"
                  style="opacity: 0.7; font-weight: 400"
                >
                  · {{ opt.trackCount }}
                </span>
              </div>
            </button>
          </div>
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn
            flat
            color="grey-7"
            label="Abbrechen"
            @click="showBattlePoolDialog = false"
          />
          <q-btn
            color="positive"
            label="Übernehmen"
            icon="check"
            :disable="!pendingBattlePool"
            @click="confirmBattlePool"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>

    <!-- Ziehung des Startspielers: laeuft bei allen gleichzeitig, weil der
         Server den Gewinner vorgibt. -->
    <q-dialog :model-value="!!starterOverlay" persistent>
      <q-card class="starter-dialog">
        <q-card-section class="text-center">
          <div class="text-subtitle1 q-mb-md">
            {{ starterOverlay?.gewinner === null ? "Wer beginnt?" : "Beginnt:" }}
          </div>
          <div class="starter-list">
            <div
              v-for="(name, index) in starterOverlay?.namen || []"
              :key="index"
              class="starter-name"
              :class="{
                'starter-name--aktiv': starterOverlay?.aktiv === index,
                'starter-name--gewinner': starterOverlay?.gewinner === index,
              }"
            >
              {{ name }}
            </div>
          </div>
        </q-card-section>
      </q-card>
    </q-dialog>

</template>

<script>
import { ref, computed, watch, onBeforeUnmount, onMounted } from "vue";
import { useRouter } from "vue-router";
import { Notify, copyToClipboard } from "quasar";
import { getUsername } from "../utils/authService";
import { storeSlotAvatars } from "../utils/profileService";
import AvatarStack from "../components/AvatarStack.vue";
import { useVersions } from "../composables/useVersions";
import {
  waitForConnect,
  emit,
  emitWithAck,
  on,
  off,
  onReconnect,
  offReconnect,
} from "../utils/socketService";

const AUDIO_MODE_OPTIONS = [
  { label: "Nur Host", value: "host-only", icon: "person" },
  { label: "Alle Spieler", value: "all-clients", icon: "groups" },
];

// Toleranz fuer die "aehnliche Songanzahl"-Regel im Battle-Modus.
const BATTLE_TRACKCOUNT_TOLERANCE = 10;

export default {
  name: "LobbyPage",
  components: { AvatarStack },

  setup() {
    const router = useRouter();
    const currentUsername = ref(getUsername() || "");

    // Versionen zentral (server-getrieben); ausgeblendete filtert useVersions raus.
    const { allVersions, visibleVersions, loadVersions } = useVersions();
    const audioModeOptions = AUDIO_MODE_OPTIONS;

    // Raum erstellen
    const gameMode = ref("normal");
    const selectedSongPools = ref([]);
    const audioMode = ref("host-only");
    const hostSlotName = ref(currentUsername.value);

    // Bingo-spezifische Raum-Konfiguration (nur relevant bei gameMode === "bingo")
    const bingoDifficulty = ref("easy");
    const bingoTimerMode = ref("timer");
    const bingosToWin = ref(3);

    // Sichtbare Versionen fuer den "Raum erstellen"-Grid, abhaengig vom Modus:
    // Film -> nur Soundtracks-Edition, Rest -> alle sichtbaren Versionen.
    const modeFilteredVersions = computed(() => {
      if (gameMode.value === "film") {
        return visibleVersions.value.filter((v) => v.film);
      }
      return visibleVersions.value;
    });

    // Film-Modus: eine Film-Version ohne Filmeintraege darf nicht gewaehlt werden.
    const isFilmBlocked = (option) =>
      gameMode.value === "film" && !option.filmReady;

    // Beim Wechsel in den Film-Modus die Auswahl auf gueltige (film-bereite)
    // Film-Versionen eindampfen. Battle -> Auswahl leeren (Pool spaeter pro Slot).
    watch(gameMode, (mode) => {
      if (mode === "film") {
        const ready = new Set(
          allVersions.value
            .filter((v) => v.film && v.filmReady)
            .map((v) => v.value),
        );
        selectedSongPools.value = selectedSongPools.value.filter((val) =>
          ready.has(val),
        );
      }
      if (mode === "battle") {
        selectedSongPools.value = [];
      }
    });

    const canCreateRoom = computed(() => {
      // Im Battle-Modus wird der Pool spaeter pro Spieler gewaehlt -> ok ohne
      // Vorauswahl. Sonst: mindestens ein Pool ODER ein geladener Spielstand.
      if (gameMode.value === "battle") return true;
      return selectedSongPools.value.length > 0 || sessionLoaded.value;
    });

    /** Spielernamen aus dem geladenen Spielstand (für Host-Auswahl) */
    const savedPlayerNames = computed(() => {
      if (!sessionLoaded.value) return [];
      try {
        const raw = localStorage.getItem(SESSION_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed.players) || parsed.players.length === 0)
          return [];
        return parsed.players
          .map((p) => (typeof p === "string" ? p : p.name))
          .filter(Boolean);
      } catch {
        return [];
      }
    });
    const creatingRoom = ref(false);

    const toggleSongPool = (poolValue) => {
      // Im Film-Modus keine Version ohne Filmeintraege auswaehlbar.
      if (gameMode.value === "film") {
        const option = allVersions.value.find((v) => v.value === poolValue);
        if (option && !option.filmReady) return;
      }
      if (selectedSongPools.value.includes(poolValue)) {
        selectedSongPools.value = selectedSongPools.value.filter(
          (v) => v !== poolValue,
        );
      } else {
        selectedSongPools.value = [...selectedSongPools.value, poolValue];
      }
    };

    // Session laden
    const SESSION_STORAGE_KEY = "hitster-session-save-v1";
    const sessionFileInput = ref(null);
    const savedSessionMeta = ref(null);
    const showSessionLoadDialog = ref(false);
    const sessionLoaded = ref(false);

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

    const openSessionLoadDialog = () => {
      savedSessionMeta.value = readSavedSessionMeta();
      showSessionLoadDialog.value = true;
    };

    const applySongPoolsFromSession = () => {
      try {
        const raw = localStorage.getItem(SESSION_STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        const pools =
          Array.isArray(parsed.songPools) && parsed.songPools.length > 0
            ? parsed.songPools
            : parsed.songPool
              ? [parsed.songPool]
              : [];
        // Ein Spielstand kann auf Versionen zeigen, die inzwischen geloescht
        // wurden. Die wuerden sonst als roher Wert ("custom-1234…") im Raum
        // landen und liessen sich dort nicht mehr abwaehlen.
        const vorhanden = pools.filter((val) =>
          allVersions.value.some((v) => v.value === val),
        );
        if (vorhanden.length > 0) selectedSongPools.value = vorhanden;
        if (vorhanden.length < pools.length) {
          Notify.create({
            type: "warning",
            message:
              pools.length - vorhanden.length === 1
                ? "Eine Version aus dem Spielstand gibt es nicht mehr und wurde übersprungen."
                : `${pools.length - vorhanden.length} Versionen aus dem Spielstand gibt es nicht mehr und wurden übersprungen.`,
          });
        }
      } catch {
        /* ignore */
      }
    };

    const confirmLoadFromBrowser = () => {
      showSessionLoadDialog.value = false;
      sessionLoaded.value = true;
      applySongPoolsFromSession();
    };

    const parseSnapshotFromImport = (text) => {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === "object" && parsed.players) return parsed;
      const rawSession = parsed?.["hitster-session-save-v1"];
      if (typeof rawSession === "string") return JSON.parse(rawSession);
      throw new Error("Datei enthält keinen gültigen Spielstand.");
    };

    const handleSessionFileSelected = async (event) => {
      try {
        const file = event?.target?.files?.[0];
        if (!file) return;
        const text = await file.text();
        const snapshot = parseSnapshotFromImport(text);
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(snapshot));
        savedSessionMeta.value = readSavedSessionMeta();
        showSessionLoadDialog.value = false;
        sessionLoaded.value = true;
        applySongPoolsFromSession();
      } catch (error) {
        Notify.create({
          type: "negative",
          message: `Fehler beim Laden: ${error.message}`,
          timeout: 3500,
        });
      } finally {
        if (event?.target) event.target.value = "";
      }
    };

    // Raum beitreten
    const joinCode = ref("");
    const lookingUpRoom = ref(false);
    const foundRoom = ref(null);
    const selectedSlotId = ref(null);
    const newSlotName = ref(currentUsername.value);
    const joiningRoom = ref(false);

    // Aktiver Raum
    const activeRoom = ref(null);
    const isHost = computed(
      () => activeRoom.value?.hostUsername === currentUsername.value,
    );

    // ── Socket-Listener ──────────────────────────────────────────────────────
    const LOBBY_ROOM_KEY = "hitster-lobby-room";

    const onRoomState = (room) => {
      activeRoom.value = room;
      joiningRoom.value = false;
      lookingUpRoom.value = false;
      creatingRoom.value = false;
      if (room?.code) {
        sessionStorage.setItem(LOBBY_ROOM_KEY, room.code);
      }
    };

    const onGameStarted = (room) => {
      const players = room.players || [];
      const mySlotIndex = players.findIndex((p) =>
        p.members.includes(currentUsername.value),
      );
      const mode = room.settings?.gameMode || "normal";
      // Im Battle-Modus: Pool pro Slot (in Slot-Reihenfolge) und effektive
      // Pool-Liste als Union aller Slot-Pools.
      const isBattle = mode === "battle";
      const perPlayerPools = isBattle ? players.map((p) => p.pool || "") : [];
      const effectivePools = isBattle
        ? [...new Set(perPlayerPools.filter(Boolean))]
        : room.settings?.songPools || ["staffel1"];

      const query = {
        multiplayer: "1",
        roomCode: room.code,
        isHost: room.hostUsername === currentUsername.value ? "1" : "0",
        guestSlotIndex: mySlotIndex >= 0 ? mySlotIndex : 0,
        songPools: effectivePools.join(","),
        songPool: effectivePools[0] || "staffel1",
        audioMode: room.audioMode,
        mode,
        names: players.map((p) => p.slotName).join(","),
        players: players.length,
      };
      if (isBattle) {
        query.playerSongPools = perPlayerPools.join(",");
      }
      if (mode === "bingo") {
        query.bingoDifficulty = room.settings?.bingoDifficulty || "easy";
        query.bingoTimerMode = room.settings?.bingoTimerMode || "timer";
        query.bingoTimerSeconds = String(
          room.settings?.bingoTimerSeconds || 30,
        );
        query.bingosToWin = String(room.settings?.bingosToWin || 3);
        // Karten/Marks pro Team via sessionStorage übergeben (zu groß für URL).
        // Wird in useGameState beim Init gelesen; danach ist der Server
        // via `roomState`-Event autoritativ.
        try {
          if (room.bingoState) {
            sessionStorage.setItem(
              "hitster-bingo-state",
              JSON.stringify(room.bingoState),
            );
          }
        } catch {
          /* ignore quota errors */
        }
      } else {
        // Wechsel WEG von Bingo (z. B. Bingo → Normal): sessionStorage-
        // Rest von einer früheren Bingo-Runde entsorgen, damit
        // `useGameState` den frischen Nicht-Bingo-State nicht mit alten
        // Bingo-Karten mischt.
        try {
          sessionStorage.removeItem("hitster-bingo-state");
        } catch {
          /* ignore */
        }
      }
      if (sessionLoaded.value) {
        query.loadSession = "1";
      }
      // Startspieler kommt vom Server, damit alle denselben haben. Die
      // Spielansicht liest ihn wie im Offlinemodus aus der Query.
      const starter = Number.isInteger(room.startingPlayer)
        ? room.startingPlayer
        : 0;
      query.startingPlayer = String(starter);
      // Profilbilder pro Slot für die Spielansicht ablegen (In-Game-Objekte
      // tragen nur Namen). Server liefert `memberAvatars` im Raum-State.
      storeSlotAvatars(players, room.memberAvatars);
      // replace statt push, damit ein evtl. noch offener /game-Route-
      // Eintrag aus einer vorherigen Runde nicht in der History bleibt
      // und beim Zurück den alten Modus wieder aufruft.
      const weiter = () => router.replace({ path: "/game", query });
      // Wurde ausgelost, sehen alle zuerst die Ziehung. Bei einer festen
      // Wahl des Hosts waere die Animation nur Show und kostet Zeit.
      if (room.startingPlayerWasRandom && players.length > 1) {
        starterAnimation(players, starter, weiter);
      } else {
        weiter();
      }
    };

    // ── Ziehung des Startspielers ────────────────────────────────────────
    // Die Hervorhebung springt durch die Namen und wird dabei langsamer, bis
    // sie beim Gewinner stehenbleibt. Das Ergebnis steht vorher fest, die
    // Animation zeigt es nur.
    const starterOverlay = ref(null);
    let starterTimer = null;

    const starterAnimation = (players, gewinner, fertig) => {
      const namen = players.map((p, i) => slotLabel(p, i));
      starterOverlay.value = { namen, aktiv: 0, gewinner: null };
      const anzahl = namen.length;
      // So viele Umlaeufe, dass es nach Ziehung aussieht, aber bei vielen
      // Spielern nicht zaeh wird. Damit liegt die Dauer immer bei rund zwei
      // bis vier Sekunden, unabhaengig von der Spielerzahl.
      const runden = anzahl >= 7 ? 1 : anzahl >= 5 ? 2 : 3;
      const schritte = runden * anzahl + ((gewinner - 0 + anzahl) % anzahl);
      let schritt = 0;

      const naechster = () => {
        starterOverlay.value = {
          namen,
          aktiv: schritt % anzahl,
          gewinner: null,
        };
        schritt += 1;
        if (schritt > schritte) {
          starterOverlay.value = { namen, aktiv: gewinner, gewinner };
          starterTimer = setTimeout(() => {
            starterOverlay.value = null;
            fertig();
          }, 1100);
          return;
        }
        // Von 60 ms auf rund 320 ms abbremsen (quadratisch, fuehlt sich
        // natuerlicher an als linear).
        const anteil = schritt / schritte;
        const pause = 60 + 260 * anteil * anteil;
        starterTimer = setTimeout(naechster, pause);
      };
      naechster();
    };

    const onError = ({ message }) => {
      Notify.create({ type: "negative", message, timeout: 3500 });
      creatingRoom.value = false;
      joiningRoom.value = false;
      lookingUpRoom.value = false;
      if (message && message.includes("nicht gefunden")) {
        sessionStorage.removeItem(LOBBY_ROOM_KEY);
        activeRoom.value = null;
      }
    };

    const leaveRoom = async () => {
      // Wichtig: Server explizit informieren und AUF ACK warten, damit der
      // Slot SOFORT aufgelöst wird bevor der Nutzer erneut sucht/beitritt.
      // Ohne den Ack konnte ein sofortiger Rejoin den Server treffen, bevor
      // der leaveRoom verarbeitet war – dann sah der Server den Nutzer noch
      // im alten Slot und ignorierte die neue Slot-Wahl.
      const code = activeRoom.value?.code;
      // UI sofort zurücksetzen (Nutzer sieht die Lobby-Auswahl) – der
      // Server-Aufräum-Prozess läuft parallel.
      sessionStorage.removeItem(LOBBY_ROOM_KEY);
      activeRoom.value = null;
      foundRoom.value = null;
      selectedSlotId.value = null;
      newSlotName.value = currentUsername.value;
      if (code) {
        try {
          await emitWithAck("leaveRoom", { roomCode: code });
        } catch {
          // Verbindung weg oder Timeout – disconnect-Karenz räumt später auf.
        }
      }
    };

    const setupListeners = () => {
      removeListeners();
      on("roomState", onRoomState);
      on("gameStarted", onGameStarted);
      on("error", onError);
    };

    const removeListeners = () => {
      off("roomState", onRoomState);
      off("gameStarted", onGameStarted);
      if (starterTimer) clearTimeout(starterTimer);
      off("error", onError);
    };

    const isAuthError = (err) =>
      err?.message?.includes("Token") || err?.message?.includes("abgelaufen");

    // ── Raum erstellen ────────────────────────────────────────────────────────
    const handleCreateRoom = async () => {
      if (!canCreateRoom.value) return;
      creatingRoom.value = true;
      setupListeners();

      let socket;
      try {
        socket = await waitForConnect();
      } catch (err) {
        creatingRoom.value = false;
        Notify.create({
          type: "negative",
          message: isAuthError(err)
            ? "Sitzung abgelaufen. Bitte erneut anmelden."
            : err.message,
          timeout: 3500,
        });
        if (isAuthError(err)) router.push("/login");
        return;
      }

      const savedPlayers = (() => {
        if (!sessionLoaded.value) return null;
        try {
          const raw = localStorage.getItem(SESSION_STORAGE_KEY);
          if (!raw) return null;
          const parsed = JSON.parse(raw);
          if (!Array.isArray(parsed.players) || parsed.players.length === 0)
            return null;
          return parsed.players
            .map((p) => (typeof p === "string" ? p : p.name))
            .filter(Boolean);
        } catch {
          return null;
        }
      })();

      // Nur Versionen in den Raum schicken, die es hier wirklich gibt. Sonst
      // sehen alle einen Eintrag, den niemand aufloesen kann.
      const gueltigePools = selectedSongPools.value.filter((val) =>
        allVersions.value.some((v) => v.value === val),
      );

      emit("createRoom", {
        settings: {
          gameMode: gameMode.value,
          songPools: gueltigePools,
          customVersionsMeta: buildVersionsMeta(gueltigePools),
          audioMode: audioMode.value,
          ...(gameMode.value === "bingo"
            ? {
                bingoDifficulty: bingoDifficulty.value,
                bingoTimerMode: bingoTimerMode.value,
                bingosToWin: bingosToWin.value,
              }
            : {}),
          ...(savedPlayers ? { savedPlayers } : {}),
        },
      });

      socket.once("roomCreated", ({ roomCode }) => {
        Notify.create({
          type: "positive",
          message: `Raum ${roomCode} erstellt!`,
          timeout: 2000,
        });
        emit("joinRoom", {
          roomCode,
          slotId: null,
          slotName: hostSlotName.value || currentUsername.value,
        });
      });
    };

    // ── Raum suchen ───────────────────────────────────────────────────────────
    const handleLookupRoom = async () => {
      const code = joinCode.value.toUpperCase().trim();
      if (!code) return;
      lookingUpRoom.value = true;

      try {
        await waitForConnect();
      } catch (err) {
        lookingUpRoom.value = false;
        Notify.create({
          type: "negative",
          message: isAuthError(err)
            ? "Sitzung abgelaufen. Bitte erneut anmelden."
            : err.message,
          timeout: 3500,
        });
        if (isAuthError(err)) router.push("/login");
        return;
      }
      setupListeners();

      try {
        const info = await emitWithAck("lookupRoom", { roomCode: code });
        foundRoom.value = info;
        selectedSlotId.value = null;
      } catch (err) {
        Notify.create({
          type: "negative",
          message: err.message,
          timeout: 3500,
        });
        foundRoom.value = null;
      } finally {
        lookingUpRoom.value = false;
      }
    };

    // ── Raum beitreten ────────────────────────────────────────────────────────
    const handleJoinRoom = async () => {
      const code = joinCode.value.toUpperCase().trim();
      if (!code) return;
      joiningRoom.value = true;
      try {
        // „Neuer Spieler"-Wahl (slotId=null): vorher explizit leaveRoom
        // schicken, damit ein alter Slot-Rest (aus einer vorherigen Session
        // oder einer 20-Sek-Karenz) definitiv verschwunden ist, BEVOR wir
        // joinen. Sonst kann es passieren, dass der Server den Nutzer noch
        // im alten Team sieht und die Neu-Anlage überspringt.
        if (selectedSlotId.value === null) {
          try {
            await emitWithAck("leaveRoom", { roomCode: code });
          } catch {
            // Nutzer war nicht drin – ok, ignorieren.
          }
        }
        await emitWithAck("joinRoom", {
          roomCode: code,
          slotId: selectedSlotId.value,
          slotName:
            selectedSlotId.value === null
              ? newSlotName.value || currentUsername.value
              : undefined,
        });
      } catch (err) {
        Notify.create({
          type: "negative",
          message: err.message,
          timeout: 3500,
        });
        joiningRoom.value = false;
      }
    };

    // Gespeicherten Spieler auswählen – joinst bestehenden Slot als Team, falls Slot schon existiert
    const selectSavedPlayer = (savedName) => {
      const existing = foundRoom.value?.players.find(
        (s) => s.slotName === savedName,
      );
      if (existing) {
        selectedSlotId.value = existing.slotId;
        newSlotName.value = "";
      } else {
        selectedSlotId.value = null;
        newSlotName.value = savedName;
      }
    };

    const isSavedPlayerSelected = (savedName) => {
      const existing = foundRoom.value?.players.find(
        (s) => s.slotName === savedName,
      );
      if (existing) return selectedSlotId.value === existing.slotId;
      return selectedSlotId.value === null && newSlotName.value === savedName;
    };

    const handleAudioModeChange = (newMode) => {
      emit("host:setAudioMode", { audioMode: newMode });
    };

    // Host wechselt den Spielmodus im aktiven Raum. Beim Wechsel in den
    // Bingo-Modus werden die aktuellen Bingo-Settings mitgeschickt, damit
    // die Server-Defaults (falls Neubelegung nötig) übernommen werden.
    const handleGameModeChange = (newMode) => {
      if (!newMode || newMode === activeRoomGameMode.value) return;
      const bs = activeRoom.value?.settings || {};
      emit("host:setGameMode", {
        gameMode: newMode,
        bingoSettings: {
          bingoDifficulty: bs.bingoDifficulty,
          bingoTimerMode: bs.bingoTimerMode,
          bingoTimerSeconds: bs.bingoTimerSeconds,
          bingosToWin: bs.bingosToWin,
        },
      });
    };

    // Host passt einzelne Bingo-Settings im aktiven Raum an (Schwierigkeit,
    // Timer-Modus, Ziel-Bingos). Wird als partielles Update gesendet – der
    // Server merged mit den bestehenden Werten.
    const handleBingoSettingChange = (key, value) => {
      const payload = {};
      payload[key] = value;
      emit("host:setBingoSettings", payload);
    };

    // ── Song-Versionen im Raum ändern (Host) ─────────────────────────────────
    const showVersionDialog = ref(false);
    const pendingVersionPools = ref([]);

    const activeRoomGameMode = computed(
      () => activeRoom.value?.settings?.gameMode || "normal",
    );

    // Optionen fuer den (host-seitigen) Versionen-Wechsel-Dialog: im Film-Modus
    // nur die Soundtracks-Edition, sonst alle sichtbaren.
    const activeRoomVersionOptions = computed(() => {
      if (activeRoomGameMode.value === "film") {
        return visibleVersions.value.filter((v) => v.film && v.filmReady);
      }
      return visibleVersions.value;
    });

    // Vom Raum geteilte Metadaten (Label/Cover/Trackzahl) eigener bzw.
    // eingeschränkter Versionen – damit alle Clients sie anzeigen können, auch
    // ohne die Version lokal zu besitzen (der Ersteller teilt sie mit).
    const sharedVersionMeta = computed(
      () => activeRoom.value?.settings?.customVersionsMeta || {},
    );

    // Meta der eigenen/eingeschränkten Versionen unter den gewählten Pools bauen.
    // ── Startspieler ─────────────────────────────────────────────────────
    // null heisst "beim Start auslosen". Der Server entscheidet dann einmal
    // fuer alle, damit niemand ein anderes Ergebnis sieht.
    const startingPlayerChoice = computed(() => {
      const v = activeRoom.value?.settings?.startingPlayer;
      return Number.isInteger(v) ? v : null;
    });

    const slotLabel = (slot, index) => {
      if (!slot) return `Spieler ${index + 1}`;
      if (slot.name) return slot.name;
      const mitglieder = slot.members || [];
      return mitglieder.length ? mitglieder.join(", ") : `Spieler ${index + 1}`;
    };

    const startingPlayerText = computed(() => {
      const idx = startingPlayerChoice.value;
      if (idx === null) return "Wird beim Start ausgelost.";
      const slot = (activeRoom.value?.players || [])[idx];
      return `Beginnt: ${slotLabel(slot, idx)}`;
    });

    const setStartingPlayer = (index) => {
      if (!isHost.value) return;
      emit("host:setStartingPlayer", { startingPlayer: index });
    };

    const buildVersionsMeta = (poolValues) => {
      const meta = {};
      for (const value of poolValues || []) {
        const v = allVersions.value.find((x) => x.value === value);
        if (v && (v.custom || v.restricted)) {
          meta[value] = {
            value: v.value,
            label: v.label,
            icon: v.icon || null,
            trackCount: v.trackCount || 0,
          };
        }
      }
      return meta;
    };

    const resolvePoolOption = (value) => {
      const v = allVersions.value.find((x) => x.value === value);
      if (v) return v;
      const m = sharedVersionMeta.value[value];
      if (m) {
        return { value, label: m.label, icon: m.icon, trackCount: m.trackCount };
      }
      // Weder im eigenen Katalog noch vom Host mitgeschickt: die Version wurde
      // geloescht oder nie geteilt. Den rohen Wert anzuzeigen ("custom-1234…")
      // hilft niemandem.
      return {
        value,
        label: "Nicht mehr verfügbar",
        icon: null,
        trackCount: 0,
        fehlt: true,
      };
    };

    const activeSongPoolOptions = computed(() =>
      (activeRoom.value?.settings?.songPools || []).map(resolvePoolOption),
    );

    const getVersionLabel = (value) => {
      const v = allVersions.value.find((x) => x.value === value);
      if (v) return v.label;
      const m = sharedVersionMeta.value[value];
      return m ? m.label : value;
    };

    // Baut die Avatar-Einträge eines Slots (Mitglieder + Profilbild-Pfade aus
    // dem Raum-State) für den AvatarStack. Optional eine explizite Avatar-Map
    // (z. B. aus dem gefundenen Raum beim Beitreten), sonst der aktive Raum.
    const slotAvatarEntries = (slot, avatars) => {
      const map = avatars || activeRoom.value?.memberAvatars || {};
      return (slot?.members || []).map((username) => ({
        username,
        avatar: map[username] || null,
      }));
    };

    // ── Battle-Modus: Pool pro Slot (jeder Spieler waehlt seine Version) ─────
    const mySlot = computed(() =>
      (activeRoom.value?.players || []).find((p) =>
        p.members.includes(currentUsername.value),
      ),
    );
    const mySlotPool = computed(() => mySlot.value?.pool || null);

    // Referenz-Trackcount = trackCount der zuerst gewaehlten Battle-Version
    // (in Slot-Reihenfolge). Solange noch keiner gewaehlt hat, kein Filter.
    const battleReferenceTrackCount = computed(() => {
      const firstChosen = (activeRoom.value?.players || []).find(
        (p) => !!p.pool,
      );
      if (!firstChosen) return null;
      const v = allVersions.value.find((x) => x.value === firstChosen.pool);
      return v?.trackCount ?? null;
    });

    const isBattlePoolDisabled = (option) => {
      // Von einem anderen Spieler gewaehlt?
      const otherPools = (activeRoom.value?.players || [])
        .filter((p) => !p.members.includes(currentUsername.value))
        .map((p) => p.pool)
        .filter(Boolean);
      if (otherPools.includes(option.value)) return true;
      // Trackcount-Filter (nur wenn Referenz existiert und nicht identisch).
      const ref = battleReferenceTrackCount.value;
      if (ref === null) return false;
      const count = option.trackCount || 0;
      if (!count) return false;
      return Math.abs(count - ref) > BATTLE_TRACKCOUNT_TOLERANCE;
    };

    const showBattlePoolDialog = ref(false);
    const pendingBattlePool = ref(null);
    const openBattlePoolDialog = () => {
      pendingBattlePool.value = mySlotPool.value;
      showBattlePoolDialog.value = true;
    };
    const confirmBattlePool = () => {
      if (!pendingBattlePool.value) return;
      emit("player:setSlotPool", {
        pool: pendingBattlePool.value,
        versionMeta:
          buildVersionsMeta([pendingBattlePool.value])[pendingBattlePool.value] ||
          null,
      });
      showBattlePoolDialog.value = false;
    };

    // Blockade-Meldung fuer den Start-Button im Battle-Modus.
    const battleStartBlocker = computed(() => {
      if (activeRoomGameMode.value !== "battle") return "";
      const players = activeRoom.value?.players || [];
      if (players.length === 0) return "Noch keine Spieler im Raum.";
      const missing = players.filter((p) => !p.pool);
      if (missing.length > 0) {
        const names = missing.map((p) => p.slotName).join(", ");
        return `Warten auf Versionsauswahl: ${names}`;
      }
      const pools = players.map((p) => p.pool);
      if (new Set(pools).size !== pools.length) {
        return "Zwei Spieler haben dieselbe Version gewählt.";
      }
      return "";
    });

    const canStartGame = computed(() => {
      const players = activeRoom.value?.players || [];
      if (players.length < 1) return false;
      if (activeRoomGameMode.value === "battle") {
        return battleStartBlocker.value === "";
      }
      return true;
    });

    const openVersionDialog = () => {
      pendingVersionPools.value = [
        ...(activeRoom.value?.settings?.songPools || []),
      ];
      showVersionDialog.value = true;
    };

    const togglePendingPool = (poolValue) => {
      if (pendingVersionPools.value.includes(poolValue)) {
        pendingVersionPools.value = pendingVersionPools.value.filter(
          (v) => v !== poolValue,
        );
      } else {
        pendingVersionPools.value = [...pendingVersionPools.value, poolValue];
      }
    };

    const confirmVersionChange = () => {
      if (pendingVersionPools.value.length === 0) return;
      emit("host:setSongPools", {
        songPools: pendingVersionPools.value,
        versionsMeta: buildVersionsMeta(pendingVersionPools.value),
      });
      showVersionDialog.value = false;
    };

    const handleStartGame = () => {
      emit("host:startGame");
    };

    const copyCode = () => {
      if (!activeRoom.value) return;
      copyToClipboard(activeRoom.value.code).then(() => {
        Notify.create({
          type: "positive",
          message: "Code kopiert!",
          timeout: 1500,
        });
      });
    };

    // Nach Reconnect: Raum automatisch wieder beitreten (z.B. nach kurzer Cloudflare-Unterbrechung)
    // onReconnect feuert NUR bei echten Reconnects – nicht beim ersten Verbindungsaufbau.
    const onSocketReconnect = () => {
      if (activeRoom.value) {
        emit("joinRoom", { roomCode: activeRoom.value.code });
      }
    };
    onReconnect(onSocketReconnect);

    // Nach Page-Reload: gespeicherten Raum automatisch wiederjoinen
    onMounted(async () => {
      loadVersions();
      const savedCode = sessionStorage.getItem(LOBBY_ROOM_KEY);
      if (savedCode && !activeRoom.value) {
        try {
          await waitForConnect();
          setupListeners();
          emit("joinRoom", { roomCode: savedCode });
        } catch (err) {
          sessionStorage.removeItem(LOBBY_ROOM_KEY);
          if (isAuthError(err)) router.push("/login");
        }
      }
    });

    onBeforeUnmount(() => {
      removeListeners();
      offReconnect(onSocketReconnect);
      // Socket NICHT trennen – die Game-Seite braucht ihn noch
    });

    return {
      currentUsername,
      visibleVersions,
      modeFilteredVersions,
      isFilmBlocked,
      audioModeOptions,
      gameMode,
      canCreateRoom,
      starterOverlay,
      startingPlayerChoice,
      startingPlayerText,
      setStartingPlayer,
      slotLabel,
      selectedSongPools,
      toggleSongPool,
      audioMode,
      hostSlotName,
      savedPlayerNames,
      creatingRoom,
      bingoDifficulty,
      bingoTimerMode,
      bingosToWin,
      joinCode,
      lookingUpRoom,
      foundRoom,
      selectedSlotId,
      newSlotName,
      joiningRoom,
      activeRoom,
      activeRoomGameMode,
      activeRoomVersionOptions,
      isHost,
      canStartGame,
      battleStartBlocker,
      mySlotPool,
      getVersionLabel,
      slotAvatarEntries,
      showBattlePoolDialog,
      pendingBattlePool,
      openBattlePoolDialog,
      confirmBattlePool,
      isBattlePoolDisabled,
      handleCreateRoom,
      handleLookupRoom,
      handleJoinRoom,
      selectSavedPlayer,
      isSavedPlayerSelected,
      handleAudioModeChange,
      handleGameModeChange,
      handleBingoSettingChange,
      showVersionDialog,
      pendingVersionPools,
      activeSongPoolOptions,
      openVersionDialog,
      togglePendingPool,
      confirmVersionChange,
      handleStartGame,
      leaveRoom,
      copyCode,
      sessionFileInput,
      savedSessionMeta,
      showSessionLoadDialog,
      openSessionLoadDialog,
      confirmLoadFromBrowser,
      handleSessionFileSelected,
      sessionLoaded,
    };
  },
};
</script>

<style scoped>
.lobby-page {
  min-height: 100vh;
  background: var(--app-bg, #121212);
}
.lobby-container {
  max-width: var(--content-max-width, 1180px);
  margin: 0 auto;
  padding: 28px 16px 48px;
}
.lobby-card {
  width: 100%;
  max-width: 540px;
  color: #fff;
}
/* Hintergrund/Rundung kommen aus der globalen .q-card-Acryl-Regel;
   nur der Rand folgt der Theme-Surface-Farbe (vorher fixes Lila). */
.active-room-card {
  color: #fff;
  border-color: var(--surface-border) !important;
}
.room-code {
  font-family: "Courier New", monospace;
  font-size: 1.5em;
  letter-spacing: 6px;
  color: var(--app-accent);
  font-weight: bold;
}
/* Versionsauswahl-Karten sind zentral in src/css/app.scss definiert (identisch
   mit dem Index). Hier nur die Lobby-spezifische Breiten-Variante unten. */
.gap-sm {
  gap: 8px;
}
.gap-md {
  gap: 12px;
}
.active-pools-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.pool-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 20px;
  padding: 3px 10px 3px 5px;
}
.pool-chip-icon {
  width: 24px;
  height: 24px;
  object-fit: contain;
}
.pool-chip-name {
  font-size: 0.73rem;
  color: #e0e0e0;
}
.version-grid--wide {
  /* Erbt die 4 Spalten aus .version-grid; --wide unterscheidet sich hier nur
     durch einen kleineren minimalen Kachel-Anteil, falls der Dialog schrumpft. */
  grid-template-columns: repeat(4, minmax(0, 1fr));
}
@media (max-width: 599px) {
  .version-grid--wide {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

/* ========== RESPONSIVE / MOBILE ========== */
@media (max-width: 599px) {
  .lobby-container {
    padding: 16px 8px 32px;
  }

  .lobby-container > .row.items-center.justify-between {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  .lobby-container .text-h4 {
    font-size: 1.3rem;
  }

  .lobby-container .text-h5 {
    font-size: 1.1rem;
  }

  .room-code {
    font-size: 1.2em;
    letter-spacing: 4px;
  }

  .lobby-card {
    max-width: 100%;
  }
}

/* Ziehung des Startspielers */
.starter-dialog {
  min-width: 300px;
  background: var(--surface-bg);
  backdrop-filter: var(--surface-blur);
  border-radius: var(--surface-radius);
}
.starter-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.starter-name {
  padding: 10px 16px;
  border-radius: var(--surface-radius);
  border: 2px solid transparent;
  font-size: 1.05rem;
  opacity: 0.55;
  transition:
    transform 90ms ease,
    opacity 90ms ease;
}
.starter-name--aktiv {
  opacity: 1;
  border-color: var(--app-accent);
  transform: scale(1.04);
}
.starter-name--gewinner {
  background: var(--app-accent);
  color: var(--app-on-accent);
  border-color: var(--app-accent);
  transform: scale(1.09);
  font-weight: 600;
}
/* Startspieler-Auswahl in der Lobby */
.starter-choice {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}


/* Versionen-Dialog: feste Breite mit Deckel. Ohne die waechst der Dialog bis
   92vw, und auf einem breiten Monitor werden die vier Kacheln riesig. */
.versionen-dialog {
  width: 640px;
  max-width: 92vw;
}
/* Bei vielen Versionen scrollt die Kachelreihe, statt den Dialog ueber den
   Bildschirmrand hinauswachsen zu lassen.
   Achtung: Der Auswahlring der Kacheln ist ein box-shadow und liegt damit
   AUSSERHALB der Kachel. Sobald overflow-y gesetzt ist, wird overflow-x
   automatisch zu `auto`, der Container beschneidet also auch seitlich und
   schneidet den Ring der linken Spalte ab. Deshalb rundum Platz schaffen und
   ihn seitlich per negativem Aussenabstand wieder hereinholen, damit die
   Kacheln ihre bisherige Breite behalten. */
.versionen-dialog-grid {
  max-height: 58vh;
  overflow-y: auto;
  padding: 12px;
  margin: -12px -12px 0;
}

</style>
