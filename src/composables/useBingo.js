// Zentrale Bingo-Konstanten und Hilfsfunktionen (client-seitig).
// Regeln + Farb-Zuordnung sind bewusst hier hart kodiert, weil die
// Kategorie-Farb-Zuordnung Teil der Spielregeln ist (nicht themebar).
// Wichtig: die Karten-Generierung (`generateBingoCard`) ist absichtlich
// identisch zur Server-Version in `server/rooms.js` – wenn hier etwas
// geändert wird, muss die Server-Version mitgezogen werden. Autoritativ
// ist der Server; der Client generiert nur als Fallback / für Offline-Vorschau.

export const BINGO_CARD_SIZE = 5;
export const BINGO_CELL_COUNT = BINGO_CARD_SIZE * BINGO_CARD_SIZE; // 25
export const BINGO_MIN_PER_COLOR = 3;
export const BINGO_MAX_PER_COLOR = 7;

// Die 5 Kategorie-Farben. Reihenfolge = fixe Zuordnung zu den Kategorien
// (siehe BINGO_CATEGORIES). Werte sind vom Theme unabhängig, weil die
// Farbe = Spielregel ist.
export const BINGO_COLORS = Object.freeze({
  green: "#21ba45",
  pink: "#e91e63",
  yellow: "#f9a825",
  purple: "#8e24aa",
  blue: "#29b6f6",
});

export const BINGO_COLOR_KEYS = Object.freeze([
  "green",
  "pink",
  "yellow",
  "purple",
  "blue",
]);

// Kategorien je Schwierigkeit, fix zu einer Farbe. `id` ist der interne
// Identifier, der später vom Server als „diese Runde ist Kategorie X".
// verwendet wird. `bonusYearRange` (Zahl oder null) steuert die
// ±X-Sonderregel („exakt geraten → Kreuz beim Gegner entfernen").
export const BINGO_CATEGORIES = Object.freeze({
  easy: [
    {
      id: "solo-group",
      color: "green",
      label: "Solo oder Gruppe?",
      shortLabel: "Solo / Gruppe",
      description:
        "Wird der Song von einer Gruppe oder einer Solo-Künstlerin/einem Solo-Künstler gesungen? Features und Duette zählen als Gruppe.",
      bonusYearRange: null,
    },
    {
      id: "before-2000",
      color: "pink",
      label: "Vor 2000?",
      shortLabel: "Vor 2000?",
      description:
        'Ist der Song vor dem Jahr 2000 erschienen? Das Jahr 2000 selbst zählt zu „ab 2000".',
      bonusYearRange: null,
    },
    {
      id: "year-4",
      color: "yellow",
      label: "Jahr ±4",
      shortLabel: "±4 Jahre",
      description:
        "Rate das Erscheinungsjahr. Ein Spielraum von ±4 Jahren zählt als richtig. Wird das Jahr exakt getroffen, darf ein Kreuz auf der Karte eines gegnerischen Teams entfernt werden (nicht in einer bereits vollen 5er-Reihe).",
      bonusYearRange: 4,
    },
    {
      id: "decade",
      color: "purple",
      label: "Jahrzehnt",
      shortLabel: "Jahrzehnt",
      description:
        "In welchem Jahrzehnt ist der Song erschienen? (z. B. 1980er)",
      bonusYearRange: null,
    },
    {
      id: "year-2",
      color: "blue",
      label: "Jahr ±2",
      shortLabel: "±2 Jahre",
      description:
        "Rate das Erscheinungsjahr. Ein Spielraum von ±2 Jahren zählt als richtig. Bei exaktem Treffer: Kreuz beim Gegner entfernen (nicht in einer vollen 5er-Reihe).",
      bonusYearRange: 2,
    },
  ],
  hard: [
    {
      id: "title",
      color: "green",
      label: "Titel des Songs",
      shortLabel: "Titel",
      description: "Nenne den genauen Titel des Songs.",
      bonusYearRange: null,
    },
    {
      id: "exact-year",
      color: "pink",
      label: "Genaues Erscheinungsjahr",
      shortLabel: "Genaues Jahr",
      description: "Rate das Erscheinungsjahr auf das Jahr genau.",
      bonusYearRange: null,
    },
    {
      id: "artist",
      color: "yellow",
      label: "Name der Band / des Künstlers",
      shortLabel: "Künstler",
      description:
        "Nenne den Namen der Band oder der/des Solokünstlerin/-künstlers.",
      bonusYearRange: null,
    },
    {
      id: "decade",
      color: "purple",
      label: "Jahrzehnt",
      shortLabel: "Jahrzehnt",
      description:
        "In welchem Jahrzehnt ist der Song erschienen? (z. B. 1980er)",
      bonusYearRange: null,
    },
    {
      id: "year-3",
      color: "blue",
      label: "Jahr ±3",
      shortLabel: "±3 Jahre",
      description:
        "Rate das Erscheinungsjahr. Ein Spielraum von ±3 Jahren zählt als richtig. Bei exaktem Treffer: Kreuz beim Gegner entfernen (nicht in einer vollen 5er-Reihe).",
      bonusYearRange: 3,
    },
  ],
});

