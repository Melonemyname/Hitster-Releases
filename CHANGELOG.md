# Changelog

## 2026-08-20 – Version 1.0.1: Titel und Künstler richtig erkennen

Betrifft das Raten von Titel und Künstler (Bingo-Kategorien „Titel des Songs" und
„Name der Band / des Künstlers" sowie die Bonusfragen im Film-Modus).

- **Titel wurden mitten im Wort abgeschnitten.** Der Featuring-Filter hatte keine
  Wortgrenze vor dem Suchmuster und schlug überall zu, wo ein Wort auf „ft" endet.
  Aus „Kein Schwein ruft mich an" wurde intern „Kein Schwein ru", aus „no tears left
  to cry" wurde „no tears le", aus „Thrift Shop" wurde „Thri". Beim Vergleich fiel
  das nicht auf, weil beide Seiten gleich verstümmelt wurden, aber es war gefährlich:
  Von „Left Outside Alone" blieb „Le" übrig, von „Lift Me Up" blieb „Li", und der
  Abstand liegt innerhalb der Tippfehler-Toleranz. Eine falsche Antwort wäre als
  richtig durchgegangen. 16 Titel im vorhandenen Bestand waren betroffen.
- **„(feat. …)" musste mitgetippt werden.** Zwei Bereinigungsschritte liefen in der
  falschen Reihenfolge: Erst wurde ab „feat." alles abgeschnitten, samt schließender
  Klammer, danach fand die Klammern-Bereinigung kein vollständiges Paar mehr. Bei
  „Sucker for Pain (with Wiz Khalifa, … feat. X Ambassadors)" blieb die halbe
  Gästeliste stehen und wurde verlangt.
- **Mehr Fassungs-Hinweise werden erkannt.** Bisher nur „Remastered" und
  „Reimagined", und auch nur direkt hinter dem Bindestrich, sodass „Song - 2011
  Remaster" durchfiel. Jetzt zusätzlich Live, Acoustic, Unplugged, Instrumental,
  Demo, Mono, Stereo, Radio Edit, Single/Album Version, Extended Mix, Edit, Mix und
  „From …". Die Leerzeichen um den Bindestrich sind dabei Pflicht, sonst würde ein
  Titel wie „Played-A-Live" zu „Played-A" verstümmelt.
- **Semikolon trennt jetzt auch bei Künstlern.** Es ist mit 196 Einträgen der
  häufigste Trenner in den Song-Daten, wurde aber als einziger nicht erkannt. Wer bei
  „Luis Fonsi;Demi Lovato" nur einen der beiden nannte, lag zu Unrecht falsch.
  Nicht ergänzt wurden „/", „+" und „with": Dort sind die Vorkommen im Bestand
  ausschließlich echte Bandnamen wie AC/DC, Florence + The Machine oder
  Sin With Sebastian.

Abgesichert über den gesamten Bestand: Alle 4694 Titel und 2752 Künstler erkennen
sich selbst, alle 1551 Einzelnennungen aus Kollaborationen werden akzeptiert, und
der Vergleich alter gegen neue Logik ergab 20 Änderungen, allesamt Verbesserungen.

## 2026-08-20 – Version 1.0.0: Veröffentlichung

- **Der Quellcode ist jetzt öffentlich**, im selben Repo, in dem schon die
  Releases lagen (`Melonemyname/Hitster-Releases`). Dazu gehören eine
  MIT-Lizenz, ein README mit Vibecoding- und Rechtshinweis, eine vollständige
  Funktionsanleitung (`ANLEITUNG.md`) und eine erweiterte Hosting-Anleitung mit
  den drei Wegen, andere auf den eigenen Server zu holen (gleiches WLAN,
  privates Netz, öffentlich mit Portfreigabe). Nutzerdaten, private Editionen
  und Arbeitsunterlagen bleiben im privaten Repo; den Abgleich übernimmt
  `scripts/public-snapshot.sh` mit eingebauter Kontrolle.
- **Startskripte umbenannt und robuster.** „1 Server starten" und „2 Spiel
  starten" je Plattform, mit verständlicher Meldung, falls Node.js fehlt.
- **Der Release-Workflow unterscheidet jetzt Vorab- und Vollversionen** anhand
  der Versionsnummer: Tags mit `-` werden Prerelease, reine Versionen wie
  `v1.0.0` ein volles Release, das GitHub als „Latest" führt.
- **Kein fest verdrahteter Admin-Name mehr.** Auf einem bestehenden Server ohne
  Owner-Datei wird der zuerst registrierte Account Owner.
- **Stabile Installationen bleiben auf stabilen Versionen.** Der Update-Kanal
  richtet sich nach der installierten Version, statt immer auch Vorabversionen
  zu ziehen.

## 2026-08-19 – Sitzungsprüfung, Band/Solo-Trenner, Zugriff auf freigegebene Versionen

- **Freigegebene Versionen erschienen ohne Anmeldung.** Hitster Staffel 1 und 2 sind
  account-gebunden und werden vom Server nur an berechtigte Konten ausgeliefert. Die
  Auswahl las aber allein den gerätelokalen Zwischenspeicher, ohne zu prüfen, ob
  überhaupt jemand angemeldet ist, und geleert wurde der nur bei einem ausdrücklichen
  Abmelden. Jetzt tauchen sie ohne Anmeldung nicht mehr auf, und der Zwischenspeicher
  wird beim Start tatsächlich geleert statt nur ausgeblendet.
- **Die Sitzungsprüfung lief überhaupt nicht.** `verifyStoredToken` hatte keinen
  einzigen Aufrufer, damit war auch die Token-Erneuerung wirkungslos: Der Server
  stellte ein frisches Token aus, aber niemand fragte danach. Ebenso fiel ein längst
  ungültiges Token nie auf, die App hielt sich für angemeldet, während jeder
  Serveraufruf still scheiterte. Geprüft wird jetzt beim Start und danach alle sechs
  Stunden, weil die Desktop-App mitunter wochenlang durchläuft. Ein Netzwerkfehler
  meldet dabei niemanden ab, offline soll niemanden hinauswerfen.
- **Profilbild im FAB, zweiter Anlauf.** Ein misslungener Ladeversuch löschte das Bild
  und wurde nie wiederholt, deshalb half nur der Umweg über die Profilseite. Ein
  Fehlschlag lässt den bisherigen Stand jetzt stehen, es wird bis zu dreimal mit
  wachsendem Abstand versucht, und das Profil wird vor den Versionslisten geladen.
  Vorher liefen beide gleichzeitig los, und die kleine Profil-Antwort zog gegen
  mehrere hundert Songs pro Edition den Kürzeren.
- **Band/Solo erkennt jetzt alle Trenner.** Die Erkennung kannte nur das Komma. In den
  vorhandenen Daten trennen aber auch Semikolon (174 Künstler), das kaufmännische Und
  (83), Schrägstrich (7) und Plus (3) mehrere Interpreten, und bei keinem davon steht
  „Solo". Alle gelten jetzt als Zusammenschluss, dazu `feat.`, `ft.` und `featuring`.
  Gegenprobe: Ohne Künstler-Verzeichnis liegt die reine Trennregel bei allen 2657
  gepflegten Künstlern kein einziges Mal falsch.
- **Band/Solo nachträglich ergänzen.** Versionen, die vor der automatischen Erkennung
  entstanden sind, haben das Feld durchgehend leer. Im Bearbeiten-Dialog steht jetzt,
  bei wie vielen Songs es fehlt, samt Knopf zum Nachtragen. Bereits gesetzte Werte
  bleiben unangetastet. Im Bingo erspart ein gesetztes Feld dem Host die Nachfrage in
  der Kategorie „Solo oder Gruppe?".
- **Statistik zeigt keine internen Kennungen mehr.** Als meistgespielte Version stand
  dort teils `custom-` samt Nummer. Die Namensliste kannte nur den mitgelieferten
  Katalog, eigene und freigegebene Versionen fehlten darin ganz, und bei einem
  unbekannten Schlüssel zeigte die Zeile ersatzweise den rohen Wert. Jetzt umfasst die
  Liste alle bekannten Versionen, nicht mehr vorhandene fallen bei der Auswahl heraus,
  und bei Gleichstand entscheidet das Los, weil ein Mischpool für jede seiner
  Versionen gleich hoch zählt. Bleibt nichts übrig, steht dort ein Strich.
- **Metadaten-Zwischenspeicher wird beim Erstellen und Löschen geleert.** Alle
  verwandten Aktionen taten das bereits, diese beiden nicht. Er merkt sich auch
  negative Treffer, deshalb blieb ein Song, der vorher einmal unbekannt war, bis zum
  Neustart ohne Titel und Jahr, obwohl die neue Version ihn mitbrachte.
- **Ein Weg statt zwei zum Film-Eintrag.** Seit der Editor auch für eigene Versionen
  gilt, konnte er alles, was der eigene Film-Dialog konnte, und mehr. Der Dialog ist
  entfallen, der Bearbeiten-Stift führt jetzt für Film-Versionen dorthin.
- **Release-Workflow auf aktuelle Actions.** `checkout` und `setup-node` zielten auf
  das abgekündigte Node 20 und wurden von GitHub bereits zwangsweise auf Node 24
  gehoben.

## 2026-08-19 – Band/Solo beim Import automatisch

- **Band/Solo wird beim Import gesetzt.** Exportify liefert das Feld nicht mit,
  bisher blieb es bei jedem importierten Song leer und musste von Hand nachgetragen
  werden. Jetzt entsteht beim Import ein Künstler-Verzeichnis aus allem, was die App
  kennt: der mitgelieferten Metadaten-CSV sowie den eigenen und freigegebenen
  Versionen. Ein bekannter Künstler bekommt seinen bisherigen Wert, mehrere Künstler
  in einem Feld gelten als Band, und was unbekannt bleibt, bleibt leer statt geraten.
  Die Reihenfolge ist dabei wichtig: erst der Namenstreffer, dann die Trennregel,
  sonst würde ein Künstler mit Komma im Namen fälschlich als Zusammenschluss gelten.
  Bei widersprüchlichen Angaben entscheidet die Mehrheit, bei Gleichstand bleibt das
  Feld offen.
- **Rückmeldung zur Nacharbeit.** Beim Erstellen und beim Ergänzen steht jetzt dabei,
  bei wie vielen Songs Band/Solo noch fehlt, damit man die Lücken gezielt im
  Bearbeiten-Dialog nachträgt.

## 2026-08-19 – Versionen per CSV erweitern, sichtbare Auswahl, Profilbild

- **Versionen lassen sich mit einer weiteren CSV erweitern.** Im Bearbeiten-Dialog
  einer Version gibt es jetzt „Songs aus CSV ergänzen": Eine neue Exportify-Datei
  auswählen, und Links samt Metadaten werden an die vorhandenen angehängt. Songs,
  die schon in der Version stecken, werden übersprungen (erkannt an der
  Spotify-Track-Kennung, ersatzweise an Titel und Künstler), ein erneuter Export
  derselben Playlist legt also nichts doppelt an. Übernommen wird erst beim
  Speichern, vorher steht darüber, wie viele Songs neu waren.
- **Bearbeiten gibt es jetzt auch für eigene Versionen.** Der Editor war bisher
  auf freigegebene Versionen beschränkt, obwohl gerade die selbst importierten
  regelmäßig nachwachsen. Er liest und speichert nun je nach Art am richtigen Ort.
- **Die Auswahl in der Lobby ist wieder zu erkennen.** Beim Startspieler und bei
  der Spielernamen-Schnellauswahl sahen alle Knöpfe gleich aus. Sie markierten
  ihren Zustand über Quasars `outline`, das aber wirkungslos ist, seit die
  zentralen Button-Regeln jede rechteckige Schaltfläche mit dem Theme-Akzent
  füllen. Beide nutzen jetzt die dafür vorgesehene Klasse: ausgewählt in vollem
  Akzent, alles andere gedämpft.
- **Auswahlrahmen im Versionsdialog wird nicht mehr abgeschnitten.** Der Ring um
  eine gewählte Kachel liegt als Schatten außerhalb der Kachel, und der scrollende
  Kachelbereich beschnitt ihn an der linken Kante. Ursache: Sobald eine Achse
  scrollt, beschneidet der Browser auch die andere. Der Bereich hat jetzt rundum
  Platz dafür.
- **Profilbild erscheint sofort nach dem Anmelden.** Bisher blieb der Knopf oben
  rechts leer, bis man einmal das Profil geöffnet hatte. Anmelde- und Admin-Status
  wurden bei jedem Seitenwechsel neu aus dem lokalen Speicher gelesen, und dieser
  Umweg griff beim Anmelden nicht zuverlässig. Beides ist jetzt direkt im
  Auth-Dienst hinterlegt und meldet den Wechsel sofort.

## 2026-08-18 – Synchronisieren großer Versionen, Sitzungen, Startspieler online

- **Versionen-Dialog in der Lobby war zu breit.** Die Karte hatte nur eine
  Mindestbreite und einen 92vw-Deckel, aber keine feste Breite. Auf einem breiten
  Monitor wuchs der Dialog dadurch fast über das ganze Fenster, und weil das Raster
  feste vier Spalten hat, wurden die Kacheln entsprechend groß. Jetzt 640 Pixel wie
  im großen Versionen-Dialog, und die Kachelreihe scrollt ab 58 % der Fensterhöhe.

- **Fehler 413 beim Synchronisieren behoben.** Versionen ließen sich weder mit dem
  Server abgleichen noch mit anderen teilen, sobald sie etwas größer wurden. Ursache
  war das globale Body-Limit von 100 KB: Eine Karte wiegt rund 190 Byte, ab etwa 530
  Karten war Schluss. Das Limit wird jetzt zentral nach Pfad vergeben, für Versionen
  und Avatare gelten 8 MB, für alles andere weiterhin 100 KB. **Nebenbefund:** Der
  Avatar-Upload war aus demselben Grund kaputt. Sein eigenes 6-MB-Limit an der Route
  war wirkungslos, weil der globale Parser vorher greift und schon 413 wirft, bevor
  die Route überhaupt erreicht wird.
- **Man bleibt angemeldet.** Das Token galt 24 Stunden und wurde nie verlängert, wer
  die App ein Wochenende nicht öffnete, musste sich neu anmelden. Die Laufzeit liegt
  jetzt bei 30 Tagen, und beim Sitzungscheck (`/api/verify`) stellt der Server
  rechtzeitig ein frisches Token aus, sobald weniger als ein Drittel der Zeit übrig
  ist. Wer die App gelegentlich öffnet, wird damit gar nicht mehr abgemeldet.
- **Startspieler im Onlinemodus.** Bisher begann online immer der erste Slot. Der Host
  kann jetzt in der Lobby einen Startspieler festlegen oder es beim Auslosen belassen,
  was die Voreinstellung ist. Ausgelost wird einmal auf dem Server, damit alle
  denselben Gewinner sehen. Beim Start läuft bei allen synchron eine Ziehung: Die
  Hervorhebung springt durch die Namen, bremst ab und bleibt beim Gewinner stehen.
  Je nach Spielerzahl dauert das zwei bis vier Sekunden. Hat der Host jemanden fest
  gewählt, entfällt die Animation.
- **Geisterversionen in der Lobby entfernt.** Eine gelöschte Version tauchte im Raum
  weiter auf, angezeigt als roher Wert `custom-1754…`, und ließ sich dort nicht mehr
  loswerden. Sie stammte aus einem gespeicherten Spielstand, der ungeprüft übernommen
  wurde. Beim Laden eines Spielstands und beim Erstellen eines Raums werden Versionen
  jetzt gegen den Katalog geprüft, übersprungene werden gemeldet. Fehlt eine Version
  trotzdem einmal, steht dort „Nicht mehr verfügbar" statt der internen Kennung.

## 2026-07-30 – Versionen an Accounts freigeben, Restricted-Editor & Film-Versionen

- **Custom-Version an Accounts freigeben (wird zu Restricted).** In „Versionen
  verwalten" hat jede selbst erstellte Version einen „An Accounts freigeben"-Button
  (`group_add`). Erlaubt für den Ersteller und den Admin. Die Version wird auf den
  Server geladen, zur eingeschränkten Version und liegt danach nur noch dort; die
  gewählten Accounts bekommen sie automatisch (beim Abmelden verschwindet sie wieder
  von deren Geräten). Neue, eigentümer-geprüfte Endpoints unter
  `/api/my/restricted-versions` (POST/PUT/PATCH access/DELETE) plus
  `GET /api/users/basic` für die Account-Auswahl. Restricted-Versionen tragen jetzt
  `creatorId` und ein `film`-Flag; der Ersteller bleibt automatisch freigegeben.
- **Editor für eingeschränkte Versionen.** Bearbeiten-Stift in der Versionsübersicht
  (nur bei verwaltbaren Restricted-Versionen, also Ersteller/Admin). Neuer Editor
  (`SongMetadataEditor` + `RestrictedVersionEditor`): oben eine Suchleiste, darunter
  der aktuelle Song mit Vor/Zurück-Navigation, darunter die Felder untereinander in
  Metadaten-Reihenfolge (Titel, Künstler, Jahr, Band/Solo, Film/Serie). Die trackId
  wird nicht angezeigt. Speichern wirkt serverseitig für alle berechtigten Accounts.
- **Film-/Serien-Versionen allgemein.** Beim Erstellen ein Schalter „Ist eine
  Film-/Serien-Version"; danach öffnet sich direkt der Film-Eintrag-Dialog
  (`FilmEntryDialog`), um pro Song den Film/die Serie zu hinterlegen (für Custom
  bewusst kein voller Editor). Wird eine Film-Version freigegeben (Restricted), weist
  ein Hinweis auf den Editor hin. Der Film-Modus zeigt jetzt **alle** als Film
  markierten Versionen (nicht mehr nur die Soundtracks-Edition, die dafür in
  `editions.json` ein `film: true` bekommen hat) und **verhindert die Auswahl** von
  Film-Versionen ohne Filmeinträge (ausgegraut mit Hinweis).

## 2026-07-24 (2) – Admin-Seite, HITSTER-Logo, Rangliste & Statistik verifiziert

- **Admin-Seite: Nutzerverwaltung (nur der Server-Owner).** Neue Route `/admin` mit
  Router-Guard (`meta.requiresAdmin`), Server-Middleware `requireAdmin` prüft den
  JWT-Username final. Menüpunkt „Nutzerverwaltung" im FAB-Menü erscheint nur beim
  Admin-Account. Funktionen: Nutzerliste (Avatar, Spiele/Siege, Sicherheitsfrage-
  Badge), Nutzer anlegen (Sicherheitsfrage optional – neuer Nutzer kann sie im
  Profil selbst hinterlegen), Nutzer löschen (Admin-Account gegen Selbst-Löschen
  geschützt, Avatar-Datei wird mit gelöscht). Neue Server-Endpoints unter
  `/api/admin/users` (`GET`, `POST`, `DELETE`).
- **HITSTER-Logo als SVG-Komponente.** Neue `HitsterLogo.vue` ersetzt den „Game
  Starten"-Schriftzug im Index. Reines Inline-SVG mit Neon-Look (doppelter Text-
  Stroke für die Röhre + gestufte Gauss-Blur-Layer als Glow). Farbe folgt
  `--logo-color` mit Fallback `var(--app-accent)` – passt sich also automatisch
  dem Theme an; ViewBox erweitert, damit der Glow oben/unten Platz hat.
