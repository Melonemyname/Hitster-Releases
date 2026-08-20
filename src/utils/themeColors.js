// Deterministische Farbableitung für Themes.
//
// Ziel: Aus einem Theme (Verlauf oder einfarbig) reproduzierbar eine
// gut lesbare Schriftfarbe (auf dem Hintergrund) und eine Akzent-/
// Buttonfarbe erzeugen. Gleiches Theme => immer gleiche Farben.
//
// Karten bleiben dunkel und unangetastet, daher wird der Akzent auf ein
// „button-taugliches" Helligkeits-/Sättigungsband normalisiert, das
// sowohl gefüllt (weißes Label) als auch als flacher/outline-Button auf
// dunklen Karten ordentlich lesbar ist.

// ---- Hex <-> RGB -------------------------------------------------------

export function hexToRgb (hex) {
  let h = String(hex || '').trim().replace('#', '')
  if (h.length === 3) {
    h = h.split('').map((c) => c + c).join('')
  }
  const int = parseInt(h, 16)
  if (Number.isNaN(int) || h.length !== 6) {
    return { r: 0, g: 0, b: 0 }
  }
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255
  }
}

function clampByte (v) {
  return Math.max(0, Math.min(255, Math.round(v)))
}

export function rgbToHex ({ r, g, b }) {
  const toHex = (v) => clampByte(v).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

// ---- RGB <-> HSL -------------------------------------------------------

export function rgbToHsl ({ r, g, b }) {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case rn: h = (gn - bn) / d + (gn < bn ? 6 : 0); break
      case gn: h = (bn - rn) / d + 2; break
      default: h = (rn - gn) / d + 4
    }
    h /= 6
  }
  return { h: h * 360, s, l }
}

export function hslToRgb ({ h, s, l }) {
  const hn = ((h % 360) + 360) % 360 / 360
  if (s === 0) {
    const v = l * 255
    return { r: v, g: v, b: v }
  }
  const hue2rgb = (p, q, t) => {
    let tn = t
    if (tn < 0) tn += 1
    if (tn > 1) tn -= 1
    if (tn < 1 / 6) return p + (q - p) * 6 * tn
    if (tn < 1 / 2) return q
    if (tn < 2 / 3) return p + (q - p) * (2 / 3 - tn) * 6
    return p
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  return {
    r: hue2rgb(p, q, hn + 1 / 3) * 255,
    g: hue2rgb(p, q, hn) * 255,
    b: hue2rgb(p, q, hn - 1 / 3) * 255
  }
}

// ---- Luminanz / Kontrast (WCAG) ---------------------------------------

function channelLuminance (c) {
  const cs = c / 255
  return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4)
}

export function relativeLuminance (hex) {
  const { r, g, b } = hexToRgb(hex)
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b)
}

export function contrastRatio (hexA, hexB) {
  const la = relativeLuminance(hexA)
  const lb = relativeLuminance(hexB)
  const lighter = Math.max(la, lb)
  const darker = Math.min(la, lb)
  return (lighter + 0.05) / (darker + 0.05)
}

const LIGHT_TEXT = '#F5F5F5'
const DARK_TEXT = '#141414'

// Gut lesbare Textfarbe (hell oder dunkel) für einen Untergrund.
export function readableTextOn (hex) {
  return contrastRatio(hex, LIGHT_TEXT) >= contrastRatio(hex, DARK_TEXT)
    ? LIGHT_TEXT
    : DARK_TEXT
}

// Mischt zwei Farben (Verhältnis 0..1 = Anteil b).
function mix (hexA, hexB, ratio = 0.5) {
  const a = hexToRgb(hexA)
  const b = hexToRgb(hexB)
  return rgbToHex({
    r: a.r + (b.r - a.r) * ratio,
    g: a.g + (b.g - a.g) * ratio,
    b: a.b + (b.b - a.b) * ratio
  })
}

// ---- Ableitung ---------------------------------------------------------