/**
 * Erzeugt eine zufällige 5×5-Bingokarte als Array von 25 Farb-IDs (siehe
 * BINGO_COLOR_KEYS). Jede Farbe kommt mindestens `BINGO_MIN_PER_COLOR`
 * und höchstens `BINGO_MAX_PER_COLOR` mal vor.
 *
 * Autoritativ ist die identische Server-Implementierung in
 * `server/rooms.js` – hier ausschließlich für Client-Vorschau / Fallback.
 */
export function generateBingoCard() {
  const counts = {};
  BINGO_COLOR_KEYS.forEach((c) => {
    counts[c] = BINGO_MIN_PER_COLOR;
  });
  let remaining =
    BINGO_CELL_COUNT - BINGO_COLOR_KEYS.length * BINGO_MIN_PER_COLOR;
  while (remaining > 0) {
    const available = BINGO_COLOR_KEYS.filter(
      (c) => counts[c] < BINGO_MAX_PER_COLOR,
    );
    if (available.length === 0) break;
    const pick = available[Math.floor(Math.random() * available.length)];
    counts[pick] += 1;
    remaining -= 1;
  }
  const cells = [];
  BINGO_COLOR_KEYS.forEach((c) => {
    for (let i = 0; i < counts[c]; i += 1) cells.push(c);
  });
  for (let i = cells.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  return cells;
}

/** Alle 12 möglichen Bingo-Linien als Index-Arrays (5 Zeilen, 5 Spalten, 2 Diagonalen). */
export function getBingoLines() {
  const lines = [];
  // Zeilen
  for (let r = 0; r < BINGO_CARD_SIZE; r += 1) {
    const row = [];
    for (let c = 0; c < BINGO_CARD_SIZE; c += 1) {
      row.push(r * BINGO_CARD_SIZE + c);
    }
    lines.push(row);
  }
  // Spalten
  for (let c = 0; c < BINGO_CARD_SIZE; c += 1) {
    const col = [];
    for (let r = 0; r < BINGO_CARD_SIZE; r += 1) {
      col.push(r * BINGO_CARD_SIZE + c);
    }
    lines.push(col);
  }
  // Diagonalen
  const diag1 = [];
  const diag2 = [];
  for (let i = 0; i < BINGO_CARD_SIZE; i += 1) {
    diag1.push(i * BINGO_CARD_SIZE + i);
    diag2.push(i * BINGO_CARD_SIZE + (BINGO_CARD_SIZE - 1 - i));
  }
  lines.push(diag1);
  lines.push(diag2);
  return lines;
}

/** Prüft, welche Bingo-Linien (Zellen-Index-Arrays) auf `marks` komplett sind. */
export function getCompletedLines(marks) {
  return getBingoLines().filter((line) => line.every((idx) => marks[idx]));
}
