// Colour themes. A theme is five base colours; every other colour token is derived from them,
// so changing one colour (say the accent) keeps the whole page consistent.
// The chosen theme is stored in the database (meta.theme) and applied as CSS variables on <html>.
import { ref, watchEffect } from 'vue'
import { state, touch } from './store'

export interface ThemeColors { bg: string; panel: string; ink: string; accent: string; link: string }
export interface ThemeSettings {
  /** A preset id, or 'system' (Parchment by day, Candlelight by night, following the OS). */
  preset: string
  /** Colours the user changed on top of the preset. */
  colors?: Partial<ThemeColors>
  /** Heading font id. */
  font?: string
  /** Text font id: body text, menus, tabs and tables. */
  textFont?: string
  /** Decorative style: frames, heading rules, fields and HP bars (drawn in the theme's colours); plain when unset. */
  flourish?: string
}
export interface Preset { id: string; name: string; note: string; dark: boolean; colors: ThemeColors }

export const PRESETS: Preset[] = [
  { id: 'parchment', name: 'Parchment', note: 'Ink on old paper', dark: false,
    colors: { bg: '#f4ecdc', panel: '#fffaf0', ink: '#2a2420', accent: '#8c2f1f', link: '#7a2a1b' } },
  { id: 'candlelight', name: 'Candlelight', note: 'A tavern after dark', dark: true,
    colors: { bg: '#171412', panel: '#211c18', ink: '#ece4d8', accent: '#e0835f', link: '#f0a27f' } },
  { id: 'dungeon', name: 'Dungeon', note: 'Cold stone and torchlight', dark: true,
    colors: { bg: '#141619', panel: '#1d2025', ink: '#dfe2e6', accent: '#e8a33d', link: '#f2c26b' } },
  { id: 'grove', name: 'Elven Grove', note: 'Moss, birch and gold leaf', dark: false,
    colors: { bg: '#eef0e2', panel: '#fbfcf4', ink: '#1f2a1e', accent: '#2f6b3a', link: '#36703f' } },
  { id: 'arcane', name: 'Arcane Tome', note: 'Starlight on violet vellum', dark: true,
    colors: { bg: '#15121e', panel: '#1e1a2b', ink: '#e6e0f2', accent: '#a78bfa', link: '#c4b5fd' } },
  { id: 'infernal', name: 'Infernal', note: 'Brimstone and blood', dark: true,
    colors: { bg: '#120c0c', panel: '#1d1312', ink: '#f0dfd6', accent: '#e5482e', link: '#ff8a6b' } },
  { id: 'frost', name: 'Frostmaw', note: 'Glacier light and steel', dark: false,
    colors: { bg: '#e8eef3', panel: '#f8fbfd', ink: '#1b2733', accent: '#2a6496', link: '#245b8a' } },
  { id: 'feywild', name: 'Feywild', note: 'Dusk, petals and mischief', dark: false,
    colors: { bg: '#f5ecf2', panel: '#fffafd', ink: '#2b1f2b', accent: '#a23b7a', link: '#8e2f6a' } },
]

const SERIF = '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif'
/** Heading fonts: the system's first, then the ones shipped with the app (fonts/, SIL Open Font License). */
export const FONTS = [
  { id: 'book', name: 'Book', css: '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif' },
  { id: 'classic', name: 'Classic', css: 'Constantia, Cambria, Georgia, serif' },
  { id: 'scribe', name: 'Scribe', css: 'Gabriola, "Palatino Linotype", Palatino, serif' },
  { id: 'chronicle', name: 'Chronicle', css: '"Book Antiqua", "Palatino Linotype", Garamond, serif' },
  { id: 'cinzel', name: 'Cinzel', css: `"Cinzel", ${SERIF}` },
  { id: 'eb-garamond', name: 'EB Garamond', css: `"EB Garamond", ${SERIF}` },
  { id: 'cormorant', name: 'Cormorant', css: `"Cormorant Garamond", ${SERIF}` },
  { id: 'im-fell', name: 'IM Fell', css: `"IM Fell English", ${SERIF}` },
  { id: 'uncial', name: 'Uncial', css: `"Uncial Antiqua", ${SERIF}` },
  { id: 'medievalsharp', name: 'MedievalSharp', css: `"MedievalSharp", ${SERIF}` },
  { id: 'almendra', name: 'Almendra', css: `"Almendra", ${SERIF}` },
]
const SANS = '"Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif'
/** Text fonts: the system's own, then shipped ones made for reading. */
export const TEXT_FONTS = [
  { id: 'system', name: 'System', css: SANS },
  { id: 'atkinson', name: 'Atkinson Hyperlegible', css: `"Atkinson Hyperlegible", ${SANS}` },
  { id: 'alegreya', name: 'Alegreya', css: `"Alegreya", ${SERIF}` },
  { id: 'crimson-pro', name: 'Crimson Pro', css: `"Crimson Pro", ${SERIF}` },
  { id: 'lora', name: 'Lora', css: `"Lora", ${SERIF}` },
]

