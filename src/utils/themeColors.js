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
//
// Barrierefreiheit (WCAG 2.1 AA): Jede abgeleitete Farbe wird gegen ihren
// tatsächlichen Untergrund auf 4,5:1 nachgerechnet, über alle Stellen eines
// Verlaufs. Beschriftung auf dem Akzent, Akzent als Text auf den Flächen,
// Schrift auf den Flächen und ein Halo für Text direkt auf dem Hintergrund.

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

// ---- Flächen (Acryl) ---------------------------------------------------
//
// Karten, Dialoge, Menüs und Spielflächen liegen als dunkel getönte, leicht
// durchscheinende Fläche über dem Theme-Hintergrund. Für die Kontrastrechnung
// zählt die Farbe, die dabei tatsächlich entsteht: Grundton der Fläche mit
// ihrer Deckkraft über jeder Stelle des Hintergrunds gemischt.

// Grundton der Acryl-Flächen (entspricht rgb(20 20 24), siehe app.scss).
export const SURFACE_BASE = '#141418'
// Deckkraft der Fläche: 0.72 ist der gewohnte Look. Über sehr hellen
// Hintergründen wird die Fläche damit mittelgrau (über Weiß etwa #565659),
// und weder gedämpfte Schrift noch die Akzentfarbe als Text kommen dort
// vernünftig auf 4,5:1. Deshalb wird die Deckkraft je Theme nur so weit
// angehoben, bis die hellste Stelle der Fläche dunkel genug ist.
const SURFACE_ALPHA_MIN = 0.72
const SURFACE_ALPHA_MAX = 0.86
// Höchste relative Luminanz, die eine Fläche an ihrer hellsten Stelle haben
// darf. 0.05 entspricht etwa #3f3f42 und lässt Weiß rund 9:1.
const SURFACE_MAX_LUMINANCE = 0.05
// Verschachtelte Flächen und Hover-Zustände legen bis zu 6 % Weiß darüber
// (--surface-bg-weak, .card-slot, .score-manage-preview). Text muss auch
// darauf noch lesbar sein, deshalb wird diese Variante mitgeprüft.
const SURFACE_WEAK_OVERLAY = 0.06

// Mindestkontraste (WCAG 2.1 AA, normaler Text). Für Farben, die erst im
// Browser durch Überlagerung entstehen, etwas Luft für Rundung und Blur.
const MIN_CONTRAST = 4.5
const MIN_CONTRAST_ON_SURFACE = 4.6

// Schrift auf allen dunklen Flächen und gedämpfte Variante für Nebentexte.
export const ON_SURFACE = LIGHT_TEXT
const ON_SURFACE_MUTED_BASE = '#BDBDBD'

// Semantische Farben (Quasar-Palette, siehe app.scss). Als Füllung bleiben sie
// unverändert; Beschriftung darauf und ihre Textvarianten auf den Flächen
// werden wie beim Akzent nachgerechnet.
export const SEMANTIC_POSITIVE = '#21BA45'
export const SEMANTIC_NEGATIVE = '#C10015'
export const SEMANTIC_WARNING = '#F2C037'

// Stützstellen des Hintergrunds (Vollton: 1 Punkt, Verlauf: 9 Punkte). Mehr
// als die beiden Enden, weil die Luminanz entlang eines sRGB-Verlaufs nicht
// zwingend gleichmäßig steigt oder fällt.
function backgroundSamples (theme) {
  if (theme.type === 'solid') return [theme.color]
  const points = []
  for (let i = 0; i <= 8; i++) points.push(mix(theme.from, theme.to, i / 8))
  return points
}

// CSS `saturate(1.5)` aus dem backdrop-filter der Flächen. Browser rechnen das
// je nach Filterpfad in sRGB oder linearem RGB; beide Fassungen werden
// geprüft, es zählt die ungünstigere.
const SATURATE_AMOUNT = 1.5
function saturate (hex, linear) {
  const s = SATURATE_AMOUNT
  const toLin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
  const toSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055)
  const { r, g, b } = hexToRgb(hex)
  let [R, G, B] = [r / 255, g / 255, b / 255]
  if (linear) [R, G, B] = [toLin(R), toLin(G), toLin(B)]
  const clamp = (v) => Math.max(0, Math.min(1, v))
  let out = [
    clamp((0.213 + 0.787 * s) * R + (0.715 - 0.715 * s) * G + (0.072 - 0.072 * s) * B),
    clamp((0.213 - 0.213 * s) * R + (0.715 + 0.285 * s) * G + (0.072 - 0.072 * s) * B),
    clamp((0.213 - 0.213 * s) * R + (0.715 - 0.715 * s) * G + (0.072 + 0.928 * s) * B)
  ]
  if (linear) out = out.map(toSrgb)
  return rgbToHex({ r: out[0] * 255, g: out[1] * 255, b: out[2] * 255 })
}