- **Kleiner Fix:** `Dialog`-Quasar-Plugin registriert (`quasar.config.js`), damit
  der Bestätigungsdialog zum Nutzer-Löschen tatsächlich erscheint (sonst war
  `Dialog.create` ein silent no-op).
- **Backlog aufgeräumt.** Rangliste + Profil-Statistikseite und die einheitliche
  Seitenbreite (≈ 1180 px) sind nach Nutzertest bestätigt und abgehakt.

## 2026-07-24 – Feedback-Runde: Versions-Grid, Bingo-Layout, Avatare, Scroll-Pfeile

- **Versions-Auswahl: 4 Karten pro Reihe.** Sowohl der Index-Wizard als auch der
  Lobby-Dialog (`.version-grid` und `.version-grid--wide`) verwenden jetzt einheitlich
  `repeat(4, minmax(0, 1fr))` (mobil ≤599 px fallen sie auf 2 Spalten zurück).
  Vorher waren es 2 Spalten bzw. `auto-fill minmax(100px)` – dadurch waren die Karten
  je nach Fensterbreite deutlich zu groß oder unterschiedlich groß.
- **Bingo – Layout in drei Acryl-Container gesplittet.** `.bingo-top` als Wrapper
  aufgelöst. Neu:
  1. `.bingo-header-panel` (Lobby + Chips + Info + Einstellungsrad),
  2. `.bingo-round-panel` (Kategorie-Strip + Phasen-Inhalt + Antwort-Button +
     „Song öffnen"),
  3. `.bingo-fields` (eigenes Feld + Gegner).
     Der Warten-Hinweis („Warten bis alle geantwortet haben") ist entfernt; der Zähler
     „X / Y geantwortet" bleibt.
- **Bingo – eigene Karte zentriert und viewport-basiert skaliert.** `.bingo-page` hat
  jetzt eine harte Höhe `calc(100vh - 40px)` mit `overflow: hidden`. Innerhalb füllt
  die eigene Karte per Flex-Chain die restliche Höhe; ein neuer
  `.bingo-own__card-square`-Wrapper hält sie via `aspect-ratio: 1/1` quadratisch
  (der frühere Direkt-Ansatz auf dem Grid selbst kollabierte auf `min-content`).
  Ergebnis: Seite passt in eine Viewport-Höhe, Karte skaliert auf
  `min(verfügbare Höhe, verfügbare Breite)`.
- **Bingo – Gegner-Scroller mit Chevron-Pfeilen.** Reihe der Gegner-Karten ist immer
  einzeilig (`nowrap` + `overflow-x: auto`). Chevron-Buttons links/rechts erscheinen
  nur, wenn scrollbar (Ref + `ResizeObserver`); Klick scrollt ~70 % der Container-
  Breite mit `scroll-behavior: smooth`. Gegner-Kacheln: Avatar links neben dem Namen,
  Karte darunter (statt vertikal gestapelt).
- **Timeline-Karten größer + Chevron-Pfeile.** `--timeline-card-size` war auf
  10-Karten-Fit gerechnet (≈95 px). Jetzt auf 6-Karten-Fit umgestellt (`min(220 px,
(…) / 6)`) → ≈173 px bei 1180 px Breite. Zusätzlich pro Spieler-Zeile ein eigener
  Chevron-Scroller (analog Bingo) mit gecachten Function-Refs (verhindert
  Endlosschleife durch neue Ref-Callbacks pro Render). Ausrichtung des inneren
  `inline-flex` per `vertical-align: middle` fixiert – vorher hatte die Baseline
  unten mehr Rand als oben.
- **Profilbilder in der Spielansicht funktionieren zuverlässig.** Ursache des
  Fallback-Icons war, dass `emit('gameStarted', getRoom(code))` das rohe Room-Objekt
  ohne `memberAvatars` sendete. Umgestellt auf `getRoomBroadcastState(code)`.
  Zusätzlich Client-Fallback: `useMultiplayer.onRoomState` ruft `storeSlotAvatars`
  bei jedem `roomState`-Event auf; `profileService` feuert ein Custom-Event
  `hitster:slot-avatars-updated`, auf das `Game.vue` reagiert – so werden Bilder
  auch bei verzögertem Room-State reaktiv nachgezogen.
- **Bingo – Avatare links vom Namen.** In der eigenen Team-Zeile stand der Avatar
  bisher rechts neben dem Namen; jetzt links (konsistent mit `.timeline-header` bei
  Normal/Film/Battle). Gleiches gilt für die Gegner-Kacheln.

## 2026-07-23 (17) – Bingo: Spielfeld beim Reset auch wirklich zurücksetzen

- **Bingo-Reset räumt jetzt auch den Bingo-State auf dem Server.**
  Bisher lief `resetGameState` client-seitig sauber (Timelines,
  Punkte, UI, History), sendete aber nur `host:returnToLobby`. Der
  Server-Handler `host:returnToLobby` setzte nur `gameStarted=false`
  und ließ `room.bingoState` (Karten, Marks, Bingo-Counts pro Team)
  bestehen. Ergebnis: die nächste Bingo-Runde startete mit den
  ALTEN Karten und Kreuzen, weil `initBingoState` einen Early-Return
  hat, wenn `bingoState` schon existiert. Fix:
  - Server: `host:returnToLobby` löscht jetzt `room.bingoState` mit.
    Der nächste Bingo-Start ruft `initBingoState` mit einem leeren
    Room auf → frische Karten für alle Teams.
  - Client: `resetGameState` setzt `bingoState.value = null` und
    entfernt `sessionStorage["hitster-bingo-state"]`, damit ein
    Refresh nach dem Reset nicht mit alten Karten aufsetzt.

## 2026-07-23 (16) – Windows-Play: Pause-Broadcast rausgenommen

- **Windows: kein `MEDIA_PAUSE`-Broadcast mehr vor dem URL-Load.** In
  preview.46 war die Wartezeit auf 60 ms reduziert; damit wurde der
  Web-URL-Load schneller fertig als der PowerShell-Prozess für den
  Pause-Broadcast. Ergebnis: der Pause pausierte den frisch
  gestarteten neuen Track. Der Autoplay-Redirect aus preview.45
  wechselt den Track ohnehin sauber (auch bei laufendem Vorgänger)
  – deshalb ist der Pause-Broadcast jetzt komplett raus. Track-Load
  ist damit merklich schneller (kein PowerShell-Startup mehr), und
  der „lädt, spielt, pausiert wieder"-Bug ist weg.

## 2026-07-23 (15) – Windows-Play: Wartezeit auf 60 ms reduziert

- **Windows: „Song öffnen" reagiert deutlich schneller.** Die
  Wartezeit zwischen `MEDIA_PAUSE`-Broadcast und `shell.openExternal`
  war mit 400 ms konservativ überdimensioniert. Der PowerShell-
  Prozess für den Pause-Broadcast läuft ohnehin parallel zum
  Browser-Aufruf; eine kleine Absicherungspause (60 ms) reicht,
  damit die PowerShell-Instanz überhaupt gestartet ist, bevor die
  URL geladen wird. Spart ~340 ms pro Track-Wechsel.

## 2026-07-23 (14) – Windows-Play: Web-URL mit Autoplay-Parameter

- **Windows: Track-Load jetzt über `open.spotify.com`-Web-URL mit
  `autoplay=true`.** Nach neun Iterationen (Broadcast-Play,
  gezieltes SendMessage, Message-Only-Fenster, MEDIA_STOP,
  MEDIA_PAUSE, Media-Key, AppActivate+SendKeys) hat der User selbst
  den entscheidenden Vorschlag gemacht: „Link über den Browser zur
  App schicken". Spotify hat sich für `open.spotify.com` als
  Handler registriert – der Standard-Browser bekommt den Link, sieht
  den Handler, leitet an Spotify-Desktop weiter und der
  `autoplay=true`-Parameter kommt beim Redirect mit. Kein
  PowerShell-Play-Skript mehr, kein AppActivate, kein SendKeys – nur
  noch `MEDIA_PAUSE` (damit der alte Track anhält) und dann direkt
  `shell.openExternal("https://open.spotify.com/track/XXX?autoplay=true")`.
  Trade-off: der Standard-Browser öffnet kurz einen Redirect-Tab
  (moderne Browser schließen ihn nach dem Redirect meist selbst).

## 2026-07-23 (13) – Windows-Play: AppActivate + SendKeys Space

- **Windows: neuer Track startet jetzt wirklich (Space auf
  hervorgehobenem Track statt Media-Session-Resume).** User-Feedback
  zu preview.43 hat den finalen Root Cause geklärt: sowohl der
  Broadcast-`MEDIA_PLAY` als auch der physische Media-Key
  (`VK_MEDIA_PLAY_PAUSE`) adressieren die Windows-Media-Session – und
  die ist beim vorherigen Track hängen. Spotify wechselt beim
  `spotify:track:XXX`-URI-Load nicht seinen „current track", sondern
  hebt den neuen nur in der UI hervor. Einziger zuverlässiger
  Trigger für „Play des hervorgehobenen Tracks": Space-Taste im
  fokussierten Spotify-Fenster. Neuer Ablauf:
  1. `MEDIA_PAUSE` broadcasten (Spotify pausiert)
  2. 400 ms warten
  3. `spotify:track:XXX` URI-Load (Track wird hervorgehoben)
  4. 1500 ms warten
  5. `WScript.Shell.AppActivate(spotify.pid)` + `SendKeys ' '`
     → Space auf hervorgehobenem Track = Play des neuen Tracks.
     Trade-off: Spotify poppt kurz in den Vordergrund. Nicht schön,
     aber nach acht Iterationen die einzige verlässliche Methode.

## 2026-07-23 (12) – Windows-Play: physischer Media-Key statt Broadcast

- **Windows: neuer Track startet jetzt wirklich (auch wenn Spotify
  vorher schon lief).** User-Feedback zu preview.42 hat den echten
  Root Cause geklärt: der `WM_APPCOMMAND MEDIA_PLAY`-Broadcast resumt
  den ALTEN Track, weil Spotifys „current track" nach `spotify:track:XXX`-
  Load noch der vorherige ist – der URI zeigt den neuen nur an,
  wechselt ihn aber nicht aktiv. Der Broadcast wird deshalb als
  „resume last" interpretiert. Fix: Broadcast-Play komplett rausgenommen.
  Neuer Ablauf:
  1. `MEDIA_PAUSE` broadcasten → Spotify pausiert
  2. 400 ms warten
  3. `spotify:track:XXX` URI-Load
  4. 1500 ms warten (Spotify markiert Track als current)
  5. `keybd_event(VK_MEDIA_PLAY_PAUSE)` – simulierter physischer
     Media-Tastenklick. Windows routet den Media-Key an die aktive
     Media-Session (Spotify). Da Spotify pausiert ist, macht der
     Toggle Play – und zwar des tatsächlich aktuellen Tracks (neu
     geladen), nicht des vorher gespielten.

## 2026-07-23 (11) – Windows-Play: MEDIA_PAUSE statt MEDIA_STOP

- **Windows: `MEDIA_STOP` durch `MEDIA_PAUSE` ersetzt.** Der
  `MEDIA_STOP`-Broadcast (13 = 0x0D) aus preview.41 wirkte bei
  Spotify nicht – der User musste weiterhin manuell auf Spotifys
  Pause-Button klicken, damit der neue Track startete. Fix:
  `APPCOMMAND_MEDIA_PAUSE` (47 = 0x2F) verwenden. Das entspricht
  genau dem manuellen Klick, den der User zum Behelf gedrückt hat.
  Der restliche Ablauf (400 ms warten → URI-Load → 1500 ms warten →
  `MEDIA_PLAY` × 2) bleibt.

## 2026-07-23 (10) – Bingo-Reset-Button, Windows-Play mit Stop-vor-Load

- **Bingo-Modus hat jetzt einen „Spiel zurücksetzen"-Button im
  Header.** In den anderen Modi liegt der Reset im Einstellungen-
  Dialog; im Bingo-Header gab es diesen Dialog nicht, deshalb der
  Reset direkt daneben (nur für Host bzw. lokal, analog zum Save-
  Session-Weg).
- **Windows: „Song öffnen" startet den neuen Track auch, wenn der
  vorherige noch läuft.** Bisher blieb Spotify im „already playing"-
  Zustand, der frische URI wurde hinter dem Alt-Track eingereiht und
  `MEDIA_PLAY` resumte den Alten statt den Neuen zu starten
  („spielt nicht wenn vorheriger Song noch läuft"). Neuer Ablauf:
  1. `MEDIA_STOP` broadcasten → 400 ms warten → Spotify wird „idle"
  2. `spotify:track:XXX` URI-Load
  3. 1500 ms warten → Spotify hat den Track als „current" markiert
  4. `MEDIA_PLAY` broadcasten (+ zweiter Broadcast nach 700 ms als
     Absicherung).
     Trade-off: der `MEDIA_STOP` pausiert kurz auch andere Media-Apps,
     aber ohne diesen Stop ignoriert Spotify das nachfolgende Play.

## 2026-07-23 (9) – Modus-Wechsel direkt sichtbar, Windows-Play mit 1,5 s Vorlauf

- **Modus-Wechsel: Client wechselt jetzt sofort, nicht erst bei der
  ersten Host-Aktion.** Root Cause aus dem preview.39-Feedback:
  `useMultiplayer.onGameStartedInGame` hat den Route-Wechsel per
  `router.replace('/lobby').then(() => router.push('/game', …))`
  gemacht. Der Zwischen-Unmount hat useMultiplayer destroyed, bevor
  `.then()` lief – das Push zu `/game` triggerte das Remount zwar,
  aber irgendwas dazwischen verschluckte den neuen Modus. Fix:
  - Direkter `router.replace('/game', query)` ohne Lobby-Umweg. Der
    `:key`-Fix am `<router-view>` erzwingt das Remount ohnehin.
  - Zusätzlich `watch(route.query.mode)` in `useGameState` als
    Absicherung: `gameMode` bleibt reaktiv an die URL gekoppelt.
    Falls das Remount aus irgendeinem Grund ausbleibt, wechselt der
    Modus trotzdem sofort – und nicht erst wenn der Host per
    `stateUpdate` den neuen `gameMode` „mitschickt".
- **Windows: „Song öffnen" mit 1,5 s Vorlauf.** In preview.39 kam der
  Play-Impuls bereits 200 ms nach dem URI-Load – zu früh: Spotify
  hatte den neuen Track noch nicht als „current" markiert, sodass
  `WM_APPCOMMAND MEDIA_PLAY` den vorherigen resumte („spielt nicht +
  Ping-Pong beim letzten Track"). Der `setTimeout` steht jetzt auf
  1500 ms; der zweite Broadcast nach weiteren 700 ms bleibt als
  Absicherung.

## 2026-07-23 (8) – DevTools nutzbar, Windows-Play mit Broadcast-Primär, Modus-Wechsel-Absicherung

- **Desktop-App: DevTools lassen sich wieder öffnen.** Der Prod-Build
  hatte einen `devtools-opened`-Handler, der das Panel beim Öffnen
  sofort wieder schloss – Debugging (Console, Netzwerk) war unmöglich.
  `Strg+Shift+I` / `F12` bzw. Menüleiste `View → Toggle Developer
Tools` funktionieren jetzt wieder.
- **Windows: „Song öffnen" – HWND_BROADCAST wieder als primärer Weg.**
  Zwei Iterationen mit gezielter Zustellung an Spotify.exe-Fenster
  (Toplevel + Message-Only via `EnumChildWindows(HWND_MESSAGE)`)
  blieben unzuverlässig – Spotify lud den neuen Track, spielte ihn
  aber nicht ab bzw. resumte den vorherigen. Broadcast erreicht auch
  Spotifys internen Media-Session-Handler, der auf gezielte
  `SendMessage`-Aufrufe nicht reagiert. Trade-off: fremde Media-Apps
  bekommen das Play-Kommando ebenfalls (potenzieller Ping-Pong), aber
  das ist das kleinere Übel im Vergleich zu „gar kein Playback".
  Zusätzlich zwei Broadcasts (sofort + nach 700 ms) und gezielte
  Zustellung an gefundene Spotify-Fenster als Extra-Sicherung.
- **Modus-Wechsel-Absicherung: `host:setGameMode` sendet zusätzlich
  `returnToLobby`.** Der `:key`-Fix aus preview.38 löste den „sauberen"
  Fall (Client joint, Host wechselt Modus, startet). Beim Szenario
  „vorher lief bereits eine Runde in Modus A" blieben Gäste weiterhin
  im alten Modus – vermutlich, weil sie ein `returnToLobby` verpasst
  hatten und noch in `/game` hingen. Der Server schickt beim Modus-
  Wechsel jetzt zusätzlich zum `roomState` auch `returnToLobby` an
  alle Gäste, was sie garantiert zurück in die Lobby zwingt.

## 2026-07-23 (7) – Modus-Wechsel-Remount, Windows-Play an Message-Only-Fenster

- **Modus-Wechsel synchronisiert jetzt zuverlässig alle Clients.**
  Root Cause: Vue Router mountet bei gleicher Route mit anderer Query
  die Ziel-Component **nicht** neu. `gameMode` in `useGameState` wird
  aber nur beim Setup aus `route.query.mode` gelesen – der Client
  hing deshalb im vorherigen Modus fest, sobald er einmal in `/game`
  war und der Host in der Lobby einen anderen Modus wählte. Fix:
  `:key="$route.path + ':' + $route.query.mode"` am `<router-view>`
  in `MainLayout.vue` erzwingt ein sauberes Remount bei Modus-Wechsel.
  Zusätzlich `router.replace` statt `router.push` in
  `Lobby.onGameStarted` (keine History-Reste) und sessionStorage-
  Bingo-Cleanup beim Wechsel weg von Bingo.
- **Windows: „Song öffnen" startet den neuen Track jetzt.** Der neue
  Song wurde geladen, aber Spotify hat den vorherigen wieder
  aufgenommen statt den frischen zu spielen. Grund: Spotifys
  Media-Key-Handler sitzt in einem Message-Only-Fenster
  (`HWND_MESSAGE`-parented), das `EnumWindows` **nicht** enthält.
  Das `WM_APPCOMMAND / MEDIA_PLAY` kam nur am sichtbaren Hauptfenster
  an und wurde dort als „resume last track" interpretiert. Das
  PowerShell-Skript enumeriert jetzt zusätzlich per
  `EnumChildWindows(HWND_MESSAGE, …)` alle Message-Only-Fenster von
  `Spotify.exe` und sendet Play auch dorthin. Rettungsanker:
  `HWND_BROADCAST` als letzter Versuch, falls in 5 s gar kein
  Spotify-Fenster gefunden wird (verhindert „gar kein Playback").

## 2026-07-23 (6) – Update-feste Datenablage, Lobby-Aufräumen, Song-Retry, Save-Skip lokal

- **Windows: Serverdaten & Login überleben jetzt Updates.** Die App-Daten
  (Server-URL, Login-Token, Chromium-Cookies, Fenster-Settings, Logs)
  lagen bisher „portable-artig" im Installations-Ordner
  (`<INSTDIR>\user-data\`). Der NSIS-Silent-Installer räumt beim
  Ersetzen der App-Dateien diesen Ordner mit weg – der Nutzer musste
  nach jedem Update Server und Login neu eintragen. Jetzt bleibt
  `userData` beim Electron-Standard `%APPDATA%\Roaming\Hitster\`, der
  ausserhalb des Installations-Ordners liegt und von keinem Installer
  angefasst wird. Die Wahl des Installations-Verzeichnisses im Wizard
  bleibt unverändert – nur die Datenablage wandert. Einmalige Migration
  aus dem alten INSTDIR-Ordner: sofern der Standard-Pfad noch leer ist,
  werden die alten Daten transparent übernommen.
- **Lobby: „Lokal ohne Multiplayer"-Button versteckt sich in einem
  aktiven Raum.** Der Button war auch dann sichtbar, wenn man bereits
  einem Raum beigetreten war – ein Klick darauf hätte den Multiplayer-
  Kontext unerwartet abgehängt, ohne den Server sauber zu informieren.
  Zum Verlassen dient stattdessen der „Raum verlassen"-Button in der
  Raum-Karte oben.
- **Windows: „Song öffnen" startet den neuen Track jetzt zuverlässig,
  auch beim Kaltstart.** Das gezielte `WM_APPCOMMAND` an Spotify hatte
  ein festes Timing (900 ms nach URI-Load) – zu früh, wenn Spotify erst
  starten musste oder den Track noch nicht „ready" hatte. Jetzt retryt
  das PowerShell-Skript intern bis zu 5 Sekunden lang alle 300 ms, bis
  mindestens ein Spotify-Fenster gefunden ist, und sendet nach 600 ms
  einen zweiten Play-Impuls als Absicherung.
- **Save-Dialog mit „Überspringen" jetzt in ALLEN Modi.** Der
  „Überspringen"-Button war zwar im Template vorhanden, das dafür
  zuständige `saveDialogCallbackPending`-Flag wurde in `Game.vue` aber
  weder aus dem State destrukturiert noch im `return` exportiert –
  Vue las den Wert deshalb als `undefined`, der `v-if` war immer
  falsy und der Button nie sichtbar. Jetzt korrekt verdrahtet:
  „Abbrechen / Überspringen / Speichern & weiter" erscheint bei jedem
  „Zur Lobby"-Klick, egal ob lokal, Multiplayer-Host, Normal, Film
  oder Bingo.
- **„Zur Lobby" räumt beim MP-Host jetzt komplett auf – Modus-Wechsel
  für alle Clients zuverlässig.** Bisher hat `handleEndGame` nur
  `host:returnToLobby` gesendet und den Host zur Lobby gepusht.
  Wenn der Host anschließend einen anderen Modus wählte (z. B.
  Bingo → Normal) und neu startete, hingen die Gäste-Clients im alten
  Modus fest – der manuelle Workaround war „Spiel zurücksetzen" +
  erneut starten. Jetzt läuft der komplette `resetGameState`-Flow als
  Callback des Save-Dialogs: lokaler State geräumt,
  `syncMultiplayerState`, `host:returnToLobby`, Push zur Lobby – der
  nächste Start landet garantiert im richtigen Modus für alle.
- **Timeline-Slots blitzen nicht mehr auf.** Beim Host im all-clients-
  Modus wurde `currentCard` sofort gesetzt, `pendingSongUrl` aber erst
  nach dem Server-Roundtrip – für ein paar Frames waren die `+`-Slots
  sichtbar. Der Host setzt `pendingSongUrl` jetzt lokal beim Ziehen.
  Beim Gast (all-clients) gibt es zusätzlich einen Guard in
  `onStateUpdate`: wenn eine neue Karten-`songUrl` per `stateUpdate`
  reinkommt und der Ready-Flow noch offen ist, wird `pendingSongUrl`
  proaktiv gesetzt – falls `cardDrawn` und `stateUpdate` durch Timing
  ungünstig verschränkt ankommen, entsteht kein Flicker mehr.

## 2026-07-23 (5) – Windows-Play ohne Pausier-Ping-Pong, Battle-Versions-Chip

- **Windows: „Song öffnen" startet den Track jetzt sauber genau einmal.**
  Bisher wurde `APPCOMMAND_MEDIA_PLAY` per `HWND_BROADCAST` an _alle_
  Toplevel-Fenster geschickt. Andere Media-Apps (Browser-Tabs mit
  Spotify-Web, WhatsApp, Media-Player) haben dadurch den Media-Session-
  Fokus gestohlen und Spotify kurz nach dem Start wieder pausiert. Das
  PowerShell-Skript enumeriert die Fenster jetzt per `EnumWindows`,
  filtert per `GetWindowThreadProcessId` gezielt auf `Spotify.exe`-PIDs
  und sendet `WM_APPCOMMAND` nur dorthin – kein Ping-Pong mehr, keine
  fremden Apps pausieren.
- **Battle-Modus: gewählte Version pro Spieler sichtbar.** Im
  Timeline-Header steht neben dem Spielernamen jetzt ein Chip mit der
  von diesem Spieler gewählten Battle-Version (z. B. „Battle of the
  Generations (1985–2004)"), damit alle sehen, aus welchem Pool welche
  Karte kam. Nur im Battle-Modus sichtbar.

## 2026-07-23 (4) – Startspieler-Buttons folgen dem Theme-Akzent

- **Startspieler-Auswahl im lokalen Spielstart:** die nicht-gewählten
  Spielernamen-Buttons (`.btn-unselected`) waren auf vielen Themes
  unlesbar (farblose Surface-Fläche + `--app-on-bg`, das bei manchen
  Themes dunkel ist). Jetzt bekommen sie – analog zu den Modus-Toggle-
  Buttons – eine dezente Theme-Akzent-Tönung und Schrift in
  `--app-on-accent`, was auf jedem Theme gut lesbar ist. Der aktiv
  gewählte Button (voller Akzent) hebt sich weiterhin klar ab.
- Hover verstärkt Fläche und Rand, damit klar erkennbar bleibt was
  aktuell unter dem Cursor ist.

## 2026-07-23 (3) – Deaktivierte & inaktive Buttons folgen dem Theme-Akzent

- **Deaktivierte und nicht-ausgewählte Buttons haben jetzt eine dezente
  Theme-Akzent-Tönung** statt eine farblose halbtransparent-graue
  Fläche. Sie sehen dadurch auf jedem Theme (Solar Flare, Neon Tide,
  Onyx, Deep Teal, Espresso, Wine, Forest usw.) sichtbar theme-farbig
  aus – nicht mehr wie „irgendwie grau mit Transparenz".
- **Schrift folgt `--app-on-accent`** (statt `--app-on-bg`). Damit ist
  sie immer auf der Akzent-Tönung lesbar – keine dunkle Schrift mehr
  auf dunklen Buttons, weil die Card-Chrome unter dem Button immer
  dunkel ist, unabhängig vom gewählten Theme.
- Deaktivierte Rechteck-Buttons zusätzlich mit `filter: saturate(0.55)`
  gedimmt + `2px dashed` als klarem „nicht klickbar"-Signal. Nicht-
  aktive Toggle-Buttons haben einen dünnen Solid-Rand, der beim Hover
  kräftiger wird.
- **Vorschau im Theme-Dialog** verwendet dieselbe Formel mit
  `preview.accent` / `preview.onAccent`, zeigt also präzise wie die
  deaktivierten Buttons im ausgewählten Theme aussehen werden.

## 2026-07-23 (2) – Deaktivierte & inaktive Buttons auf jedem Theme sichtbar

- **Deaktivierte Buttons und nicht-ausgewählte Toggle-Optionen** (z. B.
  die Modus-Auswahl neben „Normal": Battle / Film / Bingo) waren im
  Onyx-Theme kaum sichtbar – die Fläche verschmolz mit dem
  Seitenhintergrund und war erst beim Hover erkennbar.
- **Fix:** theme-abhängige Fläche via `color-mix(in srgb,
var(--app-on-bg) N%, transparent)` und Schrift in `var(--app-on-bg)`.
  Damit ergibt sich auf dunklen Themes eine helle transparente Fläche
  mit heller Schrift, auf hellen Themes eine dunkle transparente
  Fläche mit dunkler Schrift – immer sichtbar, immer lesbar. Kein
  weißer Text mehr auf heller Fläche.
- Deaktivierte Rechteck-Buttons bekommen zusätzlich einen deutlich
  sichtbaren gestrichelten Rand (`2px dashed` mit 55 %-Opazität) und
  `cursor: not-allowed`. Nicht-aktive Toggle-Buttons haben einen
  dünnen Solid-Rand, der beim Hover kräftiger wird.
- **Vorschau im Theme-Dialog** verwendet dieselbe Formel inline über
  `preview.onBg`, damit sichtbar wird, wie deaktivierte Buttons im
  ausgewählten Theme wirklich aussehen.

## 2026-07-23 (1) – Metadaten-Sektionen, Theming-Fixes, Lint-Aufräumung

### Songdaten / Import

- **Metadaten-CSV nach Versionen unterteilt.** Die zentrale
  `src/assets/songs/hitster-song-metadata.csv` ist jetzt nach den
  offiziellen Versionen (Staffel 1, Deutschland Rock, Platinum,
  Battle-Generations, …) gruppiert. Sektionsköpfe im Format
  `---- / Titel / ----` werden vom Spiel und vom Import-Skript
  ignoriert – reine Lesbarkeit im Editor, keine Verhaltensänderung
  im Spiel.
- **Import-Skript versteht Sektionen** (`scripts/import_hitster_csvs.py`).
  Neue Songs werden pro Playlist automatisch unter dem passenden
  Versions-Sektionskopf einsortiert; existiert die Sektion schon,
  werden sie ans Ende dieser Sektion angehängt. Neues Kommando
  `--reorganize` sortiert die bestehende CSV bei Bedarf jederzeit
  neu (Zuordnung anhand der `.txt`-Songlisten).
- **Zwei fehlende Songs zu „Hitster Staffel 2" zugeordnet**
  (Bad Omens – „Who are you?", Judas Priest – „Sinner"), die in
  keiner `.txt`-Songliste referenziert waren und deshalb bisher
  nirgends im Spiel auftauchten.

### Theming

- **Einheitliche Button-Schriftfarbe:** Alle rechteckigen
  Akzent-Buttons (inkl. `.bg-primary`/`.bg-secondary`/`.bg-accent`)
  erzwingen jetzt konsequent `--app-on-accent` – auch auf
  `.q-btn__content` und `.q-icon`. Damit werden per
  `text-color="white"` gesetzte weiße Schrift-Utilities (in Game
  und Lobby knapp 20 Stellen) auf hellen Themes nicht mehr
  unleserlich. Destruktive Buttons (`bg-negative`) bleiben explizit
  weiß auf Rot.
- **Deaktivierte Buttons auf jedem Theme klar sichtbar:** Quasars
  Standard-`opacity: 0.6` wird für Rechteck-Buttons und
  Segment-Toggle-Buttons überschrieben durch einen theme-neutralen
  Look – dezente Surface-Fläche, gestrichelter Rand, gedimmte
  On-Background-Schrift, `cursor: not-allowed`. Funktioniert auf
  hellen wie dunklen Themes gleichermassen.
- **Vorschau im Theme-Dialog erweitert:** Neben dem aktiven Button
  wird jetzt zusätzlich ein deaktivierter Button-Platzhalter
  angezeigt, damit die Kombination aus Akzent, Hintergrund und
  Disabled-Optik direkt beim Wählen geprüft werden kann.

### Aufräumen

- **Lint komplett grün** (0 Errors, 0 Warnings). 55 tote
  Destrukturierungen in `Game.vue`, ein ungenutzter Import in
  `useGameState.js` (`validateYearGuess`), ein toter Server-Import
  (`allBingoTeamsAnswered`) sowie ein Attribut-Reihenfolge-Hinweis
  im Settings-Dialog entfernt. Keine Verhaltensänderung, nur toter
  Code.

## 2026-07-22 (16) – Modus-Wechsel-Sync, Battle ohne Einwände-Chip

- **Modus-Wechsel wird jetzt korrekt an bereits laufende Clients
  übertragen.** Wenn der Host das Spiel beendet, in der Lobby einen
  anderen Modus wählt (z. B. von Bingo zu Normal) und erneut startet,
  bleiben Clients nicht mehr in der alten Route/im alten Modus hängen.
  `useMultiplayer` hört jetzt zusätzlich in `Game.vue` auf `gameStarted`
  und navigiert – wenn der Client bereits in `/game` ist – über einen
  Zwischenstopp in `/lobby` mit neuen Query-Parametern zurück nach
  `/game`, sodass die Komponente sauber neu mountet und mit dem neuen
  Modus initialisiert wird. `returnToLobby` räumt zusätzlich den in
  `sessionStorage` gecachten Bingo-State auf, damit ein späterer Bingo-
  Start nicht mit alten Karten weiterspielt.
- **Battle-Modus zeigt keinen Einwände-Chip mehr neben den Spielernamen.**
  Da Einwände im Battle deaktiviert sind, blendet die Timeline-Header-
  Zeile den Chip in diesem Modus jetzt aus. Punkte- und Karten-Chip
  bleiben.

## 2026-07-22 (15) – Lobby-Button im Bingo, Windows-Play deterministisch, Skip-Absicherung

### Multiplayer

- **„Zur Lobby" funktioniert jetzt im Bingo-Modus.** Der Save-Session-
  Dialog war bisher nur im Nicht-Bingo-`<template v-else>` gerendert;
  beim Klick auf „Zur Lobby" im Bingo passierte deshalb sichtbar
  nichts. Der Dialog liegt jetzt global auf der Page und wird für alle
  Modi geöffnet.
- **Klarere Aktions-Buttons im Save-Dialog:** „Abbrechen" (bleibt im
  Spiel) / „Überspringen" (führt Callback ohne Speichern aus) /
  „Speichern & weiter". Das Label „Zurück" war irreführend, weil es
  sich wie „Abbrechen" verhält – jetzt heißt der Button auch so.
  Escape / Klick daneben verwerfen den Callback (kein automatisches
  Weiter).
- **Skip-Absicherung gegen Late-Klicks:** Der Host akzeptiert
  `guest:placeCard` und `guest:submitGuess` nur noch, wenn eine
  Platzierung tatsächlich offen ist (`currentCard`, keine bereits
  geratene Runde, kein Feedback aktiv, kein noch nicht geöffneter
  Song). Damit können Gäste nach einem Skip nicht mehr nachträglich
  eine alte Karte platzieren oder eine alte Rate-Eingabe abschicken.

### Windows / Electron

- **Spotify Autoplay via `WM_APPCOMMAND` (`APPCOMMAND_MEDIA_PLAY`).**
  Statt des toggelnden Media-Play/Pause-Keys (der einen bereits laufenden
  Song wieder pausiert) sendet die App jetzt gezielt den PLAY-Befehl per
  `SendMessage(HWND_BROADCAST, WM_APPCOMMAND, ...)` via PowerShell.
  Spotify startet damit die Wiedergabe des per URI geladenen Tracks
  garantiert – und tut nichts, wenn bereits gespielt wird. Kein
  Fenster-Fokus nötig, andere Apps unberührt.

### UI / Regeln

- **Karten können nicht mehr platziert werden, bevor der Song geöffnet
  wurde.** Ein neuer `canPlaceCards`-Guard blockiert die Timeline-Slots,
  solange `pendingSongUrl` (all-clients-Modus) oder `guestPendingSongUrl`
  (host-only-Fallback) noch offen sind. Vorher konnte der aktive Gast
  eine Karte legen, obwohl er den „Song öffnen"-Button noch nicht
  gedrückt hatte.

## 2026-07-22 (14) – Team-Rejoin, Bingo-Anzeige, Windows-Autoplay, Skip-Reset

### Multiplayer

- **Team-Rejoin: Slot-Wahl gilt jetzt wirklich.** Beim Klick auf „Raum
  verlassen" wartet der Client auf die Server-Bestätigung (`emitWithAck`),
  bevor die UI zurückspringt. Zusätzlich sendet er beim „Neuer
  Spieler"-Beitritt (`slotId === null`) vorab ein weiteres `leaveRoom`,
  damit ein alter Slot-Rest aus der Server-Karenz zuverlässig weg ist,
  bevor der neue `joinRoom` verarbeitet wird.
- **Skip resettet komplett bei allen Clients.** `manualSkipSong` löst
  nach dem lokalen Reset explizit einen `syncMultiplayerState`-Push aus
  (zusätzlich zum debouncten Watcher) und setzt beim empfangenden Gast
  weitere Zustände zurück (`activeGuessPlayerIndex`, `pendingPlacement`,
  `loadingNextSong`). Damit lässt sich nach einem Skip nicht mehr
  weiterraten oder eine noch aktive Platzierung fortführen.
- **„Zur Lobby" bietet Speichern-Dialog wieder als Option an – überall.**
  Auch im Bingo-Modus wird der Save-Dialog geöffnet (statt direkt zur
  Lobby zu pushen). Der Dialog ist eindeutig überspringbar: drei Buttons
  „Zurück / Nicht speichern / Speichern & weiter", und ein Klick daneben
  bzw. Escape zählt jetzt ebenfalls als „überspringen und weiter" (der
  „Zur Lobby"-Callback wird ausgeführt).

### Bingo

- **Antwort-Fortschritt sichtbar:** In der Antwortphase gibt es jetzt
  einen Chip „X / Y geantwortet" mit grünem Häkchen, sobald alle Teams
  ihre Antwort abgeschickt haben. Der Host sieht deutlich, ob er die
  Runde auflösen kann – der „Runde auflösen"-Button beschriftet sich um
  auf „Trotzdem auflösen" (+ Tooltip), solange noch nicht alle geantwortet
  haben.

### Windows / Electron

- **Spotify-Autoplay deterministisch:** Statt einer einzelnen Media-
  Play/Pause-Toggle-Taste (die bei bereits laufendem Song fälschlich
  pausierte) läuft jetzt eine explizite Sequenz aus Media-STOP →
  Track-URI öffnen → Media-PLAY. Damit wird Spotify vor dem Laden in
  einen definierten Stop-Zustand versetzt und der Play-Toggle wirkt
  garantiert als „starten". Der neue Track spielt auch dann sofort, wenn
  Spotify vorher einen anderen Song wiedergegeben hat.

### Modi / Spiel-Logik

- **Film-Modus behält Einwände** – die frühere Einwand-Deaktivierung war
  falsch adressiert und wurde zurückgenommen. Stattdessen sind **Einwände
  nur im Battle-Modus deaktiviert** (jeder Spieler hat einen eigenen
  Song-Pool, Einwände von anderen sind dort inhaltlich nicht sinnvoll).
  Info-Dialog + Objection-Reward-Logik entsprechend angepasst.
- **`localStorage`-Persistenz für gespielte Songs entfernt.**
  `hitster-played-links-*` wird nicht mehr gelesen oder geschrieben.
  Duplikat-Vermeidung läuft rein in-memory pro Session; Reload/Neustart
  =\u00a0frischer Song-Pool. `clearSongsHistory` räumt bestehende
  Alt-Einträge (Legacy-Key + pool-Key) beim Aufruf weg, damit sie nicht
  wieder auftauchen.

### UI

- **„Song öffnen"-Button in der Draw-Buttons-Reihe** – für Host und
  Gäste an derselben Stelle wie „Startkarte ziehen" und „Neue Karte
  ziehen". Der frühere Doppel-Auftritt (Header + Seitenmitte) und der
  reine Bottom-Fallback sind entfernt; auf mobilen Geräten liegt der
  Button weiterhin in der fixen Draw-Actions-Leiste am Viewport-Boden.

## 2026-07-22 (13) – Windows-Installer: wählbarer Zielordner + portable Datenablage

- **Neuer NSIS-Wizard-Installer**: `oneClick: false`, kein Admin-Zwang
  (`perMachine: false`, `allowElevation: false`). Der Nutzer sieht beim
  Setup einen klassischen Installations-Assistenten und darf den
  Zielordner frei wählen.
- **Default-Zielordner = Downloads**: `build/installer.nsh` schreibt
  vor dem Setup den `InstallLocation`-Registry-Wert auf
  `%USERPROFILE%\Downloads\Hitster`, sodass der Wizard genau diesen
  Ordner vorschlägt.
- **Alle Daten im Installations-Ordner**: `electron-main.js` biegt in
  gepackten Builds die Electron-Standardpfade auf einen Unterordner von
  `<INSTDIR>\user-data\` um. Fenster-Einstellungen, Cookies/LocalStorage,
  IndexedDB, `logs\main.log`, `temp\` und `crash-dumps\` liegen jetzt
  alle beim Setup-Ordner statt in `%APPDATA%\Hitster`.
- **Auto-Update bleibt silent**: `electron-updater` ruft den heruntergeladenen
  Installer weiterhin mit `/S --updated` auf, sodass der Wizard beim
  Update-Vorgang nicht erscheint und der zuvor gewählte Zielordner
  erhalten bleibt.
- **Zusätzlicher Komfort**: Desktop- und Startmenü-Shortcut werden bei
  Erstinstallation automatisch angelegt, die App startet nach Abschluss
  des Wizards direkt (`runAfterFinish: true`).

## 2026-07-22 (12) – Test-Release (Auto-Update-Prüfung)

Reiner Version-Bump ohne funktionale Änderungen. Dient nur dazu, den
neuen Windows-Auto-Update-Flow aus preview.26 zu verifizieren: eine auf
preview.26 installierte Desktop-App soll dieses preview.27 erkennen,
herunterladen und über die neue „Jetzt installieren"-Notify-Aktion
tatsächlich installieren.

## 2026-07-22 (11) – Windows-Update, Multiplayer-Fixes, Modus-Wechsel in der Lobby

### Windows / Electron

- **Auto-Update installiert jetzt tatsächlich**: Neuer IPC-Handler
  `hitster:installUpdate` ruft `autoUpdater.quitAndInstall(false, true)`
  auf. Nach dem `downloaded`-Event zeigt die Notify jetzt zwei Aktionen
  („Jetzt installieren" / „Später"), sodass der NSIS-Installer sichtbar
  gestartet wird. Ohne diesen expliziten Aufruf blieb es bei manchen
  Windows-Setups beim reinen Hinweis stehen, ohne dass die Installation
  wirklich lief.
- **Spotify-Autoplay unter Windows**: Nach `spotify:track:ID#0:01` wird
  zusätzlich der Media-Play-Key (VK 0xB3) per PowerShell/WScript.Shell
  gesendet, damit die Wiedergabe auch bei bereits laufendem Spotify
  sofort auf den neuen Track umschaltet. Der Zusatz-Key braucht keinen
  Fenster-Fokus und stört keine anderen Anwendungen.

### Multiplayer / Server

- **Team-Rejoin ist wieder frei wählbar**: Neuer `leaveRoom`-Handler
  entfernt den Spieler beim Klick auf „Raum verlassen" **sofort** (kein
  20-Sek-Karenz-Bleiben mehr). Zusätzlich respektiert `joinRoom` eine
  explizite Slot-Wahl und räumt einen eventuell noch vorhandenen alten
  Slot vorher weg. Vorher landete man nach dem Verlassen automatisch
  wieder im alten Team, weil der Server einen serverseitig noch dort
  mitgeführt hat.
- **Sofortiger Host-Failover**: Wenn der Host den Raum verlässt oder die
  Verbindung verliert, wird sofort der nächste verbundene Spieler zum
  Host promoted (Lobby und laufendes Spiel). Der neue Host bekommt ein
  `hostAssigned`-Event und die UI schaltet automatisch auf Host-Ansicht
  (Draw/Skip/Bingo-Aktionen).
- **Skip im Multiplayer resettet komplett**: `manualSkipSong` schickt am
  Ende `host:confirmSkip` an alle Clients, entfernt lokal einen etwaigen
  Placeholder aus der Timeline und setzt beim Client `pendingPlacement`,
  `showGuessDialog` etc. zurück. Vorher konnte ein Gast nach einem
  Host-Skip noch weiter platzieren und raten.
- **Client-Eingaben werden an alle synchronisiert**: `guest:guessInputSync`
  wird jetzt an alle Clients im Raum broadcastet (Server nutzt
  `socket.to(roomCode).emit(...)`), sodass z. B. im Film-Modus alle
  sehen, was der aktive Rater eintippt – nicht nur der Host.
- **Rateformular flackert beim Client nicht mehr auf**: `drawNewCard`
  setzt beim Host `showGuessDialog`, `pendingPlacement`, `activeGuess…`
  usw. explizit zurück, bevor die neue Karte gezogen wird. Ohne den
  Reset blitzte beim Gast kurz das Formular des vorherigen Zugs auf,
  bis der nächste Sync-Snapshot eintrudelte.

### Spielmodi

- **Host wechselt Spielmodus in der Lobby**: Neue Handler
  `host:setGameMode` und `host:setBingoSettings`. In der aktiven
  Raum-Karte gibt es jetzt einen Modus-Toggle (Normal / Film / Battle /
  Bingo) und – im Bingo – Regler für Schwierigkeit, Timer-Modus und
  Ziel-Bingos, alles vor dem Spielstart änderbar.
- **Film-Modus – erweiterte Punkte**: Neben den bisherigen Regeln geben
  **Film + Titel + Jahr** und **Film + Künstler + Jahr** jetzt **3
  Punkte** (statt vorher 1). Der Info-Dialog ist entsprechend
  aktualisiert.
- **Film-Modus – keine Einwände**: `checkForObjections` bricht im
  Film-Modus früh ab, es wird kein Einwand-Bonus mehr vergeben und der
  Info-Dialog blendet den Einwand-Abschnitt aus. Punkte übernehmen in
  diesem Modus die Rolle.
- **Klammern im Titel werden ignoriert**: `stripVersionDescriptors`
  entfernt jetzt ganze `(…)`- und `[…]`-Klammern (Client + Server
  synchron). Titel wie „Main Titel Theme (From X)" oder „Song [Radio
  Edit]" matchen jetzt als „Main Titel Theme" bzw. „Song".

### Bingo

- **„Solo/Gruppe" und „Vor/Ab 2000"** zeigen die aktive Auswahl
  eindeutig: `unelevated color="primary"` für ausgewählt,
  `.btn-unselected` (dezente Surface-Fläche) für die andere Seite.
- **Host-Aktionsleiste**: Skip / Runde auflösen / Timer-Toggle stehen
  jetzt in einem `.bingo-host-actions`-Container mit `flex-wrap` +
  `gap-md`, sodass die Buttons nicht mehr aneinander kleben und auf
  schmalen Fenstern sauber umbrechen.
- **Bingo-Feld zentriert + Acryl-Rahmen**: Der komplette Bingo-Bereich
  (Header, Runden-Panel, „Song öffnen", Karten-Layout) liegt jetzt in
  einem `.bingo-page`-Wrapper (max. 1180 px, mittig, Acryl-Fläche im
  App-Look). Auf Mobil füllt der Wrapper die volle Breite.

### Sonstiges

- **„Song öffnen"-Button im Header**: Erscheint in Normal, Film und
  Battle nun zusätzlich im `game-info-center`, damit man ihn beim
  Scrollen nicht mehr unten am Seitenende suchen muss. Der bestehende
  Button in `.actions-section` bleibt als Fallback.
- **„Speichern"-Dialog beim Verlassen ist eindeutig optional**: Drei
  klare Buttons – „Zurück" (bleiben), „Nicht speichern" (weiter ohne
  speichern), „Speichern & weiter". Auf Mobil sauber untereinander
  gestapelt.
- **Theme-Lesbarkeit**: Chip-Text/-Icons folgen jetzt zwangsweise
  `--app-on-accent` (überschreibt fest gesetzte `text-white`-Utility);
  Flat- und Outline-Buttons mit `color="grey*"` (Abbrechen/Schließen)
  folgen `--app-on-bg` und bleiben so auch bei hellen Themes lesbar.

## 2026-07-22 (10) – Bingo-Modus komplett (Etappen 3–7)

- **Neuer Spielmodus „Bingo" (Multiplayer-only)** ist jetzt vollständig
  spielbar. Etappen 1 (Gerüst) und 2 (Karte + Legende + Gegner-Vorschau)
  wurden im vorherigen Zwischenstand bereits geliefert; mit diesem Release
  kommen Etappen 3–7 dazu.
- **Runden-Flow** (server-autoritativ in `server/rooms.js`):
  1. **Runde starten**: Host zieht Karte (nutzt bestehenden Song-Manager,
     aber ohne sofortiges Popup). Server wählt die Kategorie zufällig aus
     dem Schwierigkeitspool und broadcastet `phase='reveal'` + Kategorie.
  2. **Reveal-Animation** (client-lokal, analog `objectionRaffle`): der
     Highlight läuft durch die 5 Kategorie-Chips oben und landet mit
     Ease-out auf der gewählten Kategorie.
  3. **Antwortphase**: Host emittiert `host:bingoOpenAnswering`, Server
     verteilt den Song über den bestehenden `cardDrawn`-Kanal (Audio-Modus
     wie in anderen MP-Modi, inkl. Ready-Flow im all-clients-Modus). Jedes
     Team hat **ein synced Eingabefeld** (Server persistiert pro Slot,
     Team-Mitglieder sehen live).
  4. **Auflösung**: Timer-Modus → Host-Client löst nach Ablauf automatisch
     auf; Wait-all-Modus → Host löst manuell aus. Server wertet alle
     Antworten aus, gibt die Songdaten frei und markiert die korrekten
     Teams.
  5. **Markieren**: Korrekte Teams klicken selbst ein freies Feld der
     Kategorie-Farbe auf ihrer Karte (Server validiert Farbe + „Feld frei").
  6. **Bonus**: Bei jeder ±X-Jahre-Kategorie (leicht ±4/±2, schwer ±3) und
     exaktem Treffer öffnet sich der neue **`BingoBonusDialog`** – das Team
     wählt ein Kreuz eines Gegnerteams zum Entfernen. Kreuze in bereits
     vollen 5er-Reihen sind gesperrt (client- und server-seitig geprüft).
  7. **Sieg-Check**: nach jeder Runde. Erreicht ein Team die konfigurierte
     Bingo-Anzahl, wird das Spiel beendet und der Gewinner (bzw. bei
     mehreren zeitgleich erreichten Zielen ein **geteilter Sieg**) angezeigt.
- **Kategorien** & **Farb-Zuordnung** wie im BACKLOG festgelegt (5 fixe
  Farben pro Schwierigkeit, semantisch – vom Theme unabhängig).
- **Antwort-UI je Kategorie** (neue Komponente `BingoAnswerInput.vue`):
  - Solo/Gruppe & Vor 2000 → 2 Buttons
  - Titel & Künstler → Textfeld (Server-Matching mit Fuzzy-Toleranz +
    Featuring-/Remaster-Bereinigung, analog Rate-Engine)
  - Genaues Jahr, ±X Jahre → Zahleneingabe (Server prüft Toleranz + exakt)
  - Jahrzehnt → Dropdown 1950er–2020er
- **Solo/Gruppe-Persistenz**: neue Datei `server/song-classifications.json`
  (per Song-Link gekeyed, absichtlich mit im Repo für den Fall abwechselnder
  Server-Rechner). Ist der Song beim ersten „Solo/Gruppe"-Auftreten noch
  nicht klassifiziert, entscheidet der **Host einmalig** über zwei Buttons;
  die Klassifikation wird persistiert und beim nächsten Auftreten
  automatisch verwendet. Neue Socket-Events: `host:bingoClassifySoloGroup`.
- **Sicherheit**: neuer `getRoomBroadcastState`-Helper in `server/rooms.js`
  filtert `bingoState.round.songData` aus allen `roomState`-Broadcasts,
  bis die Antwortphase abgeschlossen ist. Damit sieht ein neugieriger
  Teamplayer die Antwort auch mit Devtools erst nach der Auflösung.
- **Runden-Panel im Header**: Kategorie-Strip mit Highlight-Animation,
  aktuelle Phase (Kategorie-Label + Beschreibung), Countdown im Timer-Modus,
  Host-Aktionen (Runde auflösen, Skip, Timer-Modus umschalten in-game).
- **Karten-UI**: eigene 5×5-Karte wird beim Markieren interaktiv (nur
  freie Felder der aktiven Kategorie-Farbe sind klickbar); Gegner-Karten
  bleiben read-only und zeigen ein Bingo-Badge (🏆 N), sobald ein Team
  Reihen komplett hat.
- **Host-Notaus** in jeder aktiven Phase („Runde abbrechen") setzt die
  Runde ohne Auswerten zurück, damit ein hängengebliebenes Team die
  Runde nicht blockiert.
- **Fehlerpfade** (Etappe 7-Politur): `ensureAllTeamsHaveCards` legt für
  Slot-Nachzügler eine Karte an; Server-Handler reagieren mit `error`-
  Nachrichten auf ungültige Aktionen (falsche Farbe, doppelte Markierung,
  Bonus auf gesperrtem Feld, …); Client-Watcher brechen die Reveal-
  Animation ab, wenn nach einem Reconnect die Phase bereits weiter ist.
- Neue Composables/Komponenten:
  `src/composables/useBingoRound.js`,
  `src/components/BingoAnswerInput.vue`,
  `src/components/BingoBonusDialog.vue`.
- Neue Socket-Events (Server): `host:bingoStartRound`,
  `host:bingoOpenAnswering`, `host:bingoResolveRound`,
  `host:bingoClassifySoloGroup`, `host:bingoSkipRound`,
  `host:bingoNextRound`, `host:bingoSetTimerMode`, `team:bingoAnswer`,
  `team:bingoMarkCell`, `team:bingoUseBonus`.

## 2026-07-22 (9) – Profilbilder wandern mit ins Repo

- `server/uploads/` (Profilbilder) ist **nicht mehr gitignored**. Analog zu
  `server/users.json` reisen die JPEG-Dateien jetzt mit dem Repo, damit
  `users.json`-Verweise wie `/uploads/avatars/…jpeg` auf allen Server-
  Rechnern (Mac/Linux/Windows) sofort passen – vorher 404 auf Geräten, die
  das Bild nicht selbst hochgeladen hatten.
- Merker: Wer ein Profilbild hochlädt, muss die neue Datei zusätzlich zu
  `users.json` mit-committen (`git add -A` fasst beides).
- Kein Client-Code-Change; Release nur als Marker gedacht.

## 2026-07-22 (8) – Battle-Modus: harte 3-Spieler-Grenze und Team-Sperre entfernt

- Der 3-Spieler-Cap im Battle-Modus war eine ungewollte Eigen-Interpretation
  des Hinweistextes. **Entfernt** – Battle unterstützt jetzt wieder bis zu
  `GAME_CONSTANTS.MAX_PLAYERS` Spieler (aktuell 10), sowohl lokal (Index.vue)
  als auch online (Lobby.vue + Server).
- **Teams im Battle-Modus wieder erlaubt** – ein Slot darf wie in den anderen
  Modi mehrere Mitglieder haben.
- Hinweistext im Wizard + der Lobby entschärft: „Am besten mit den drei
  ‚Battle of the Generations'-Editionen spielen (die Empfehlung passt
  naturgemäß für bis zu 3 Spieler)." – kein Zwang mehr.
- Server-Validierung im Battle-Start prüft weiterhin: alle Slots haben einen
  Pool und keine Version doppelt (das war die eigentliche User-Vorgabe).

## 2026-07-22 (7) – Battle- und Film-Modus auch online

- **Multiplayer-Lobby unterstützt jetzt Spielmodi.** Neue Toggle
  „Normal / Film / Battle" beim Raum erstellen.
- **Film-Modus online:** Beim Wechsel zu „Film / Serie" wird automatisch
  nur noch die Soundtracks-Edition angezeigt und gewählt (analog zum
  lokalen Modus). Der Modus wird an alle Clients gespiegelt (Chip im
  Raum-Header) und ans Spiel übergeben.
- **Battle-Modus online:** Jeder Spieler wählt seine eigene Version im
  aktiven Raum („Meine Version wählen"-Button). Die Auswahl wird per
  neuem Socket-Event `player:setSlotPool` an den Server gesendet;
  Dopplungen und Versionen außerhalb ±10 Songs zur zuerst gewählten
  Version sind ausgegraut. Der Server erzwingt max. 3 Slots ohne Teams
  und blockt `host:startGame`, solange nicht alle Slots eine gültige
  Version haben. Die Slot-Auswahl wird pro Slot in der Spielerliste
  angezeigt.
- Ist der Raum im Battle-Modus, wird die geteilte Song-Versionen-Sektion
  im Raum (inkl. Host-„Ändern"-Button) ausgeblendet — der Pool ist
  spielerspezifisch.
- Beim Spielstart übergibt die Lobby nun `mode` und
  `playerSongPools` an das Spiel, sodass Battle-/Film-Regeln identisch
  zum lokalen Ablauf greifen.

## 2026-07-22 (6) – Abstand unter Wizard-Buttons

- Neue `.wizard-top-nav`-Klasse für die Navigations-Zeile in jedem
  Wizard-Schritt (20px Margin unten + dünner Trennstrich). Damit kleben
  Eingabefelder, Versionskarten und Startspieler-Buttons nicht mehr direkt
  an den Buttons darüber.

## 2026-07-22 (5) – Wizard-Buttons konsequent nach oben

- **Zurück / Weiter / Nächster Spieler / Spiel starten** liegen jetzt in
  **jedem** Wizard-Schritt oben (rechts oben Aktion, links Zurück), damit man
  bei langen Listen (Versionen, Spielernamen, Startspieler) nicht ans Ende
  scrollen muss. Die bisherigen `q-stepper-navigation`-Blöcke am unteren Rand
  sind entfallen.

## 2026-07-22 (4) – Battle-Modus UX-Feinschliff

- **Doppelter „Weiter"-Button im ersten Wizard-Schritt entfernt.** Bei Normal/
  Film liegt der Weiter-Button jetzt nur noch oben direkt beim
  Auswahlzähler; im Battle-Modus (kein Grid im Schritt 1) wird er unten
  angezeigt.
- **Battle-Modus-Hinweistext gekürzt** auf das Wesentliche: am besten mit den
  drei „Battle of the Generations"-Editionen spielen, funktioniert nur mit
  bis zu 3 Spielern.
- **Battle: Spieleranzahl auf 3 gedeckelt.** Die Spieleranzahl-Eingabe
  respektiert den Battle-Modus (max 3); beim Umschalten auf Battle wird ein
  höherer Wert automatisch auf 3 zurückgesetzt.
- **Battle-Versionen: Ein Spieler nach dem anderen.** Statt einer langen
  Scroll-Liste mit einem Block pro Spieler wird jetzt immer nur die
  Versionsauswahl für den aktuell aktiven Spieler angezeigt. Buttons
  „Zurück" / „Nächster Spieler" führen durch die Spielerreihenfolge; der
  letzte Spieler schließt mit „Weiter" ab.

## 2026-07-22 (3) – Battle-Modus & Film-Modus-Fix

- **Neuer Spielmodus „Battle"** (lokales Spiel): jeder Spieler wählt eine
  eigene Version aus der Versionsliste. Empfohlen mit den drei
  „Battle of the Generations"-Editionen (Hinweistext im Wizard).
  - Versionen dürfen nicht doppelt gewählt werden (bereits vergebene sind
    ausgegraut und nicht klickbar).
  - Zusätzlich werden Versionen ausgegraut, deren Song-Anzahl mehr als **±10**
    von der zuerst gewählten Version abweicht. So bleibt das Spiel für alle
    fair vergleichbar.
  - Beim Ziehen einer Karte wird nur aus dem Pool des aktuellen Spielers
    gezogen; ein evtl. vorab geladener Preload aus dem falschen Pool wird
    verworfen.
  - Wizard hat einen zusätzlichen Schritt „Versionen" nach den Spielernamen,
    der pro Spieler eine Versionsauswahl anzeigt.
- **Film/Serie-Modus: nur noch die Soundtracks-Edition wählbar.** Beim
  Umschalten auf „Film / Serie" wird die Soundtracks-Edition automatisch
  gewählt und die Versionsliste auf diese eine Version reduziert – so kann
  nicht mehr aus Versehen mit einer nicht-Film-Version gestartet werden.
- Session-Save speichert `gameMode` und `playerSongPools` mit, damit Battle-
  Runden korrekt weiter geladen werden können.

## 2026-07-22 (2) – Server-Hardening für den öffentlichen Betrieb

- **`server/users.json` aus dem Repo entfernt** (bleibt lokal, ist ab jetzt
  gitignored). Ein Klon des Projekts enthält damit keine echten Nutzer-Hashes
  oder Sicherheitsantworten mehr. Beim ersten Serverstart wird die Datei
  automatisch als leeres Array angelegt; Beispiel liegt als
  `server/users.example.json`.
- **`JWT_SECRET`-Handling gehärtet:**
  - In `NODE_ENV=production` **Pflicht**: der Server verweigert den Start ohne
    gültige ENV-Variable und meldet klar, wie man eins erzeugt
    (`openssl rand -hex 32`).
  - In Dev wird automatisch ein zufälliges Secret erzeugt und in
    `server/.jwt-secret` persistiert (gitignored), damit ausgestellte Tokens
    Neustarts überleben.
  - Der unsichere Fallback-String `'hitster-dev-secret-…'` wurde aus dem Code
    entfernt.
- **Rate-Limit** (`express-rate-limit`, 20 Requests / 15 min / IP) auf allen
  sicherheitsrelevanten Endpunkten: `POST /api/login`, `POST /api/register`,
  `GET /api/recover/question`, `POST /api/recover/reset`. Schützt vor
  Online-Bruteforce und Massen-Registrierung.
- **CORS-Whitelist** über `ALLOWED_ORIGINS` (komma-getrennt). In production
  werden fremde Browser-Origins abgelehnt; Requests ohne Origin (Electron,
  curl, same-origin) bleiben erlaubt. In Dev bewusst offen für `quasar dev`.
- **JSON-Body-Limit** auf 100 KB reduziert (vorher global 6 MB). Nur
  `POST /api/profile/avatar` bekommt weiterhin sein eigenes 6-MB-Limit.
- Neue `server/.env.example` dokumentiert die benötigten Umgebungsvariablen
  (`PORT`, `NODE_ENV`, `JWT_SECRET`, `ALLOWED_ORIGINS`).

## 2026-07-22 – Auto-Update auf Windows repariert, manueller Button entfernt

- **Auto-Update auf Windows funktionierte nicht** (Toast „Update bereit" kam nie).
  Ursache: der NSIS-Installer hieß per Default `Hitster Setup <version>.exe`
  (mit Leerzeichen). electron-builder schreibt den Namen in `latest.yml` mit
  Bindestrichen (`Hitster-Setup-….exe`), GitHub speichert das Asset dagegen mit
  Punkten (`Hitster.Setup.….exe`). `electron-updater` bekam beim Download 404
  und starb geräuschlos.
  Fix: `nsis.artifactName` explizit auf `${productName}-Setup-${version}.${ext}`
  gesetzt – ohne Leerzeichen stimmt der Name auf Platte, in `latest.yml` und
  auf GitHub überein.
- **Manueller Update-Button entfernt.** Der Race-Timeout hat den laufenden
  GitHub-API-Aufruf zwar formal abgebrochen, der Spinner lief in der Praxis
  trotzdem weiter. Auto-Update (Windows NSIS + Linux AppImage) übernimmt die
  Aufgabe zuverlässig; .deb/.rpm/.dmg zeigen ohnehin nur den Hinweis-Toast beim
  App-Start.
- **`electron-log` als Logger für `electron-updater`** eingebaut. Fehler
  (Download, SHA-Vergleich, silent-Install blockiert durch SmartScreen/Defender)
  landen jetzt in `%APPDATA%\Hitster\logs\main.log` (Windows) bzw. den
  plattform-üblichen Log-Pfaden auf macOS/Linux. Diagnose zukünftiger
  Auto-Update-Ausfälle ist damit möglich, statt zu raten.

## 2026-07-21 (2) – Update-Check: 30 s-Timeout statt endloser Spinner

- **Update-Button in der Desktop-App** brach den „Suche nach Updates…"-Spinner
  bisher erst nach 15 s ab – in der Praxis konnte er (z. B. bei blockiertem
  Auto-Updater oder nicht erreichbarer GitHub-API) trotzdem gefühlt „ewig"
  laufen. Der Race-Timeout wurde auf **30 Sekunden** verlängert und die
  Fehlermeldung schreibt jetzt explizit „Zeitüberschreitung nach 30 Sekunden".

## 2026-07-21 – Film-Modus: Punkte- & Einwand-Feinschliff, Feld-Reihenfolge

- **Punkte im Film-Modus (final):**
  - Film + Titel + Künstler + Jahr → **4 Punkte**
  - Film + Titel + Künstler → **3 Punkte**
  - Film + Jahr → 2 Punkte
  - nur Film → 1 Punkt
  - Ohne richtigen Film gelten weiterhin die **Normal-Modus-Regeln**
    (Titel+Künstler+Jahr → 3, Titel+Künstler → 1, nur Jahr → 1) – vorher gab es
    ohne Film gar keine Bonuspunkte, das war zu streng.
- **Einwand-Belohnung im Film-Modus:**
  - Film + Titel + Künstler + Jahr → **+2 Einwände**
  - Film + Titel + Künstler → +1 Einwand
  - Film + Jahr → +1 Einwand
  - Sonst wie Normal-Modus (Titel+Künstler → +1 Einwand).
- **Reihenfolge der Eingabefelder** im Rate-Dialog angepasst: „Film / Serie"
  steht jetzt **unter** „Jahr" – sowohl im lokalen Rateformular als auch im
  Online-Gast-Formular. Die Live-Anzeige-Panels („Host tippt…" / „Rät gerade…")
  und die Bonus-Chips nach der Auflösung folgen derselben Reihenfolge.
- **Legende in Game.vue** an die neuen Regeln angepasst.

## 2026-07-20 (4) – Multi-Plattform-Release-Pipeline & Prerelease v1.0.0-preview.3

- **Automatischer Multi-Plattform-Build** über GitHub Actions: ein Tag-Push `vX.Y.Z…` reicht
  jetzt, um parallel Linux (AppImage/deb/rpm) und Windows (NSIS .exe) zu bauen und die
  Artefakte an einen Prerelease anzuhängen.
- **Releases getrennt vom Code-Repo:** Installer landen im **öffentlichen**
  [`Melonemyname/Hitster-Releases`](https://github.com/Melonemyname/Hitster-Releases/releases),
  Quellcode bleibt im privaten `Hitster`. So kann `electron-updater` im installierten Client
  anonym die Release-Metadaten lesen (Auto-Update funktioniert ohne Token beim Nutzer).
- **npm-Skripte ergänzt:** `build:electron:linux` / `build:electron:win` (nur ein Target),
  `release:electron*` (mit Auto-Publish). Default-`build:electron` läuft mit `-P never`, damit
  electron-builder nicht versucht, ohne Token zu publishen (verursachte den ersten CI-Fehler).
- **Linux-Target über Env-Variable steuerbar:** `LINUX_TARGETS=AppImage,deb npm run build:electron:linux`
  – Workaround für lokale Builds auf NTFS-Mounts mit Leerzeichen im Pfad, wo `rpmbuild` scheitert.
  Actions-Runner ignoriert das und baut alle drei.
- **Publish-Step in `release.yml` von `softprops/action-gh-release@v2` auf direkten curl-API-Call
  umgestellt.** Die Action lehnt fine-grained PATs beim cross-repo-Publish (Parameter `repository:`)
  mit HTTP 403 ab; ein per Diagnose-Workflow verifizierter, funktionierender Token nutzt nichts.
  Der neue Step ist idempotent (Race-Condition zwischen Windows/Linux-Jobs wird über 422-Handling
  abgefangen) und URL-encodet Asset-Namen (NSIS-Installer enthält Leerzeichen).
- **Sicherheits-Fixes am Setup:** `.gh-token` in `.gitignore` aufgenommen (für einmalige lokale
  Token-Tests); Diagnose-Workflow `check-releases-token.yml` prüft PAT-Rechte per API, ohne den
  Token zu loggen.
- **Erster funktionierender Prerelease:** v1.0.0-preview.3 mit AppImage (131 MB), .deb (88 MB),
  .rpm (88 MB), Windows .exe (~85 MB) + Blockmap + latest\*.yml für Auto-Update.

## 2026-07-20 (3) – Eigene Versionen importieren/erstellen

- **Neuer Bereich „Version erstellen" im Einstellungstab → Versionen.** Ablauf:
  - Playlist mit **Exportify** als CSV exportieren (Link/Button direkt im Dialog).
  - Die CSV im Dialog **hochladen** (frei wählbarer Speicherort – kein fester Ordner);
    sie wird **clientseitig** geparst (Exportify-Format), Song-Anzahl wird angezeigt.
  - **Name** vergeben (aus Dateiname vorbefüllt) und **Cover** wählen (aus den vorhandenen
    PNGs **oder** per Upload), dann erstellen.
  - Die Version wird angelegt; ihre Songs + Metadaten (Jahr/Titel/Künstler) fließen beim
    Spielen automatisch ein.
- **Speicherung account-gebunden mit Sync-Toggle:** je Version umschaltbar zwischen
  **synchronisiert** (server-seitig pro Nutzer, auf allen Geräten verfügbar) und
  **nur auf diesem Gerät** (localStorage) – jederzeit im Dialog änderbar (Cloud-Symbol).
  Gerätespezifisch geht auch **ohne Login**; Synchronisieren erfordert Anmeldung.
- Eigene Versionen erscheinen in der Auswahl (lokal **und** online) wie die Standardversionen,
  sind ausblendbar und löschbar (synchronisierte werden dabei auch aus dem Konto entfernt).
- Technik: Client-Parser `utils/exportifyCsv`, Server `GET/PUT/DELETE /api/versions` (JWT,
  nur die Account-Synchronisierung), `useVersions` (Merge Bundle + lokal + synchronisiert),
  Spiel-Integration in `useSongManager`/`spotifyCsvService` (Metadaten-Merge).

## 2026-07-20 (2) – Desktop-App (Electron) für Windows & Linux

- **App ist jetzt zusätzlich als Desktop-App baubar** (Quasar-Electron), ohne die
  Web-Nutzung zu verlieren: `npm run build` → Web-SPA (wie bisher), `npm run build:electron`
  → Desktop-Installer. electron-builder-Targets: **Windows (NSIS)**, **Linux (AppImage/deb/rpm)**.
- **Lokales Spiel läuft offline** in der App: die Song-Listen (`.txt`) und die Metadaten-CSV
  werden jetzt **ins Bundle eingebettet** (Vite `?raw`) statt zur Laufzeit per `fetch('/songs/…')`
  geladen (das bricht unter Electron `file://`). Ein Code-Pfad für Web **und** Desktop.
- **Versions-Icons** werden als Vite-Assets importiert (aufgelöste URLs) statt über absolute
  `/versions/…`-Pfade – damit funktionieren sie in Web und Desktop.
- **Song-Assets verschoben** von `public/songs` → `src/assets/songs` (Vite kann `public/` nicht
  importieren); Versions-PNGs nach `src/assets/versions`. Import-Script
  (`scripts/import_hitster_csvs.py`) schreibt entsprechend dorthin. `español`-Songliste in
  ASCII-Dateinamen umbenannt (Import-Pfad-Sicherheit; Pool-Wert `español-rock` unverändert).
- **Server-Adresse konfigurierbar:** neuer FAB-Eintrag „Server-Verbindung" (Dialog) – in der
  Desktop-App trägt man dort die Adresse des Host-Rechners (z. B. No-IP) für den Online-Modus
  ein. Leer = gleiche Herkunft (wie im Web). Gespeichert pro Gerät.
- Nur für Online verbindet sich die App mit deinem Rechner als Server (Räume erstellen/joinen);
  socket.io erlaubt bereits beliebige Origins, daher kein Server-Umbau nötig.

## 2026-07-20 – Versionen verwalten (Ausblenden & Löschen)

- **Neuer Eintrag „Versionen verwalten" im Konto-FAB** (neben „Design anpassen"):
  öffnet einen Einstellungs-Dialog, der alle Editionen wie in der Versionsauswahl
  auflistet – je Version ein **Augen-Symbol** (Ausblenden) und – bei selbst
  hinzugefügten Versionen – ein **Papierkorb-Symbol** (Löschen).
- **Alles wirkt rein gerätelokal** (`localStorage`) – nie global oder für andere Geräte/Nutzer.
- **Ausblenden:** für **alle** Versionen, entfernt sie aus der Auswahl (lokal **und** online),
  jederzeit über das Augen-Symbol umkehrbar (ausgeblendete bleiben im Dialog ausgegraut).
- **Löschen:** nur für **selbst hinzugefügte** Versionen (aktuell „Hitster Staffel 1/2");
  **Standardversionen** sind nicht löschbar (nur ausblendbar, Kennzeichnung „Standard").
  Gelöschte lassen sich über „Gelöschte wiederherstellen" zurückholen.
- **Technik:** gebündelter Versions-Katalog (`versionsCatalog.js`) mit `custom`-Flag; gemeinsamer
  Zustand über `useVersions` (gerätelokale Ausblend-/Lösch-Listen). Die zuvor in
  `Index.vue`/`Lobby.vue` doppelt gepflegte Versionsliste wurde durch die zentrale Quelle ersetzt.
- Vorbereitung für eine spätere **Importierfunktion** eigener Versionen (siehe `BACKLOG.md`).

## 2026-07-17 (2) – Einwand-Umbau Etappe 2: Online/Multiplayer

- **Neuer Einwand-Ablauf jetzt auch im Multiplayer** (spiegelt die lokale Etappe 1 über den
  Host↔Gast-Sync):
  - Das **10-Sek-Opt-in-Fenster** erscheint auf allen Geräten; jeder Gast meldet sich für den
    **eigenen** Slot an/ab (Fremd-Slots deaktiviert), der Host für seinen Slot. Der Opt-in-Status
    (`objectionOptIns`) ist für alle sichtbar.
  - **Countdowns** (Opt-in 10 s / Platzierung 30 s) und die geordnete Platzierungs-Warteschlange
    laufen autoritativ beim Host und werden live an die Gäste gespiegelt; der jeweils aktive
    Einwender platziert über die `+`-Slots (bestehender `guest:placeCard`-Weg).
  - Der **Number-Picker** (bei mehreren korrekten Einwänden) wird samt Kandidaten, Hervorhebung
    und Gewinner an alle Clients synchronisiert; die **Einwand-Rückgabe** an korrekte
    Nicht-Gewinner passiert host-seitig und landet per State-Sync bei allen.
  - Die **Feedback-Liste der korrekten Einwände** inkl. Karten-Gewinner (🏆) wird jetzt auch für
    Gäste synchronisiert.
  - Nur der Host (bzw. lokal) sieht „Einwandphase starten"; Gäste warten auf Host/Timer.
- Technik: neue Sync-Felder in `host:syncState`/`stateUpdate`, neues Gast-Event
  `guest:toggleObjectionOptIn` (Server-Relay + Host-Handler), Reset der gespiegelten Einwand-UI
  bei Skip/Neustart. Der veraltete Gast-„Einwenden"-Dialog (alter Ablauf) wurde entfernt.

## 2026-07-17 (1) – Einwand-Umbau (lokal) + Spiel-Politur

- **Neuer Einwand-Ablauf (lokal, Etappe 1):**
  - Nach der Platzierung öffnet sich ein **10-Sekunden-Opt-in-Fenster** (mit Timer/Spinner im
    Header links); alle außer dem aktuellen Spieler können sich zum Einwenden anmelden.
  - Danach platzieren die Angemeldeten **nacheinander in Spielerreihenfolge**, je **30 Sekunden**
    (Timeout → übersprungen).
  - Feedback zeigt kurz, wer falsch eingeordnet hat, plus die **Liste der korrekten Einwände**.
  - Bei mehreren korrekten Einwänden entscheidet ein **animierter Number-Picker** (Namen, wird zum
    Ende langsamer) – die korrekten Nicht-Gewinner bekommen ihren **Einwand zurück**.
- **Spielkarten-Farbmodus** (Theme-Dialog): Original vs. Theme (siehe frühere Einträge), Vorschau
  zeigt die Auswahl jetzt korrekt an; Button-Hoverfarbe pro Theme.
- **Mobil:** „Startkarte ziehen"/„Neue Karte ziehen" liegen auf Mobile als fixe Leiste unten
  (bleiben beim Scrollen sichtbar); im Desktop weiterhin im Header.
- **Info-Button** neben dem Einstellungsrad erklärt Punkte & Einwände.
- Kleinere Theming-Fixes: Feedback-Haken/X, History-Löschen-Icon, Info-/Erfolg-/Warn-Toasts folgen
  dem Theme (Fehler bleiben rot).

## 2026-07-17 – Einwand-Umbau (Etappe 1: lokal) + Theming-Politur

- **Neuer Einwand-Ablauf (lokal):**
  - Nach der Platzierung öffnet ein **10-Sekunden-Opt-in-Fenster** (Countdown-Anzeige):
    alle außer dem aktuellen Spieler können sich für einen Einwand anmelden.
  - Danach platzieren die angemeldeten Spieler **nacheinander in Spielerreihenfolge**,
    je **30 Sekunden** (Timeout → übersprungen); Countdown links im Header.
  - Feedback zeigt zusätzlich die **korrekten Einwender**.
  - Bei **mehreren korrekten Einwänden** entscheidet ein **animierter Number-Picker**
    (mit Spielernamen) über den Gewinner; die anderen korrekten Einwender bekommen ihren
    **Einwand zurück**.
  - _(Online/Multiplayer folgt in Etappe 2 – bis dahin bitte lokal testen.)_
- **Theming-Politur:**
  - Feedback-Haken/X, History-Löschen-Icon, Einstellungs-/+/−-Icons folgen dem Theme.
  - Toasts: Info/Erfolg/Warnung folgen dem Theme (nur Fehler bleiben rot).
  - **Button-Hoverfarbe** pro Theme berechnet und angewandt.
  - Theme-Dialog-Vorschau zeigt die gewählte **Kartenfarben-Option** korrekt an.

## 2026-07-16 (5) – Theming: Bugfixes & Acrylic-Politur

- **Globale FABs zusammengelegt:** statt zwei Buttons (Konto + Palette) jetzt **ein**
  Konto-Button mit Menü (Mein Profil/Anmelden · Design anpassen · Abmelden). Behebt die
  Überlappung mit dem „Abmelden"-Button auf der Profilseite (der Header-Logout dort entfällt,
  Logout liegt jetzt im Menü).
- **Custom-Theme-Lesbarkeit:** Username-Chip in der Lobby erbte eine fest weiße Schrift
  (`text-color="white"`) → bei weißem Akzent weiß-auf-weiß. Chips/Badges folgen jetzt (wie
  Buttons) der abgeleiteten `--app-on-accent`-Farbe.
- **Theme-Treue:** „Raum erstellen"-Button + Plus-Icon und die manuellen Karten-Elemente im
  Spiel nutzten festes Türkis/Cyan (`positive`/`teal`, `#00bcd4`/`#00e5ff`) → jetzt auf den
  Theme-Akzent umgestellt (inkl. Karten-Slot-Rahmen). Dialog-Köpfe (`bg-primary`) nehmen die
  On-Accent-Schriftfarbe.
- **Acrylic-/Mica-Flächen:** Karten und Container (z.B. Versionsauswahl) sind jetzt leicht
  durchscheinend mit Weichzeichner (`--surface-bg`/`--surface-blur`), sodass die Theme-Farben
  auch im **lokalen Modus** und hinter den Containern sichtbar sind (vorher voll-opak).
- **Verlaufs-Lesbarkeit:** On-Background-Textfarbe wird für Verläufe über mehrere Stützstellen
  (beide Stops + Mitte) nach bestem Worst-Case-Kontrast gewählt statt nur aus dem 50/50-Mittel.
- **Acryl auf Popups/Menüs:** das FAB-Menü und Dropdown-Popups (`.q-menu`) sind jetzt ebenfalls
  durchscheinend statt voll-opak.
- **Versionsauswahl-Karten:** grauer Rahmen/Verlauf entfernt → dezenter, schwächerer Transparenz-
  Effekt (verschachtelt über dem Container), Hover-Rand folgt dem Theme-Akzent.
- **Lobby-Kopfzeile aufgeräumt:** doppelter Logout entfernt (nur noch im FAB-Menü), Nutzer-Chip
  entfernt. Der FAB zeigt jetzt das **Profilbild** des Nutzers (Fallback: Konto-Icon), ohne
  Hover-Tooltip. Logout räumt zusätzlich Socket/Lobby-Zustand auf.
- **Dev:** `/uploads` in den Dev-Proxy aufgenommen, damit Profilbilder auch im Dev-Modus laden
  (Produktion ist ohnehin Single-Origin).
- **`positive`-Farbe:** vom alten Marken-Cyan `#00e5ff` auf ein echtes Erfolgs-Grün `#21ba45`
  umgestellt (Buttons wie „Spiel starten" + Erfolgs-Toasts) – theme-neutral, semantisch klar,
  von `primary` unterscheidbar.
- **Index-Layout:** Titel „Game Starten" und die Buttons „Multiplayer Lobby"/„Spielstand laden"
  liegen jetzt außerhalb des Containers (nur noch Stepper/Versionsauswahl im Container); Container
  mit Abstand zum unteren Rand. Grauer Rahmen um die Versions-PNGs entfernt.
- **„Multiplayer Lobby"-Button** folgt jetzt dem Theme (vorher fest `deep-purple`).
- **Versionsauswahl:** PNGs einer Reihe stehen jetzt auf gleicher Höhe (bei mehrzeiligen Namen
  rutschte das Bild der kürzeren Karte vorher nach unten).
- **Einheitliche Rundung:** neuer `--surface-radius`-Token, app-weit auf Karten, Popups und
  beschriftete Buttons angewandt (Icon-/FAB-Buttons bleiben rund).
- **Buttons vereinheitlicht:** flache/Outline-Buttons werden gefüllt in Theme-Akzent (mit
  `--app-on-accent`-Schrift), destruktive Aktionen gefüllt rot. Segment-Toggles (z. B.
  Verlauf/Einfarbig, Audio-Modus) haben jetzt Abstand und eine klar erkennbare Auswahl.
- **Versionsauswahl-PNGs:** Bild füllt die Karte randlos (auf die Rundung geclippt), kein Rahmen
  mehr. Auswahl als Akzent-Ring – bei Standard-/keinem Theme als animierter Regenbogen-Ring.
- **App-weite Vereinheitlichung:**
  - Alle rechteckigen Buttons gefüllt in Theme-Akzent + `--app-on-accent`, ohne Rand/Schatten
    (Schatten jetzt überall gleich = keiner); destruktive gefüllt rot. Abstand bei Stepper-/
    Dialog-Button-Reihen.
  - Alle Chips themed (Akzent + On-Accent, negative rot).
  - Farbige Karten-/Dialog-Köpfe (`bg-primary`) nutzen On-Accent statt fest `text-white`.
  - Versionskarten (Index **und** Lobby) haben jetzt EINE zentrale Definition in `app.scss`
    → identisches Aussehen; das randlose PNG/Acryl gilt auch im Multiplayer-Erstellen.
  - Spielansicht (`Game.scss`): Spieler-Timelines & Feedback-Dialog auf Acryl umgestellt; aktiver
    Spieler mit Akzent-Rahmen (Regenbogen als Fallback bei Standard-Theme).
- **Konsistenz-Audit umgesetzt (überall):**
  - Restliche Dialog-/Kartenköpfe (`bg-grey-8/9`, `bg-amber-8`, `bg-warning`) auf einheitliches
    `bg-primary` umgestellt; „Host tippt"-Panel auf dezente Surface-Fläche.
  - Badges wie Chips gethemt; Banner nutzen die Surface-Fläche statt fixem Grau.
  - Lobby: lila Rahmen der Raum-Karte → Surface-Farbe, Raumcode → Akzentfarbe, Slot-Auswahl-
    Highlight → Theme-Akzent (statt fixem Lila).
  - „Keine Karten"-Platzhalter im Spiel folgt Surface/On-Bg (Lesbarkeit auch bei hellem Theme).
  - 404-Seite folgt jetzt dem Theme (vorher fest blau).
  - Aufgeräumt: tote, überschriebene `#1e1e1e`-Kartenhintergründe entfernt.
- **Spielkarten-Farben wählbar:** neue Theme-Option „Original" vs. „Theme" (Akzent). Beim
  Standard-Theme sind bewusst nur die originalen bunten Kartenfarben verfügbar.
- **Weitere Bugfixes/Politur:**
  - Startspieler-Auswahl: nur der gewählte Button ist farbig (Rest dezent).
  - Spiel-Header (Skip/gespielte Songs) nutzt dieselbe Acryl-Fläche wie das Spielfeld.
  - Sicherheitsfrage speichern: Antwortfeld wird nicht mehr fälschlich rot markiert.
  - Info-/neutrale Toasts folgen dem Theme (statt fixem Blau).
  - Overscroll/Bounce app-weit deaktiviert.
  - Profil-Zurück-Button führt zur vorherigen Seite (statt fest Lobby).
  - Alle Buttons wirklich schattenlos (auch die Elevation über `::before`).
  - Einstellungs-Icons und das +/- Vorschau-Icon folgen dem Theme.
  - Lobby: „Du"/„Host"-Badges mit Abstand, „Ändern"-Button mit normalem Innenabstand.
  - Zähler-Anzeige: Leerzeichen zwischen Zahl und „Einwände"/„Karten".
  - Spiel-Header ist jetzt ein **sticky Header** (bleibt beim Scrollen oben); „Neue Karte ziehen"
    sitzt mittig direkt neben der „Songs gespielt"-Anzeige.

## 2026-07-16 (4) – Import-Script für Spotify-Exporte

- `scripts/import_hitster_csvs.py` überarbeitet:
  - Eingabe über CLI-Argumente (Dateien/Ordner/Glob) statt hartem Pfad
    einen beliebigen Ordner; ohne Argumente `scripts/spotify-exports/*.csv`.
  - Liest jetzt das Spotify-/Exportify-Format (`Track URI`, `Track Name`,
    `Artist Name(s)`, `Album Release Date`) mit Alias-Erkennung der Spalten.
  - **Jahr wird aus dem Release-Date übernommen** (zuvor leer → Songs wurden im
    Spiel gefiltert), Warnung bei Songs ohne Jahr.
  - `--dry-run`, saubere CSV-Anhänge (Quoting/Zeilenumbruch), BOM-fest,
    idempotent (bereits vorhandene Track-IDs werden übersprungen).
- `scripts/spotify-exports/` in `.gitignore` (Nutzer-Exporte).

## 2026-07-16 (3) – Passwort-Wiederherstellung per Sicherheitsfrage

- Bei der Registrierung ist jetzt eine **Sicherheitsfrage + Antwort** Pflicht
  (Vorauswahl an Fragen oder eigene Frage). Antwort wird gehasht (bcrypt),
  Vergleich normalisiert (klein + getrimmt).
- Neue Seite „Passwort vergessen" (`/forgot`): Benutzername → hinterlegte Frage →
  Antwort + neues Passwort → bei korrekter Antwort Reset + Auto-Login.
- Profilseite: Sicherheitsfrage setzen/ändern (bestehende Accounts können sie
  nachtragen).
- Server: `GET /api/recover/question`, `POST /api/recover/reset`,
  `PATCH /api/profile/security`; `/api/me` liefert die hinterlegte Frage mit.
- Kein E-Mail-Versand nötig.

## 2026-07-16 (2) – Self-Service-Accounts

- Selbst-Registrierung neuer Accounts (offen für alle).
- Profilseite (`/profile`): Benutzername, Profilbild und Passwort selbst bearbeiten.
  Erreichbar über neuen Account-Button (global).
- Passwortänderung wird über das aktuelle Passwort bestätigt.
- Profilbilder werden als Datei auf dem Server gespeichert (`server/uploads/avatars`,
  statisch ausgeliefert) und clientseitig auf 256px verkleinert.
- Server: neue Endpunkte `POST /api/register`, `GET /api/me`,
  `PATCH /api/profile/username|password`, `POST|DELETE /api/profile/avatar`.
  Benutzername ist die Identität → Änderung stellt ein neues JWT aus.
- Gast-Modus („Lokal ohne Login spielen") bleibt unverändert erhalten.
- Fix: fehlende Frontend-Abhängigkeit `socket.io-client` nachinstalliert (Lobby lud sonst nicht).

## 2026-07-16 – UI-Theming

- UI-Theming für den Hintergrund hinzugefügt: 18 Verlaufs-Presets, einfarbige
  Vorlagen sowie eigenes Theme (2-Farben-Verlauf mit wählbarer Ausrichtung oder
  Vollton).
- Schrift- (auf dem Hintergrund) und Buttonfarbe werden pro Theme deterministisch
  und lesbar abgeleitet; bei eigenen Themes zusätzlich manuell anpassbar.
- Karten bleiben in jedem Theme unverändert (dunkel, heller Text).
- Theme-Dialog über globalen Palette-Button erreichbar; Auswahl wird lokal
  (localStorage) persistiert und beim Start wiederhergestellt.
- Dark-Mode fest aktiviert (die App ist durchgehend dunkel gestaltet; `dark: 'auto'`
  führte im hellen OS-Modus zu fehlerhaften Kontrasten auf den dunklen Flächen).
- Theme an den Account gekoppelt: neue REST-Endpunkte `GET/PUT /api/theme` (JWT-geschützt),
  Speicherung pro Nutzer in `users.json`. Beim Start/Login wird der Server-Stand geladen
  (Server hat Vorrang vor localStorage), Änderungen werden für eingeloggte Nutzer
  server-seitig gespeichert. Gäste bleiben bei localStorage.

## 2026-05-02

- Metadatenquelle auf Web Now Playing umgestellt.
- Alte Umschalt- und Migrationsreste entfernt.
- Ueberfluessige Artefakte und Skripte bereinigt.

## 2026-05-02 vorher

- Repo bereinigt und Spielablauf stabilisiert.
- Songlisten auf Spotify-Links migriert.
- Jahrkorrekturen in die generische Metadatenkorrektur ueberfuehrt.
