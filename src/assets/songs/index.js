/**
 * Song-Listen (Spotify-Links) als ins Bundle eingebetteter Rohtext.
 *
 * Früher wurden diese Dateien zur Laufzeit per fetch('/songs/...') geladen. Das
 * bricht in der Desktop-App (Electron, file://), weil Chromium keine lokalen
 * Dateien per fetch lädt. Daher werden sie hier zur Buildzeit als Text
 * eingebettet (Vite `?raw`) – ein Code-Pfad, der in Web UND Desktop funktioniert.
 *
 * Neue Songlisten (via scripts/import_hitster_csvs.py) müssen hier ergänzt und
 * die App neu gebaut werden.
 */

import battle19852004 from "./hitster-battle-generations-1985-2004.txt?raw";
import battle20052025 from "./hitster-battle-generations-2005-2025.txt?raw";
import battleBis1984 from "./hitster-battle-generations-bis-1984.txt?raw";
import bayern1 from "./hitster-bayern1-expansion.txt?raw";
import bingo from "./hitster-bingo-deutschland.txt?raw";
import deutsch from "./hitster-deutsch.txt?raw";
import celebration from "./hitster-deutschland-celebration.txt?raw";
import christmas from "./hitster-deutschland-christmas-expansion.txt?raw";
import deutschlandRock from "./hitster-deutschland-rock.txt?raw";
import soundtracks from "./hitster-deutschland-soundtracks-expansion.txt?raw";
import guiltyPleasures from "./hitster-deutschland-guilty-pleasures.txt?raw";
import hipHop from "./hitster-deutschland-hip-hop.txt?raw";
import summerParty from "./hitster-deutschland-summer-party.txt?raw";
import schlagerParty from "./hitster-schlager-party.txt?raw";
import espanolRock from "./hitster-espanol-rock.txt?raw";
import hungaryRock from "./hitster-hungary-rock.txt?raw";
import nederlandsRock from "./hitster-nederlands-rock.txt?raw";
import nordicsRock from "./hitster-nordics-rock.txt?raw";
import platinum from "./hitster-platinum-edition.txt?raw";
import poloniaRock from "./hitster-polonia-rock.txt?raw";

// Schlüssel = Dateiname (wie in SONG_POOL_FILE_MAPPING referenziert).
export const SONG_FILES = {
  "hitster-battle-generations-1985-2004.txt": battle19852004,
  "hitster-battle-generations-2005-2025.txt": battle20052025,
  "hitster-battle-generations-bis-1984.txt": battleBis1984,
  "hitster-bayern1-expansion.txt": bayern1,
  "hitster-bingo-deutschland.txt": bingo,
  "hitster-deutsch.txt": deutsch,
  "hitster-deutschland-celebration.txt": celebration,
  "hitster-deutschland-christmas-expansion.txt": christmas,
  "hitster-deutschland-rock.txt": deutschlandRock,
  "hitster-deutschland-soundtracks-expansion.txt": soundtracks,
  "hitster-deutschland-guilty-pleasures.txt": guiltyPleasures,
  "hitster-deutschland-hip-hop.txt": hipHop,
  "hitster-deutschland-summer-party.txt": summerParty,
  "hitster-schlager-party.txt": schlagerParty,
  "hitster-espanol-rock.txt": espanolRock,
  "hitster-hungary-rock.txt": hungaryRock,
  "hitster-nederlands-rock.txt": nederlandsRock,
  "hitster-nordics-rock.txt": nordicsRock,
  "hitster-platinum-edition.txt": platinum,
  "hitster-polonia-rock.txt": poloniaRock,
};