// Alles, was hinter einer Fläche liegen kann: Hintergrund-Stützstellen, jeweils
// auch in der gesättigten Fassung des backdrop-filters.
function backdropSamples (theme) {
  const out = []
  for (const bg of backgroundSamples(theme)) {
    out.push(bg, saturate(bg, false), saturate(bg, true))
  }
  return out
}

// Deckkraft der Fläche für ein Theme (siehe SURFACE_ALPHA_*).
export function surfaceAlphaFor (theme) {
  const backdrops = backdropSamples(theme)
  for (let a = SURFACE_ALPHA_MIN; a < SURFACE_ALPHA_MAX; a += 0.01) {
    const alpha = Math.round(a * 100) / 100
    const brightest = Math.max(...backdrops.map((bg) => relativeLuminance(mix(bg, SURFACE_BASE, alpha))))
    if (brightest <= SURFACE_MAX_LUMINANCE) return alpha
  }
  return SURFACE_ALPHA_MAX
}

// Alle Farben, die eine Fläche dieses Themes annehmen kann (Fläche selbst und
// mit schwacher Aufhellung durch verschachtelte Flächen/Hover).
export function surfaceSamples (theme, alpha = surfaceAlphaFor(theme)) {
  const out = []
  for (const bg of backdropSamples(theme)) {
    const surface = mix(bg, SURFACE_BASE, alpha)
    out.push(surface, mix(surface, '#FFFFFF', SURFACE_WEAK_OVERLAY))
  }
  return out
}

function worstContrast (hex, samples) {
  return Math.min(...samples.map((s) => contrastRatio(hex, s)))
}