/** Decorative styles: how frames, heading rules, fields and HP bars are drawn. */
export const FLOURISHES = [
  { id: 'plain', name: 'Plain', note: 'Clean lines' },
  { id: 'illuminated', name: 'Illuminated', note: 'Gilded rules and scrolled corners' },
  { id: 'runecarved', name: 'Runecarved', note: 'Cut in stone: chamfers, notches and gems' },
  { id: 'wax', name: 'Wax & Ribbon', note: 'Soft paper, ribbons and wax seals' },
]

export const COLOR_LABELS: Record<keyof ThemeColors, string> = {
  bg: 'Background', panel: 'Cards and menus', ink: 'Text', accent: 'Accent', link: 'Links',
}

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')
const systemDark = ref(darkQuery.matches)

export const settings = (): ThemeSettings => state.db?.meta.theme ?? { preset: 'system' }

/** The preset that is in effect right now (resolving 'system'). */
export function activePreset(s = settings()): Preset {
  const id = s.preset === 'system' ? (systemDark.value ? 'candlelight' : 'parchment') : s.preset
  return PRESETS.find(p => p.id === id) ?? PRESETS[0]
}
export function effectiveColors(s = settings()): ThemeColors {
  return { ...activePreset(s).colors, ...s.colors }
}

// ---------- colour maths ----------
const hex = (c: string) => {
  const h = c.replace('#', '')
  const f = h.length === 3 ? h.split('').map(x => x + x).join('') : h
  return [0, 2, 4].map(i => parseInt(f.slice(i, i + 2), 16))
}
const toHex = (rgb: number[]) => '#' + rgb.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')
/** a moved t of the way towards b. */
const mix = (a: string, b: string, t: number) => { const x = hex(a), y = hex(b); return toHex(x.map((v, i) => v + (y[i] - v) * t)) }
const luminance = (c: string) => {
  const [r, g, b] = hex(c).map(v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
export const isDark = (c: string) => luminance(c) < 0.2

/** All CSS variables for a set of base colours. */
export function tokens(c: ThemeColors): Record<string, string> {
  const dark = isDark(c.bg)
  const onAccent = luminance(c.accent) > 0.35 ? '#1a1410' : '#ffffff'
  return {
    '--bg': c.bg,
    '--panel': c.panel,
    '--panel-2': mix(c.panel, c.ink, dark ? 0.05 : 0.06),
    '--ink': c.ink,
    '--ink-2': mix(c.ink, c.bg, 0.25),
    '--muted': mix(c.ink, c.bg, 0.45),
    '--line': mix(c.bg, c.ink, dark ? 0.16 : 0.13),
    '--accent': c.accent,
    '--accent-2': dark ? mix(c.accent, '#ffffff', 0.2) : mix(c.accent, c.bg, 0.22),
    '--on-accent': onAccent,
    '--link': c.link,
    '--chip': mix(mix(c.panel, c.ink, dark ? 0.08 : 0.05), c.accent, 0.06),
    '--secret-bg': mix(c.panel, c.accent, dark ? 0.12 : 0.07),
    '--secret-line': mix(c.panel, c.accent, 0.45),
    '--warn': mix(c.panel, '#e0a020', dark ? 0.16 : 0.15),
    '--sb-bg': mix(c.panel, '#e0b060', dark ? 0.04 : 0.08),
    '--sb-line': c.accent,
    '--shadow': dark ? '0 1px 2px rgb(0 0 0 / .35), 0 4px 16px rgb(0 0 0 / .3)' : '0 1px 2px rgb(60 40 20 / .07), 0 4px 16px rgb(60 40 20 / .07)',
    'color-scheme': dark ? 'dark' : 'light',
  }
}

export function applyTheme() {
  const s = settings()
  const root = document.documentElement
  for (const [k, v] of Object.entries(tokens(effectiveColors(s)))) root.style.setProperty(k, v)
  const font = FONTS.find(f => f.id === s.font) ?? FONTS[0]
  root.style.setProperty('--serif', font.css)
  const text = TEXT_FONTS.find(f => f.id === s.textFont) ?? TEXT_FONTS[0]
  root.style.setProperty('--sans', text.css)
  // the decorative style (styles/): class "fx" and data-fx="<style>" on <html>; Plain has neither. The style gallery
  // (#/styles) shows every style in boxes of its own, so the window stays plain while it's open.
  const gallery = location.hash.startsWith('#/styles')
  const fx = !gallery && FLOURISHES.some(f => f.id === s.flourish && f.id !== 'plain') ? s.flourish! : ''
  root.classList.toggle('fx', !!fx)
  if (fx) root.dataset.fx = fx; else delete root.dataset.fx
  // The browser's own UI (address bar on phones) follows the background.
  let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null
  if (!meta) { meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.append(meta) }
  meta.content = effectiveColors(s).bg
}

/** Keep the page in sync with the stored theme (and with the OS for the 'system' preset). */
export function startTheme() {
  watchEffect(() => { void JSON.stringify(state.db?.meta.theme); void systemDark.value; applyTheme() })
  darkQuery.addEventListener('change', e => { systemDark.value = e.matches })
}

export function setTheme(patch: Partial<ThemeSettings>) {
  const m = state.db!.meta
  m.theme = { ...settings(), ...patch }
  touch()
}
export function setColor(key: keyof ThemeColors, value: string) {
  setTheme({ colors: { ...settings().colors, [key]: value } })
}
