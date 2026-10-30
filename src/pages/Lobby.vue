<template>
  <q-page class="lobby-page">
    <div class="lobby-container">
      <!-- Header -->
      <div class="row items-center justify-between q-mb-lg">
        <!-- Seitenüberschrift als h1 (Struktur für Screenreader); Optik bleibt
             über text-h4, q-my-none nimmt den Browser-Standardabstand weg. -->
        <h1 class="text-h4 q-my-none">
          <q-icon name="sports_esports" class="q-mr-sm" />
          Online-Lobby
        </h1>
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
                  class="text-muted"
                  aria-label="Raumcode kopieren"
                  @click="copyCode"
                >
                  <q-tooltip>Code kopieren</q-tooltip>
                </q-btn>
              </div>
              <div class="text-caption text-muted">
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
                aria-label="Bingos zum Sieg"
                class="q-mb-sm"
                @update:model-value="
                  (v) => handleBingoSettingChange('bingosToWin', v)
                "
              />
            </div>
          </div>

          <!-- Spielerliste -->
          <div class="text-subtitle2 q-mb-xs">
            {{ activeRoomGameMode === "bingo" ? "Teams im Raum" : "Spieler im Raum" }}
          </div>
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
                <!-- Team-Slots heissen „NameA & NameB" und Namen duerfen 40
                     Zeichen lang sein: kuerzen statt umbrechen. -->
                <q-item-label class="ellipsis" :title="slot.slotName">
                  {{ slot.slotName }}
                </q-item-label>
                <q-item-label
                  caption
                  class="ellipsis"
                  :title="slot.members.join(' & ')"
                >
                  {{ slot.members.join(" & ") }}
                </q-item-label>
                <!-- Battle-Modus: gewaehlte Version pro Slot als Zeile -->
                <q-item-label
                  v-if="activeRoomGameMode === 'battle'"
                  caption
                  class="q-mt-xs ellipsis"
                  :title="slot.pool ? getVersionLabel(slot.pool) : ''"
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
              <q-item-section side class="slot-badges">
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
            <!-- Der Versionsname kann lang sein. Als `label` brach der Knopf
                 auf drei Zeilen um (q-btn setzt `nowrap` nur mit dem
                 `no-wrap`-Prop) und schob alles darunter nach unten. Deshalb
                 einzeilig mit Ellipse; der volle Name steht im `title`. -->
            <q-btn
              color="primary"
              icon="album"
              no-wrap
              class="full-width"
              @click="openBattlePoolDialog"
            >
              <span
                class="ellipsis q-ml-sm"
                :title="mySlotPool ? getVersionLabel(mySlotPool) : ''"
              >
                {{
                  mySlotPool
                    ? `Meine Version: ${getVersionLabel(mySlotPool)}`
                    : "Meine Version wählen"
                }}
              </span>
            </q-btn>
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
                size="sm"
                aria-label="Song-Versionen ändern"
                @click="openVersionDialog"
              >
                <span class="gt-xs q-ml-sm">Ändern</span>
              </q-btn>
            </div>
            <div v-if="activeSongPoolOptions.length" class="active-pools-row">
              <div
                v-for="pool in activeSongPoolOptions"
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

          <!-- Startspieler (alle sehen, nur Host kann aendern). Im Bingo
               spielen alle Teams gleichzeitig, einen Startspieler gibt es
               dort nicht. -->
          <div v-if="activeRoomGameMode !== 'bingo'" class="q-mb-md">
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
                no-wrap
                icon="casino"
                :class="{ 'btn-unselected': startingPlayerChoice !== null }"
                @click="setStartingPlayer(null)"
              >
                <span class="q-ml-sm">Auslosen</span>
              </q-btn>
              <!-- Team-Slots heissen „NameA & NameB" und werden lang. Als
                   `label` brach der Text um und die Knoepfe einer Reihe waren
                   unterschiedlich hoch. Einzeilig kuerzen, voller Name im
                   `title`. -->
              <q-btn
                v-for="(slot, index) in activeRoom.players"
                :key="slot.id || index"
                dense
                no-caps
                no-wrap
                :icon="startingPlayerChoice === index ? 'check' : 'person'"
                :class="{ 'btn-unselected': startingPlayerChoice !== index }"
                @click="setStartingPlayer(index)"
              >
                <span class="ellipsis q-ml-sm" :title="slotLabel(slot, index)">
                  {{ slotLabel(slot, index) }}
                </span>
              </q-btn>
            </div>
            <div v-else class="text-caption text-muted">
              {{ startingPlayerText }}
            </div>
            <div v-if="isHost" class="text-caption text-muted q-mt-xs">
              {{ startingPlayerText }}
            </div>
          </div>

          <q-separator class="q-mb-md" />

          <!-- Laufendes Spiel, eigener Slot: zurück in die Spielansicht (etwa
               nach einem versehentlichen Tipp auf „Lobby“). Kein Zwang, der
               Knopf bietet es nur an. -->
          <q-btn
            v-if="canReturnToGame"
            color="primary"
            icon="sports_esports"
            label="Zurück zum Spiel"
            aria-label="Zurück zum laufenden Spiel"
            size="lg"
            class="full-width q-mb-md"
            @click="returnToGame"
          />

          <!-- Spiel starten (nur Host) -->
          <q-btn
            v-if="isHost"
            color="positive"
            label="Spiel starten"
            icon="play_arrow"
            size="lg"
            class="full-width"
            :disable="!canStartGame || startingGame"
            :loading="startingGame"
            @click="handleStartGame"
          />
          <div
            v-else-if="!canReturnToGame"
            class="text-center text-muted q-py-sm"
            role="status"
          >
            <q-spinner color="primary" class="q-mr-md" />
            Warte darauf, dass der Host das Spiel startet …
          </div>
          <div
            v-if="isHost && (activeRoom.players || []).length === 1"
            class="text-caption text-muted q-mt-xs"
          >
            <q-icon name="info" size="xs" class="q-mr-xs" />
            Mit nur einem Platz gibt es keine Einwände und keinen Bingo-Bonus.
          </div>

          <q-btn
            flat
            label="Raum verlassen"
            icon="logout"
            class="full-width q-mt-md"
            @click="leaveRoom"
          />
        </q-card-section>
      </q-card>

      <!-- Raum erstellen / Raum beitreten (nur wenn noch kein aktiver Raum) -->
      <!-- Mit ?view=create/join steht nur eine Karte da: Die nimmt die volle
           Breite wie die lokale Spieleinrichtung, statt schmal in der Mitte
           zu stehen. Ohne Angabe beide nebeneinander wie bisher. -->
      <div
        v-if="!activeRoom"
        :class="
          lobbyView !== 'both'
            ? 'lobby-single'
            : 'row q-gutter-lg justify-center'
        "
      >
        <!-- ── Raum erstellen ── -->
        <!-- Aus dem Hauptmenü kommt man mit ?view=create oder ?view=join und
             sieht dann nur die passende Karte. Ohne Angabe beide wie bisher. -->
        <q-card v-if="lobbyView !== 'join'" class="lobby-card">
          <q-card-section>
            <div class="text-h6 q-mb-md">
              <q-icon name="add_circle" color="primary" class="q-mr-sm" />
              Raum erstellen
            </div>

            <!-- Aufbau wie die lokale Einrichtung (Index, Schritt „Versionen"):
                 Spielmodus, Einstellungen, dann Versionsfrage mit Auswahlkasten
                 und darunter gleich Zurück/Raum erstellen. Das lange Raster
                 kommt erst danach, damit man zum Erstellen nicht scrollen muss. -->
            <div class="text-subtitle1 q-mb-sm">Spielmodus</div>
            <q-btn-toggle
              v-model="gameMode"
              class="full-width"
              :class="gameMode === 'normal' ? 'q-mb-md' : 'q-mb-xs'"
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
              Jeder Spieler wählt seine eigene Version im Raum aus.
            </div>
            <div
              v-if="gameMode === 'bingo'"
              class="text-caption text-muted q-mb-md"
            >
              Bingo-Modus: Jedes Team hat eine 5×5-Bingokarte, pro Runde wird
              eine Kategorie zufällig gewählt.
              {{
                bingoDifficulty === "hard"
                  ? "Schwer: Geraten werden Titel, Künstler, das genaue Jahr, das Jahr ±3 oder das Jahrzehnt."
                  : "Leicht: Geraten wird, ob Solo oder Gruppe singt, ob der Song vor 2000 erschien, das Jahr (±4 oder ±2) oder das Jahrzehnt."
              }}
              Für die passendste Songauswahl wird die „Bingo
              Deutschland"-Version empfohlen.
            </div>

            <!-- Bingo-spezifische Konfiguration (nur beim Raum-Erstellen).
                 Steht vor dem Knopf, weil sie beim Erstellen feststehen muss. -->
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
              <div class="text-caption text-muted q-mb-md">
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
                aria-label="Bingos zum Sieg"
                class="q-mb-md"
              />
            </template>

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
                  ? "Alle Spieler hören Musik"
                  : "Nur Host hört Musik"
              }}
            </q-chip>

            <!-- Ein Bingo-Spielstand liegt beim Server, nicht in einer Datei. -->
            <div v-if="gameMode !== 'bingo'" class="q-mb-md">
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

            <!-- Schnellauswahl aus geladenem Spielstand -->
            <div v-if="savedPlayerNames.length > 0" class="q-mb-sm">
              <div class="text-caption text-amber-6 q-mb-xs">
                <q-icon name="manage_history" class="q-mr-xs" />
                Als wer spielst du?
              </div>
              <div class="row q-gutter-xs q-mb-sm saved-name-choice">
                <!-- Auswahl ueber `btn-unselected`, nicht ueber `outline`:
                     app.scss fuellt rechteckige Buttons per !important mit dem
                     Akzent, `outline`/`color` bleiben dadurch wirkungslos. -->
                <!-- Beschriftung einzeilig kuerzen wie bei `.starter-choice`,
                     sonst werden die Knoepfe einer Reihe unterschiedlich hoch. -->
                <q-btn
                  v-for="name in savedPlayerNames"
                  :key="name"
                  :class="{ 'btn-unselected': hostSlotName !== name }"
                  size="sm"
                  no-wrap
                  @click="hostSlotName = name"
                >
                  <span class="ellipsis" :title="name">{{ name }}</span>
                </q-btn>
              </div>
            </div>

            <q-input
              v-model="hostSlotName"
              label="Dein Spielername (Platz)"
              outlined
              dark
              class="q-mb-md"
              :placeholder="currentUsername"
            />

            <template v-if="gameMode !== 'battle'">
              <div class="text-subtitle1 q-mb-sm">
                Mit welchen Versionen soll gespielt werden?
              </div>
              <!-- Derselbe Kasten wie in der lokalen Einrichtung, damit man bei
                   vielen Versionen nicht das ganze Raster absuchen muss. -->
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
            </template>

            <!-- Knopfzeile wie „Zurück/Weiter" in der lokalen Einrichtung,
                 über dem Raster, damit sie ohne Scrollen erreichbar ist. Auch
                 im Battle-Modus (ohne Raster) steht sie an derselben Stelle.
                 Zurück nur in der Einzelansicht: Mit beiden Karten gibt es
                 den Zurück-Knopf unter den Karten. -->
            <div class="row items-center wizard-top-nav">
              <q-btn
                v-if="lobbyView !== 'both'"
                flat
                color="primary"
                label="Zurück"
                @click="backToOnlineMenu"
              />
              <q-space />
              <q-btn
                color="primary"
                label="Raum erstellen"
                :loading="creatingRoom"
                :disable="!canCreateRoom || creatingRoom"
                @click="handleCreateRoom"
              />
            </div>

            <template v-if="gameMode !== 'battle'">
              <div
                v-if="gameMode === 'film' && modeFilteredVersions.length === 0"
                class="text-caption text-muted q-mb-md"
              >
                Noch keine Film-/Serien-Version vorhanden.
              </div>
              <div class="version-grid">
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
                  :aria-pressed="
                    selectedSongPools.includes(opt.value) ? 'true' : 'false'
                  "
                  @click="toggleSongPool(opt.value)"
                >
                  <q-card class="timeline-look-card">
                    <q-card-section class="timeline-look-content">
                      <!-- Leeres alt: Der Name steht darunter als Text und
                           gibt dem Knopf seinen Namen. -->
                      <img class="version-icon" :src="opt.icon" alt="" />
                    </q-card-section>
                  </q-card>
                  <div class="version-name" :title="opt.label">
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
          </q-card-section>
        </q-card>

        <!-- ── Raum beitreten ── -->
        <q-card v-if="lobbyView !== 'create'" class="lobby-card">
          <q-card-section>
            <div class="text-h6 q-mb-md">
              <q-icon name="meeting_room" color="primary" class="q-mr-sm" />
              Raum beitreten
            </div>

            <!-- Kein natives maxlength: Das zählte auch ein Leerzeichen oder
                 ein unsichtbares Zeichen aus der Zwischenablage mit, und dann
                 passte das sechste Zeichen des Codes nicht mehr hinein.
                 Stattdessen erst alles außer Buchstaben und Ziffern
                 herausfiltern, dann auf 6 Zeichen kürzen. -->
            <q-input
              :model-value="joinCode"
              label="Raumcode (6 Zeichen)"
              outlined
              dark
              class="q-mb-md"
              style="text-transform: uppercase"
              autocapitalize="characters"
              autocomplete="off"
              spellcheck="false"
              @update:model-value="onJoinCodeInput"
            >
              <template #prepend>
                <q-icon name="tag" />
              </template>
            </q-input>

            <!-- Dieselbe Knopfzeile wie beim Erstellen: Zurück links, der
                 nächste Schritt rechts. Ohne Trennlinie, weil nach dem Suchen
                 der gefundene Raum mit eigenem Trenner darunter erscheint und
                 vorher sonst eine Linie am Kartenende hinge. -->
            <div class="row items-center q-mb-md">
              <q-btn
                v-if="lobbyView !== 'both'"
                flat
                color="primary"
                label="Zurück"
                @click="backToOnlineMenu"
              />
              <q-space />
              <q-btn
                color="primary"
                label="Raum suchen"
                :loading="lookingUpRoom"
                :disable="joinCode.length < 4"
                @click="handleLookupRoom"
              />
            </div>

            <!-- Laufendes Spiel mit eigenem Slot: statt der Slot-Auswahl die
                 Rückkehr anbieten. Der Host muss sie freigeben. -->
            <div v-if="foundRoom && foundRoom.rejoin">
              <q-separator class="q-mb-md" />
              <div class="q-mb-md">
                Das Spiel läuft schon. Du spielst als
                <strong>{{ foundRoom.mySlotName }}</strong> mit.
              </div>

              <!-- Die Live-Region steht immer im DOM, damit Screenreader den
                   eingeblendeten Wartehinweis auch ansagen. -->
              <div role="status" aria-live="polite">
                <div
                  v-if="rejoinState === 'pending'"
                  class="text-center text-muted q-py-sm"
                >
                  <q-spinner color="primary" class="q-mr-md" />
                  Warte auf Freigabe durch den Host …
                </div>
              </div>

              <q-btn
                v-if="rejoinState === 'pending'"
                flat
                label="Abbrechen"
                icon="close"
                class="full-width q-mt-sm"
                @click="handleCancelRejoin"
              />
              <q-btn
                v-else
                color="primary"
                icon="sports_esports"
                label="Zurück ins Spiel"
                class="full-width"
                :loading="rejoinState !== null"
                @click="handleRequestRejoin"
              />
            </div>

            <!-- Slot-Auswahl nach Lookup -->
            <div v-else-if="foundRoom">
              <q-separator class="q-mb-md" />
              <div class="text-subtitle2 q-mb-xs">Platz wählen</div>

              <!-- In einer Liste (role="list") sind nur Listeneinträge erlaubt.
                   Der Trenner vor „Geladene Spieler" ist deshalb rein optisch
                   (role="none", ohne das dann unzulässige aria-orientation,
                   das QSeparator sonst mitgibt); die Überschrift selbst ist
                   ein Element ohne Rolle und damit zulässig. -->
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
                    <q-item-label class="ellipsis" :title="slot.slotName">
                      {{ slot.slotName }}
                    </q-item-label>
                    <q-item-label
                      caption
                      class="ellipsis"
                      :title="slot.members.join(' & ')"
                    >
                      {{ slot.members.join(" & ") }}
                    </q-item-label>
                  </q-item-section>
                  <!-- Das lange Badge liess dem Namen nur rund 73px. Unter
                       600px deshalb die Kurzform. -->
                  <q-item-section side class="slot-badges">
                    <q-badge color="blue">
                      <span class="gt-xs">Als Team beitreten</span>
                      <span class="lt-sm">Team</span>
                    </q-badge>
                  </q-item-section>
                </q-item>

                <!-- Geladene Spieler (wenn Host einen Spielstand geladen hat) -->
                <template
                  v-if="
                    foundRoom.savedPlayers && foundRoom.savedPlayers.length > 0
                  "
                >
                  <q-separator dark role="none" :aria-orientation="null" />
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
                      <q-item-label class="ellipsis" :title="savedName">
                        {{ savedName }}
                      </q-item-label>
                      <q-item-label caption class="ellipsis">
                        {{
                          foundRoom.players.find(
                            (s) => s.slotName === savedName,
                          )
                            ? foundRoom.players
                                .find((s) => s.slotName === savedName)
                                .members.join(" & ") + " · Als Team beitreten"
                            : "Gespeicherten Spieler übernehmen"
                        }}
                      </q-item-label>
                    </q-item-section>
                    <q-item-section side class="slot-badges">
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
                      Eigenen Platz erstellen
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

      <!-- Zurück ins Online-Menü: nur anzeigen, wenn NICHT bereits in
           einem Raum. Innerhalb einer Lobby ist das kein Verlassen, sondern
           würde nur den Multiplayer-Kontext unerwartet abhängen; dafür gibt
           es „Raum verlassen" in der aktiven-Raum-Karte oben. In der
           Einzelansicht (?view=create/join) hat die Karte ihren eigenen
           Zurück-Knopf, dann entfällt dieser hier. -->
      <div v-if="!activeRoom && lobbyView === 'both'" class="text-center q-mt-xl">
        <q-btn
          flat
          label="Zurück"
          icon="arrow_back"
          @click="backToOnlineMenu"
        />
      </div>
    </div>

    <!-- Spielstand laden Dialog -->
    <!-- aria-labelledby landet bei QDialog direkt auf dem role="dialog"-
         Element und gibt dem Dialog den sichtbaren Titel als Namen. -->
    <q-dialog
      v-model="showSessionLoadDialog"
      persistent
      aria-labelledby="lobby-session-load-title"
    >
      <q-card style="min-width: 420px">
        <q-card-section class="bg-primary">
          <div id="lobby-session-load-title" class="text-h6">
            Spielstand laden
          </div>
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
        <q-card-actions align="right" class="q-pa-md stacked-actions">
          <q-btn
            flat
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
    <q-dialog
      v-model="showVersionDialog"
      aria-labelledby="lobby-version-dialog-title"
    >
      <q-card class="versionen-dialog">
        <q-card-section class="bg-primary">
          <div id="lobby-version-dialog-title" class="text-h6">
            <q-icon name="library_music" class="q-mr-sm" />
            Song-Versionen wechseln
          </div>
        </q-card-section>
        <q-card-section>
          <div class="text-caption text-muted q-mb-md">
            Wähle eine oder mehrere Versionen aus.
          </div>
          <div class="version-grid version-grid--wide versionen-dialog-grid">
            <button
              v-for="opt in activeRoomVersionOptions"
              :key="opt.value"
              type="button"
              class="version-card-btn"
              :class="{ selected: pendingVersionPools.includes(opt.value) }"
              :aria-pressed="
                pendingVersionPools.includes(opt.value) ? 'true' : 'false'
              "
              @click="togglePendingPool(opt.value)"
            >
              <q-card class="timeline-look-card">
                <q-card-section class="timeline-look-content">
                  <img class="version-icon" :src="opt.icon" alt="" />
                </q-card-section>
              </q-card>
              <div class="version-name" :title="opt.label">{{ opt.label }}</div>
            </button>
          </div>
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Abbrechen" @click="showVersionDialog = false" />
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
    <q-dialog
      v-model="showBattlePoolDialog"
      aria-labelledby="lobby-battle-pool-title"
    >
      <q-card style="min-width: 480px; max-width: 92vw">
        <q-card-section class="bg-primary">
          <div id="lobby-battle-pool-title" class="text-h6">
            <q-icon name="album" class="q-mr-sm" />
            Deine Version wählen
          </div>
        </q-card-section>
        <q-card-section>
          <div class="text-caption text-muted q-mb-md">
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
              :aria-pressed="pendingBattlePool === opt.value ? 'true' : 'false'"
              @click="pendingBattlePool = opt.value"
            >
              <q-card class="timeline-look-card">
                <q-card-section class="timeline-look-content">
                  <img class="version-icon" :src="opt.icon" alt="" />
                </q-card-section>
              </q-card>
              <div class="version-name" :title="opt.label">
                {{ opt.label }}
                <span
                  v-if="opt.trackCount"
                  class="text-caption text-muted"
                  style="font-weight: 400"
                >
                  · {{ opt.trackCount }}<span class="sr-only"> Songs</span>
                </span>
              </div>
            </button>
          </div>
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn
            flat
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
    <q-dialog
      :model-value="!!starterOverlay"
      persistent
      aria-label="Auslosung des Startspielers"
    >
      <q-card class="starter-dialog">
        <q-card-section class="text-center">
          <!-- Die Namen wechseln während der Ziehung im Takt. Angesagt wird
               deshalb nur das Ergebnis, über diese unsichtbare Live-Region. -->
          <div class="sr-only" aria-live="polite">
            {{
              starterOverlay && starterOverlay.gewinner !== null
                ? `Beginnt: ${starterOverlay.namen[starterOverlay.gewinner]}`
                : ""
            }}
          </div>
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
import {
  ref,
  computed,
  watch,
  nextTick,
  onBeforeUnmount,
  onMounted,
} from "vue";
import { useRoute, useRouter } from "vue-router";
import { Notify, copyToClipboard } from "quasar";
import { getUsername } from "../utils/authService";
import { storeSlotAvatars } from "../utils/profileService";
import AvatarStack from "../components/AvatarStack.vue";
import { useVersions } from "../composables/useVersions";
import { metaIcon } from "../utils/versionsCatalog";
import { encodeNamesQuery } from "../composables/useGameState";
import { parseSnapshotText } from "../utils/savedGames";
import { useRejoinRequests } from "../composables/useRejoinRequests";
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
    const route = useRoute();
    const currentUsername = ref(getUsername() || "");

    // Vorauswahl aus dem Hauptmenü: nur „Raum erstellen" oder nur „Raum
    // beitreten" zeigen. Alles andere (auch ohne Angabe) zeigt beide Karten.
    const lobbyView = computed(() => {
      const view = (route.query.view || "").toString();
      return view === "create" || view === "join" ? view : "both";
    });

    // Versionen zentral (server-getrieben); ausgeblendete filtert useVersions raus.
    const { allVersions, visibleVersions, loadVersions } = useVersions();
    const audioModeOptions = AUDIO_MODE_OPTIONS;

    // Zurück ins Untermenü „Online spielen" (Knopfzeile der Karten und der
    // Zurück-Knopf unter beiden Karten).
    const backToOnlineMenu = () =>
      router.push({ path: "/", query: { menu: "online" } });

    // Raum erstellen
    const gameMode = ref("normal");
    const selectedSongPools = ref([]);

    // Auswahl für den Kasten „Ausgewählte Versionen" wie im lokalen Start.
    // Unbekannte Werte (etwa noch nicht geladen) fallen raus.
    const selectedSongPoolOptions = computed(() =>
      selectedSongPools.value
        .map((value) => allVersions.value.find((v) => v.value === value))
        .filter(Boolean),
    );
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
      return selectedSongPools.value.length > 0 || sessionUsable.value;
    });

    /** Spielernamen aus dem geladenen Spielstand (für Host-Auswahl) */
    const savedPlayerNames = computed(() => {
      if (!sessionUsable.value) return [];
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
    // Im Bingo ist „Spielstand laden“ ausgeblendet; ein vorher geladener
    // Stand gilt dort nicht.
    const sessionUsable = computed(
      () => sessionLoaded.value && gameMode.value !== "bingo",
    );

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

    // Aus dem Hauptmenü („Online spielen", „Spielstand laden") kommt man mit
    // ?session=1; der gewählte Stand liegt dann schon im Spielstand-Speicher.
    // Er wird wie über „Aus Browser laden" übernommen, dazu der Spielmodus des
    // Stands. Die Versionen müssen dafür geladen sein, sonst fielen alle
    // Versionen des Stands als „gibt es nicht mehr" heraus.
    const applySessionFromRoute = async (versionsReady) => {
      if ((route.query.session || "").toString() !== "1") return;
      try {
        await versionsReady;
      } catch {
        /* offline: mit den vorhandenen Versionen weiter */
      }
      let snapshot = null;
      try {
        snapshot = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) || "null");
      } catch {
        snapshot = null;
      }
      if (!snapshot) {
        Notify.create({
          type: "warning",
          message: "Kein Spielstand zum Laden gefunden.",
        });
        return;
      }
      // Bingo-Stände liegen beim Server; nur die übrigen Modi übernehmen.
      if (["normal", "film", "battle"].includes(snapshot.gameMode)) {
        gameMode.value = snapshot.gameMode;
      }
      // Erst den Modus-Watcher laufen lassen, er leert bzw. filtert die
      // Versionsauswahl. Danach die Versionen des Stands setzen.
      await nextTick();
      savedSessionMeta.value = readSavedSessionMeta();
      sessionLoaded.value = true;
      applySongPoolsFromSession();
    };

    const handleSessionFileSelected = async (event) => {
      try {
        const file = event?.target?.files?.[0];
        if (!file) return;
        const text = await file.text();
        const snapshot = parseSnapshotText(text);
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
    const onJoinCodeInput = (val) => {
      const roh = String(val ?? "");
      const sauber = roh
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 6);
      // Bleibt der bereinigte Wert gleich (etwa nur ein Leerzeichen getippt),
      // merkt QInput keine Änderung und zeigt das Zeichen weiter an. Deshalb
      // kurz den rohen Wert setzen, damit das Feld den sauberen übernimmt.
      if (sauber === joinCode.value && sauber !== roh) {
        joinCode.value = roh;
        nextTick(() => {
          joinCode.value = sauber;
        });
        return;
      }
      joinCode.value = sauber;
    };
    const lookingUpRoom = ref(false);
    const foundRoom = ref(null);
    const selectedSlotId = ref(null);
    const newSlotName = ref(currentUsername.value);
    const joiningRoom = ref(false);

    // Rückkehr ins laufende Spiel: null, "sending" (Anfrage unterwegs),
    // "pending" (wartet auf den Host) oder "joining" (freigegeben, Beitritt
    // läuft). Der Code wird gemerkt, weil der Nutzer das Eingabefeld während
    // des Wartens ändern kann.
    const rejoinState = ref(null);
    let rejoinCode = null;

    // Aktiver Raum
    const activeRoom = ref(null);
    const isHost = computed(
      () => activeRoom.value?.hostUsername === currentUsername.value,
    );

    // ── Socket-Listener ──────────────────────────────────────────────────────
    const LOBBY_ROOM_KEY = "hitster-lobby-room";

    const onRoomState = (room) => {
      const vorherHost = activeRoom.value?.hostUsername;
      activeRoom.value = room;
      joiningRoom.value = false;
      lookingUpRoom.value = false;
      creatingRoom.value = false;
      if (room?.gameStarted) endStartingGame();
      if (room?.code) {
        sessionStorage.setItem(LOBBY_ROOM_KEY, room.code);
      }
      // Nach freigegebener Rückkehr direkt in die Spielansicht. Ist das Spiel
      // inzwischen vorbei, bleibt man einfach im Raum.
      if (rejoinState.value === "joining" && room?.code === rejoinCode) {
        rejoinState.value = null;
        rejoinCode = null;
        foundRoom.value = null;
        if (room.gameStarted && mySlotIndexIn(room) >= 0) returnToGame();
        return;
      }
      // Host-Wechsel, während man hier in der Lobby steht: Ohne Host in der
      // Spielansicht stünde das Spiel für alle still. Also direkt ins Spiel;
      // die Spielansicht übernimmt dort den Stand des Servers. Läuft gerade
      // die Auslosung des Startspielers, führt deren Ende ohnehin hinein.
      if (
        room?.gameStarted &&
        room.hostUsername === currentUsername.value &&
        vorherHost !== currentUsername.value &&
        mySlotIndexIn(room) >= 0 &&
        !starterOverlay.value
      ) {
        returnToGame();
      }
    };

    // Läuft im Raum ein Spiel und hat man dort einen Slot, führt ein Knopf
    // zurück in die Spielansicht. Der Raum ist nach „Lobby“ weiter verbunden.
    const mySlotIndexIn = (room) =>
      (room?.players || []).findIndex((p) =>
        (p.members || []).includes(currentUsername.value),
      );
    // Für Gäste immer. Ein Host nur, wenn der Server einen Spielstand hat:
    // Die Spielansicht übernimmt ihn dann (useMultiplayer), statt mit leerem
    // Stand den der anderen zu überschreiben.
    const canReturnToGame = computed(
      () =>
        !!activeRoom.value?.gameStarted &&
        (!isHost.value || !!activeRoom.value?.gameState) &&
        mySlotIndexIn(activeRoom.value) >= 0,
    );

    // Query für /game aus dem Raum bauen (Spielstart und Rückkehr).
    const buildGameQuery = (room) => {
      const players = room.players || [];
      const mySlotIndex = mySlotIndexIn(room);
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
        names: encodeNamesQuery(players.map((p) => p.slotName)),
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
      // Startspieler kommt vom Server, damit alle denselben haben. Die
      // Spielansicht liest ihn wie im Offlinemodus aus der Query.
      const starter = Number.isInteger(room.startingPlayer)
        ? room.startingPlayer
        : 0;
      query.startingPlayer = String(starter);
      // Profilbilder pro Slot für die Spielansicht ablegen (In-Game-Objekte
      // tragen nur Namen). Server liefert `memberAvatars` im Raum-State.
      storeSlotAvatars(players, room.memberAvatars);
      return query;
    };

    // Zurück ins laufende Spiel. Den aktuellen Stand holt sich die
    // Spielansicht beim Server (`guest:requestSync`).
    const returnToGame = () => {
      const room = activeRoom.value;
      if (!room?.gameStarted) return;
      router.replace({ path: "/game", query: buildGameQuery(room) });
    };

    const onGameStarted = (room) => {
      endStartingGame();
      const players = room.players || [];
      const query = buildGameQuery(room);
      if (sessionLoaded.value && room.settings?.gameMode !== "bingo") {
        query.loadSession = "1";
      }
      const starter = Number(query.startingPlayer);
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
      endStartingGame();
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

    // ── Rückkehr ins laufende Spiel (anfragende Seite) ─────────────────────
    const resetRejoin = () => {
      rejoinState.value = null;
      rejoinCode = null;
    };

    // Ohne slotId: Für den Server ist das der Reconnect-Fall, er setzt den
    // Nutzer auf seinen alten Slot. Den Wechsel ins Spiel erledigt
    // onRoomState, sobald der Raum-State da ist.
    const joinAfterRejoin = async () => {
      rejoinState.value = "joining";
      try {
        await emitWithAck("joinRoom", { roomCode: rejoinCode });
        // Stand der Socket schon im Raum, kam der Raum-State womöglich vor
        // dem Wechsel auf "joining". Dann mit dem bekannten Stand weiter.
        if (
          rejoinState.value === "joining" &&
          activeRoom.value?.code === rejoinCode
        ) {
          onRoomState(activeRoom.value);
        }
      } catch (err) {
        Notify.create({ type: "negative", message: err.message, timeout: 3500 });
        resetRejoin();
      }
    };

    const onRejoinAnswer = ({ roomCode, accepted } = {}) => {
      // Die Antwort kann theoretisch vor dem Ack von requestRejoin eintreffen,
      // deshalb zählt auch "sending".
      if (rejoinState.value !== "pending" && rejoinState.value !== "sending")
        return;
      if (roomCode && roomCode !== rejoinCode) return;
      if (accepted) {
        joinAfterRejoin();
        return;
      }
      resetRejoin();
      foundRoom.value = null;
      Notify.create({
        type: "negative",
        message: "Der Host hat die Rückkehr abgelehnt.",
        timeout: 3500,
      });
    };

    // Anfrage an den Server schicken. `approved` heißt: kein Host verbunden
    // (man wird selbst Host) oder man ist schon im Raum, also gleich beitreten.
    // Beim erneuten Senden nach einem Reconnect bleibt die Anzeige auf
    // „Warte auf Freigabe“ stehen.
    const sendRejoinRequest = async (code) => {
      if (rejoinState.value !== "pending") rejoinState.value = "sending";
      try {
        const res = await emitWithAck("requestRejoin", { roomCode: code });
        if (
          (rejoinState.value !== "sending" && rejoinState.value !== "pending") ||
          rejoinCode !== code
        ) {
          return;
        }
        if (res?.approved) {
          await joinAfterRejoin();
        } else if (res?.pending) {
          rejoinState.value = "pending";
        } else {
          resetRejoin();
        }
      } catch (err) {
        if (rejoinCode !== code) return;
        Notify.create({ type: "negative", message: err.message, timeout: 3500 });
        resetRejoin();
      }
    };

    const handleRequestRejoin = async () => {
      if (rejoinState.value !== null) return;
      const code = (foundRoom.value?.code || joinCode.value)
        .toUpperCase()
        .trim();
      if (!code) return;
      rejoinCode = code;
      // Sicherstellen, dass rejoinAnswer und roomState schon mithören.
      setupListeners();
      await sendRejoinRequest(code);
    };

    // Offene Anfrage zurückziehen, damit beim Host kein Dialog stehen bleibt.
    const withdrawRejoin = () => {
      const code = rejoinCode;
      const offen =
        rejoinState.value === "pending" || rejoinState.value === "sending";
      resetRejoin();
      if (!offen || !code) return;
      emitWithAck("cancelRejoin", { roomCode: code }).catch(() => {
        // Anfrage war schon erledigt oder Verbindung weg, nichts zu tun.
      });
    };

    const handleCancelRejoin = () => {
      withdrawRejoin();
    };

    const setupListeners = () => {
      removeListeners();
      on("roomState", onRoomState);
      on("gameStarted", onGameStarted);
      on("error", onError);
      on("rejoinAnswer", onRejoinAnswer);
      // Host-Seite: Rückkehr-Anfragen anderer Spieler (modulweit, idempotent).
      useRejoinRequests();
    };

    const removeListeners = () => {
      off("roomState", onRoomState);
      off("gameStarted", onGameStarted);
      if (starterTimer) clearTimeout(starterTimer);
      off("error", onError);
      off("rejoinAnswer", onRejoinAnswer);
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
        if (!sessionUsable.value) return null;
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
      // Neue Suche: eine noch offene Rückkehr-Anfrage gilt nicht mehr.
      withdrawRejoin();
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
            // Mitspieler lösen das Cover selbst auf (resolveCover). `icon`
            // bleibt für ältere Clients, der Server lässt davon nur
            // Data-URLs und relative Pfade durch.
            cover: v.cover || null,
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
        return {
          value,
          label: m.label,
          icon: metaIcon(m),
          trackCount: m.trackCount,
        };
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

    // Doppelklick-Schutz: Der Knopf bleibt gesperrt, bis der Start beim
    // Server angekommen ist (gameStarted bzw. roomState), ein Fehler kommt
    // oder spätestens nach einer Frist, falls der Server still verwirft.
    const startingGame = ref(false);
    let startingGameTimer = null;
    const endStartingGame = () => {
      startingGame.value = false;
      if (startingGameTimer) {
        clearTimeout(startingGameTimer);
        startingGameTimer = null;
      }
    };
    const handleStartGame = () => {
      if (startingGame.value) return;
      if (!emit("host:startGame")) {
        Notify.create({
          type: "negative",
          message: "Keine Verbindung zum Server. Bitte gleich noch einmal versuchen.",
          timeout: 3500,
        });
        return;
      }
      startingGame.value = true;
      startingGameTimer = setTimeout(endStartingGame, 10000);
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
      // Eine wartende Rückkehr-Anfrage hing am alten Socket, der Server hat
      // sie mit ihm verworfen. Mit dem gemerkten Code neu stellen.
      if (rejoinState.value === "pending" && rejoinCode) {
        sendRejoinRequest(rejoinCode);
      }
    };
    onReconnect(onSocketReconnect);

    // Nach Page-Reload: gespeicherten Raum automatisch wiederjoinen
    onMounted(async () => {
      const versionsReady = loadVersions();
      applySessionFromRoute(versionsReady);
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
      // Wer die Seite verlässt, wartet nicht mehr auf den Host.
      withdrawRejoin();
      removeListeners();
      offReconnect(onSocketReconnect);
      endStartingGame();
      // Socket NICHT trennen – die Game-Seite braucht ihn noch
    });

    return {
      currentUsername,
      lobbyView,
      backToOnlineMenu,
      selectedSongPoolOptions,
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
      onJoinCodeInput,
      lookingUpRoom,
      foundRoom,
      selectedSlotId,
      newSlotName,
      joiningRoom,
      rejoinState,
      handleRequestRejoin,
      handleCancelRejoin,
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
      startingGame,
      leaveRoom,
      canReturnToGame,
      returnToGame,
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
.lobby-single .lobby-card {
  max-width: none;
}
/* Kasten „Ausgewählte Versionen" und Knopfzeile darunter: Abbild der
   gleichnamigen Klassen aus Index.vue (dort scoped), damit lokale
   Einrichtung und Raum erstellen gleich aussehen. Die Chips selbst
   (.active-pools-row/.pool-chip) kommen zentral aus app.scss. */
.selected-pools-box {
  margin-bottom: 12px;
  padding: 10px 12px;
  border: 1px solid var(--surface-border);
  border-radius: var(--surface-radius);
}
.wizard-top-nav {
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--surface-border, rgba(255, 255, 255, 0.08));
}
.lobby-card {
  width: 100%;
  max-width: 540px;
  /* Flächenschrift über das Token statt fest #fff (Theming-Regel). */
  color: var(--app-on-surface);
}
/* Hintergrund/Rundung kommen aus der globalen .q-card-Acryl-Regel;
   nur der Rand folgt der Theme-Surface-Farbe (vorher fixes Lila). */
.active-room-card {
  color: var(--app-on-surface);
  border-color: var(--surface-border) !important;
}
.room-code {
  font-family: "Courier New", monospace;
  font-size: 1.5em;
  letter-spacing: 6px;
  /* Akzent als Textfarbe auf der Fläche: die lesbare Variante (>= 4,5:1). */
  color: var(--app-accent-text);
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
/* Versions-Chips (.active-pools-row/.pool-chip) liegen zentral in app.scss,
   weil der lokale Start (Index) dieselbe Anzeige nutzt. */
.version-grid--wide {
  /* Erbt die 4 Spalten aus .version-grid; --wide unterscheidet sich hier nur
     durch einen kleineren minimalen Kachel-Anteil, falls der Dialog schrumpft. */
  grid-template-columns: repeat(4, minmax(0, 1fr));
}
@media (max-width: 599px) {
  .version-grid--wide {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  /* Auf Touch sind zwei ineinander liegende Scrollbereiche unangenehm. Die
     Dialogkarte scrollt bereits (zentrale Regel in app.scss), deshalb hier
     die eigene Deckelung aufheben. Ohne `overflow` braucht es auch die
     Polster-/Aussenabstand-Kompensation fuer den Auswahlring nicht mehr. */
  .versionen-dialog-grid {
    max-height: none;
    overflow: visible;
    padding: 0;
    margin: 0;
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
  /* Eigene Schriftfarbe: Ohne sie erbte die Karte die Seiten-Schriftfarbe,
     die bei hellen Themes dunkel ist und auf der dunklen Fläche unterging. */
  color: var(--app-on-surface);
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
  /* Nicht aktive Namen gedämpft über die Farbe statt opacity: 55 % Deckkraft
     lag auf hellen Themes deutlich unter 4,5:1. */
  color: var(--app-on-surface-muted);
  transition:
    transform 90ms ease,
    color 90ms ease;
}
.starter-name--aktiv {
  color: var(--app-on-surface);
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
/* Ein einzelner Knopf darf nie breiter als die Reihe werden; gekuerzt wird
   die Beschriftung (siehe `ellipsis` im Template), nicht der Knopf. */
.starter-choice .q-btn,
.saved-name-choice .q-btn {
  max-width: 100%;
}

/* Die Abzeichen rechts in den Slot-Listen behalten ihre Breite, gekuerzt
   werden die Namen links. */
.slot-badges {
  flex-shrink: 0;
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
