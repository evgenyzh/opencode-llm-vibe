/** Mood protocol, validation, and palette helpers. */

export interface Mood {
  /** 1-4 lowercase hex colors, darkest first, hottest last. */
  readonly colors: readonly string[]
  /** 1-3 words shown inside the square. */
  readonly words?: string
  /** 0..1. Drives motion and turbulence. */
  readonly energy: number
  /** Short pseudo-graphic accent. */
  readonly glyph?: string
}

export type VibeInput =
  | { readonly kind: "set"; readonly mood: Mood }
  | { readonly kind: "clear" }

export interface Rgb {
  readonly r: number
  readonly g: number
  readonly b: number
}

/** Fixed-length palette sampled from the model's colors. */
export type Palette = readonly Rgb[]

export const DEFAULT_ENERGY = 0.5
export const MAX_COLORS = 4
export const MAX_WORDS = 80
export const MAX_GLYPH = 8
export const PALETTE_SIZE = 8

/** Semantic palettes for models that prefer a name over raw hex colors. */
export const PRESETS = {
  calm: ["#08131f", "#1f6f78", "#8fd6c9"],
  focus: ["#0b1026", "#3d5afe", "#ffb74d"],
  warm: ["#1f0a12", "#a63d40", "#ffb27a"],
  alert: ["#1a0505", "#d7263d", "#ffd166"],
  playful: ["#160b2b", "#9b5de5", "#f15bb5", "#4adede"],
  tired: ["#0d0f14", "#343b4a", "#7d8496"],
} as const satisfies Record<string, readonly string[]>

export type PresetName = keyof typeof PRESETS

export const PRESET_NAMES = [
  "calm",
  "focus",
  "warm",
  "alert",
  "playful",
  "tired",
] as const satisfies readonly PresetName[]

/** Used when a call has words/energy/glyph but no valid colors. */
export const FALLBACK_COLORS = ["#1b1b2f", "#4b3f72", "#c86b85"] as const

/** JSON Schema for the `vibe` tool input. Kept compact on purpose. */
export const VIBE_INPUT_SCHEMA = {
  type: "object",
  properties: {
    clear: { type: "boolean" },
    colors: {
      type: "array",
      items: { type: "string" },
      minItems: 1,
      maxItems: MAX_COLORS,
    },
    preset: { type: "string", enum: PRESET_NAMES },
    words: { type: "string", maxLength: MAX_WORDS },
    energy: { type: "number", minimum: 0, maximum: 1 },
    glyph: { type: "string", maxLength: MAX_GLYPH },
  },
  additionalProperties: false,
} as const

const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/g
const HEX3 = /^#([0-9a-f]{3})$/i
const HEX6 = /^#([0-9a-f]{6})$/i
const GLYPH_CHAR = /[\p{L}\p{N}\p{P}\p{S}]/u

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function truncate(value: string, max: number): string {
  const chars = Array.from(value)
  if (chars.length <= max) return value
  if (max <= 1) return chars.slice(0, max).join("")
  return `${chars.slice(0, max - 1).join("")}…`
}

function sanitizeWords(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const cleaned = value.replace(CONTROL_CHARS, " ").replace(/\s+/g, " ").trim()
  return cleaned ? truncate(cleaned, MAX_WORDS) : undefined
}

function sanitizeGlyph(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const chars = Array.from(value).filter((char) => GLYPH_CHAR.test(char))
  const glyph = chars.slice(0, MAX_GLYPH).join("")
  return glyph || undefined
}

function resolvePreset(value: unknown): readonly string[] | undefined {
  if (typeof value !== "string" || !Object.hasOwn(PRESETS, value)) return undefined
  return PRESETS[value as PresetName]
}

export function parseColor(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const input = value.trim()
  const short = HEX3.exec(input)
  if (short) {
    const [r, g, b] = short[1]!.toLowerCase()
    return `#${r}${r}${g}${g}${b}${b}`
  }
  const long = HEX6.exec(input)
  return long ? `#${long[1]!.toLowerCase()}` : undefined
}

export function colorToRgb(value: string): Rgb {
  const hex = parseColor(value) ?? "#000000"
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  }
}

export function rgbToHex(color: Rgb): string {
  const channel = (value: number): string =>
    Math.round(clamp(value, 0, 255)).toString(16).padStart(2, "0")
  return `#${channel(color.r)}${channel(color.g)}${channel(color.b)}`
}