// Hellt eine Farbe im HSL-Raum (Farbton und Sättigung bleiben) gerade so weit
// auf, dass sie auf allen übergebenen (dunklen) Untergründen den Mindest-
// kontrast erreicht. Liefert die Ausgangsfarbe, wenn sie schon reicht.
function lightenUntilReadable (hex, samples, minContrast) {
  if (worstContrast(hex, samples) >= minContrast) return hex
  const hsl = rgbToHsl(hexToRgb(hex))
  for (let l = hsl.l; l <= 1.0001; l += 0.005) {
    const candidate = rgbToHex(hslToRgb({ h: hsl.h, s: hsl.s, l: Math.min(l, 1) }))
    if (worstContrast(candidate, samples) >= minContrast) return candidate
  }
  return '#FFFFFF'
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

// Bei der festen Helligkeit 0.55 gibt es Farbtöne (mittleres Blau, Violett),
// auf denen weder helle noch dunkle Beschriftung 4,5:1 schafft. Dann wird die
// Helligkeit des Akzents nachgeführt: für helle Schrift abdunkeln, für dunkle
// aufhellen, und zwar in die Richtung mit der kleineren Verschiebung. Der
// Farbton bleibt. Liefert Akzent und passende Beschriftung.
function ensureLabelContrast (hex) {
  const label = readableTextOn(hex)
  if (contrastRatio(hex, label) >= MIN_CONTRAST) return { accent: hex, onAccent: label }
  const hsl = rgbToHsl(hexToRgb(hex))
  const at = (l) => rgbToHex(hslToRgb({ h: hsl.h, s: hsl.s, l }))
  let darker = null
  for (let l = hsl.l; l >= 0; l -= 0.005) {
    if (contrastRatio(at(l), LIGHT_TEXT) >= MIN_CONTRAST) { darker = { l, accent: at(l), onAccent: LIGHT_TEXT }; break }
  }
  let lighter = null
  for (let l = hsl.l; l <= 1; l += 0.005) {
    if (contrastRatio(at(l), DARK_TEXT) >= MIN_CONTRAST) { lighter = { l, accent: at(l), onAccent: DARK_TEXT }; break }
  }
  const pick = !lighter || (darker && hsl.l - darker.l <= lighter.l - hsl.l) ? darker : lighter
  return { accent: pick.accent, onAccent: pick.onAccent }
}

// Verschiebt die Helligkeit eines Akzents weg von seiner Beschriftung (bei
// heller Schrift dunkler, bei dunkler heller). So bleibt die Beschriftung auf
// Hover- und Sekundärvariante mindestens so gut lesbar wie auf dem Akzent.
function shiftAwayFromLabel (hex, onAccent, amount) {
  const hsl = rgbToHsl(hexToRgb(hex))
  const l = onAccent === LIGHT_TEXT ? hsl.l - amount : hsl.l + amount
  return rgbToHex(hslToRgb({ h: hsl.h, s: hsl.s, l: Math.max(0, Math.min(1, l)) }))
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

// Wählt die Textfarbe (hell/dunkel), deren SCHLECHTESTER Kontrast über den
// gesamten Verlauf am besten ist. Verhindert, dass ein einzelner heller oder
// dunkler Stop den Text am jeweils anderen Ende unlesbar macht (der bisherige
// reine 50/50-Mittelwert konnte das nicht abfangen).
export function readableTextOnTheme (theme) {
  const samples = backgroundSamples(theme)
  const worst = (text) => worstContrast(text, samples)
  return worst(LIGHT_TEXT) >= worst(DARK_TEXT) ? LIGHT_TEXT : DARK_TEXT
}

// Bei Verläufen von hell nach dunkel erreicht keine Schriftfarbe auf der
// ganzen Fläche 4,5:1. Text, der direkt auf dem Hintergrund liegt, bekommt
// dann einen Halo in der Gegenfarbe: ein dichter, weicher Schatten direkt um
// die Buchstaben, der den Hintergrund dahinter abdeckt. Themes, bei denen die
// Schrift überall reicht, bleiben ohne Halo.
function haloFor (onBg, theme) {
  if (worstContrast(onBg, backgroundSamples(theme)) >= MIN_CONTRAST) return 'none'
  const c = readableTextOn(onBg)
  return `0 0 1px ${c}, 0 0 2px ${c}, 0 0 3px ${c}, 0 0 6px ${c}, 0 0 10px ${c}`
}

// Erzeugt das komplette abgeleitete Farbset für ein Theme.
// overrides.accent / overrides.onBg (falls gesetzt) haben Vorrang. Ein eigener
// Akzent wird dabei nur so weit in der Helligkeit nachgeführt, wie es für eine
// lesbare Beschriftung nötig ist.
export function deriveThemeColors (theme) {
  const overrides = theme.overrides || {}

  const { accent, onAccent } = ensureLabelContrast(overrides.accent || normalizeAccent(accentBaseOf(theme)))
  const secondary = shiftAwayFromLabel(accent, onAccent, 0.08)
  // Hover-Variante: sichtbar anders, aber immer in die Richtung, in der die
  // Beschriftung kontrastreicher wird (nie unter 4,5:1 beim Überfahren).
  const accentHover = shiftAwayFromLabel(accent, onAccent, 0.1)

  const onBg = overrides.onBg || readableTextOnTheme(theme)
  const onBgHalo = haloFor(onBg, theme)

  const surfaceAlpha = surfaceAlphaFor(theme)
  const surfaces = surfaceSamples(theme, surfaceAlpha)
  const { r, g, b } = hexToRgb(SURFACE_BASE)
  const surfaceBg = `rgba(${r}, ${g}, ${b}, ${surfaceAlpha})`
  const onSurface = ON_SURFACE
  const onSurfaceMuted = lightenUntilReadable(ON_SURFACE_MUTED_BASE, surfaces, MIN_CONTRAST_ON_SURFACE)
  // Akzent als Text-/Iconfarbe auf Flächen: gleicher Farbton, so weit
  // aufgehellt, dass er auf jeder Stelle der Fläche lesbar ist.
  const accentText = lightenUntilReadable(accent, surfaces, MIN_CONTRAST_ON_SURFACE)
  // Erfolg/Fehler/Warnung als Textfarbe auf Flächen (z. B. Hinweiszeilen,
  // Fehlermeldungen unter Feldern): gleicher Farbton, nötigenfalls aufgehellt.
  // Das Grün (#21BA45) reicht auf den aufgehellten Flächen heller Themes
  // nicht ganz, das Quasar-Rot (#C10015) auf keiner Fläche.
  const positiveText = lightenUntilReadable(SEMANTIC_POSITIVE, surfaces, MIN_CONTRAST_ON_SURFACE)
  const negativeText = lightenUntilReadable(SEMANTIC_NEGATIVE, surfaces, MIN_CONTRAST_ON_SURFACE)
  const warningText = lightenUntilReadable(SEMANTIC_WARNING, surfaces, MIN_CONTRAST_ON_SURFACE)
  // Beschriftung auf grüner Füllung: Weiß kommt nur auf 2,6:1, Dunkel auf 7,2:1.
  const onPositive = readableTextOn(SEMANTIC_POSITIVE)

  return {
    accent,
    accentHover,
    secondary,
    onAccent,
    accentText,
    onBg,
    onBgHalo,
    surfaceBg,
    surfaceAlpha,
    onSurface,
    onSurfaceMuted,
    positiveText,
    negativeText,
    warningText,
    onPositive
  }
}

// CSS-Wert für den Hintergrund (Verlauf oder einfarbig).
export function backgroundCss (theme) {
  if (theme.type === 'solid') return theme.color
  return `linear-gradient(${theme.direction}, ${theme.from}, ${theme.to})`
}
