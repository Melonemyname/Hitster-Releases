<template>
  <q-page class="game-page">
    <!-- ── Bingo-Modus: Runden-Flow (Etappen 3–7) ───────────────────────
         Der Server ist autoritativ (siehe server/rooms.js). Diese Ansicht
         spiegelt `bingoState.round` per Phase und liefert die Aktionen
         (Ziehen, Antworten, Auflösen, Markieren, Bonus, nächste Runde).
    -->
    <template v-if="gameMode === 'bingo'">
      <div class="bingo-page">
        <!-- Obere Acryl-Fläche (nur Kopf-Buttons/Chips) – vom Randomizer
             getrennt, damit oben Lobby/Schwierigkeit/Timer/Bingos und darunter
             der Rate-Bereich (mit Button) in eigenen Flächen liegen. -->
        <div class="bingo-header-panel">
          <div class="bingo-header">
            <q-btn
              flat
              color="grey"
              icon="logout"
              label="Lobby"
              @click="handleEndGame"
            />
            <div class="bingo-header__chips">
              <q-chip
                :color="
                  bingoSettings.difficulty === 'hard' ? 'deep-orange' : 'green'
                "
                text-color="white"
                icon="whatshot"
                square
                dense
              >
                {{ bingoSettings.difficulty === "hard" ? "Schwer" : "Leicht" }}
              </q-chip>
              <q-chip
                color="blue-grey"
                text-color="white"
                icon="timer"
                square
                dense
              >
                {{
                  bingoSettings.timerMode === "wait-all"
                    ? "Warten"
                    : `${bingoSettings.timerSeconds}s`
                }}
              </q-chip>
              <q-chip
                color="purple"
                text-color="white"
                icon="emoji_events"
                square
                dense
              >
                {{ bingoSettings.bingosToWin }} Bingo(s)
              </q-chip>
              <q-chip
                v-if="bingoRound?.roundNumber"
                color="primary"
                text-color="white"
                icon="casino"
                square
                dense
              >
                Runde {{ bingoRound.roundNumber }}
              </q-chip>
            </div>
            <q-btn
              round
              flat
              color="white"
              icon="info"
              @click="showBingoLegend = true"
            >
              <q-tooltip>Farben &amp; Regeln</q-tooltip>
            </q-btn>
            <!-- Bingo: Einstellungsrad (nur Host). Bündelt die Host-Werkzeuge
               analog zu den anderen Modi: Kreuze zurücksetzen, Kreuze
               korrigieren, komplettes Spiel zurücksetzen, zur Lobby. -->
            <q-btn
              v-if="!multiplayerMode || multiplayerIsHost"
              round
              flat
              color="white"
              icon="settings"
              @click="showBingoSettingsDialog = true"
            >
              <q-tooltip>Einstellungen</q-tooltip>
            </q-btn>
          </div>
        </div>
        <!-- /.bingo-header-panel -->

        <!-- Runden-Panel: Kategorie-Strip + Phasen-abhängiger Inhalt.
             Eigenständige Acryl-Fläche (siehe .bingo-round-panel in Game.scss). -->
        <div class="bingo-round-panel">
          <!-- Kategorie-Strip (Reveal-Animation & Runden-Highlight) -->
          <div class="bingo-category-strip">
            <div
              v-for="(cat, i) in bingoOrderedCategories"
              :key="cat.id"
              class="bingo-category-chip"
              :class="{
                'bingo-category-chip--active':
                  bingoHighlightedCategoryIndex === i,
                'bingo-category-chip--dimmed':
                  bingoHighlightedCategoryIndex !== -1 &&
                  bingoHighlightedCategoryIndex !== i &&
                  !bingoRevealAnimating,
              }"
              :style="{ '--cat-color': bingoCategoryColorHex(cat.color) }"
            >
              {{ cat.shortLabel }}
            </div>
          </div>

          <div class="bingo-phase-content">
            <!-- Sieg -->
            <template v-if="bingoWinners && bingoWinners.length">
              <div class="text-h5 text-center q-mb-sm">
                <q-icon name="emoji_events" class="q-mr-sm" />
                {{ bingoWinners.length > 1 ? "Geteilter Sieg!" : "Sieg!" }}
              </div>
              <div class="text-center text-body1 q-mb-sm">
                {{ bingoWinnerNames.join(", ") }}
              </div>
              <div class="text-center">
                <q-btn
                  color="grey-7"
                  icon="home"
                  label="Zur Lobby"
                  @click="handleEndGame"
                />
              </div>
            </template>

            <!-- Idle: Runde starten -->
            <template v-else-if="!bingoRound || bingoRound.phase === 'idle'">
              <div class="text-center">
                <template v-if="multiplayerIsHost">
                  <q-btn
                    color="primary"
                    size="lg"
                    icon="casino"
                    label="Runde starten"
                    :loading="loadingNextSong"
                    :disable="loadingNextSong"
                    @click="onBingoDrawCard"
                  />
                </template>
                <template v-else>
                  <q-spinner color="primary" size="24px" />
                  <span class="q-ml-sm">Warte auf den Host …</span>
                </template>
              </div>
            </template>

            <!-- Reveal-Animation läuft -->
            <template v-else-if="bingoRound.phase === 'reveal'">
              <div class="text-center text-body1">
                <q-icon name="auto_awesome" class="q-mr-sm" />
                Kategorie wird gewählt …
              </div>
            </template>

            <!-- Antwortphase -->
            <template v-else-if="bingoRound.phase === 'answering'">
              <div class="text-center text-h6 q-mb-xs">
                {{ bingoCurrentCategoryFull?.label }}
              </div>
              <div
                class="text-center text-caption q-mb-sm"
                style="opacity: 0.8"
              >
                {{ bingoCurrentCategoryFull?.description }}
              </div>
              <div class="bingo-answer-wrapper">
                <BingoAnswerInput
                  :category="bingoCurrentCategoryFull || bingoRound.category"
                  :model-value="bingoTeamAnswer"
                  :disabled="!bingoIAmInATeam"
                  @update:model-value="onBingoTeamAnswerInput"
                />
              </div>
              <div
                class="row items-center justify-center q-mt-sm gap-md bingo-host-actions"
              >
                <!-- Antwort-Zähler: für alle sichtbar, zeigt wie viele Teams
                     ihre Antwort bereits abgeschickt haben. -->
                <q-chip
                  :color="bingoAllTeamsAnswered ? 'positive' : 'blue-grey'"
                  text-color="white"
                  :icon="
                    bingoAllTeamsAnswered ? 'check_circle' : 'hourglass_empty'
                  "
                  dense
                >
                  {{ bingoAnsweredCount }} / {{ bingoTotalTeams }} geantwortet
                </q-chip>
                <template
                  v-if="
                    bingoSettings.timerMode === 'timer' &&
                    bingoSecondsRemaining !== null
                  "
                >
                  <q-chip
                    color="blue-grey"
                    text-color="white"
                    icon="timer"
                    dense
                  >
                    {{ bingoSecondsRemaining }}s
                  </q-chip>
                </template>
                <template v-if="multiplayerIsHost">
                  <q-btn
                    color="positive"
                    icon="check"
                    :label="
                      bingoAllTeamsAnswered
                        ? 'Runde auflösen'
                        : 'Trotzdem auflösen'
                    "
                    size="sm"
                    @click="onBingoResolveRound"
                  >
                    <q-tooltip v-if="!bingoAllTeamsAnswered">
                      Es haben noch nicht alle Teams geantwortet ({{
                        bingoAnsweredCount
                      }}
                      / {{ bingoTotalTeams }}).
                    </q-tooltip>
                  </q-btn>
                  <q-btn
                    outline
                    color="warning"
                    icon="skip_next"
                    label="Skip"
                    size="sm"
                    @click="onBingoSkipRound"
                  />
                  <q-btn-toggle
                    :model-value="bingoSettings.timerMode"
                    :options="[
                      { label: 'Timer', value: 'timer' },
                      { label: 'Warten', value: 'wait-all' },
                    ]"
                    color="primary"
                    outline
                    size="sm"
                    spread
                    @update:model-value="onBingoSetTimerMode"
                  />
                </template>
              </div>
            </template>

            <!-- Host wartet auf Solo/Gruppe-Klassifikation -->
            <template v-else-if="bingoRound.phase === 'awaiting-solo-group'">
              <div class="text-center text-h6 q-mb-xs">Solo oder Gruppe?</div>
              <div class="text-center text-caption q-mb-md">
                Der Song ist noch nicht klassifiziert. Der Host entscheidet
                einmalig; die Klassifikation wird für zukünftige Runden
                gespeichert.
              </div>
              <template v-if="multiplayerIsHost">
                <div class="row items-center justify-center gap-md">
                  <q-btn
                    color="primary"
                    label="Solo"
                    icon="person"
                    @click="onBingoClassifySoloGroup('solo')"
                  />
                  <q-btn
                    color="primary"
                    label="Gruppe"
                    icon="group"
                    @click="onBingoClassifySoloGroup('group')"
                  />
                </div>
              </template>
              <template v-else>
                <div class="text-center">
                  <q-spinner color="primary" size="24px" />
                  <span class="q-ml-sm">Warte auf den Host …</span>
                </div>
              </template>
            </template>

            <!-- Auflösung / Markieren / Bonus / Runden-Ende -->
            <template
              v-else-if="bingoRound.answersRevealed && bingoRound.songData"
            >
              <div class="text-center text-body1 q-mb-xs">
                <strong>{{ bingoRound.songData.title || "Unbekannt" }}</strong>
                — {{ bingoRound.songData.artist || "Unbekannt" }}
                <span v-if="bingoRound.songData.year">
                  ({{ bingoRound.songData.year }})
                </span>
              </div>
              <div class="text-center text-caption q-mb-sm">
                Kategorie: {{ bingoCurrentCategoryFull?.label }}
              </div>

              <div class="bingo-team-eval-list">
                <div
                  v-for="team in bingoTeamsWithEval"
                  :key="team.slotId"
                  class="bingo-team-eval-row"
                  :class="{
                    'bingo-team-eval-row--correct': team.correct === true,
                    'bingo-team-eval-row--wrong': team.correct === false,
                  }"
                >
                  <div class="bingo-team-eval-row__name">{{ team.name }}</div>
                  <div class="bingo-team-eval-row__answer">
                    {{ team.displayAnswer || "—" }}
                  </div>
                  <q-icon
                    :name="team.correct ? 'check_circle' : 'cancel'"
                    :color="team.correct ? 'positive' : 'negative'"
                    size="sm"
                  />
                </div>
              </div>

              <div
                v-if="bingoIAmCorrectAndNeedsMark"
                class="text-center q-mt-sm text-body2"
              >
                <q-icon name="touch_app" class="q-mr-xs" />
                Wähle unten ein freies
                <strong
                  :style="{
                    color: bingoCategoryColorHex(bingoRound.category?.color),
                  }"
                  >Feld dieser Farbe</strong
                >
                zum Markieren.
              </div>

              <div
                v-if="bingoRound.phase === 'bonus' && !bingoIAmInBonusPending"
                class="text-center q-mt-sm text-caption"
                style="opacity: 0.8"
              >
                Bonus-Wahl anderer Teams läuft …
              </div>

              <div
                v-if="bingoRound.phase === 'round-done' && multiplayerIsHost"
                class="text-center q-mt-md"
              >
                <q-btn
                  color="primary"
                  icon="casino"
                  label="Nächste Runde"
                  @click="onBingoNextRound"
                />
              </div>
              <div
                v-else-if="
                  bingoRound.phase === 'round-done' && !multiplayerIsHost
                "
                class="text-center q-mt-md text-caption"
                style="opacity: 0.8"
              >
                Warte auf die nächste Runde …
              </div>
            </template>
          </div>

          <!-- Host-Notaktionen (in allen aktiven Phasen, ohne Sieg) -->
          <div
            v-if="
              multiplayerIsHost &&
              bingoRound &&
              bingoRound.phase !== 'idle' &&
              bingoRound.phase !== 'answering' &&
              bingoRound.phase !== 'round-done' &&
              !(bingoWinners && bingoWinners.length)
            "
            class="text-center q-mt-sm"
          >
            <q-btn
              outline
              color="warning"
              icon="skip_next"
              label="Runde abbrechen"
              size="sm"
              @click="onBingoSkipRound"
            />
          </div>
        </div>

        <!-- Song öffnen: Synchronisierter Ready-Check im all-clients-Modus.
             Bleibt Teil des Randomizer-Bereichs (User-Wunsch: Rate-/Song-Button
             in einem Container mit dem Runden-Panel), deshalb direkt darunter. -->
        <div v-if="pendingSongUrl" class="bingo-song-open text-center">
          <q-btn
            :color="songReadyConfirmed ? 'grey-7' : 'positive'"
            size="lg"
            :icon="songReadyConfirmed ? 'check_circle' : 'play_circle'"
            :label="songReadyConfirmed ? 'Warte auf andere…' : 'Song öffnen'"
            :disable="songReadyConfirmed"
            @click="confirmSongReady"
          />
          <div class="text-caption q-mt-sm" style="opacity: 0.8">
            {{ songReadyCount }} / {{ songReadyTotal }} bereit
          </div>
        </div>

        <!-- Spielfeld-Acryl-Fläche: umschließt eigenes Feld + Gegner und reicht
             bis zum unteren Seitenrand. Das eigene Feld liegt zentriert oben in
             einer eigenen (verschachtelten) Fläche, die Gegner darunter. -->
        <div class="bingo-fields">
          <!-- Eigene Karte (zentral, groß) -->
          <div class="bingo-own">
            <div class="text-subtitle2 q-mb-sm bingo-team-label">
              <AvatarStack
                :entries="slotAvatarEntries(guestSlotIndex)"
                size="26px"
                :overlap="9"
                dense
                class="q-mr-xs"
              />
              <q-icon name="star" class="q-mr-xs" />
              Dein Team:
              {{
                playerTimelines[guestSlotIndex]?.name ||
                (guestSlotIndex >= 0 ? `Team ${guestSlotIndex + 1}` : "—")
              }}
              <q-chip
                v-if="bingoOwnBingoCount > 0"
                color="positive"
                text-color="white"
                icon="emoji_events"
                size="sm"
                dense
                class="q-ml-sm"
              >
                {{ bingoOwnBingoCount }} Bingo{{
                  bingoOwnBingoCount === 1 ? "" : "s"
                }}
              </q-chip>
            </div>
            <!-- Wrapper nimmt die restliche Höhe im .bingo-own; darin sorgt
                 der innere `.bingo-own__card-square` per aspect-ratio dafür,
                 dass die BingoCard quadratisch bleibt und auf min(verfügbare
                 Höhe, verfügbare Breite) skaliert (siehe Game.scss). -->
            <div class="bingo-own__card-wrap">
              <div class="bingo-own__card-square">
                <BingoCard
                  :cells="ownTeamCells"
                  :marks="ownTeamMarks"
                  :interactive="bingoIAmCorrectAndNeedsMark"
                  :pickable-color="
                    bingoIAmCorrectAndNeedsMark
                      ? bingoActiveCategoryColor
                      : null
                  "
                  @pick-cell="onBingoMarkCell"
                />
              </div>
            </div>
            <div
              v-if="!ownTeamCells.length"
              class="text-caption q-mt-sm text-center"
              style="opacity: 0.7"
            >
              Karte wird geladen …
            </div>
          </div>

          <!-- Gegner-Karten (Desktop: Seitenpanel, Mobile: horizontal scrollbar) -->
          <div class="bingo-layout__opponents">
            <div class="text-subtitle2 q-mb-sm">
              <q-icon name="groups" class="q-mr-xs" />
              Gegner-Karten
            </div>
            <div
              v-if="opponentTeams.length === 0"
              class="text-caption"
              style="opacity: 0.7"
            >
              Keine Gegner-Teams.
            </div>
            <div v-else class="bingo-opponents-wrap">
              <q-btn
                v-show="opponentsCanScrollLeft"
                round
                dense
                unelevated
                icon="chevron_left"
                class="bingo-opponents-nav bingo-opponents-nav--left"
                aria-label="Nach links scrollen"
                @click="scrollOpponents(-1)"
              />
              <div
                ref="opponentsScrollerRef"
                class="bingo-opponents-scroller"
                @scroll.passive="updateOpponentsScrollState"
              >
                <div
                  v-for="team in opponentTeams"
                  :key="team.slotIndex"
                  class="bingo-opponent"
                >
                  <div class="bingo-opponent__header">
                    <AvatarStack
                      :entries="slotAvatarEntries(team.slotIndex)"
                      size="24px"
                      :overlap="8"
                      dense
                    />
                    <div class="bingo-opponent__name">
                      {{ team.name }}
                      <span
                        v-if="bingoBingoCounts[team.slotId] > 0"
                        class="bingo-opponent__badge"
                      >
                        🏆 {{ bingoBingoCounts[team.slotId] }}
                      </span>
                    </div>
                  </div>
                  <BingoCard :cells="team.cells" :marks="team.marks" compact />
                </div>
              </div>
              <q-btn
                v-show="opponentsCanScrollRight"
                round
                dense
                unelevated
                icon="chevron_right"
                class="bingo-opponents-nav bingo-opponents-nav--right"
                aria-label="Nach rechts scrollen"
                @click="scrollOpponents(1)"
              />
            </div>
          </div>
        </div>
      </div>

      <BingoLegend
        v-model="showBingoLegend"
        :difficulty="bingoSettings.difficulty"
        :bingos-to-win="bingoSettings.bingosToWin"
      />

      <BingoBonusDialog
        v-model="showBingoBonusDialog"
        :opponent-teams="bingoOpponentTeamsForBonus"
        @confirm="onBingoBonusConfirm"
        @skip="teamSkipBonus"
      />

      <!-- Bingo: Host-Einstellungen (Werkzeuge). Nur Host. Aktionsliste analog
           zu den anderen Modi + Unteransicht zum Korrigieren einzelner Kreuze. -->
      <q-dialog
        v-model="showBingoSettingsDialog"
        @hide="bingoSettingsView = 'menu'"
      >
        <q-card class="settings-dialog-card">
          <q-card-section class="bg-primary row items-center">
            <q-btn
              v-if="bingoSettingsView !== 'menu'"
              flat
              round
              dense
              icon="arrow_back"
              @click="bingoSettingsView = 'menu'"
            />
            <div class="text-h6">
              {{
                bingoSettingsView === "correct"
                  ? "Kreuze korrigieren"
                  : "Einstellungen"
              }}
            </div>
            <q-space />
            <q-btn v-close-popup flat round dense icon="close" />
          </q-card-section>

          <!-- Aktionsmenü -->
          <q-list v-if="bingoSettingsView === 'menu'">
            <q-item-label header class="text-grey-7">
              Aktionen (nur Host)
            </q-item-label>

            <q-item v-close-popup clickable @click="onBingoResetMarks">
              <q-item-section avatar>
                <q-icon color="primary" name="grid_off" />
              </q-item-section>
              <q-item-section>
                Kreuze zurücksetzen
                <q-item-label caption>
                  Alle Kreuze löschen, gespielte Songs behalten
                </q-item-label>
              </q-item-section>
            </q-item>

            <q-item clickable @click="enterBingoCorrectView">
              <q-item-section avatar>
                <q-icon color="primary" name="edit" />
              </q-item-section>
              <q-item-section>
                Kreuze korrigieren
                <q-item-label caption>
                  Einzelne Kreuze eines Teams setzen/entfernen
                </q-item-label>
              </q-item-section>
              <q-item-section side>
                <q-icon name="chevron_right" />
              </q-item-section>
            </q-item>

            <q-separator />

            <q-item v-close-popup clickable @click="resetGameState">
              <q-item-section avatar>
                <q-icon color="primary" name="restart_alt" />
              </q-item-section>
              <q-item-section>
                Spiel zurücksetzen
                <q-item-label caption
                  >Neues Spiel, zurück zur Lobby</q-item-label
                >
              </q-item-section>
            </q-item>

            <q-item v-close-popup clickable @click="handleEndGame">
              <q-item-section avatar>
                <q-icon color="primary" name="home" />
              </q-item-section>
              <q-item-section>Zur Lobby</q-item-section>
            </q-item>
          </q-list>

          <!-- Korrektur-Ansicht: Team wählen, Felder togglen -->
          <q-card-section v-else-if="bingoSettingsView === 'correct'">
            <div class="text-caption text-grey-7 q-mb-sm">
              Team wählen, dann Felder antippen zum Setzen/Entfernen.
            </div>
            <q-select
              v-model="bingoCorrectSlotId"
              :options="bingoTeamSelectOptions"
              emit-value
              map-options
              dense
              outlined
              label="Team"
              class="q-mb-md"
            />
            <div v-if="bingoCorrectTeam">
              <BingoCard
                :cells="bingoCorrectTeam.cells"
                :marks="bingoCorrectTeam.marks"
                host-edit
                @pick-cell="onBingoCorrectCell"
              />
              <div
                class="text-caption text-center q-mt-sm"
                style="opacity: 0.8"
              >
                {{ bingoCorrectTeam.bingoCount }} Bingo{{
                  bingoCorrectTeam.bingoCount === 1 ? "" : "s"
                }}
              </div>
            </div>
          </q-card-section>
        </q-card>
      </q-dialog>
    </template>

    <template v-else>
      <!-- Info-Header mit gespielten Songs und Einstellungsmenü -->
      <div class="game-info-header">
        <div class="game-info-left">
          <!-- Normaler Skip (Host oder lokal) -->
          <q-btn
            v-if="!multiplayerMode || multiplayerIsHost"
            color="primary"
            icon="skip_next"
            outline
            @click="manualSkipSong"
          >
            <span class="gt-xs q-ml-sm">Skip</span>
          </q-btn>
          <!-- Skip anfragen (Gast im Multiplayer) -->
          <q-btn
            v-if="multiplayerMode && !multiplayerIsHost"
            color="warning"
            icon="skip_next"
            outline
            @click="guestRequestSkip"
          >
            <span class="gt-xs q-ml-sm">Skip anfragen</span>
          </q-btn>

          <!-- Einwand-Countdown (Opt-in bzw. Platzierung) -->
          <div
            v-if="objectionOptInActive || objectionPlacementCountdown > 0"
            class="objection-timer q-ml-sm"
          >
            <q-spinner-hourglass size="22px" color="primary" />
            <span class="objection-timer__text">
              <template v-if="objectionOptInActive">
                Einwand: {{ objectionOptInCountdown }}s
              </template>
              <template v-else>
                {{ playerTimelines[currentObjectionPlayerIndex]?.name }}:
                {{ objectionPlacementCountdown }}s
              </template>
            </span>
          </div>
        </div>

        <div class="game-info-center">
          <q-chip color="info" text-color="white" icon="music_note" size="lg">
            {{
              multiplayerMode && !multiplayerIsHost
                ? guestSyncState.playedLinksHistoryCount
                : playedLinksHistory.length
            }}<span class="gt-xs">&nbsp;Songs gespielt</span>
          </q-chip>
          <!-- Multiplayer-Raum-Chip -->
          <q-chip
            v-if="multiplayerMode"
            color="deep-purple"
            text-color="white"
            icon="wifi"
            size="lg"
            class="q-ml-sm"
            clickable
            @click="copyRoomCode"
          >
            {{ multiplayerRoomCode }}
            <q-icon name="content_copy" size="xs" class="q-ml-xs" />
            <q-tooltip>
              Klicken zum Kopieren ·
              {{ multiplayerIsHost ? "Du bist Host" : "Du bist Gast" }} · Audio:
              {{ multiplayerAudioMode === "host-only" ? "Nur Host" : "Alle" }}
            </q-tooltip>
          </q-chip>

          <!-- Draw-Buttons: Desktop inline im Header, mobil als fixe Leiste unten.
             Auf mobil per Teleport an <body>, sonst hielte der Header
             (backdrop-filter = Containing-Block) die fixe Leiste oben fest. -->
          <Teleport to="body" :disabled="!isMobile">
            <div class="draw-actions">
              <!-- Startkarte ziehen für ALLE Spieler (nur Host bzw. lokal) -->
              <q-btn
                v-if="
                  (!multiplayerMode || multiplayerIsHost) &&
                  !loadingNextSong &&
                  !currentCard &&
                  playerTimelines.some((p) => p.cards.length === 0)
                "
                color="primary"
                icon="casino"
                label="Startkarte ziehen"
                class="q-ml-sm"
                @click="drawAllStartCards"
              />

              <!-- Neue Karte ziehen (direkt neben der Songs-Anzeige) -->
              <q-btn
                v-if="
                  !currentCard &&
                  !loadingNextSong &&
                  !pendingSongUrl &&
                  playerTimelines.every((p) => p.cards.length > 0)
                "
                color="primary"
                icon="casino"
                label="Neue Karte ziehen"
                class="q-ml-sm"
                :disable="
                  multiplayerMode &&
                  !multiplayerIsHost &&
                  (currentPlayerIndex !== guestSlotIndex ||
                    guestSyncState.loadingNextSong ||
                    multiplayerAudioMode !== 'all-clients')
                "
                @click="
                  multiplayerMode && !multiplayerIsHost
                    ? guestDrawCard()
                    : drawNewCard()
                "
              >
                <q-tooltip
                  v-if="
                    multiplayerMode &&
                    !multiplayerIsHost &&
                    currentPlayerIndex === guestSlotIndex &&
                    multiplayerAudioMode !== 'all-clients'
                  "
                >
                  Nur verfügbar wenn Audio-Modus auf &quot;Alle&quot; gestellt
                  ist
                </q-tooltip>
                <q-tooltip
                  v-else-if="
                    multiplayerMode &&
                    !multiplayerIsHost &&
                    currentPlayerIndex !== guestSlotIndex
                  "
                >
                  Nur der aktive Spieler oder der Host kann eine Karte ziehen
                </q-tooltip>
              </q-btn>

              <!-- „Song öffnen" liegt in derselben Button-Reihe wie
                   „Startkarte ziehen" / „Neue Karte ziehen". Sichtbar sowohl
                   für Host als auch für Gäste – im all-clients-Modus als
                   Ready-Check, im host-only-Modus als Gast-Fallback (Popup
                   blockiert). -->
              <q-btn
                v-if="pendingSongUrl"
                :color="songReadyConfirmed ? 'grey-7' : 'positive'"
                :icon="songReadyConfirmed ? 'check_circle' : 'play_circle'"
                :label="
                  songReadyConfirmed
                    ? `Warte… ${songReadyCount}/${songReadyTotal}`
                    : 'Song öffnen'
                "
                :disable="songReadyConfirmed"
                class="q-ml-sm"
                @click="confirmSongReady"
              />
              <q-btn
                v-else-if="
                  multiplayerMode && !multiplayerIsHost && guestPendingSongUrl
                "
                color="positive"
                icon="open_in_new"
                label="Song öffnen"
                class="q-ml-sm"
                @click="openGuestSongUrl"
              />
            </div>
          </Teleport>
        </div>

        <div class="game-info-right">
          <!-- Info: Punkte & Einwände -->
          <q-btn
            round
            flat
            color="white"
            icon="info"
            size="md"
            @click="showInfoDialog = true"
          >
            <q-tooltip>Punkte &amp; Einwände</q-tooltip>
          </q-btn>
          <!-- Einstellungsrad -->
          <q-btn
            round
            flat
            color="white"
            icon="settings"
            size="md"
            @click="showSettingsDialog = true"
          >
            <q-tooltip>Einstellungen</q-tooltip>
          </q-btn>
        </div>
      </div>

      <!-- Info-Dialog: Punkte & Einwände -->
      <q-dialog v-model="showInfoDialog">
        <q-card class="settings-dialog-card">
          <q-card-section class="bg-primary">
            <div class="text-h6">Punkte &amp; Einwände</div>
          </q-card-section>
          <q-card-section class="q-gutter-sm">
            <div class="text-subtitle2">Karte gewinnen</div>
            <div class="text-body2">
              Ordne den Song chronologisch korrekt in deine Timeline ein → du
              bekommst die Karte.
            </div>
            <q-separator dark />
            <div class="text-subtitle2">Punkte (Bonus fürs Raten)</div>
            <template v-if="gameMode === 'film'">
              <div class="text-body2">
                • Film/Serie + Titel + Künstler + Jahr → <b>4 Punkte</b>
              </div>
              <div class="text-body2">
                • Film/Serie + Titel + Künstler → <b>3 Punkte</b>
              </div>
              <div class="text-body2">
                • Film/Serie + Titel + Jahr → <b>3 Punkte</b>
              </div>
              <div class="text-body2">
                • Film/Serie + Künstler + Jahr → <b>3 Punkte</b>
              </div>
              <div class="text-body2">
                • Film/Serie + Jahr → <b>2 Punkte</b>
              </div>
              <div class="text-body2">
                • Film/Serie richtig → <b>1 Punkt</b>
              </div>
              <div class="text-caption text-grey-6 q-mt-xs">
                Ohne richtigen Film/Serie gelten die Normal-Modus-Regeln:
                Titel+Künstler+Jahr → 3, Titel+Künstler → 1, nur Jahr → 1.
              </div>
            </template>
            <template v-else>
              <div class="text-body2">
                • Titel + Künstler + Jahr exakt → <b>3 Punkte</b>
              </div>
              <div class="text-body2">
                • Titel + Künstler richtig → <b>1 Punkt</b>
              </div>
              <div class="text-body2">• Nur Jahr exakt → <b>1 Punkt</b></div>
            </template>
            <!-- Einwände: im Battle-Modus deaktiviert (jeder Spieler hat
                 einen eigenen Song-Pool, Einwände von anderen sind dort
                 inhaltlich nicht sinnvoll). Der ganze Einwand-Abschnitt
                 wird dort ausgeblendet. -->
            <template v-if="gameMode !== 'battle'">
              <q-separator dark />
              <div class="text-subtitle2">Einwände</div>
              <div class="text-body2">
                • Start: <b>3 Einwände</b> pro Spieler.
              </div>
              <template v-if="gameMode === 'film'">
                <div class="text-body2">
                  • Film/Serie + Titel + Künstler + Jahr →
                  <b>+2 Einwände</b>.
                </div>
                <div class="text-body2">
                  • Film/Serie + Titel + Künstler → <b>+1 Einwand</b>.
                </div>
                <div class="text-body2">
                  • Film/Serie + Jahr → <b>+1 Einwand</b>.
                </div>
                <div class="text-body2">
                  • Ohne Film/Serie: Titel + Künstler beide korrekt →
                  <b>+1 Einwand</b>.
                </div>
              </template>
              <div v-else class="text-body2">
                • Titel + Künstler beide korrekt geraten → <b>+1 Einwand</b>.
              </div>
              <div class="text-body2">
                • Ein Einwand kostet 1 Token. Wer korrekt einwendet, aber im
                Number-Picker die Karte nicht bekommt, erhält den Einwand
                zurück.
              </div>
            </template>
          </q-card-section>
          <q-card-actions align="right">
            <q-btn v-close-popup flat label="Schließen" />
          </q-card-actions>
        </q-card>
      </q-dialog>

      <!-- Einstellungen Dialog -->
      <q-dialog v-model="showSettingsDialog">
        <q-card class="settings-dialog-card">
          <q-card-section class="bg-primary row items-center">
            <div class="text-h6">Einstellungen</div>
            <q-space />
            <q-btn v-close-popup flat round dense icon="close" />
          </q-card-section>
          <q-list>
            <q-item-label header class="text-grey-7"> Aktionen </q-item-label>

            <template v-if="!multiplayerMode || multiplayerIsHost">
              <q-item v-close-popup clickable @click="openSaveSessionDialog">
                <q-item-section avatar>
                  <q-icon color="primary" name="save" />
                </q-item-section>
                <q-item-section>Spielstand speichern</q-item-section>
              </q-item>

              <q-item v-close-popup clickable @click="openLoadSessionDialog">
                <q-item-section avatar>
                  <q-icon color="primary" name="folder_open" />
                </q-item-section>
                <q-item-section>Spielstand laden</q-item-section>
              </q-item>

              <q-separator />

              <q-item
                v-close-popup
                clickable
                :disable="playedLinksHistory.length === 0"
                @click="clearSongsHistory"
              >
                <q-item-section avatar>
                  <q-icon color="primary" name="delete" />
                </q-item-section>
                <q-item-section>
                  History löschen
                  <q-item-label caption>
                    Löscht alle Einträge aus localStorage
                  </q-item-label>
                </q-item-section>
              </q-item>

              <q-item v-close-popup clickable @click="resetGameState">
                <q-item-section avatar>
                  <q-icon color="primary" name="restart_alt" />
                </q-item-section>
                <q-item-section>
                  Spiel zurücksetzen
                  <q-item-label caption> Außer Spielernamen </q-item-label>
                </q-item-section>
              </q-item>

              <q-separator />

              <q-item v-close-popup clickable @click="openManualCardDialog">
                <q-item-section avatar>
                  <q-icon color="primary" name="add_card" />
                </q-item-section>
                <q-item-section>
                  Karte manuell hinzufügen
                  <q-item-label caption>
                    Direkt in die Timeline einsortieren
                  </q-item-label>
                </q-item-section>
              </q-item>

              <q-item
                v-close-popup
                clickable
                @click="showScoreManageDialog = true"
              >
                <q-item-section avatar>
                  <q-icon color="primary" name="scoreboard" />
                </q-item-section>
                <q-item-section>
                  Punkte / Einwände verwalten
                  <q-item-label caption>
                    Hinzufügen oder entfernen
                  </q-item-label>
                </q-item-section>
              </q-item>

              <q-separator />
            </template>

            <!-- Audio-Modus (nur im Multiplayer sichtbar, nur Host kann ändern) -->
            <div v-if="multiplayerMode" class="q-px-md q-py-sm">
              <div class="text-caption text-grey-7 q-mb-xs">Audio-Modus</div>
              <q-btn-toggle
                v-model="multiplayerAudioMode"
                :options="[
                  { label: 'Nur Host', value: 'host-only', icon: 'person' },
                  { label: 'Alle', value: 'all-clients', icon: 'groups' },
                ]"
                :disable="!multiplayerIsHost"
                color="primary"
                outline
                size="sm"
                class="full-width"
                @update:model-value="
                  (val) => {
                    if (multiplayerIsHost)
                      socketEmit('host:setAudioMode', { audioMode: val });
                  }
                "
              />
              <div
                v-if="!multiplayerIsHost"
                class="text-caption text-grey-7 q-mt-xs"
              >
                Nur der Host kann den Modus ändern
              </div>
            </div>

            <q-separator />

            <q-item v-close-popup clickable @click="handleEndGame">
              <q-item-section avatar>
                <q-icon color="primary" name="home" />
              </q-item-section>
              <q-item-section>{{
                multiplayerMode ? "Zur Lobby" : "Zur Startseite"
              }}</q-item-section>
            </q-item>
          </q-list>
        </q-card>
      </q-dialog>

      <!-- Punkte / Einwände verwalten Dialog -->
      <q-dialog v-model="showScoreManageDialog" persistent>
        <q-card style="min-width: 400px">
          <q-card-section class="bg-primary">
            <div class="text-h6">Punkte / Einwände verwalten</div>
          </q-card-section>

          <q-card-section class="score-manage-form">
            <q-select
              v-model="scoreManagePlayerIndex"
              :options="
                playerTimelines.map((p, i) => ({
                  label: p.name || `Spieler ${i + 1}`,
                  value: i,
                }))
              "
              emit-value
              map-options
              label="Spieler"
              outlined
            />
            <q-btn-toggle
              v-model="scoreManageType"
              :options="[
                { label: 'Punkte', value: 'points', icon: 'emoji_events' },
                { label: 'Einwände', value: 'objections', icon: 'gavel' },
              ]"
              color="primary"
              outline
              class="full-width"
              toggle-color="primary"
            />
            <q-btn-toggle
              v-model="scoreManageAction"
              :options="[
                { label: 'Hinzufügen', value: 'add', icon: 'add' },
                { label: 'Entfernen', value: 'remove', icon: 'remove' },
              ]"
              color="primary"
              outline
              class="full-width"
              toggle-color="primary"
            />
            <q-input
              v-model.number="scoreManageAmount"
              type="number"
              label="Anzahl"
              outlined
              min="1"
            />

            <div class="score-manage-preview q-mt-sm">
              <q-icon
                :name="
                  scoreManageAction === 'add' ? 'add_circle' : 'remove_circle'
                "
                color="primary"
                size="sm"
              />
              <span>
                {{ scoreManageAmount || 1 }}
                {{
                  scoreManageType === "points" ? "Punkt(e)" : "Einwand/Einwände"
                }}
                {{ scoreManageAction === "add" ? "hinzufügen" : "entfernen" }}
                für
                <strong>{{
                  playerTimelines[scoreManagePlayerIndex]?.name ||
                  `Spieler ${scoreManagePlayerIndex + 1}`
                }}</strong>
              </span>
            </div>
          </q-card-section>

          <q-card-actions align="right">
            <q-btn
              flat
              label="Abbrechen"
              @click="showScoreManageDialog = false"
            />
            <q-btn color="primary" label="Anwenden" @click="applyScoreManage" />
          </q-card-actions>
        </q-card>
      </q-dialog>

      <!-- Manuell Karte hinzufügen Dialog -->
      <q-dialog v-model="showManualCardDialog" persistent>
        <q-card style="min-width: 400px">
          <q-card-section class="bg-primary">
            <div class="text-h6">Karte manuell hinzufügen</div>
            <div class="text-subtitle2">
              Wird chronologisch in die Timeline eingeordnet
            </div>
          </q-card-section>

          <q-card-section class="q-gutter-sm">
            <q-input
              v-model="manualCardTitle"
              label="Titel"
              outlined
              autofocus
            />
            <q-input v-model="manualCardArtist" label="Künstler" outlined />
            <q-input
              v-model.number="manualCardYear"
              type="number"
              label="Jahr *"
              outlined
              min="1900"
              max="2100"
              @keyup.enter="confirmManualCard"
            />
            <q-select
              v-model="manualCardPlayerIndex"
              :options="
                playerTimelines.map((p, i) => ({ label: p.name, value: i }))
              "
              emit-value
              map-options
              label="Für Spieler"
              outlined
            />
          </q-card-section>

          <q-card-actions align="right">
            <q-btn
              flat
              label="Abbrechen"
              @click="showManualCardDialog = false"
            />
            <q-btn
              color="primary"
              label="Hinzufügen"
              @click="confirmManualCard"
            />
          </q-card-actions>
        </q-card>
      </q-dialog>

      <!-- Rateformular Dialog -->
      <q-dialog v-model="showGuessDialog" persistent>
        <q-card style="min-width: 400px">
          <!-- Host beobachtet Gast: Read-only-Ansicht -->
          <template v-if="isHostWatchingGuestGuess">
            <q-card-section class="bg-primary">
              <div class="text-h6">
                {{ getGuessDialogSubtitle() }} rät gerade...
              </div>
            </q-card-section>
            <q-card-section>
              <div class="text-caption text-grey-7 q-mb-sm">Live-Eingabe:</div>
              <div>
                <q-icon name="music_note" /> Titel:
                <strong>{{ activeGuessDisplay.title || "—" }}</strong>
              </div>
              <div>
                <q-icon name="person" /> Künstler:
                <strong>{{ activeGuessDisplay.artist || "—" }}</strong>
              </div>
              <div>
                <q-icon name="calendar_today" /> Jahr:
                <strong>{{ activeGuessDisplay.year || "—" }}</strong>
              </div>
              <div v-if="gameMode === 'film'">
                <q-icon name="movie" /> Film/Serie:
                <strong>{{ activeGuessDisplay.movie || "—" }}</strong>
              </div>
            </q-card-section>
          </template>

          <!-- Eigener Zug: Interaktives Rateformular -->
          <template v-else>
            <q-card-section class="bg-primary">
              <div class="text-h6">Song raten</div>
              <div class="text-subtitle2">
                {{ getGuessDialogSubtitle() }}
              </div>
            </q-card-section>

            <q-card-section>
              <div class="text-body2 q-mb-md">
                Der Song wurde in Spotify geöffnet. Höre ihn dir an und rate:
              </div>

              <q-input
                v-model="guessedTitle"
                label="Song Titel"
                outlined
                class="q-mb-md"
                hint="Optional - für Bonuspunkte"
              />

              <q-input
                v-model="guessedArtist"
                label="Künstler"
                outlined
                class="q-mb-md"
                hint="Optional - für Bonuspunkte"
              />

              <q-input
                v-model.number="guessedYear"
                type="number"
                label="Jahr (optional)"
                outlined
                :class="gameMode === 'film' ? 'q-mb-md' : ''"
                hint="Optional - für Bonuspunkte"
              />

              <q-input
                v-if="gameMode === 'film'"
                v-model="guessedMovie"
                label="Film / Serie"
                outlined
                hint="Optional - für Bonuspunkte"
              />
            </q-card-section>

            <q-card-actions align="between" class="q-px-md q-pb-md">
              <q-btn
                flat
                label="Neu einordnen"
                color="warning"
                icon="undo"
                @click="cancelGuessAndReplace"
              />
              <q-btn
                flat
                label="Raten abgeben"
                color="primary"
                @click="submitGuess"
              />
            </q-card-actions>
          </template>
        </q-card>
      </q-dialog>

      <!-- Gast: Eigener Raten-Dialog (interaktiv, wenn es der eigene Slot ist) -->
      <q-dialog
        :model-value="isMyGuestGuessTurn"
        persistent
        @update:model-value="() => {}"
      >
        <q-card style="min-width: 400px">
          <q-card-section class="bg-primary">
            <div class="text-h6">Song raten – dein Zug!</div>
            <div class="text-subtitle2">Tippe deine Schätzung ein</div>
          </q-card-section>

          <!-- Live-Anzeige: Was der Host parallel eintippt -->
          <q-card-section
            v-if="
              activeGuessDisplay.title ||
              activeGuessDisplay.artist ||
              activeGuessDisplay.year
            "
            class="rounded-borders"
            style="background: var(--surface-bg-weak)"
          >
            <div class="text-caption q-mb-sm" style="opacity: 0.7">
              Host tippt:
            </div>
            <div>
              <q-icon name="music_note" /> Titel:
              <strong>{{ activeGuessDisplay.title || "—" }}</strong>
            </div>
            <div>
              <q-icon name="person" /> Künstler:
              <strong>{{ activeGuessDisplay.artist || "—" }}</strong>
            </div>
            <div>
              <q-icon name="calendar_today" /> Jahr:
              <strong>{{ activeGuessDisplay.year || "—" }}</strong>
            </div>
            <div v-if="gameMode === 'film'">
              <q-icon name="movie" /> Film/Serie:
              <strong>{{ activeGuessDisplay.movie || "—" }}</strong>
            </div>
          </q-card-section>

          <q-card-section>
            <div class="text-body2 q-mb-md">
              Höre den Song an und rate (optional – für Bonuspunkte):
            </div>
            <q-input
              v-model="guestGuessTitle"
              label="Song Titel"
              outlined
              class="q-mb-md"
              hint="Optional"
            />
            <q-input
              v-model="guestGuessArtist"
              label="Künstler"
              outlined
              class="q-mb-md"
              hint="Optional"
            />
            <q-input
              v-model.number="guestGuessYear"
              type="number"
              label="Jahr (optional)"
              outlined
              :class="gameMode === 'film' ? 'q-mb-md' : ''"
              hint="Optional"
            />
            <q-input
              v-if="gameMode === 'film'"
              v-model="guestGuessMovie"
              label="Film / Serie"
              outlined
              hint="Optional"
            />
          </q-card-section>
          <q-card-actions align="right" class="q-px-md q-pb-md">
            <q-btn
              flat
              color="warning"
              icon="undo"
              label="Neu einordnen"
              @click="guestCancelGuessAndReplace"
            />
            <q-btn
              flat
              label="Raten abgeben"
              color="primary"
              @click="guestSubmitGuess"
            />
          </q-card-actions>
        </q-card>
      </q-dialog>

      <!-- Gast: Read-only Anzeige (anderer Spieler rät gerade) -->
      <q-dialog
        :model-value="showGuestGuessReadOnly"
        persistent
        @update:model-value="() => {}"
      >
        <q-card style="min-width: 340px">
          <q-card-section class="bg-primary">
            <div class="text-h6">
              {{
                playerTimelines[guestSyncState.activeGuessPlayerIndex]?.name ||
                "Jemand"
              }}
              rät gerade...
            </div>
          </q-card-section>
          <q-card-section>
            <div class="text-caption text-grey-7 q-mb-sm">Live-Eingabe:</div>
            <div>
              <q-icon name="music_note" /> Titel:
              <strong>{{ activeGuessDisplay.title || "—" }}</strong>
            </div>
            <div>
              <q-icon name="person" /> Künstler:
              <strong>{{ activeGuessDisplay.artist || "—" }}</strong>
            </div>
            <div>
              <q-icon name="calendar_today" /> Jahr:
              <strong>{{ activeGuessDisplay.year || "—" }}</strong>
            </div>
            <div v-if="gameMode === 'film'">
              <q-icon name="movie" /> Film/Serie:
              <strong>{{ activeGuessDisplay.movie || "—" }}</strong>
            </div>
          </q-card-section>
        </q-card>
      </q-dialog>

      <!-- Einwand: Opt-in-Fenster (10 Sek) -->
      <q-dialog v-model="objectionOptInActive" persistent>
        <q-card style="min-width: 420px">
          <q-card-section class="bg-primary row items-center no-wrap">
            <div>
              <div class="text-h6">Einwand möglich</div>
              <div class="text-subtitle2">
                Alle außer dem aktuellen Spieler können einwenden
              </div>
            </div>
            <q-space />
            <q-circular-progress
              show-value
              :value="(objectionOptInCountdown / 10) * 100"
              size="48px"
              :thickness="0.2"
              color="white"
              track-color="rgba(255,255,255,0.35)"
            >
              {{ objectionOptInCountdown }}
            </q-circular-progress>
          </q-card-section>

          <q-card-section>
            <div class="q-mb-md text-body2">
              Tippe „Einwand", um dich anzumelden. Danach platziert ihr
              nacheinander (Spielerreihenfolge), je 30 Sekunden.
            </div>

            <template v-for="(player, idx) in playerTimelines" :key="idx">
              <div
                v-if="idx !== currentPlayerIndex"
                class="row items-center justify-between q-mb-sm"
              >
                <div class="row items-center">
                  <strong>{{ player.name }}</strong>
                  <q-chip dense class="q-ml-sm">
                    {{ player.objections }} Einwände
                  </q-chip>
                </div>
                <q-btn
                  size="sm"
                  :label="
                    objectionOptIns.includes(idx) ? 'Angemeldet ✓' : 'Einwand'
                  "
                  color="primary"
                  :class="{ 'btn-unselected': !objectionOptIns.includes(idx) }"
                  :disable="
                    player.objections <= 0 ||
                    (multiplayerMode && idx !== guestSlotIndex)
                  "
                  @click="onToggleObjectionOptIn(idx)"
                />
              </div>
            </template>
            <div
              v-if="multiplayerMode && !multiplayerIsHost"
              class="text-caption q-mt-sm"
              style="opacity: 0.7"
            >
              Der Host startet die Einwandphase (oder sie startet automatisch
              nach Ablauf der Zeit).
            </div>
          </q-card-section>

          <q-card-actions
            v-if="!multiplayerMode || multiplayerIsHost"
            align="right"
          >
            <q-btn
              label="Einwandphase starten"
              color="primary"
              @click="closeOptInWindow"
            />
          </q-card-actions>
        </q-card>
      </q-dialog>

      <!-- Number-Picker: Auslosung bei mehreren korrekten Einwänden -->
      <div v-if="objectionRaffleActive" class="feedback-overlay">
        <div class="feedback-dialog">
          <div class="text-h6 q-mb-xs">Mehrere korrekte Einwände!</div>
          <div class="text-body2 q-mb-md">
            Es wird ausgelost, wer die Karte bekommt …
          </div>
          <div class="raffle-list">
            <div
              v-for="(name, i) in objectionRaffleNames"
              :key="i"
              class="raffle-item"
              :class="{
                'raffle-item--active':
                  objectionRaffleWinner === null &&
                  i === objectionRaffleHighlight,
                'raffle-item--winner': objectionRaffleWinner === i,
              }"
            >
              {{ name }}
            </div>
          </div>
          <div v-if="objectionRaffleWinner !== null" class="text-h6 q-mt-md">
            🎉 {{ objectionRaffleNames[objectionRaffleWinner] }} gewinnt die
            Karte!
          </div>
        </div>
      </div>

      <!-- Spieler Timelines -->
      <div class="timelines-container">
        <div
          v-for="(player, index) in playerTimelines"
          :key="index"
          class="player-timeline"
          :class="{ 'active-player': index === currentPlayerIndex }"
        >
          <div class="timeline-header">
            <div class="player-info">
              <span class="player-name-row">
                <AvatarStack
                  :entries="slotAvatarEntries(index)"
                  size="30px"
                  :overlap="10"
                />
                <span class="text-h6">{{
                  player.name || `Spieler ${index + 1}`
                }}</span>
              </span>
              <div class="player-chips">
                <!-- Battle-Modus: gewählte Version pro Spieler anzeigen,
                     damit alle sehen, wer aus welchem Pool zieht. -->
                <q-chip
                  v-if="gameMode === 'battle' && playerSongPools[index]"
                  color="deep-purple"
                  text-color="white"
                  icon="album"
                >
                  <span class="gt-xs">{{
                    battleVersionLabel(playerSongPools[index])
                  }}</span>
                  <q-tooltip>
                    {{ battleVersionLabel(playerSongPools[index]) }}
                  </q-tooltip>
                </q-chip>
                <!-- Einwände-Chip nur wenn Einwände im aktuellen Modus
                     überhaupt möglich sind (Battle deaktiviert Einwände,
                     siehe useGuessEngine.checkForObjections). -->
                <q-chip
                  v-if="gameMode !== 'battle'"
                  :color="player.objections > 0 ? 'orange' : 'grey-7'"
                  text-color="white"
                  icon="gavel"
                >
                  {{ player.objections
                  }}<span class="gt-xs">&nbsp;Einwände</span>
                </q-chip>
                <q-chip
                  color="green"
                  text-color="white"
                  icon="emoji_events"
                  class="lt-sm score-chip-mobile"
                >
                  {{ player.points || 0 }}
                </q-chip>
                <q-chip color="primary" text-color="white" icon="style">
                  {{ player.cards.length
                  }}<span class="gt-xs">&nbsp;Karten</span>
                </q-chip>
              </div>
            </div>
            <div class="player-score-center">
              <q-chip
                class="score-chip"
                color="green"
                text-color="white"
                icon="emoji_events"
                size="lg"
              >
                {{ player.points || 0 }} Punkte
              </q-chip>
            </div>
            <div class="timeline-header-actions">
              <q-btn
                v-if="
                  player.cards.length === 1 &&
                  !loadingNextSong &&
                  !player.cards[0]?.isStartCard
                "
                color="primary"
                icon="refresh"
                class="q-mb-md"
                :disable="loadingFirstCard[index]"
                style="margin-left: auto"
                @click="reloadFirstCard(index)"
              >
                <q-tooltip
                  >Erste Karte neu laden (Songdaten aktualisieren)</q-tooltip
                >
              </q-btn>
            </div>
          </div>

          <div class="timeline-cards-wrap">
            <q-btn
              v-show="timelineScrollState[index]?.canScrollLeft"
              round
              dense
              unelevated
              icon="chevron_left"
              class="timeline-cards-nav timeline-cards-nav--left"
              aria-label="Nach links scrollen"
              @click="scrollTimeline(index, -1)"
            />
            <div
              :ref="setTimelineScrollerRef(index)"
              class="timeline-cards"
              @scroll.passive="updateTimelineScrollState(index)"
            >
              <div class="timeline-cards-inner">
                <!-- Platzhalter vor der ersten Karte -->
                <div
                  v-if="
                    canPlaceCards &&
                    ((index === currentPlayerIndex && !isObjectionPhase) ||
                      (isObjectionPhase &&
                        currentObjectionPlayerIndex !== null &&
                        index === currentPlayerIndex)) &&
                    currentCard &&
                    !playerHasGuessed &&
                    !showFeedback &&
                    (!multiplayerMode ||
                      (currentPlayerIndex === guestSlotIndex &&
                        !isObjectionPhase) ||
                      (isObjectionPhase &&
                        currentObjectionPlayerIndex === guestSlotIndex))
                  "
                  class="card-slot"
                  @click="
                    multiplayerMode && !multiplayerIsHost
                      ? guestPlaceCard(index, 0)
                      : placeCard(index, 0)
                  "
                >
                  <q-icon name="add" size="xl" />
                </div>

                <!-- Vorhandene Karten -->
                <template
                  v-for="(card, cardIndex) in player.cards"
                  :key="cardIndex"
                >
                  <q-card
                    class="timeline-card"
                    :style="{ '--card-color': cardColor(card) }"
                  >
                    <q-card-section class="timeline-card-content">
                      <div class="timeline-card-artist">
                        {{ card.artist }}
                      </div>
                      <div class="timeline-card-year-wrapper">
                        <div class="timeline-card-year">
                          {{ card.year }}
                        </div>
                      </div>
                      <div class="timeline-card-title">
                        {{ card.title }}
                      </div>
                    </q-card-section>
                  </q-card>

                  <!-- Platzhalter nach jeder Karte -->
                  <div
                    v-if="
                      canPlaceCards &&
                      ((index === currentPlayerIndex && !isObjectionPhase) ||
                        (isObjectionPhase &&
                          currentObjectionPlayerIndex !== null &&
                          index === currentPlayerIndex)) &&
                      currentCard &&
                      !playerHasGuessed &&
                      !showFeedback &&
                      (!multiplayerMode ||
                        (currentPlayerIndex === guestSlotIndex &&
                          !isObjectionPhase) ||
                        (isObjectionPhase &&
                          currentObjectionPlayerIndex === guestSlotIndex))
                    "
                    class="card-slot"
                    @click="
                      multiplayerMode && !multiplayerIsHost
                        ? guestPlaceCard(index, cardIndex + 1)
                        : placeCard(index, cardIndex + 1)
                    "
                  >
                    <q-icon name="add" size="xl" />
                  </div>
                </template>

                <!-- Wenn keine Karten vorhanden -->
                <div v-if="player.cards.length === 0" class="no-cards">
                  <span>Keine Karten</span>
                </div>
              </div>
            </div>
            <q-btn
              v-show="timelineScrollState[index]?.canScrollRight"
              round
              dense
              unelevated
              icon="chevron_right"
              class="timeline-cards-nav timeline-cards-nav--right"
              aria-label="Nach rechts scrollen"
              @click="scrollTimeline(index, 1)"
            />
          </div>
        </div>
      </div>

      <div class="actions-section">
        <!-- Song öffnen (Ready-Check + Gast-Fallback) liegt jetzt oben in
             der Draw-Buttons-Reihe (siehe Teleport-Block). Hier nur noch
             der Lade-Spinner für den nächsten Song. -->
        <div v-if="loadingNextSong" class="loading-card">
          <q-spinner-audio color="primary" size="80px" />
          <div class="text-h6 q-mt-md">Lade nächsten Song...</div>
        </div>

        <!-- Song-Anzeige entfernt -->
      </div>

      <!-- Bereits gespielte Songs werden intern gespeichert, aber nicht angezeigt -->

      <!-- Feedback Overlay (erscheint erst nach Schließen des Einwanddialogs) -->
      <transition name="fade">
        <div v-if="showFeedback" class="feedback-overlay">
          <div class="feedback-dialog">
            <q-icon
              :name="feedbackCorrect ? 'check_circle' : 'cancel'"
              color="primary"
              size="64px"
            />
            <div class="text-h6 q-mt-md">
              {{ feedbackCorrect ? "Richtig!" : "Falsch!" }}
            </div>
            <div class="text-body1 q-mt-sm">
              {{ feedbackMessage }}
            </div>
            <div v-if="correctObjectorNames.length" class="q-mt-sm">
              <div class="text-caption">Korrekte Einwände:</div>
              <div
                v-for="(n, i) in correctObjectorNames"
                :key="i"
                class="text-body2"
              >
                {{ n
                }}<span v-if="n === objectionWinnerName">
                  🏆 (bekommt die Karte)</span
                >
              </div>
            </div>
            <div v-if="guessResults" class="guess-results q-mt-md">
              <q-chip
                v-if="guessResults.titleCorrect !== null"
                :color="guessResults.titleCorrect ? 'positive' : 'negative'"
                text-color="white"
              >
                Titel: {{ guessResults.titleCorrect ? "Richtig" : "Falsch" }}
              </q-chip>
              <q-chip
                v-if="guessResults.artistCorrect !== null"
                :color="guessResults.artistCorrect ? 'positive' : 'negative'"
                text-color="white"
              >
                Künstler:
                {{ guessResults.artistCorrect ? "Richtig" : "Falsch" }}
              </q-chip>
              <q-chip
                v-if="currentCard && currentCard.year"
                color="info"
                text-color="white"
              >
                Jahr: {{ currentCard.year }}
              </q-chip>
              <q-chip
                v-if="gameMode === 'film' && guessResults.movieCorrect !== null"
                :color="guessResults.movieCorrect ? 'positive' : 'negative'"
                text-color="white"
              >
                Film/Serie:
                {{ guessResults.movieCorrect ? "Richtig" : "Falsch" }}
              </q-chip>
            </div>
            <div v-if="currentCard" class="q-mt-md text-body2">
              <div>
                <strong>Richtiger Titel:</strong>
                {{ currentCard.title || "Unbekannt" }}
              </div>
              <div>
                <strong>Richtiger Künstler:</strong>
                {{ currentCard.artist || "Unbekannt" }}
              </div>
              <div v-if="gameMode === 'film' && currentCard.movie">
                <strong>Richtiger Film/Serie:</strong>
                {{ currentCard.movie }}
              </div>
            </div>

            <div class="feedback-countdown q-mt-md">
              <q-circular-progress
                :value="feedbackCountdown * 20"
                size="36px"
                color="primary"
                track-color="grey-8"
              />
              <span class="q-ml-sm text-grey-5" style="font-size: 0.85rem">
                {{ `Weiter in ${feedbackCountdown}s` }}
              </span>
            </div>

            <q-btn
              v-if="!multiplayerMode || multiplayerIsHost"
              class="q-mt-sm"
              color="primary"
              flat
              label="Jetzt weiter"
              @click="doCloseFeedback"
            />
          </div>
        </div>
      </transition>

      <!-- Das Einwandfeld entfällt, Einwand erfolgt direkt über die Plus-Slots in der Timeline wie beim normalen Raten. -->

      <!-- Sieg Dialog -->
      <q-dialog v-model="showVictoryDialog" persistent>
        <q-card style="min-width: 500px">
          <q-card-section class="bg-positive text-white text-center">
            <div class="text-h4">Sieg!</div>
          </q-card-section>

          <q-card-section class="text-center q-pa-lg">
            <div class="text-h5 q-mb-md text-grey-9">
              <strong>{{ winnerName }}</strong> {{ victoryHeadline }}
            </div>
            <div class="text-h6 text-grey-7">
              {{ victorySubline }}
            </div>
          </q-card-section>

          <q-card-actions align="center" class="q-pa-md">
            <q-btn
              color="positive"
              label="Erneut spielen"
              icon="refresh"
              size="lg"
              class="q-mr-sm"
              @click="openRestartDialog"
            />
            <q-btn
              color="grey-7"
              :label="multiplayerMode ? 'Zur Lobby' : 'Spiel beenden'"
              icon="close"
              size="lg"
              outline
              @click="handleEndGame"
            />
          </q-card-actions>
        </q-card>
      </q-dialog>

      <q-dialog v-model="showRestartDialog" persistent>
        <q-card style="min-width: 460px">
          <q-card-section class="bg-primary">
            <div class="text-h6">Neue Runde starten</div>
          </q-card-section>
          <q-card-section>
            Wie möchtest du die nächste Runde starten?
          </q-card-section>
          <q-card-actions class="q-pa-md restart-actions">
            <q-btn
              class="full-width"
              flat
              color="grey-7"
              :label="multiplayerMode ? 'Zur Lobby' : 'Nein, neues Spiel'"
              @click="restartAsNewGame"
            />
            <q-btn
              v-if="!multiplayerMode"
              class="full-width"
              flat
              color="secondary"
              label="Neue Namen + Punkte"
              @click="restartWithNewNamesKeepingScores"
            />
            <q-btn
              class="full-width"
              color="primary"
              label="Ja, gleiche Spieler + Punkte"
              @click="restartKeepingPlayersAndScores"
            />
          </q-card-actions>
        </q-card>
      </q-dialog>

      <q-dialog v-model="showLoadSessionDialog">
        <q-card style="min-width: 420px">
          <q-card-section class="bg-primary">
            <div class="text-h6">Spielstand laden</div>
          </q-card-section>
          <q-card-section>
            <div class="q-mb-md text-body2">
              Hast du eine gespeicherte Datei?
            </div>
          </q-card-section>
          <q-card-actions align="right" class="q-pa-md">
            <q-btn
              flat
              color="grey-7"
              label="Abbrechen"
              @click="showLoadSessionDialog = false"
            />
            <q-btn
              color="secondary"
              label="Aus Browser laden"
              @click="confirmLoadFromLocalStorage"
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

      <!-- Skip-Anfrage-Dialog (nur für Host sichtbar) -->
      <q-dialog v-model="showSkipRequestDialog" persistent>
        <q-card style="min-width: 320px">
          <q-card-section class="bg-primary">
            <div class="text-h6">Skip-Anfrage</div>
          </q-card-section>
          <q-card-section>
            <strong>{{ skipRequestFrom }}</strong> möchte den aktuellen Song
            skippen.
          </q-card-section>
          <q-card-actions align="right">
            <q-btn
              flat
              label="Ablehnen"
              @click="showSkipRequestDialog = false"
            />
            <q-btn
              color="warning"
              label="Skip bestätigen"
              icon="skip_next"
              @click="confirmGuestSkip"
            />
          </q-card-actions>
        </q-card>
      </q-dialog>
    </template>

    <!-- Save-Session-Dialog: MODUS-UNABHÄNGIG, damit „Zur Lobby" auch
         im Bingo den Speichern-mit-Skip-Dialog zeigen kann. Vorher lag der
         Dialog nur im v-else-Zweig; im Bingo passierte beim Klick auf
         „Zur Lobby" gar nichts sichtbar. -->
    <q-dialog v-model="showSaveSessionDialog" @hide="onSaveSessionDialogHidden">
      <q-card style="min-width: 420px">
        <q-card-section class="bg-primary">
          <div class="text-h6">
            {{
              saveDialogCallbackPending
                ? "Vorher speichern?"
                : "Spielstand speichern"
            }}
          </div>
        </q-card-section>
        <q-card-section>
          <div v-if="saveDialogCallbackPending" class="q-mb-md text-body2">
            Du kannst den aktuellen Spielstand jetzt speichern oder ohne
            Speichern weiter zur Lobby.
          </div>
          <div v-else class="q-mb-md text-body2">
            Wähle aus, welche Bereiche gespeichert werden sollen.
          </div>

          <q-checkbox
            v-model="saveSessionOptions.playerNames"
            :disable="saveSessionOptions.points"
            label="Spielernamen"
          />
          <q-checkbox
            v-model="saveSessionOptions.points"
            label="Punkte (inkl. Spielernamen)"
          />
          <q-checkbox
            v-model="saveSessionOptions.playedCards"
            label="Gespielte Karten (inkl. Versionen)"
          />
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md save-dialog-actions">
          <!-- Drei klare Aktionen, wenn ein Callback wartet:
                 * „Abbrechen" bleibt im Spiel (dialog schließen ohne weiter)
                 * „Überspringen" führt den Callback aus (ohne speichern)
                 * „Speichern & weiter" speichert und führt aus.
               `@hide` wird beim Abbrechen NICHT als Skip gewertet – der
               Skip-Weg läuft nur über die beiden dedizierten Buttons. -->
          <template v-if="saveDialogCallbackPending">
            <q-btn
              flat
              color="grey-7"
              label="Abbrechen"
              @click="cancelSaveSessionDialog"
            />
            <q-btn
              flat
              color="warning"
              label="Überspringen"
              @click="skipSaveAndContinue"
            />
            <q-btn
              color="positive"
              label="Speichern & weiter"
              :disable="!hasAnySaveSessionOption"
              @click="confirmSaveSessionSnapshot"
            />
          </template>
          <template v-else>
            <q-btn
              flat
              color="grey-7"
              label="Abbrechen"
              @click="showSaveSessionDialog = false"
            />
            <q-btn
              color="positive"
              label="Speichern"
              :disable="!hasAnySaveSessionOption"
              @click="confirmSaveSessionSnapshot"
            />
          </template>
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script>
import {
  ref,
  computed,
  watch,
  nextTick,
  onMounted,
  onBeforeUnmount,
} from "vue";
import { useRoute, useRouter } from "vue-router";
import { Notify, useQuasar } from "quasar";
import { emit as socketEmit } from "../utils/socketService";
import { useTheme } from "../composables/useTheme";
import { useGameState } from "../composables/useGameState";
import { useSongManager } from "../composables/useSongManager";
import { useGuessEngine } from "../composables/useGuessEngine";
import { useMultiplayer } from "../composables/useMultiplayer";
import { useBingoRound } from "../composables/useBingoRound";
import { BINGO_COLORS } from "../composables/useBingo";
import BingoCard from "../components/BingoCard.vue";
import BingoLegend from "../components/BingoLegend.vue";
import BingoAnswerInput from "../components/BingoAnswerInput.vue";
import BingoBonusDialog from "../components/BingoBonusDialog.vue";
import AvatarStack from "../components/AvatarStack.vue";
import { loadSlotAvatars, SLOT_AVATARS_EVENT } from "../utils/profileService";
import { useVersions } from "../composables/useVersions";