export function mixRgb(a: Rgb, b: Rgb, amount: number): Rgb {
  const t = clamp(amount, 0, 1)
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  }
}

export function darken(color: Rgb, amount: number): Rgb {
  return mixRgb(color, { r: 0, g: 0, b: 0 }, amount)
}

export function lighten(color: Rgb, amount: number): Rgb {
  return mixRgb(color, { r: 255, g: 255, b: 255 }, amount)
}

function resample(anchors: readonly Rgb[]): Palette {
  if (anchors.length === 0) return [colorToRgb("#000000")]
  const result: Rgb[] = []
  for (let index = 0; index < PALETTE_SIZE; index += 1) {
    const position = (index / (PALETTE_SIZE - 1)) * (anchors.length - 1)
    const left = Math.floor(position)
    const right = Math.min(anchors.length - 1, left + 1)
    const fraction = position - left
    result.push(mixRgb(anchors[left]!, anchors[right]!, fraction))
  }
  return result
}

/**
 * Builds a fixed-length dark-to-hot palette.
 * 1 color gets dark/light derivatives; 2-4 colors become gradient anchors.
 */
export function buildPalette(colors: readonly string[]): Palette {
  const parsed = colors
    .map((color) => parseColor(color))
    .filter((color): color is string => color !== undefined)
    .slice(0, MAX_COLORS)
  const source = parsed.length > 0 ? parsed : [...FALLBACK_COLORS]
  const rgb = source.map(colorToRgb)

  if (rgb.length === 1) {
    const only = rgb[0]!
    return resample([darken(only, 0.62), darken(only, 0.25), only, lighten(only, 0.3)])
  }
  if (rgb.length === 2) {
    return resample([darken(rgb[0]!, 0.5), rgb[0]!, rgb[1]!, lighten(rgb[1]!, 0.15)])
  }
  if (rgb.length === 3) {
    return resample([darken(rgb[0]!, 0.55), rgb[0]!, rgb[1]!, rgb[2]!])
  }
  return resample([darken(rgb[0]!, 0.55), rgb[0]!, rgb[1]!, rgb[2]!, rgb[3]!])
}

export const EMPTY_PALETTE: Palette = resample([
  colorToRgb("#040507"),
  colorToRgb("#080a0f"),
  colorToRgb("#0d1017"),
])

export function paletteColor(palette: Palette, value: number): Rgb {
  if (palette.length === 0) return { r: 0, g: 0, b: 0 }
  const position = clamp(value, 0, 1) * (palette.length - 1)
  const left = Math.floor(position)
  const right = Math.min(palette.length - 1, left + 1)
  return mixRgb(palette[left]!, palette[right]!, position - left)
}

export function blendPalettes(from: Palette, to: Palette, amount: number): Palette {
  const length = Math.max(from.length, to.length)
  const result: Rgb[] = []
  for (let index = 0; index < length; index += 1) {
    result.push(
      mixRgb(from[index] ?? from.at(-1) ?? { r: 0, g: 0, b: 0 }, to[index] ?? to.at(-1) ?? { r: 0, g: 0, b: 0 }, amount),
    )
  }
  return result
}

/**
 * Accepts unknown tool input and returns a normalized mood, a clear action, or
 * undefined for an empty/invalid call. Never throws.
 */
export function parseVibe(input: unknown): VibeInput | undefined {
  if (!isRecord(input)) return undefined
  if (input.clear === true) return { kind: "clear" }

  const colors: string[] = []
  if (Array.isArray(input.colors)) {
    for (const value of input.colors) {
      const color = parseColor(value)
      if (color && !colors.includes(color)) colors.push(color)
      if (colors.length === MAX_COLORS) break
    }
  }

  const preset = colors.length > 0 ? undefined : resolvePreset(input.preset)
  const words = sanitizeWords(input.words)
  const glyph = sanitizeGlyph(input.glyph)
  const energy =
    typeof input.energy === "number" && Number.isFinite(input.energy)
      ? clamp(input.energy, 0, 1)
      : undefined

  if (
    colors.length === 0 &&
    preset === undefined &&
    words === undefined &&
    glyph === undefined &&
    energy === undefined
  ) {
    return undefined
  }

  return {
    kind: "set",
    mood: {
      colors: colors.length > 0 ? colors : preset ? [...preset] : [...FALLBACK_COLORS],
      ...(words === undefined ? {} : { words }),
      energy: energy ?? DEFAULT_ENERGY,
      ...(glyph === undefined ? {} : { glyph }),
    },
  }
}
