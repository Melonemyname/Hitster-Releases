// Zentrales Theme-Management (Singleton).
//
// Hält den aktuellen Theme-Zustand, wendet ihn als CSS-Variablen auf
// <html> an, persistiert ihn im localStorage und stellt ihn beim Start
// wieder her. Alle Komponenten teilen sich denselben State.
//
// Persistenz erfolgt aktuell lokal (localStorage). Die Kopplung an den
// Account (server-seitig) ist ein separater Backlog-Punkt.

import { reactive, computed, readonly } from 'vue'
import {
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  GRADIENT_PRESETS,
  SOLID_PRESETS
} from '../utils/themePresets'
import { deriveThemeColors, backgroundCss } from '../utils/themeColors'
import { getToken, SERVER_URL } from '../utils/authService'

function cloneDefault () {
  return JSON.parse(JSON.stringify(DEFAULT_THEME))
}

// Fusioniert einen geladenen Theme-Zustand mit den Defaults, damit
// fehlende Felder (z.B. nach Format-Erweiterungen) robust ergänzt werden.
function normalizeTheme (raw) {
  const base = cloneDefault()
  if (!raw || typeof raw !== 'object') return base
  const merged = {
    ...base,
    ...raw,
    overrides: { ...base.overrides, ...(raw.overrides || {}) }
  }
  if (merged.type !== 'gradient' && merged.type !== 'solid') merged.type = base.type
  if (merged.source !== 'custom' && merged.source !== 'preset') merged.source = base.source
  if (merged.cardColors !== 'theme' && merged.cardColors !== 'original') merged.cardColors = base.cardColors
  return merged
}

const state = reactive(cloneDefault())

const colors = computed(() => deriveThemeColors(state))
const background = computed(() => backgroundCss(state))
// Ob aktuell das Standard-/kein Theme aktiv ist (siehe isDefaultTheme).
const isDefault = computed(() => isDefaultTheme(state))
// Effektiver Kartenfarben-Modus: beim Standard-Theme immer 'original'.
const cardColorMode = computed(() => (isDefault.value ? 'original' : state.cardColors))

// Standard-/kein Theme = unveränderter Default (Onyx-Preset, keine eigenen
// Farb-Overrides). Dient als Signal für Fallback-Effekte (z.B. Regenbogen-Auswahl).
function isDefaultTheme (s) {
  const noOverrides = !s.overrides || (!s.overrides.accent && !s.overrides.onBg)
  return s.source === 'preset' && s.type === 'solid' && s.presetId === 'onyx' && noOverrides
}

function applyToDom () {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const c = deriveThemeColors(state)
  root.style.setProperty('--app-bg', backgroundCss(state))
  root.style.setProperty('--app-on-bg', c.onBg)
  root.style.setProperty('--app-accent', c.accent)
  root.style.setProperty('--app-accent-hover', c.accentHover)
  root.style.setProperty('--app-on-accent', c.onAccent)
  // Flag für „Standard-/kein Theme" (Fallback-Effekte im CSS).
  root.setAttribute('data-default-theme', isDefaultTheme(state) ? 'true' : 'false')
  // Quasar-Palette überschreiben (nur Marken-/Akzentfarben; semantische
  // Farben wie positive/negative/warning/info bleiben unverändert).
  root.style.setProperty('--q-primary', c.accent)
  root.style.setProperty('--q-secondary', c.secondary)
  root.style.setProperty('--q-accent', c.accent)
}

function persist () {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* Speicher nicht verfügbar – ignorieren */
  }
}

function loadFromStorage () {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY)
    if (raw) return normalizeTheme(JSON.parse(raw))
  } catch {
    /* ignorieren */
  }
  return cloneDefault()
}

function assign (next) {
  Object.assign(state, normalizeTheme(next))
}

// ─── Server-Persistenz (an den Account gekoppelt) ──────────────────────
// Nur für eingeloggte Nutzer. Gäste bleiben bei localStorage.

async function pushToServer () {
  const token = getToken()
  if (!token) return
  try {
    await fetch(`${SERVER_URL}/api/theme`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ theme: JSON.parse(JSON.stringify(state)) })
    })
  } catch {
    /* offline / Server nicht erreichbar – localStorage bleibt als Fallback */
  }
}

// Lädt das server-seitig gespeicherte Theme und wendet es an (Server hat
// Vorrang vor localStorage). Wird beim Start und nach dem Login aufgerufen.
async function syncFromServer () {
  const token = getToken()
  if (!token) return
  try {
    const res = await fetch(`${SERVER_URL}/api/theme`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!res.ok) return
    const data = await res.json().catch(() => ({}))
    if (data && data.theme) {
      assign(data.theme)
      applyToDom()
      persist() // lokalen Cache mit Server-Stand abgleichen
    }
  } catch {
    /* ignorieren – localStorage-Stand bleibt aktiv */
  }
}

// Setzt ein komplett neues Theme (z.B. aus dem Dialog) und speichert es
// lokal sowie – falls eingeloggt – server-seitig.
function setTheme (next) {
  assign(next)
  applyToDom()
  persist()
  pushToServer()
}

function resetTheme () {
  assign(cloneDefault())
  applyToDom()
  persist()
  pushToServer()
}

let initialized = false

// Beim ersten Aufruf: lokalen Stand sofort anwenden (kein Flackern) und
// anschließend – falls eingeloggt – den Account-Stand vom Server nachziehen.
function initTheme () {
  if (initialized) return
  initialized = true
  assign(loadFromStorage())
  applyToDom()
  syncFromServer()
}

export function useTheme () {
  return {
    theme: readonly(state),
    colors,
    background,
    isDefault,
    cardColorMode,
    presets: GRADIENT_PRESETS,
    solidPresets: SOLID_PRESETS,
    setTheme,
    resetTheme,
    initTheme,
    syncFromServer,
    // Für Live-Vorschau: Farben eines beliebigen (noch nicht gesetzten)
    // Theme-Entwurfs berechnen, ohne den globalen State zu verändern.
    previewColors: (draft) => deriveThemeColors(normalizeTheme(draft)),
    previewBackground: (draft) => backgroundCss(normalizeTheme(draft))
  }
}
