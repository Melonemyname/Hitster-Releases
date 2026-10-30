/**
 * Mehrere Einträge pro Feld (Titel, Künstler, Jahr, Film/Serie), getrennt mit
 * `;`. Beim Film gilt aus älteren Daten zusätzlich `|` als Trenner.
 *
 * - Titel / Film:   jede Variante zählt beim Raten als richtig, angezeigt
 *                   wird die erste.
 * - Künstler:       jeder Beteiligte zählt, angezeigt werden alle (", ").
 * - Jahr:           das erste ist das Hauptjahr (danach wird die Zeitleiste
 *                   sortiert, das wird angezeigt), jede Variante zählt beim
 *                   Raten und beim Einordnen als richtig.
 *
 * Der Server hat dieselben Regeln in server/rooms.js (CommonJS, eigene Kopie).
 */

export function splitVariants(value) {
  return String(value ?? "")
    .split(/[;|]/)
    .map((v) => v.trim())
    .filter(Boolean);
}

export function firstVariant(value) {
  return splitVariants(value)[0] || "";
}

// Künstler zur Anzeige: „A;B" -> „A, B".
export function displayArtists(value) {
  return splitVariants(value).join(", ");
}

// Jahre aus einem Feldwert („1975;2011", 1975, „1975-03-01") – nur gültige
// vierstellige Jahre, in der eingegebenen Reihenfolge.
export function parseYears(value) {
  if (Array.isArray(value)) {
    return value.map(Number).filter((y) => Number.isInteger(y) && y > 0);
  }
  return splitVariants(value)
    .map((v) => {
      const m = v.match(/(\d{4})/);
      return m ? Number.parseInt(m[1], 10) : 0;
    })
    .filter((y) => y > 0);
}

// Alle Jahre einer Karte bzw. Songdaten, Hauptjahr zuerst.
export function yearsOf(song) {
  const list = parseYears(song?.years);
  if (list.length) return list;
  const y = Number(song?.year || 0);
  return y ? [y] : [];
}

// Das Jahr, das am nächsten an `guess` liegt (für Punkte und Abstand).
// Ohne Tipp das Hauptjahr.
export function closestYear(years, guess) {
  const list = Array.isArray(years) ? years : [Number(years || 0)];
  const g = Number(guess);
  if (!list.length) return 0;
  if (guess === null || guess === undefined || guess === "" || !Number.isFinite(g)) {
    return list[0];
  }
  return list.reduce((best, y) =>
    Math.abs(y - g) < Math.abs(best - g) ? y : best,
  );
}

// Jahre zur Anzeige der Auflösung: „1975 / 2011".
export function displayYears(song) {
  return yearsOf(song).join(" / ");
}

// ── Titel und Künstler vergleichbar machen ───────────────────────────────
// Gebraucht beim Raten (useGuessEngine) und beim Erkennen doppelter Songs
// (useGameState). Derselbe Song steckt oft unter mehreren Track-IDs in den
// Daten, etwa als Original und als Remaster in einer anderen Version.

// Kleinbuchstaben, Akzente weg, nur noch Buchstaben und Ziffern. Die
// Sonderbuchstaben ohne Zerlegung (ß, æ, đ, ł …) vorher von Hand umschreiben,
// denn NFD trennt bei ihnen keinen Akzent ab.
export function normalizeMatchText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/æ/g, "ae")
    .replace(/œ/g, "oe")
    .replace(/ø/g, "o")
    .replace(/đ/g, "d")
    .replace(/ł/g, "l")
    .replace(/þ/g, "th")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

// Hinweise auf eine Fassung, die hinter „ - " am Titel hängen (Spotify-
// Konvention): „Song - 2011 Remaster", „Song - Radio Edit", „Song - Pt. 1",
// „Song - DJ X Remix", „Song - Special Edition" und so weiter.
const VERSION_SUFFIX_WORDS =
  "remaster(?:ed)?|remix(?:ed)?|rework(?:ed)?|reimagin(?:ed)?|re-?recorded|re-?edit|" +
  "live|acoustic|unplugged|instrumental|demo|mono|stereo|edit|mix(?:ed)?|" +
  "version|edition|original|single|side|pt\\.?\\s*\\d+|part\\s+\\d+|session|" +
  "from\\b.*";
const VERSION_SUFFIX_RE = new RegExp(
  `\\s+[-–—]\\s+.*\\b(${VERSION_SUFFIX_WORDS})\\b.*$`,
  "gi",
);

// Titel ohne Fassungs-Hinweise. `keepBracketText` behält den Inhalt runder
// und eckiger Klammern (nur die Klammern fallen weg), damit auch
// „I Can't Get No Satisfaction" für „(I Can't Get No) Satisfaction" zählt.
// Ohne den Schalter fällt der Klammerinhalt ganz weg, wie bei
// „Song (Remastered 2011)" oder „Track [Radio Edit]".
export function stripVersionDescriptors(value, { keepBracketText = false } = {}) {
  let text = String(value ?? "");
  text = keepBracketText
    ? text.replace(/[()[\]]/g, " ")
    : text.replace(/\s*\([^)]*\)/g, "").replace(/\s*\[[^\]]*\]/g, "");
  return (
    text
      // Die Leerzeichen um den Bindestrich sind Pflicht, sonst würde ein
      // Titel wie „Played-A-Live" zu „Played-A" verstümmelt.
      .replace(VERSION_SUFFIX_RE, "")
      // Zusatz ohne Klammern und Bindestrich („Song Remastered 2011").
      .replace(/\s+\b(remaster(?:ed)?|reimagin(?:ed)?)\b.*$/gi, "")
      .replace(/\s+/g, " ")
      .trim()
  );
}

export function stripFeaturingFromTitle(value) {
  return String(value ?? "")
    .replace(/\s*[([–—-]?\s*\b(feat\.?|ft\.?|featuring)\b.*$/i, "")
    .trim();
}

// Vergleichbare Fassungen eines Titels: ohne Klammerinhalt und mit
// Klammerinhalt (Klammern entfernt). Reihenfolge wichtig: ERST die
// Klammern, DANN das Featuring. Andersherum schneidet das Featuring bei
// „Sucker for Pain (with … feat. X Ambassadors)" die schließende Klammer
// mit ab, und der halbe Zusatz bliebe stehen.
export function titleMatchForms(value) {
  const forms = [
    stripFeaturingFromTitle(stripVersionDescriptors(value)),
    stripFeaturingFromTitle(
      stripVersionDescriptors(value, { keepBracketText: true }),
    ),
  ].filter(Boolean);
  return [...new Set(forms)];
}

// Erster genannter Künstler: erste `;`-Variante, davon der Teil vor einem
// Komma (Exportify listet mehrere Künstler mit Komma) oder einem Featuring.
export function firstArtist(value) {
  return (
    firstVariant(value)
      .split(/,|\s+(?:feat\.?|ft\.?|featuring)\s+/i)[0]
      ?.trim() || ""
  );
}

// Kennung eines Songs unabhängig von Track-ID und Fassung: normalisierter
// erster Titel ohne Fassungs-Hinweise plus normalisierter erster Künstler.
// Leer, wenn eines von beiden fehlt (etwa bei Startkarten).
export function songIdentitySignature(song) {
  if (!song) return "";
  const title = normalizeMatchText(
    stripFeaturingFromTitle(stripVersionDescriptors(firstVariant(song.title))),
  );
  const artist = normalizeMatchText(firstArtist(song.artist));
  if (!title || !artist) return "";
  return `${title}__${artist}`;
}
