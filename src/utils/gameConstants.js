// Spielkonstanten
export const GAME_CONSTANTS = {
  // Spieler
  MIN_PLAYERS: 2,
  MAX_PLAYERS: 10,

  // Einwände
  INITIAL_OBJECTIONS: 3,
  MAX_OBJECTIONS: 10,

  // Jahr-Schätzung
  MAX_YEAR_DIFFERENCE: 3, // Maximale Abweichung für korrekte Schätzung

  // Audio
  DEFAULT_AUDIO_DELAY: 800, // ms vor dem Laden einer neuen Karte
  SONG_LOAD_DELAY: 150, // ms zwischen Song-Abrufen (Rate Limiting)

  // Songdaten
  TOKEN_EXPIRY_BUFFER: 300 // Sekunden vor Ablauf zum Erneuern
}

// Validierungs-Funktionen
export const validatePlayerCount = (count) => {
  return count >= GAME_CONSTANTS.MIN_PLAYERS && count <= GAME_CONSTANTS.MAX_PLAYERS
}

export const validateYearGuess = (guess, actualYear) => {
  return Math.abs(guess - actualYear) <= GAME_CONSTANTS.MAX_YEAR_DIFFERENCE
}
