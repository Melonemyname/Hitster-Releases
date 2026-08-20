# Hitster (inoffiziell)

> ## ⚠️ Dieses Projekt ist vibe-coded
>
> **Ich habe diesen Code nicht selbst geschrieben.** Die Anwendung ist
> vollständig mit einer KI entstanden, von der ersten Zeile bis zum
> Release-Prozess. Ich habe beschrieben, was passieren soll, getestet und
> Fehler gemeldet, aber ich kann für die Qualität, Sicherheit oder Wartbarkeit
> des Codes nicht geradestehen und werde Fragen dazu nur begrenzt beantworten
> können.
>
> Wer das hier einsetzen will, sollte sich den Code vorher selbst ansehen. Das
> gilt besonders, wenn ein Server im Internet erreichbar sein soll.

> ### 🇩🇪 Nur auf Deutsch
>
> Die Anwendung ist **ausschließlich auf Deutsch** verfügbar. Es gibt keine
> Sprachumschaltung und keine Übersetzung, alle Beschriftungen stehen fest im
> Code. Auch diese Dokumentation ist nur auf Deutsch.
>
> *This application is German-only. There is no localization and no English
> translation.*

> ### Rechtlicher Hinweis
>
> Dies ist ein **privates Fan-Projekt ohne jede Verbindung** zu Jumbo Diset,
> Sit Down! oder anderen Rechteinhabern des Spiels *Hitster*. Es besteht keine
> Zusammenarbeit, keine Lizenz und keine Unterstützung durch den Hersteller.
> „Hitster" ist eine Marke ihrer jeweiligen Inhaber und wird hier nur
> beschreibend verwendet.
>
> Die Anwendung enthält **keine Spielkarten und keine Musik**. Sie arbeitet mit
> Links auf öffentlich zugängliche Spotify-Playlists sowie den dazugehörigen
> Titelangaben. Zum Abspielen braucht jede Person ein eigenes Spotify-Konto.

---

Ein digitaler Spielleiter für ein Musik-Ratespiel: Ein Song wird abgespielt, die
Mitspielenden ordnen ihn in ihrer Zeitleiste ein, die Anwendung kennt das Jahr
und wertet aus.

- **Lokal und online.** Am selben Gerät reihum, oder in einer Online-Lobby mit
  Raumcode, bei der alle ihr eigenes Gerät benutzen.
- **Vier Spielarten:** Normal, Film/Serie, Battle und Bingo.
- **Eigene Song-Stapel** aus jeder Spotify-Playlist, per CSV-Import.
- **Konten** mit Statistik, Rangliste und Profilbild.
- **Anpassbares Design.**

**➡️ Alle Funktionen im Detail: [ANLEITUNG.md](ANLEITUNG.md)**

## Inhalt

