# Anleitung

Alle Funktionen der Anwendung im Überblick. Für Einrichtung und Installation
siehe [README.md](README.md), für den Betrieb eines eigenen Servers
[deploy/OEFFENTLICH-HOSTEN.md](deploy/OEFFENTLICH-HOSTEN.md).

> **Sprache:** Die Anwendung gibt es derzeit **nur auf Deutsch**. Es ist keine
> Übersetzung eingebaut, alle Beschriftungen stehen fest im Code.

## Inhalt

- [Grundprinzip](#grundprinzip)
- [Das Hauptmenü](#das-hauptmenü)
- [Am selben Gerät spielen](#am-selben-gerät-spielen)
- [Online mit mehreren Geräten](#online-mit-mehreren-geräten)
- [Die vier Spielarten](#die-vier-spielarten)
- [Während der Runde](#während-der-runde)
- [Song-Versionen verwalten](#song-versionen-verwalten)
- [Konto, Profil und Statistik](#konto-profil-und-statistik)
- [Design anpassen](#design-anpassen)
- [Spielstände](#spielstände)
- [Nur in der Desktop-App](#nur-in-der-desktop-app)

## Grundprinzip

Es wird ein Song abgespielt, ohne dass jemand Titel, Künstler oder Jahr sieht.
Die Person am Zug ordnet ihn in ihre Zeitleiste ein, also zwischen zwei bereits
liegende Karten oder an einen der beiden Ränder. Stimmt die Einordnung, bleibt
die Karte liegen und die Zeitleiste wächst.

Zum Abspielen öffnet die Anwendung den Song bei Spotify. **Ein eigenes
Spotify-Konto ist also nötig**, die Anwendung selbst enthält keine Musik.

Jede Zeitleiste beginnt mit einer **Startkarte**. Ihr Jahr wird zufällig aus dem
Zeitraum der gewählten Versionen gezogen, im Battle aus dem Zeitraum der
eigenen Version.

### Wer gewinnt

Geprüft wird nur am Ende einer vollständigen Runde, also wenn alle gleich oft
am Zug waren. Hat dann mindestens eine Person **10 oder mehr Karten** und liegt
genau eine Person mit den meisten Karten allein vorn, hat sie gewonnen. Teilen
sich mehrere die meisten Karten, geht das Spiel weiter, bis eine Person allein
vorn liegt. Gehen vorher die Songs aus, gewinnen alle mit den meisten Karten.

**Punkte entscheiden nicht über den Sieg.** Sie werden angezeigt und in der
Statistik gezählt. Wer am Ende mindestens 10 Karten hat, bekommt 3 Punkte
extra.

### Bonus fürs Raten

Wer neben der Einordnung auch Titel, Künstler oder das Jahr errät, bekommt
Bonuspunkte und unter Umständen einen zusätzlichen Einwand. Den Bonus gibt es
**immer**, auch wenn die Karte falsch eingeordnet wurde. Die genaue Wertung
steht im Spiel hinter dem Info-Knopf.

## Das Hauptmenü

Nach dem Start erscheint ein Menü wie bei einem Spiel:

- **Lokal spielen** führt zu „Neues Spiel" und „Spielstand laden" für eine
  Partie an einem Gerät.
- **Online spielen** führt zu „Raum erstellen", „Raum beitreten" und
  „Spielstand laden".
- **Versionen** öffnet die Verwaltung der Song-Versionen.
- Darunter liegen **Statistik** (Symbol links), **Optionen**, **Beenden** (nur in
  der Desktop-App) und **Rangliste** (Podest-Symbol rechts).

Unter **Optionen** liegen Design, Server-Verbindung und Songs-Ordner (beide nur
in der Desktop-App) sowie für den Serverbesitzer die Nutzerverwaltung. Das
Konto-Menü oben rechts enthält nur noch Profil beziehungsweise Anmelden,
Optionen, „Immer im Vordergrund" (Desktop-App) und Abmelden.

## Am selben Gerät spielen

Der schnellste Weg, ohne Konto und ohne Server. Unter **Lokal spielen → Neues
Spiel** führt ein Assistent durch vier Schritte:

1. **Spielmodus** wählen (Normal, Film/Serie oder Battle)
2. **Versionen** auswählen, aus denen die Songs gezogen werden. Mehrere
   Versionen lassen sich mischen.
3. **Spieleranzahl und Namen** eintragen
4. **Startspieler** festlegen oder auslosen lassen

Danach wird das Gerät reihum weitergereicht. Wer dran ist, sieht seine eigene
Zeitleiste, ordnet die Karte ein und bestätigt.

## Online mit mehreren Geräten

Dafür wird ein Server gebraucht und jede Person braucht ein Konto. Über
**Online spielen** im Hauptmenü:

- **Raum erstellen** erzeugt einen sechsstelligen Raumcode, den die anderen
  eingeben. Wer den Raum erstellt, ist Host und stellt alles ein.
- **Beitreten** mit dem Raumcode. Danach wählt jede Person einen Slot, also
  einen Platz im Spiel.

Mehrere Personen können sich einen Slot teilen, etwa wenn zwei an einem Gerät
sitzen. Wer der Lobby beitritt, taucht mit Namen und Profilbild auf. Ein Raum
mit nur einem Slot lässt sich starten, die Lobby weist dann darauf hin.

**Zurück in eine laufende Runde:** Wer die Verbindung verliert oder die App
schließt, behält seinen Slot. Mit demselben Raumcode lässt sich wieder
beitreten, der Host bekommt dann eine Anfrage und muss sie bestätigen. Ist
gerade kein Host verbunden, wird die Rückkehr ohne Nachfrage zugelassen. Geht
der Host selbst, übernimmt eine andere Person und bleibt Host, auch wenn der
ursprüngliche Host zurückkommt.

In der Lobby und in jeder Spielansicht steht, welche Versionen aktiv sind.

### Was der Host einstellt

| Einstellung | Bedeutung |
|---|---|
| **Spielmodus** | Normal, Film/Serie, Battle oder Bingo |
| **Song-Versionen** | Aus welchen Stapeln gezogen wird, mehrere gleichzeitig möglich |
| **Startspieler** | Fest wählen oder auslosen lassen. Beim Auslosen läuft bei allen synchron eine Ziehung ab, die Hervorhebung springt durch die Namen und bleibt beim Gewinner stehen. |
| **Audio-Modus** | „Nur Host hört Musik" oder „Alle Spieler hören Musik". Beim zweiten öffnet sich der Song auf jedem Gerät, dann braucht jede Person ein eigenes Spotify-Konto. |
| **Schwierigkeit** | Nur Bingo: Leicht oder Schwer, bestimmt die Kategorien |
| **Antwort-Timer** | Nur Bingo: entweder 30 Sekunden oder „Warten bis alle fertig“ |
| **Bingos zum Sieg** | Nur Bingo: wie viele volle Reihen ein Team zum Sieg braucht, 1 bis 12 |

Der Raum lässt sich auch mit einem geladenen Spielstand starten, dann werden
Punkte und Namen übernommen.

## Die vier Spielarten

### Normal

Der Grundmodus: Song anhören, in die Zeitleiste einordnen, fertig.

### Film / Serie

Zusätzlich zur Einordnung wird geraten, aus welchem Film oder welcher Serie der
Song stammt, mit eigenem Punktesystem. Spielbar ist jede Version, bei der der
Film-Schalter aktiv ist und bei der die Filmtitel pro Song hinterlegt sind.

Beim Jahr zählt das Jahr der Aufnahme. Wer stattdessen das Jahr des Films oder
der Serie nennt, liegt ebenfalls richtig.

### Battle

Jede Person spielt mit einer **eigenen** Version statt aus einem gemeinsamen
Stapel. Gedacht für Stapel, die verschiedene Zeiträume abdecken, damit jede
Generation ihre eigene Musik bekommt. Versionen mit stark abweichender
Songanzahl werden ausgegraut, damit die Stapel vergleichbar bleiben. Einwände
gibt es im Battle nicht.

### Bingo (nur online)

Gespielt wird **in Teams**, ein Slot in der Lobby ist ein Team. Statt einer
Zeitleiste hat jedes Team eine Bingo-Karte mit farbigen Feldern. Pro Runde wird
eine **Kategorie** ausgespielt, und jedes Team, das sie richtig beantwortet,
kreuzt ein freies Feld in deren Farbe an. Die Kategorien sind unter anderem:

- Solo oder Gruppe? (Features und Duette zählen als Gruppe)
- Vor 2000?
- Jahrzehnt
- Jahr auf ±2, ±3 oder ±4 genau
- Genaues Erscheinungsjahr
- Titel des Songs
- Name der Band oder des Künstlers

Jedes Team gibt seine Antwort ein, der Host löst die Runde auf, und das Spiel
prüft die Antworten automatisch anhand der Songdaten. Wenn doch einmal etwas
falsch gewertet wurde, kann der Host einzelne Kreuze von Hand korrigieren.

Ein Bingo sind fünf Kreuze in einer Reihe, waagerecht, senkrecht oder
diagonal. Wie viele davon zum Sieg nötig sind, stellt der Host ein. Schaffen
mehrere Teams das Ziel in derselben Runde, teilen sie sich den Sieg. **Punkte
gibt es im Bingo nicht.**

**Bonus:** Trifft ein Team in einer Kategorie mit Spielraum (±2, ±3 oder ±4
Jahre) das Jahr exakt, darf es ein Kreuz eines anderen Teams entfernen.
Ausgenommen sind Kreuze in einer bereits vollen Reihe.

## Während der Runde

- **Song öffnen** startet die Wiedergabe bei Spotify.
- **Neu einordnen** verschiebt die Karte, solange noch nicht bestätigt wurde.
- **Skip** legt einen Song beiseite, etwa wenn er sich nicht abspielen
  lässt. Online fragen Gäste das beim Host an.
- **Einwand**: Wer glaubt, die Karte liege falsch, kann nach der Einordnung
  Einwand einlegen. Zu Beginn hat jede Person **3 Einwände**, jeder Einwand
  kostet einen davon. Alle, die einwenden, legen die Karte nacheinander in die
  Zeitleiste der Person am Zug, das Spiel prüft. Lag die Person am Zug falsch,
  bekommt jemand mit richtigem Einwand die Karte in die eigene Zeitleiste.
  Liegen mehrere richtig, wird ausgelost. Wer richtig eingewendet und die
  Karte nicht bekommen hat, bekommt den Einwand zurück, auch wenn die Person
  am Zug ebenfalls richtig lag. Wird der Song während eines Einwands
  übersprungen, gibt es alle eingesetzten Einwände zurück. Weitere Einwände
  bringt richtiges Raten. Im Battle gibt es keine Einwände.
- **Punkte / Einwände verwalten** erlaubt dem Host, Punkte und Einwände von
  Hand zu korrigieren.
- **Karte manuell hinzufügen** trägt eine Karte nachträglich in eine Zeitleiste
  ein, etwa nach einem übersprungenen Song.

Am Ende zeigt ein Dialog den Gewinner. Von dort lässt sich direkt eine neue
Partie starten, wahlweise als neues Spiel, mit denselben Spielern und Punkten
oder (am selben Gerät) mit neuen Namen und den bisherigen Punkten. Bei den
beiden Varianten mit Punkten bleiben Spielmodus und Versionen erhalten. Bei
**gleichen Spielern und Punkten**
beginnt, wer in der letzten Partie die wenigsten Karten hatte. Haben das
mehrere, wird unter ihnen ausgelost.

## Song-Versionen verwalten

Eine **Version** ist ein Stapel Songs, aus dem gezogen wird. Die Verwaltung
öffnet der Knopf **Versionen** im Hauptmenü.

### Eigene Version anlegen

1. Playlist bei [Exportify](https://exportify.net) als CSV exportieren
2. Im Dialog unter „Version erstellen" die CSV auswählen
3. Namen vergeben, Cover wählen, fertig

Aus der CSV kommen Titel, Künstler, Erscheinungsjahr und die ISRC (eine
weltweit eindeutige Kennung der Aufnahme). **Band/Solo wird automatisch
gesetzt**, wenn der Künstler bereits bekannt ist oder mehrere Künstler genannt
sind. Unter dem Auswahlknopf steht, bei wie vielen Songs die Angabe noch fehlt.

Als Cover steht eine Reihe fertiger Bilder zur Wahl, oder man lädt ein eigenes
hoch. Das Cover lässt sich später im Editor ändern.

### Abgleich mit MusicBrainz

Mit Anmeldung gleicht die Anwendung die Songs einer CSV im Hintergrund mit der
freien Musikdatenbank [MusicBrainz](https://musicbrainz.org) ab. Das Formular
bleibt dabei bedienbar, die Prüfung braucht etwa eine Sekunde pro Song.
Gefunden wird ein Song über die ISRC, den Spotify-Link oder Titel und Künstler.

- **Fehlendes Band/Solo** wird ergänzt. Eine Zeile „Band/Solo: … (von
  MusicBrainz)" zeigt, wo das passiert ist, mit **Zurücknehmen** lässt es sich
  wieder leeren. Vorhandene Angaben werden nie überschrieben.
- **Abweichendes Jahr** erscheint als Hinweis. Ist die Aufnahme ein Remaster,
  eine Neuaufnahme oder stammt sie von einer Zusammenstellung, nennt der Hinweis
  beide Jahre, etwa „Diese Aufnahme: 2011 (Remaster) · Original: 1975".
  **Original übernehmen** (vorgewählt) oder **Aufnahme übernehmen** setzt das
  gewählte Jahr als Hauptjahr, das bisherige bleibt als weiteres richtiges Jahr
  erhalten (aus „2011" wird „1975;2011"). **Behalten** lässt alles, wie es ist.
- **Alle Originaljahre übernehmen** erledigt das für alle Hinweise mit
  Originaljahr auf einmal.

Im Editor startet **Mit MusicBrainz prüfen** denselben Abgleich für eine
bestehende Version.

### Schalter beim Erstellen

- **Mit Konto synchronisieren** macht die Version auf allen Geräten verfügbar,
  auf denen dasselbe Konto angemeldet ist. Ohne den Schalter bleibt sie nur auf
  diesem Gerät.
- **Ist eine Film-/Serien-Version** macht sie für den Film-Modus nutzbar. Die
  Filmtitel werden danach pro Song eingetragen.

### Bearbeiten

Der Stift an einer eigenen oder selbst freigegebenen Version öffnet den Editor:

- **Name**, **Cover** und **Film-Schalter** ändern
- **Songs aus CSV ergänzen**: eine weitere CSV einlesen. Vor dem Anhängen zeigt
  eine Vorschau alle Songs der CSV, und man wählt aus, was dazukommen soll.
  Songs mit gleichem Spotify-Link sind gesperrt, gleicher Titel und Künstler
  unter anderem Link ist als möglicherweise doppelt markiert. Ein erneuter
  Export derselben, gewachsenen Playlist legt also nichts doppelt an.
- **Band/Solo ergänzen** trägt die Angabe für alle Songs nach, bei denen sie
  fehlt. Bereits gesetzte Werte bleiben unangetastet.
- **Metadaten pro Song**: Titel, Künstler, Jahr, Band/Solo und Film/Serie. Die
  Songs werden einzeln durchgeblättert, ein Suchfeld findet einen bestimmten.
  Einzelne Songs lassen sich entfernen.

Änderungen greifen erst mit **Speichern**, Abbrechen verwirft sie.

### Freigeben

Eine eigene Version lässt sich an andere Konten auf demselben Server freigeben.
Sie erscheint dort in der Auswahl, ohne dass die Datei weitergegeben wird. Nur
wer sie erstellt hat (oder der Serverbesitzer) kann sie danach noch bearbeiten
oder löschen. Ohne Anmeldung sind freigegebene Versionen nicht sichtbar.

### Ausblenden und löschen

**Ausblenden** nimmt eine Version aus der Auswahl, ohne sie zu löschen, und ist
jederzeit umkehrbar. **Löschen** gibt es nur für selbst importierte Versionen.

## Konto, Profil und Statistik

Ein Konto wird für Online-Partien, Ranglisten und die Synchronisierung
gebraucht. Am Gerät allein geht es ohne.

- **Registrieren** verlangt Benutzername, Passwort und eine Sicherheitsfrage.
  Die Frage ist der einzige Weg zurück, wenn das Passwort vergessen wird, es
  gibt keinen Mailversand.
- **Profil** erlaubt Profilbild, Namensänderung, Passwortwechsel und das Ändern
  der Sicherheitsfrage.
- **Rangliste** zeigt alle Konten des Servers nach Punkten und Siegen.
- **Statistik** je Konto: gespielte Partien, Siege, Punkte, dazu der
  meistgespielte Modus und die meistgespielte Version.

Der **erste Account auf einem frischen Server wird automatisch Serverbesitzer**
und bekommt damit den Punkt **Nutzerverwaltung**. Dort lassen sich Konten
anlegen (mit Benutzername und Startpasswort), löschen, aus Bestenliste und
Statistik ausblenden, und der Besitz lässt sich auf ein anderes Konto
übertragen.

## Design anpassen

Unter **Optionen → Design** lässt sich das Aussehen der gesamten Anwendung
umstellen: Akzentfarbe, Hintergrund als einzelne Farbe oder als Verlauf mit zwei
Farben und wählbarer Richtung, dazu die Farben der Spielkarten. Bei einem
angemeldeten Konto wird das Design mit dem Konto gespeichert und steht auf jedem
Gerät zur Verfügung.

## Spielstände

Eine laufende Partie lässt sich über **Spielstand speichern** sichern und
später fortsetzen. Die zehn letzten Spielstände merkt sich das Gerät, zusätzlich
lässt sich jeder als Datei herunterladen. Beim Speichern wird gewählt, was
hinein soll: Spielernamen, Punkte und die gespielten Karten samt Versionen.

**Spielstand laden** im Untermenü „Lokal spielen" oder „Online spielen" zeigt die
gemerkten Spielstände mit einer kleinen Vorschau (Spieler, Versionen, Punkte).
Dort lässt sich auch eine Spielstand-Datei auswählen. Ein Spielstand unter
„Online spielen" dient als Grundlage für eine neue Online-Lobby.

## Nur in der Desktop-App

- **Server-Verbindung**: Adresse des Servers eintragen. Im Browser entfällt das,
  dort wird der Server verwendet, von dem die Seite geladen wurde.
- **Songs-Ordner**: Die mitgelieferten Songlisten und Metadaten liegen als
  Dateien auf der Platte und lassen sich dort direkt bearbeiten.
- **Immer im Vordergrund**: hält das Hauptfenster über anderen Fenstern.
- **Automatische Updates** unter Windows und Linux (AppImage). Unter macOS nicht,
  siehe README.
