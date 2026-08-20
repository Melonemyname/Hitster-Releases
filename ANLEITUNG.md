# Anleitung

Alle Funktionen der Anwendung im Überblick. Für Einrichtung und Installation
siehe [README.md](README.md), für den Betrieb eines eigenen Servers
[deploy/OEFFENTLICH-HOSTEN.md](deploy/OEFFENTLICH-HOSTEN.md).

> **Sprache:** Die Anwendung gibt es derzeit **nur auf Deutsch**. Es ist keine
> Übersetzung eingebaut, alle Beschriftungen stehen fest im Code.

## Inhalt

- [Grundprinzip](#grundprinzip)
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

Wer zuerst **10 Karten** in der Zeitleiste hat, gewinnt, sofern alle gleich oft
am Zug waren. Erreichen mehrere gleichzeitig zehn Karten, gibt es Zusatzpunkte
und die Punktzahl entscheidet.

## Am selben Gerät spielen

Der schnellste Weg, ohne Konto und ohne Server. Auf der Startseite führt ein
Assistent durch vier Schritte:

1. **Spielmodus** wählen (Normal, Film/Serie oder Battle)
2. **Versionen** auswählen, aus denen die Songs gezogen werden. Mehrere
   Versionen lassen sich mischen.
3. **Spieleranzahl und Namen** eintragen
4. **Startspieler** festlegen oder auslosen lassen

Danach wird das Gerät reihum weitergereicht. Wer dran ist, sieht seine eigene
Zeitleiste, ordnet die Karte ein und bestätigt.

## Online mit mehreren Geräten

Dafür wird ein Server gebraucht und jede Person braucht ein Konto. Über
**Multiplayer Lobby** auf der Startseite:

- **Raum erstellen** erzeugt einen sechsstelligen Raumcode, den die anderen
  eingeben. Wer den Raum erstellt, ist Host und stellt alles ein.
- **Beitreten** mit dem Raumcode. Danach wählt jede Person einen Slot, also
  einen Platz im Spiel.

Mehrere Personen können sich einen Slot teilen, etwa wenn zwei an einem Gerät
sitzen. Wer der Lobby beitritt, taucht mit Namen und Profilbild auf.

### Was der Host einstellt

| Einstellung | Bedeutung |
|---|---|
| **Spielmodus** | Normal, Film/Serie, Battle oder Bingo |
| **Song-Versionen** | Aus welchen Stapeln gezogen wird, mehrere gleichzeitig möglich |
| **Startspieler** | Fest wählen oder auslosen lassen. Beim Auslosen läuft bei allen synchron eine Ziehung ab, die Hervorhebung springt durch die Namen und bleibt beim Gewinner stehen. |
| **Schwierigkeit** | Leicht oder Schwer |
| **Audio-Modus** | „Nur Host hört Musik" oder „Alle Spieler hören Musik". Beim zweiten öffnet sich der Song auf jedem Gerät, dann braucht jede Person ein eigenes Spotify-Konto. |
| **Antwort-Timer** | Entweder 30 Sekunden oder „Warten bis alle fertig“ |

Der Raum lässt sich auch mit einem geladenen Spielstand starten, dann werden
Punkte und Namen übernommen.

## Die vier Spielarten

### Normal

Der Grundmodus: Song anhören, in die Zeitleiste einordnen, fertig.

### Film / Serie

Zusätzlich zur Einordnung wird geraten, aus welchem Film oder welcher Serie der
Song stammt. Eigenes Punktesystem. Voraussetzung ist eine Version, bei der der
Film-Schalter aktiv ist und bei der die Filmtitel pro Song hinterlegt sind.

### Battle

Jede Person spielt mit einer **eigenen** Version statt aus einem gemeinsamen
Stapel. Gedacht für Stapel, die verschiedene Zeiträume abdecken, damit jede
Generation ihre eigene Musik bekommt. Versionen mit stark abweichender
Songanzahl werden ausgegraut, damit die Stapel vergleichbar bleiben.

### Bingo (nur online)

Statt einer Zeitleiste hat jede Person eine Bingo-Karte mit Feldern. Pro Runde
wird eine **Kategorie** ausgespielt, und wer sie richtig beantwortet, darf ein
Feld füllen. Die Kategorien sind unter anderem:

- Solo oder Gruppe? (Features und Duette zählen als Gruppe)
- Vor 2000?
- Jahrzehnt
- Jahr auf ±2, ±3 oder ±4 genau
- Genaues Erscheinungsjahr
- Titel des Songs
- Name der Band oder des Künstlers

Antworten werden pro Person eingegeben, der Host löst auf. Wo die Angabe
Band/Solo in den Songdaten hinterlegt ist, entfällt die Rückfrage beim Host.

## Während der Runde

- **Song öffnen** startet die Wiedergabe bei Spotify.
- **Neu einordnen** verschiebt die Karte, solange noch nicht bestätigt wurde.
- **Skip** überspringt einen Song, etwa wenn er sich nicht abspielen lässt.
- **Einwandphase** ist für strittige Fälle gedacht: Wer meint, die Wertung sei
  falsch, meldet sich, und die Gruppe entscheidet. Melden sich mehrere, wird
  ausgelost.
- **Punkte / Einwände verwalten** erlaubt dem Host, Punkte von Hand zu
  korrigieren.
- **Karte manuell hinzufügen** trägt eine Karte nachträglich in eine Zeitleiste
  ein, etwa nach einem übersprungenen Song.

Am Ende zeigt ein Dialog den Gewinner. Von dort lässt sich direkt eine neue
Partie starten, wahlweise mit denselben Spielern und Punkten oder mit neuen
Namen.

## Song-Versionen verwalten

Eine **Version** ist ein Stapel Songs, aus dem gezogen wird. Der Dialog liegt
oben rechts im Konto-Menü unter **Versionen verwalten**.

### Eigene Version anlegen

1. Playlist bei [Exportify](https://exportify.net) als CSV exportieren
2. Im Dialog unter „Version erstellen" die CSV auswählen
3. Namen vergeben, Cover wählen, fertig

Aus der CSV kommen Titel, Künstler und Erscheinungsjahr. **Band/Solo wird
automatisch gesetzt**, wenn der Künstler bereits bekannt ist oder mehrere
Künstler genannt sind. Unter dem Auswahlknopf steht, bei wie vielen Songs die
Angabe noch fehlt.

Zwei Schalter:

- **Mit Konto synchronisieren** macht die Version auf allen Geräten verfügbar,
  auf denen dasselbe Konto angemeldet ist. Ohne den Schalter bleibt sie nur auf
  diesem Gerät.
- **Ist eine Film-/Serien-Version** macht sie für den Film-Modus nutzbar. Die
  Filmtitel werden danach pro Song eingetragen.

### Bearbeiten

Der Stift an einer eigenen oder selbst freigegebenen Version öffnet den Editor:

- **Name** und **Film-Schalter** ändern
- **Songs aus CSV ergänzen**: eine weitere CSV einlesen, die neuen Titel werden
  angehängt. Bereits enthaltene Songs werden übersprungen, ein erneuter Export
  derselben, gewachsenen Playlist legt also nichts doppelt an.
- **Band/Solo ergänzen** trägt die Angabe für alle Songs nach, bei denen sie
  fehlt. Bereits gesetzte Werte bleiben unangetastet.
- **Metadaten pro Song**: Titel, Künstler, Jahr, Band/Solo und Film/Serie. Die
  Songs werden einzeln durchgeblättert, ein Suchfeld findet einen bestimmten.
  Einzelne Songs lassen sich entfernen.

Änderungen greifen erst mit **Speichern**, Abbrechen verwirft sie.

### Freigeben

Eine eigene Version lässt sich an andere Konten auf demselben Server freigeben.
Sie erscheint dort in der Auswahl, ohne dass die Datei weitergegeben wird. Nur
wer sie erstellt hat (oder der Server-Owner) kann sie danach noch bearbeiten
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

Der **erste Account auf einem frischen Server wird automatisch Owner** und
bekommt damit den Punkt **Nutzerverwaltung**. Dort lassen sich Konten anlegen
(mit Benutzername und Startpasswort), löschen, aus Bestenliste und Statistik
ausblenden, und die Ownership auf ein anderes Konto übertragen.

## Design anpassen

Unter **Design anpassen** lässt sich das Aussehen der gesamten Anwendung
umstellen: Akzentfarbe, Hintergrund als einzelne Farbe oder als Verlauf mit zwei
Farben und wählbarer Richtung, dazu die Farben der Spielkarten. Bei einem
angemeldeten Konto wird das Design mit dem Konto gespeichert und steht auf jedem
Gerät zur Verfügung.

## Spielstände

Eine laufende Partie lässt sich sichern und später fortsetzen, entweder im
Browser des Geräts oder als Datei. Beim Laden stehen zwei Varianten zur Wahl:
alles inklusive gespielter Karten, oder nur Punkte und Spielernamen. Ein
Spielstand lässt sich auch als Grundlage für eine Online-Lobby verwenden.

## Nur in der Desktop-App

- **Server-Verbindung**: Adresse des Servers eintragen. Im Browser entfällt das,
  dort wird der Server verwendet, von dem die Seite geladen wurde.
- **Songs-Ordner**: Die mitgelieferten Songlisten und Metadaten liegen als
  Dateien auf der Platte und lassen sich dort direkt bearbeiten.
- **Immer im Vordergrund**: hält das Hauptfenster über anderen Fenstern.
- **Automatische Updates** unter Windows und Linux (AppImage). Unter macOS nicht,
  siehe README.