- [Fertige App herunterladen](#fertige-app-herunterladen)
- [Voraussetzungen](#voraussetzungen)
- [Selbst starten](#selbst-starten)
- [Andere mitspielen lassen](#andere-mitspielen-lassen)
- [Songs mitbringen](#songs-mitbringen)
- [Für Forks](#für-forks)
- [Lizenz](#lizenz)

## Fertige App herunterladen

Wer nichts einrichten will, nimmt ein fertiges Paket aus den
[Releases](../../releases):

| System | Datei |
|---|---|
| Windows | `Hitster-Setup-*.exe` |
| Linux | `*.AppImage`, `*.deb` oder `*.rpm` |
| macOS (Apple Silicon) | `*-arm64.dmg` |
| Eigener Server, ohne Git und ohne Bauen | `Hitster-Server-*.zip` |

Unter Windows und Linux (AppImage) aktualisiert sich die App selbst.

**macOS:** Die Pakete sind **nicht signiert**, es gibt dort also kein
automatisches Update, und beim ersten Start meldet das System die App als
beschädigt. Das lässt sich einmalig beheben:

```bash
xattr -dr com.apple.quarantine /Applications/Hitster.app
```

Damit ist der Modus an einem Gerät vollständig spielbar. Für Online-Partien,
Konten und Statistiken wird zusätzlich ein Server gebraucht, siehe unten.

## Voraussetzungen

Nur nötig, wenn du die Anwendung **selbst startest oder einen Server
betreibst**. Für die fertige App oben reicht das jeweilige Paket.

| Was | Version | Wofür | Woher |
|---|---|---|---|
| **Node.js** | 20 LTS oder neuer | Alles. Bringt `npm` gleich mit. | [nodejs.org](https://nodejs.org) (LTS wählen) |
| **Git** | beliebig | Zum Klonen. Alternativ das Repo als ZIP laden. | [git-scm.com](https://git-scm.com) |
| **Spotify-Konto** | — | Zum Abspielen der Songs. Ein kostenloses reicht, spielt aber Werbung. | [spotify.com](https://spotify.com) |
| **Reverse-Proxy** (z. B. Caddy) | beliebig | **Nur** für einen öffentlich erreichbaren Server, für HTTPS. | [caddyserver.com](https://caddyserver.com) |

Prüfen, ob Node bereits da ist:

```bash
node --version
```

Kommt eine Versionsnummer ab `v20`, passt es. Kommt eine Fehlermeldung, muss
Node erst installiert werden. Die Startskripte weiter unten prüfen das selbst
und sagen Bescheid.

### Installation von Node.js

- **Windows:** Installer von [nodejs.org](https://nodejs.org) laden, LTS
  wählen, durchklicken. Danach die Eingabeaufforderung neu öffnen.
- **macOS:** Installer von [nodejs.org](https://nodejs.org), oder mit
  [Homebrew](https://brew.sh): `brew install node`
- **Linux (Debian/Ubuntu):**
  ```bash
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs git
  ```
  Andere Distributionen: `nodejs` und `npm` aus der Paketverwaltung, oder
  [nvm](https://github.com/nvm-sh/nvm).

## Selbst starten

```bash
git clone <dieses-repo> hitster
cd hitster
```

Im Ordner liegen fertige Startskripte. **Doppelklick genügt**, sie installieren
beim ersten Mal alles Nötige selbst (das dauert einige Minuten) und melden sich,
falls Node fehlt.

| System | Server starten | Spiel starten |
|---|---|---|
| **Windows** | `1 Server starten (Windows).bat` | `2 Spiel starten (Windows).bat` |
| **macOS** | `1 Server starten (macOS).command` | `2 Spiel starten (macOS).command` |
| **Linux** | `1 Server starten (Linux).sh` | `2 Spiel starten (Linux).sh` |

**Reihenfolge:** erst 1, dann 2. Beide Fenster bleiben offen, solange gespielt
wird. Danach `http://localhost:9000` im Browser öffnen.

Das Server-Skript (1) wird nur für Online-Partien, Konten und Statistiken
gebraucht. Wer nur an einem Gerät spielt, kann es weglassen.

> **macOS:** Beim ersten Doppelklick auf eine `.command`-Datei meldet das System
> einen unbekannten Entwickler. Rechtsklick auf die Datei → „Öffnen" wählen,
> dann einmal bestätigen.
>
> **Linux:** Falls sich die `.sh` nicht per Doppelklick starten lässt, einmal
> ausführbar machen: `chmod +x "1 Server starten (Linux).sh"`, oder im Terminal
> mit `bash "1 Server starten (Linux).sh"` aufrufen.

### Von Hand statt per Skript

```bash
npm install                    # Frontend
npm install --prefix server    # Backend, eigene Abhängigkeiten
```

```bash
npm run dev                    # Oberfläche auf Port 9000
```

```bash
npm start --prefix server      # Server auf Port 3000
```

Für den Dauerbetrieb wird stattdessen einmal gebaut, danach liefert der Server
die fertige Seite selbst aus, ein zweiter Prozess entfällt:

```bash
npm run build
```

## Andere mitspielen lassen

Der einfachste Weg ist das fertige **Server-Paket** aus den
[Releases](../../releases) (`Hitster-Server-*.zip`): entpacken, das passende
„Server starten"-Skript doppelklicken, fertig. Es enthält Server und Spiel
zusammen; die Startskripte liegen sichtbar oben, alles Übrige steckt im
Unterordner `programm/`. Gebraucht wird nur Node.js
([nodejs.org](https://nodejs.org), LTS), das Skript sagt Bescheid, falls es
fehlt. Eine `LIESMICH.txt` mit allem Nötigen liegt bei. Das Klonen des Repos
braucht nur, wer am Code arbeiten will.

Damit die anderen den Server erreichen, gibt es drei Wege, und nur der letzte
ist aufwendig:

1. **Alle im selben WLAN.** Keine Portfreigabe, keine Domain. Es reicht die
   lokale IP des Rechners (etwa `192.168.178.42`), die anderen öffnen
   `http://192.168.178.42:3000`.
2. **Über ein privates Netz** wie Tailscale, wenn von unterwegs gespielt werden
   soll, ohne am Router etwas zu öffnen. Funktioniert auch hinter CGNAT.
3. **Öffentlich aus dem Internet**, mit eigener Domain, DDNS, Portfreigabe für
   80 und 443 und HTTPS über einen Reverse-Proxy.

**Alle drei Wege Schritt für Schritt, inklusive Portfreigabe, IP-Ermittlung,
CGNAT-Prüfung und fertiger Konfigurationsdateien:
[deploy/OEFFENTLICH-HOSTEN.md](deploy/OEFFENTLICH-HOSTEN.md)**

Wichtig für einen öffentlich erreichbaren Server: In `server/.env` gehören
mindestens diese Werte, die Vorlage steht in `server/.env.example`.

| Variable | Bedeutung |
|---|---|
| `JWT_SECRET` | Pflicht im Produktivbetrieb, mindestens 32 zufällige Zeichen (`openssl rand -hex 32`) |
| `NODE_ENV=production` | Aktiviert die Origin-Whitelist und erzwingt das Secret |
| `ALLOWED_ORIGINS` | Die Adresse, unter der Browser die Seite öffnen |
| `DATA_DIR` | Ordner für Laufzeitdaten, **außerhalb** des Repos, damit ein `git pull` sie nie überschreibt |
| `TRUST_PROXY=1` | Hinter einem Reverse-Proxy, sonst greift das Rate-Limit auf die falsche IP |

Der **erste Account, der sich registriert, wird automatisch Server-Owner** und
bekommt die Nutzerverwaltung.

Ohne HTTPS laufen Passwörter und Tokens im Klartext durchs Netz. Im eigenen WLAN
ist das vertretbar, im Internet nicht.

## Songs mitbringen

Die Anwendung liefert keine fertigen Kartenstapel aus. Unter „Versionen
verwalten" wird eine Playlist als CSV importiert und daraus ein eigener Stapel:

1. Playlist bei [Exportify](https://exportify.net) als CSV exportieren
2. Im Dialog „Version erstellen" die Datei auswählen, Namen und Cover vergeben

Titel, Künstler und Jahr kommen aus dem Export. Band/Solo wird für bekannte
Künstler automatisch gesetzt und lässt sich pro Song nachbessern. Ein bestehender
Stapel kann jederzeit mit einer weiteren CSV erweitert werden.

Näheres in der [Anleitung](ANLEITUNG.md#song-versionen-verwalten).

## Für Forks

Zwei Stellen zeigen auf die Infrastruktur dieses Projekts und müssen angepasst
werden, wenn eigene Pakete gebaut werden sollen:

- `quasar.config.js`, Abschnitt `builder.publish`: Ziel-Repo des Auto-Updates.
  Bleibt es unverändert, ziehen sich Installationen die Pakete **dieses**
  Projekts.
- Ein Release-Workflow liegt bewusst nicht bei, weil er auf ein bestimmtes Repo
  und ein Zugriffstoken angewiesen ist. Lokal baut `npm run build:electron`.

## Mitarbeit

Fehlerberichte sind willkommen. Bei Pull Requests bitte Geduld: Siehe den
Hinweis ganz oben, die Einarbeitung in fremde Änderungen dauert hier länger als
üblich.

## Lizenz

[MIT](LICENSE). Nutzen, ändern, weitergeben und forken ist ausdrücklich erlaubt,
solange der Copyright-Hinweis erhalten bleibt. Die Software kommt ohne jede
Gewährleistung.

Die Lizenz gilt für den **Code dieses Projekts**. Sie erstreckt sich nicht auf
Marken, Playlist-Inhalte oder Bildmaterial Dritter.