// Button-taugliches Band: kräftig, aber nicht zu hell/dunkel, damit
// sowohl gefüllte (Label) als auch flache Buttons auf dunklen Karten gut
// aussehen. Bewusst nah am bisherigen Look.
const ACCENT_MIN_SAT = 0.6
const ACCENT_LIGHTNESS = 0.55

function normalizeAccent (hex) {
  const hsl = rgbToHsl(hexToRgb(hex))
  // Ganz entsättigte (graue) Ausgangsfarben bekommen einen dezenten,
  // markenähnlichen Türkis-Ton, damit der Button nicht grau wird.
  const hue = hsl.s < 0.08 ? 187 : hsl.h
  const sat = Math.max(hsl.s, ACCENT_MIN_SAT)
  return rgbToHex(hslToRgb({ h: hue, s: Math.min(sat, 0.9), l: ACCENT_LIGHTNESS }))
}

// Wählt aus einem Verlauf den kräftigeren Farbton als Akzent-Basis.
function accentBaseOf (theme) {
  if (theme.type === 'solid') return theme.color
  const fromS = rgbToHsl(hexToRgb(theme.from)).s
  const toS = rgbToHsl(hexToRgb(theme.to)).s
  return toS > fromS ? theme.to : theme.from
}

// Repräsentative Hintergrundfarbe (für die On-Background-Textfarbe).
// Bei Verläufen die Mischung beider Stops.
export function backgroundReference (theme) {
  return theme.type === 'solid' ? theme.color : mix(theme.from, theme.to, 0.5)
}

// Stützstellen des Hintergrunds (Vollton: 1 Punkt, Verlauf: beide Stops + Mitte).
function backgroundSamples (theme) {
  if (theme.type === 'solid') return [theme.color]
  return [theme.from, mix(theme.from, theme.to, 0.5), theme.to]
}

// Wählt die Textfarbe (hell/dunkel), deren SCHLECHTESTER Kontrast über den
// gesamten Verlauf am besten ist. Verhindert, dass ein einzelner heller oder
// dunkler Stop den Text am jeweils anderen Ende unlesbar macht (der bisherige
// reine 50/50-Mittelwert konnte das nicht abfangen).
export function readableTextOnTheme (theme) {
  const samples = backgroundSamples(theme)
  const worst = (text) => Math.min(...samples.map((s) => contrastRatio(s, text)))
  return worst(LIGHT_TEXT) >= worst(DARK_TEXT) ? LIGHT_TEXT : DARK_TEXT
}

// Erzeugt das komplette abgeleitete Farbset für ein Theme.
// overrides.accent / overrides.onBg (falls gesetzt) haben Vorrang.
export function deriveThemeColors (theme) {
  const overrides = theme.overrides || {}

  const accent = overrides.accent || normalizeAccent(accentBaseOf(theme))
  const accentHsl = rgbToHsl(hexToRgb(accent))
  const secondary = rgbToHex(hslToRgb({ h: accentHsl.h, s: accentHsl.s, l: Math.min(accentHsl.l + 0.08, 0.72) }))
  const onAccent = readableTextOn(accent)

  // Hover-Variante des Akzents: bei dunklen Akzenten aufhellen, bei sehr hellen
  // leicht abdunkeln – damit Hover auf jedem Theme sichtbar ist.
  const hoverL = accentHsl.l >= 0.6 ? accentHsl.l - 0.1 : accentHsl.l + 0.1
  const accentHover = rgbToHex(hslToRgb({ h: accentHsl.h, s: accentHsl.s, l: Math.max(0, Math.min(1, hoverL)) }))

  const onBg = overrides.onBg || readableTextOnTheme(theme)

  return {
    accent,
    accentHover,
    secondary,
    onAccent,
    onBg
  }
}

// CSS-Wert für den Hintergrund (Verlauf oder einfarbig).
export function backgroundCss (theme) {
  if (theme.type === 'solid') return theme.color
  return `linear-gradient(${theme.direction}, ${theme.from}, ${theme.to})`
}