export default {
  name: "GamePage",
  components: {
    BingoCard,
    BingoLegend,
    BingoAnswerInput,
    BingoBonusDialog,
    AvatarStack,
  },

  setup() {
    const route = useRoute();
    const router = useRouter();
    const $q = useQuasar();
    // Mobile Ansicht (<600px): Draw-Buttons werden per Teleport an <body>
    // gehaengt, damit die fixe Leiste am Viewport-Boden klebt.
    const isMobile = computed(() => $q.screen.lt.sm);

    // Kartenfarbe je nach Theme-Modus: 'theme' -> Akzent, sonst originale Farbe.
    const { cardColorMode } = useTheme();
    const cardColor = (card) =>
      cardColorMode.value === "theme"
        ? "var(--app-accent)"
        : card.bgColor || "#3d3d3d";

    const showSettingsDialog = ref(false);
    const showInfoDialog = ref(false);
    const showScoreManageDialog = ref(false);
    const scoreManagePlayerIndex = ref(0);
    const scoreManageType = ref("points");
    const scoreManageAction = ref("add");
    const scoreManageAmount = ref(1);
    // Bingo: Legende-Dialog
    const showBingoLegend = ref(false);
    const state = useGameState(route, router);
    const {
      // Konstanten
      MAX_CARDS,
      // Scoring
      addManualPoint,
      removeManualPoint,
      addManualObjection,
      removeManualObjection,
      // Init / Reset
      initGame,
      resetGameState,
      // Reload
      reloadFirstCard,
      loadingFirstCard,
      // Draw Start Card
      drawStartCard,
      // Manual Card
      openManualCardDialog,
      confirmManualCard,
      // Session
      openSaveSessionDialog,
      confirmSaveSessionSnapshot,
      saveSessionSnapshot,
      skipSaveAndContinue,
      onSaveSessionDialogHidden,
      cancelSaveSessionDialog,
      loadSessionSnapshot,
      openLoadSessionDialog,
      confirmLoadFromLocalStorage,
      openSessionFilePicker,
      handleSessionFileSelected,
      // Feedback
      clearFeedbackCountdown,
      doCloseFeedback,
      closeFeedback,
      // Victory / Restart
      openRestartDialog,
      restartKeepingPlayersAndScores,
      handleEndGame,
      restartAsNewGame,
      restartWithNewNamesKeepingScores,
      // Refs
      playerCount,
      playerNames,
      currentPlayerIndex,
      playerTimelines,
      currentCard,
      showFeedback,
      feedbackCorrect,
      feedbackMessage,
      loadingNextSong,
      playedSongs,
      showManualCardDialog,
      manualCardTitle,
      manualCardArtist,
      manualCardYear,
      manualCardPlayerIndex,
      showObjectionDialog,
      pendingPlacement,
      showVictoryDialog,
      winnerName,
      victoryHeadline,
      victorySubline,
      showRestartDialog,
      showSaveSessionDialog,
      saveDialogCallbackPending,
      showLoadSessionDialog,
      sessionFileInput,
      saveSessionOptions,
      hasAnySaveSessionOption,
      playedLinksHistory,
      allSongLinks,
      playerSongPools,
      showGuessDialog,
      playerHasGuessed,
      guessedTitle,
      guessedArtist,
      guessedYear,
      guessedMovie,
      gameMode,
      bingoSettings,
      bingoState,
      guessResults,
      inlineYearValue,
      feedbackCountdown,
      currentObjectionPlayerIndex,
      isObjectionPhase,
      // Neuer Einwand-Ablauf
      objectionOptInActive,
      objectionOptIns,
      objectionOptInCountdown,
      objectionPlacementCountdown,
      objectionRaffleActive,
      objectionRaffleNames,
      objectionRaffleHighlight,
      objectionRaffleWinner,
      correctObjectorNames,
      objectionWinnerName,
      // Multiplayer-Refs
      multiplayerMode,
      multiplayerIsHost,
      multiplayerRoomCode,
      multiplayerAudioMode,
      guestSlotIndex,
      showSkipRequestDialog,
      skipRequestFrom,
      guestSyncState,
      guestGuessTitle,
      guestGuessArtist,
      guestGuessYear,
      guestGuessMovie,
      activeGuessDisplay,
      guestPendingSongUrl,
      pendingSongUrl,
      songReadyCount,
      songReadyTotal,
      songReadyConfirmed,
      // Bingo-Runden-UI
      bingoTeamAnswer,
      bingoRevealHighlight,
      bingoRevealAnimating,
      showBingoBonusDialog,
      // Multiplayer-Computed
      isMyGuestGuessTurn,
      showGuestGuessReadOnly,
      showGuestObjectionDialog,
      isMyGuestObjectionTurn,
      isHostWatchingGuestGuess,
    } = state;

    const {
      loadSongLinks,
      loadAnswerData,
      loadPlayedLinksHistory,
      clearSongsHistory,
      preloadForNextCard,
      drawNewCard,
      manualSkipSong,
    } = useSongManager(state, { socketEmit });

    const {
      getGuessDialogSubtitle,
      hasPlayerSubmittedObjection,
      canPlayerStartObjection,
      placeCard,
      cancelGuessAndReplace,
      submitGuess,
      beginObjection,
      handleNoObjection,
      toggleObjectionOptIn,
      closeOptInWindow,
      clearObjectionTimers,
    } = useGuessEngine(state, { loadAnswerData });

    const {
      syncMultiplayerState,
      guestRequestSkip,
      confirmGuestSkip,
      guestDrawCard,
      openGuestSongUrl,
      guestPlaceCard,
      guestSubmitGuess,
      guestBeginObjection,
      guestToggleObjectionOptIn,
      guestCancelGuessAndReplace,
      copyRoomCode,
      confirmSongReady,
      initMultiplayer,
      destroyMultiplayer,
    } = useMultiplayer(state, {
      drawNewCard,
      manualSkipSong,
      placeCard,
      submitGuess,
      beginObjection,
      toggleObjectionOptIn,
      cancelGuessAndReplace,
      route,
      router,
    });

    // Bingo-Runden-Composable: verwaltet Reveal-Animation, Emit-Wrapper
    // für Host-/Team-Aktionen und Auto-Resolve-Timer (nur Host).
    const bingoRoundApi = useBingoRound(state, { drawNewCard });

    // Versions-Katalog (für Battle-Modus: Anzeige der gewählten Version
    // pro Spieler im Timeline-Header). loadVersions wird beim Mount
    // aufgerufen, damit auch gerätelokal importierte Versionen für den
    // Label-Lookup zur Verfügung stehen.
    const { allVersions, loadVersions } = useVersions();
    const battleVersionLabel = (poolValue) => {
      if (!poolValue) return "";
      const found = allVersions.value.find((v) => v.value === poolValue);
      return found ? found.label : poolValue;
    };

    // ── Bingo-UI-Adapter für Game.vue-Template ─────────────────────────
    const bingoRound = bingoRoundApi.round;
    const bingoWinners = bingoRoundApi.winners;
    const bingoOrderedCategories = bingoRoundApi.orderedCategories;
    const bingoActiveCategoryColor = bingoRoundApi.activeCategoryColor;
    const bingoSecondsRemaining = bingoRoundApi.secondsRemaining;
    const bingoIAmCorrectAndNeedsMark = bingoRoundApi.iAmCorrectAndNeedsMark;
    const bingoIAmInBonusPending = bingoRoundApi.iAmInBonusPending;
    const bingoMySlotId = bingoRoundApi.mySlotId;

    const bingoIAmInATeam = computed(() => bingoMySlotId.value !== null);
    const bingoBingoCounts = computed(
      () => bingoState.value?.bingoCounts || {},
    );
    const bingoOwnBingoCount = computed(() => {
      const sid = bingoMySlotId.value;
      if (sid === null) return 0;
      return Number(bingoBingoCounts.value[sid] || 0);
    });

    // Server sendet die Kategorie nur mit id/color/bonusYearRange (siehe
    // server/rooms.js BINGO_CATEGORIES). Für Label + Beschreibung nehmen
    // wir die vollständige Client-Variante.
    const bingoCurrentCategoryFull = computed(() => {
      const cat = bingoRound.value?.category;
      if (!cat) return null;
      return bingoOrderedCategories.value.find((c) => c.id === cat.id) || cat;
    });

    // Highlight-Index für den Kategorie-Strip.
    // - Während der Reveal-Animation: der laufende Highlight vom Composable.
    // - Sobald eine Kategorie feststeht (reveal / answering / ...): fix auf
    //   diese Kategorie.
    // - Sonst (idle): -1 (nichts hervorheben).
    const bingoHighlightedCategoryIndex = computed(() => {
      if (bingoRevealAnimating.value) return bingoRevealHighlight.value;
      const cat = bingoRound.value?.category;
      if (!cat) return -1;
      return bingoOrderedCategories.value.findIndex((c) => c.id === cat.id);
    });

    const bingoCategoryColorHex = (colorKey) =>
      BINGO_COLORS[colorKey] || "#666";

    // Antwort-Text pro Team hübsch aufbereitet (für die Auflösung).
    const formatBingoAnswer = (categoryId, value) => {
      if (value === undefined || value === null || value === "") return "";
      const raw = String(value);
      switch (categoryId) {
        case "solo-group":
          return raw === "solo" ? "Solo" : raw === "group" ? "Gruppe" : raw;
        case "before-2000":
          return raw === "before"
            ? "Vor 2000"
            : raw === "after"
              ? "Ab 2000"
              : raw;
        case "decade": {
          const n = Number(raw);
          return Number.isFinite(n) ? `${n}er` : raw;
        }
        default:
          return raw;
      }
    };

    // Kombiniert Teams + Antworten + Auswertung für die Anzeige.
    const bingoTeamsWithEval = computed(() => {
      const r = bingoRound.value;
      if (!r || !r.answersRevealed) return [];
      return bingoTeamsBySlotIndex.value.map((t) => {
        const rawAnswer = r.teamAnswers?.[t.slotId];
        const evaluation = r.evalPerTeam?.[t.slotId] || {};
        return {
          slotId: t.slotId,
          name: t.name,
          correct: evaluation.correct === true,
          exactYear: evaluation.exactYear === true,
          displayAnswer: formatBingoAnswer(r.category?.id, rawAnswer),
        };
      });
    });

    // Antwort-Fortschritt in der Antwortphase: zählt, wie viele Teams
    // einen nicht-leeren Antwort-Text abgegeben haben. Wird als Chip im
    // Host-Action-Bereich angezeigt, damit der Host nicht die Runde
    // auflöst, bevor alle geantwortet haben.
    const bingoTotalTeams = computed(() => bingoTeamsBySlotIndex.value.length);
    const bingoAnsweredCount = computed(() => {
      const answers = bingoRound.value?.teamAnswers || {};
      return bingoTeamsBySlotIndex.value.filter((t) => {
        const v = answers[t.slotId];
        return v !== undefined && String(v).trim() !== "";
      }).length;
    });
    const bingoAllTeamsAnswered = computed(
      () =>
        bingoTotalTeams.value > 0 &&
        bingoAnsweredCount.value >= bingoTotalTeams.value,
    );

    // Opponent-Teams für den Bonus-Dialog.
    const bingoOpponentTeamsForBonus = computed(() =>
      bingoTeamsBySlotIndex.value
        .filter((t) => t.slotId !== bingoMySlotId.value)
        .map((t) => ({
          slotId: t.slotId,
          name: t.name,
          cells: t.cells,
          marks: t.marks,
        })),
    );

    // Sieger-Namen aus slotIds ableiten.
    const bingoWinnerNames = computed(() => {
      const wins = bingoWinners.value || [];
      return wins.map((sid) => {
        const t = bingoTeamsBySlotIndex.value.find((x) => x.slotId === sid);
        return t?.name || `Team ${sid}`;
      });
    });

    // Event-Handler an die Composable-Aktionen.
    const onBingoDrawCard = () => bingoRoundApi.hostDrawBingoCard();
    const onBingoResolveRound = () => bingoRoundApi.hostResolveRound();
    const onBingoClassifySoloGroup = (cls) =>
      bingoRoundApi.hostClassifySoloGroup(cls);
    const onBingoSkipRound = () => bingoRoundApi.hostSkipRound();
    const onBingoNextRound = () => bingoRoundApi.hostNextRound();
    const onBingoSetTimerMode = (mode) => bingoRoundApi.hostSetTimerMode(mode);
    const onBingoTeamAnswerInput = (value) => {
      bingoTeamAnswer.value = value ?? "";
      bingoRoundApi.submitTeamAnswer(bingoTeamAnswer.value);
    };
    const onBingoMarkCell = (cellIndex) =>
      bingoRoundApi.teamMarkCell(cellIndex);
    const onBingoBonusConfirm = ({ targetSlotId, cellIndex }) =>
      bingoRoundApi.teamUseBonus(targetSlotId, cellIndex);
    const teamSkipBonus = () => bingoRoundApi.teamSkipBonus();

    // Einwand-Opt-in: Gäste schicken die Umschaltung an den Host, Host/lokal
    // schalten direkt um (nur der eigene Slot ist im Multiplayer klickbar).
    const onToggleObjectionOptIn = (idx) => {
      if (multiplayerMode.value && !multiplayerIsHost.value) {
        guestToggleObjectionOptIn();
      } else {
        toggleObjectionOptIn(idx);
      }
    };

    function applyScoreManage() {
      const idx = scoreManagePlayerIndex.value;
      const amount = scoreManageAmount.value || 1;
      for (let i = 0; i < amount; i++) {
        if (scoreManageType.value === "points") {
          if (scoreManageAction.value === "add") addManualPoint(idx);
          else removeManualPoint(idx);
        } else {
          if (scoreManageAction.value === "add") addManualObjection(idx);
          else removeManualObjection(idx);
        }
      }
      showScoreManageDialog.value = false;
    }

    onBeforeUnmount(() => {
      clearFeedbackCountdown();
      clearObjectionTimers();
      destroyMultiplayer();
    });

    onMounted(async () => {
      initGame();
      // Versions-Katalog laden (u. a. Battle-Versionsnamen für die Chips).
      loadVersions();

      // ── Multiplayer-Setup ──────────────────────────────────────────────────
      initMultiplayer();
      // ── Ende Multiplayer-Setup ────────────────────────────────────────────

      const loadFromSessionQuery =
        String(route.query.loadSession || "") === "1";
      if (loadFromSessionQuery) {
        // Gäste haben keinen Spielstand in ihrer localStorage – sie bekommen
        // den State direkt vom Host via syncState. Nur der Host lädt selbst.
        if (!multiplayerMode.value || multiplayerIsHost.value) {
          loadSessionSnapshot();
        }
        // Host: geladenen State sofort an alle Gäste senden
        if (multiplayerMode.value && multiplayerIsHost.value) {
          syncMultiplayerState();
        }
      }

      // Lade bereits gespielte Links aus localStorage
      try {
        playedLinksHistory.value = await loadPlayedLinksHistory();
      } catch (error) {
        console.error("Fehler beim Laden der History:", error);
      }

      // Lade alle Song-Links
      try {
        allSongLinks.value = await loadSongLinks();
        // Nächsten Link direkt vorauswählen, damit beim ersten Klick
        // window.open(songUrl) sofort ohne await aufgerufen werden kann.
        preloadForNextCard();
      } catch (error) {
        console.error("Fehler beim Laden der Song-Links:", error);
      }

      // Info-Nachricht zum Startkarten-Ziehen nur bei neuem Spiel (nicht für Gäste)
      if (
        !loadFromSessionQuery &&
        (!multiplayerMode.value || multiplayerIsHost.value)
      ) {
        setTimeout(() => {
          Notify.create({
            type: "info",
            message:
              'Klicke "Startkarte ziehen", um allen Spielern eine Startkarte zu geben.',
            timeout: 4000,
            position: "top",
          });
        }, 1000);
      }
    });

    // Zieht Startkarten für ALLE Spieler auf einmal (nur Host bzw. lokal).
    const drawAllStartCards = async () => {
      for (let i = 0; i < playerTimelines.value.length; i++) {
        if (playerTimelines.value[i].cards.length === 0) {
          // eslint-disable-next-line no-await-in-loop
          await drawStartCard(i);
        }
      }
    };

    // Aktuellen Spieler immer mittig auf den Bildschirm scrollen (online + lokal).
    const scrollToActivePlayer = () => {
      nextTick(() => {
        const el = document.querySelector(".player-timeline.active-player");
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    };
    watch(currentPlayerIndex, scrollToActivePlayer, { immediate: true });

    // Blockiere Timeline-Platzierung, solange der Song noch nicht geöffnet
    // wurde (all-clients-Modus: pendingSongUrl noch offen; host-only als
    // Gast: guestPendingSongUrl noch offen). Ohne diese Sperre konnte der
    // aktive Gast eine Karte legen, bevor er den „Song öffnen"-Button
    // gedrückt hatte – dann geraten wurde, ohne den Song überhaupt zu hören.
    const canPlaceCards = computed(() => {
      if (pendingSongUrl.value) return false;
      if (
        multiplayerMode.value &&
        !multiplayerIsHost.value &&
        guestPendingSongUrl.value
      ) {
        return false;
      }
      return true;
    });

    // ── Bingo-Modus: Karten pro Team aus bingoState ableiten ──────────────
    // Die Server-Datenstruktur ist {teamCards: {slotId: colors[25]},
    // teamMarks: {slotId: bools[25]}}. `playerTimelines`-Index entspricht
    // der Slot-Reihenfolge; die tatsächlichen `slotId`-Werte werden nicht
    // ins Query mitgegeben, deshalb ordnen wir sortiert nach Slot-Reihenfolge
    // zu (dieselbe Reihenfolge, in der der Server iteriert).
    const bingoTeamsBySlotIndex = computed(() => {
      const bs = bingoState.value;
      if (!bs || !bs.teamCards) return [];
      // slotIds numerisch sortieren, damit Reihenfolge deterministisch
      // zur Server-Iteration passt (players wurden dort in Slot-Reihenfolge
      // durchlaufen).
      const slotIds = Object.keys(bs.teamCards)
        .map((k) => Number(k))
        .filter((n) => Number.isFinite(n))
        .sort((a, b) => a - b);
      return slotIds.map((slotId, idx) => ({
        slotIndex: idx,
        slotId,
        name: playerTimelines.value[idx]?.name || `Team ${idx + 1}`,
        cells: bs.teamCards[slotId] || [],
        marks: bs.teamMarks?.[slotId] || [],
      }));
    });
    const ownTeamCells = computed(() => {
      const t = bingoTeamsBySlotIndex.value[guestSlotIndex.value];
      return t?.cells || [];
    });
    const ownTeamMarks = computed(() => {
      const t = bingoTeamsBySlotIndex.value[guestSlotIndex.value];
      return t?.marks || [];
    });
    const opponentTeams = computed(() =>
      bingoTeamsBySlotIndex.value.filter(
        (t) => t.slotIndex !== guestSlotIndex.value,
      ),
    );

    // ── Profilbilder pro Slot (Online) ─────────────────────────────────
    // Beim Spielstart von der Lobby in sessionStorage abgelegt (Index =
    // Slot-Reihenfolge, deckungsgleich mit playerTimelines). Nur im
    // Multiplayer relevant; lokal bleibt es leer.
    const slotAvatars = ref(loadSlotAvatars());
    const slotAvatarEntries = (index) =>
      multiplayerMode.value ? slotAvatars.value[index] || [] : [];
    // Aktualisieren, wenn profileService neue Slot-Avatare in sessionStorage
    // ablegt (z. B. nach einem verspäteten `roomState`, das erst nach dem
    // Mount die memberAvatars nachliefert).
    const reloadSlotAvatars = () => {
      slotAvatars.value = loadSlotAvatars();
    };

    // ── Bingo: Gegner-Karten-Scroller (Pfeil-Buttons) ─────────────────
    // Die Reihe der Gegnerkarten ist einzeilig (nowrap, overflow-x). Wenn
    // der Inhalt breiter als der Container ist, werden links/rechts
    // Chevron-Buttons eingeblendet. Zustand wird über Scroll-Events und
    // einen ResizeObserver aktuell gehalten.
    const opponentsScrollerRef = ref(null);
    const opponentsCanScrollLeft = ref(false);
    const opponentsCanScrollRight = ref(false);
    const updateOpponentsScrollState = () => {
      const el = opponentsScrollerRef.value;
      if (!el) {
        opponentsCanScrollLeft.value = false;
        opponentsCanScrollRight.value = false;
        return;
      }
      const max = el.scrollWidth - el.clientWidth;
      opponentsCanScrollLeft.value = el.scrollLeft > 4;
      opponentsCanScrollRight.value = el.scrollLeft < max - 4;
    };
    const scrollOpponents = (dir) => {
      const el = opponentsScrollerRef.value;
      if (!el) return;
      const step = Math.max(160, el.clientWidth * 0.7);
      el.scrollBy({ left: dir * step, behavior: "smooth" });
    };
    let opponentsResizeObserver = null;
    // Beim Wechsel der Teams (z. B. Spielbeitritt) neu prüfen.
    watch(opponentTeams, async () => {
      await nextTick();
      updateOpponentsScrollState();
    });

    // ── Timeline-Karten-Scroller (Pfeil-Buttons pro Spieler) ─────────
    // Jede .player-timeline hat einen eigenen horizontal scrollbaren
    // Kartenbereich. Analog zum Bingo-Gegner-Scroller blenden wir links/
    // rechts Chevron-Buttons ein, wenn der Inhalt breiter als der Container
    // ist. Refs werden per Function-Ref pro Spieler-Index verwaltet.
    const timelineScrollerRefs = {};
    const timelineResizeObservers = {};
    // Callback-Cache: WICHTIG – die Function-Ref pro Index MUSS über Renders
    // stabil bleiben, sonst behandelt Vue jeden Re-Render als neuen Ref und
    // ruft (a) den alten Callback mit null (State löschen) und (b) den neuen
    // mit dem Element (State setzen). Beide setzen `timelineScrollState.value`
    // reaktiv → weiterer Re-Render → Endlosschleife (hängende Seite in
    // Normal/Film/Battle). Deshalb Cache pro Index.
    const timelineRefCallbacks = {};
    const timelineScrollState = ref({}); // { [index]: { canScrollLeft, canScrollRight } }
    const updateTimelineScrollState = (index) => {
      const el = timelineScrollerRefs[index];
      const cur = timelineScrollState.value[index];
      let nextEntry;
      if (!el) {
        nextEntry = { canScrollLeft: false, canScrollRight: false };
      } else {
        const max = el.scrollWidth - el.clientWidth;
        nextEntry = {
          canScrollLeft: el.scrollLeft > 4,
          canScrollRight: el.scrollLeft < max - 4,
        };
      }
      // Nur reaktiv schreiben, wenn sich wirklich etwas ändert – sonst
      // triggert jedes Scroll-Event unnötige Re-Renders.
      if (
        !cur ||
        cur.canScrollLeft !== nextEntry.canScrollLeft ||
        cur.canScrollRight !== nextEntry.canScrollRight
      ) {
        timelineScrollState.value = {
          ...timelineScrollState.value,
          [index]: nextEntry,
        };
      }
    };
    const setTimelineScrollerRef = (index) => {
      if (!timelineRefCallbacks[index]) {
        timelineRefCallbacks[index] = (el) => {
          if (el) {
            // Wenn dasselbe Element erneut übergeben wird (kann bei
            // Re-Renders passieren), NICHTS neu tun – sonst Loop.
            if (timelineScrollerRefs[index] === el) return;
            timelineScrollerRefs[index] = el;
            if (
              typeof ResizeObserver !== "undefined" &&
              !timelineResizeObservers[index]
            ) {
              const ro = new ResizeObserver(() =>
                updateTimelineScrollState(index),
              );
              ro.observe(el);
              timelineResizeObservers[index] = ro;
            }
            nextTick(() => updateTimelineScrollState(index));
          } else {
            // Element wurde unmounted → Observer trennen und State
            // aufräumen. Nur wenn wir vorher tatsächlich einen Ref hatten
            // (defensiv – Vue kann null-Callbacks sonst spurios auslösen).
            if (!timelineScrollerRefs[index]) return;
            if (timelineResizeObservers[index]) {
              timelineResizeObservers[index].disconnect();
              delete timelineResizeObservers[index];
            }
            delete timelineScrollerRefs[index];
            if (timelineScrollState.value[index]) {
              const next = { ...timelineScrollState.value };
              delete next[index];
              timelineScrollState.value = next;
            }
          }
        };
      }
      return timelineRefCallbacks[index];
    };
    const scrollTimeline = (index, dir) => {
      const el = timelineScrollerRefs[index];
      if (!el) return;
      const step = Math.max(160, el.clientWidth * 0.7);
      el.scrollBy({ left: dir * step, behavior: "smooth" });
    };
    const updateAllTimelineScrollStates = () => {
      Object.keys(timelineScrollerRefs).forEach((i) =>
        updateTimelineScrollState(i),
      );
    };
    // Bei Änderungen an den Karten (Karte gelegt/entfernt) Scroll-Zustand
    // neu prüfen, damit die Pfeile richtig ein-/ausblenden.
    watch(
      playerTimelines,
      async () => {
        await nextTick();
        updateAllTimelineScrollStates();
      },
      { deep: true },
    );
    onMounted(() => {
      nextTick(() => {
        updateOpponentsScrollState();
        const el = opponentsScrollerRef.value;
        if (el && typeof ResizeObserver !== "undefined") {
          opponentsResizeObserver = new ResizeObserver(() =>
            updateOpponentsScrollState(),
          );
          opponentsResizeObserver.observe(el);
        }
        window.addEventListener("resize", updateOpponentsScrollState);
        // Timeline-Scroller ebenfalls initial prüfen + auf Resize hören.
        updateAllTimelineScrollStates();
        window.addEventListener("resize", updateAllTimelineScrollStates);
      });
      window.addEventListener(SLOT_AVATARS_EVENT, reloadSlotAvatars);
    });
    onBeforeUnmount(() => {
      if (opponentsResizeObserver) {
        opponentsResizeObserver.disconnect();
        opponentsResizeObserver = null;
      }
      window.removeEventListener("resize", updateOpponentsScrollState);
      window.removeEventListener("resize", updateAllTimelineScrollStates);
      window.removeEventListener(SLOT_AVATARS_EVENT, reloadSlotAvatars);
      // Alle Timeline-ResizeObserver aufräumen.
      Object.values(timelineResizeObservers).forEach((ro) => ro.disconnect());
      for (const k of Object.keys(timelineResizeObservers)) {
        delete timelineResizeObservers[k];
      }
    });

    // ── Bingo: Host-Einstellungen / Werkzeuge ──────────────────────────
    const showBingoSettingsDialog = ref(false);
    const bingoSettingsView = ref("menu"); // 'menu' | 'correct'
    const bingoCorrectSlotId = ref(null);

    const bingoTeamSelectOptions = computed(() =>
      bingoTeamsBySlotIndex.value.map((t) => ({
        label: t.name,
        value: t.slotId,
      })),
    );
    const bingoCorrectTeam = computed(() => {
      const t = bingoTeamsBySlotIndex.value.find(
        (x) => x.slotId === bingoCorrectSlotId.value,
      );
      if (!t) return null;
      return {
        ...t,
        bingoCount: Number(bingoBingoCounts.value[t.slotId] || 0),
      };
    });

    const enterBingoCorrectView = () => {
      if (bingoCorrectSlotId.value === null) {
        bingoCorrectSlotId.value =
          bingoTeamsBySlotIndex.value[0]?.slotId ?? null;
      }
      bingoSettingsView.value = "correct";
    };
    const onBingoResetMarks = () => bingoRoundApi.hostResetMarks();
    const onBingoCorrectCell = (cellIndex) => {
      const team = bingoCorrectTeam.value;
      if (!team) return;
      const marked = !team.marks[cellIndex];
      bingoRoundApi.hostSetCell(team.slotId, cellIndex, marked);
    };

    // ── Bingo: Ergebnis für die Statistik verbuchen ────────────────────
    // Bingo hat keine Punkte → scores = 0; nur Sieg + Spielzeit zählen.
    // Nur der Host verbucht; der Server verhindert Doppelbuchung zusätzlich.
    const bingoResultEmitted = ref(false);
    watch(bingoWinners, (winners) => {
      if (!winners || !winners.length) return;
      if (!multiplayerIsHost.value) return;
      if (bingoResultEmitted.value) return;
      bingoResultEmitted.value = true;
      const teams = bingoTeamsBySlotIndex.value;
      const scores = teams.map(() => 0);
      const winnerIndices = teams
        .filter((t) => winners.includes(t.slotId))
        .map((t) => t.slotIndex);
      socketEmit("host:recordGameResult", { scores, winnerIndices });
    });

    return {
      isMobile,
      cardColor,
      canPlaceCards,
      drawAllStartCards,
      // Bingo (Etappe 2)
      showBingoLegend,
      ownTeamCells,
      ownTeamMarks,
      opponentTeams,
      // Profilbilder pro Slot (Online)
      slotAvatarEntries,
      // Bingo: Gegner-Scroller mit Pfeil-Buttons
      opponentsScrollerRef,
      opponentsCanScrollLeft,
      opponentsCanScrollRight,
      updateOpponentsScrollState,
      scrollOpponents,
      // Timeline-Karten-Scroller (Pfeil-Buttons pro Spieler)
      timelineScrollState,
      setTimelineScrollerRef,
      updateTimelineScrollState,
      scrollTimeline,
      // Bingo: Host-Einstellungen / Werkzeuge
      showBingoSettingsDialog,
      bingoSettingsView,
      bingoCorrectSlotId,
      bingoTeamSelectOptions,
      bingoCorrectTeam,
      enterBingoCorrectView,
      onBingoResetMarks,
      onBingoCorrectCell,
      // Bingo (Etappen 3–7): Runden-Ablauf, UI-Adapter
      bingoRound,
      bingoWinners,
      bingoWinnerNames,
      bingoOrderedCategories,
      bingoHighlightedCategoryIndex,
      bingoCurrentCategoryFull,
      bingoCategoryColorHex,
      bingoActiveCategoryColor,
      bingoSecondsRemaining,
      bingoIAmCorrectAndNeedsMark,
      bingoIAmInBonusPending,
      bingoIAmInATeam,
      bingoTeamAnswer,
      bingoRevealAnimating,
      bingoRevealHighlight,
      bingoBingoCounts,
      bingoOwnBingoCount,
      bingoTeamsWithEval,
      bingoAnsweredCount,
      bingoTotalTeams,
      bingoAllTeamsAnswered,
      bingoOpponentTeamsForBonus,
      showBingoBonusDialog,
      onBingoDrawCard,
      onBingoResolveRound,
      onBingoClassifySoloGroup,
      onBingoSkipRound,
      onBingoNextRound,
      onBingoSetTimerMode,
      onBingoTeamAnswerInput,
      onBingoMarkCell,
      onBingoBonusConfirm,
      teamSkipBonus,
      currentObjectionPlayerIndex,
      getGuessDialogSubtitle,
      hasPlayerSubmittedObjection,
      canPlayerStartObjection,
      reloadFirstCard,
      loadingFirstCard,
      playerCount,
      playerNames,
      currentPlayerIndex,
      // Multiplayer
      multiplayerMode,
      multiplayerIsHost,
      multiplayerRoomCode,
      copyRoomCode,
      multiplayerAudioMode,
      guestSlotIndex,
      showSkipRequestDialog,
      skipRequestFrom,
      syncMultiplayerState,
      socketEmit,
      guestRequestSkip,
      confirmGuestSkip,
      guestDrawCard,
      guestPendingSongUrl,
      openGuestSongUrl,
      pendingSongUrl,
      songReadyCount,
      songReadyTotal,
      songReadyConfirmed,
      confirmSongReady,
      guestPlaceCard,
      guestSubmitGuess,
      guestBeginObjection,
      guestCancelGuessAndReplace,
      guestSyncState,
      guestGuessTitle,
      guestGuessArtist,
      guestGuessYear,
      guestGuessMovie,
      activeGuessDisplay,
      isMyGuestGuessTurn,
      showGuestGuessReadOnly,
      showGuestObjectionDialog,
      isMyGuestObjectionTurn,
      isHostWatchingGuestGuess,
      playerTimelines,
      currentCard,
      showFeedback,
      feedbackCorrect,
      feedbackMessage,
      loadingNextSong,
      playedSongs,
      playedLinksHistory, // Links aus localStorage
      showObjectionDialog,
      pendingPlacement,
      showVictoryDialog,
      showRestartDialog,
      showSaveSessionDialog,
      saveDialogCallbackPending,
      showLoadSessionDialog,
      sessionFileInput,
      saveSessionOptions,
      hasAnySaveSessionOption,
      winnerName,
      victoryHeadline,
      victorySubline,
      MAX_CARDS,
      showGuessDialog, // Neu: Dialog für Rateeingabe
      playerHasGuessed,
      guessedTitle,
      guessedArtist,
      guessedYear,
      guessedMovie,
      gameMode,
      bingoSettings,
      bingoState,
      guessResults,
      playerSongPools,
      battleVersionLabel,
      manualSkipSong,
      openSaveSessionDialog,
      openLoadSessionDialog,
      confirmLoadFromLocalStorage,
      openSessionFilePicker,
      handleSessionFileSelected,
      confirmSaveSessionSnapshot,
      saveSessionSnapshot,
      skipSaveAndContinue,
      onSaveSessionDialogHidden,
      cancelSaveSessionDialog,
      loadSessionSnapshot,
      addManualPoint,
      removeManualPoint,
      addManualObjection,
      removeManualObjection,
      openRestartDialog,
      restartKeepingPlayersAndScores,
      restartAsNewGame,
      restartWithNewNamesKeepingScores,
      handleEndGame,
      drawNewCard,
      placeCard,
      closeFeedback,
      isObjectionPhase,
      beginObjection,
      handleNoObjection,
      // Neuer Einwand-Ablauf
      objectionOptInActive,
      objectionOptIns,
      objectionOptInCountdown,
      objectionPlacementCountdown,
      objectionRaffleActive,
      objectionRaffleNames,
      objectionRaffleHighlight,
      objectionRaffleWinner,
      correctObjectorNames,
      objectionWinnerName,
      toggleObjectionOptIn,
      onToggleObjectionOptIn,
      closeOptInWindow,
      submitGuess,
      clearSongsHistory,
      drawStartCard,
      resetGameState,
      inlineYearValue,
      feedbackCountdown,
      doCloseFeedback,
      // Manuelle Karte
      showManualCardDialog,
      manualCardTitle,
      manualCardArtist,
      manualCardYear,
      manualCardPlayerIndex,
      openManualCardDialog,
      confirmManualCard,
      cancelGuessAndReplace,
      showSettingsDialog,
      showInfoDialog,
      // Punkte/Einwände verwalten
      showScoreManageDialog,
      scoreManagePlayerIndex,
      scoreManageType,
      scoreManageAction,
      scoreManageAmount,
      applyScoreManage,
    };
  },
};
</script>

<style scoped src="../css/Game.scss"></style>
