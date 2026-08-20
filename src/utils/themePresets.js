// Theme-Presets und -Optionen für das UI-Theming (Hintergrund).
//
// Karten bleiben bewusst unverändert (dunkel). Getheme't wird nur der
// Hintergrund; Schrift-/Button-Farben werden aus dem Theme abgeleitet
// (siehe utils/themeColors.js) und sind pro Theme deterministisch.

// Vordefinierte Verläufe (vom Nutzer vorgegeben).
export const GRADIENT_PRESETS = [
  { id: 'solar-flare', name: 'Solar Flare', from: '#FFAA00', to: '#E8003A' },
  { id: 'neon-tide', name: 'Neon Tide', from: '#00F5AA', to: '#3B00FF' },
  { id: 'dusk', name: 'Dusk', from: '#FF5CBA', to: '#2B00FF' },
  { id: 'arctic', name: 'Arctic', from: '#E8F5FF', to: '#0050D8' },
  { id: 'violet-volt', name: 'Violet Volt', from: '#FF3D7A', to: '#2E9EFF' },
  { id: 'crimson', name: 'Crimson', from: '#CA6969', to: '#C4180C' },
  { id: 'sage-blush', name: 'Sage Blush', from: '#BEE8E0', to: '#C97B8A' },
  { id: 'emerald-deep', name: 'Emerald Deep', from: '#00E68A', to: '#005F73' },
  { id: 'lilac-dusk', name: 'Lilac Dusk', from: '#D8E1F5', to: '#7B5EA7' },
  { id: 'magenta-lava', name: 'Magenta Lava', from: '#FF0054', to: '#130008' },
  { id: 'vapor', name: 'Vapor', from: '#FF10F0', to: '#130013' },
  { id: 'tide', name: 'Tide', from: '#00D4FF', to: '#001419' },
  { id: 'pulse', name: 'Pulse', from: '#7000FF', to: '#07001A' },
  { id: 'acid', name: 'Acid', from: '#C8FF00', to: '#0C1100' },
  { id: 'aurora', name: 'Aurora', from: '#B9F5D8', to: '#5B8DEF' },
  { id: 'orchid', name: 'Orchid', from: '#F2E6EE', to: '#977DFF' },
  { id: 'lagoon', name: 'Lagoon', from: '#C5F2E4', to: '#159C8E' },
  { id: 'sunset', name: 'Sunset', from: '#FFD59E', to: '#FF6B9D' }
]

// Vordefinierte einfarbige Hintergründe (Vorlagen).
export const SOLID_PRESETS = [
  { id: 'onyx', name: 'Onyx', color: '#121212' },
  { id: 'graphite', name: 'Graphite', color: '#22252A' },
  { id: 'midnight', name: 'Midnight', color: '#10182E' },
  { id: 'deep-teal', name: 'Deep Teal', color: '#05363B' },
  { id: 'plum', name: 'Plum', color: '#2A1633' },
  { id: 'espresso', name: 'Espresso', color: '#241A17' },
  { id: 'wine', name: 'Wine', color: '#4A0E22' },
  { id: 'forest', name: 'Forest', color: '#132A1E' },
  { id: 'royal', name: 'Royal', color: '#1B2A6B' },
  { id: 'sky', name: 'Sky', color: '#E8F5FF' },
  { id: 'sand', name: 'Sand', color: '#F2E6EE' },
  { id: 'mint', name: 'Mint', color: '#C5F2E4' }
]

// Verlaufsrichtungen (CSS-Wert + Label + Icon für die Auswahl).
export const GRADIENT_DIRECTIONS = [
  { value: 'to right', label: 'Horizontal →', icon: 'arrow_forward' },
  { value: 'to left', label: 'Horizontal ←', icon: 'arrow_back' },
  { value: 'to bottom', label: 'Vertikal ↓', icon: 'arrow_downward' },
  { value: 'to top', label: 'Vertikal ↑', icon: 'arrow_upward' },
  { value: 'to bottom right', label: 'Diagonal ↘', icon: 'south_east' },
  { value: 'to bottom left', label: 'Diagonal ↙', icon: 'south_west' },
  { value: 'to top right', label: 'Diagonal ↗', icon: 'north_east' },
  { value: 'to top left', label: 'Diagonal ↖', icon: 'north_west' }
]

export const DEFAULT_DIRECTION = 'to bottom right'

// Standard-Theme = aktueller Look (dunkles Onyx), damit sich ohne
// bewusste Auswahl nichts ändert.
export const DEFAULT_THEME = {
  type: 'solid', // 'solid' | 'gradient'
  source: 'preset', // 'preset' | 'custom'
  presetId: 'onyx',
  color: '#121212',
  from: '#FFAA00',
  to: '#E8003A',
  direction: DEFAULT_DIRECTION,
  // Spielkarten-Farben: 'original' = ursprüngliche bunte Farben,
  // 'theme' = an das Theme (Akzent) angepasst. Beim Standard-Theme wird immer
  // 'original' erzwungen.
  cardColors: 'original',
  // Optionale, vom Nutzer angepasste Farben (nur im Custom-Modus relevant).
  // null => automatisch aus dem Theme abgeleitet.
  overrides: {
    accent: null,
    onBg: null
  }
}

export const THEME_STORAGE_KEY = 'hitster-theme'
