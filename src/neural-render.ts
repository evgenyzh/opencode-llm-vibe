/** Neural is a readable terminal diagram, not a half-block particle field. */
import { bg, fg, StyledText, type TextChunk } from "@opentui/core"
import { mixRgb, paletteColor, rgbToHex, type Palette, type Rgb } from "./mood.js"
import type { Caption, CaptionColors, RenderedSquare } from "./render.js"
import type { Simulation } from "./simulation.js"
import { neuralColumnX, resizeNeural } from "./neural.js"

const clamp = (value: number): number => Math.max(0, Math.min(1, value))

const luminance = (rgb: Rgb): number => {
  const linear = (v: number): number => v <= 10.31475 ? v / 3294.6 : ((v / 255 + 0.055) / 1.055) ** 2.4
  return 0.2126 * linear(rgb.r) + 0.7152 * linear(rgb.g) + 0.0722 * linear(rgb.b)
}

/** Prefer hue-preserving brightness adjustment over blending toward grey. */
export function inkFor(theme: CaptionColors): (color: Rgb) => Rgb {
  const surface = luminance(theme.background)
  const contrast = (candidate: Rgb): number => {
    const value = luminance(candidate)
    return (Math.max(value, surface) + 0.05) / (Math.min(value, surface) + 0.05)
  }
  return (color: Rgb): Rgb => {
    // Decorative graphics need less contrast than text; avoid bleaching vivid blue.
    const minimum = 2.5
    if (contrast(color) >= minimum) return color
    const peak = Math.max(color.r, color.g, color.b)
    const brighter = peak > 0 ? { r: color.r * 255 / peak, g: color.g * 255 / peak, b: color.b * 255 / peak } : color
    const darkSurface = surface < 0.18
    const anchor = darkSurface ? brighter : { r: 0, g: 0, b: 0 }
    const target = contrast(anchor) >= minimum ? anchor : darkSurface ? { r: 255, g: 255, b: 255 } : anchor
    const source = target === anchor ? color : brighter
    // The path to the target has monotonic luminance. Starting below the
    // required contrast, binary search finds the same first 1% step as the scan.
    let low = 0, high = 100
    while (low < high) {
      const middle = Math.floor((low + high) / 2)
      if (contrast(mixRgb(source, target, middle / 100)) >= minimum) high = middle
      else low = middle + 1
    }
    const candidate = mixRgb(source, target, low / 100)
    return contrast(candidate) >= minimum ? candidate : target
  }
}

export function renderNeural(
  s: Simulation,
  palette: Palette,
  theme: CaptionColors,
  caption?: Caption,
  opacity = 1,
): RenderedSquare {
  const w = s.width, h = s.height / 2
  const lines = caption?.lines.slice(0, 2) ?? []
  const n = resizeNeural(s.neural, w, h - lines.length)
  const alpha = clamp(opacity)
  const background = rgbToHex(theme.background)
  const fallback = paletteColor(palette, 0.85)
  const colorCache = new Map<string, string>()
  const ink = inkFor(theme)
  const neutral = rgbToHex(mixRgb(theme.background, theme.text, alpha * 0.8))
  const chars = Array.from({ length: h }, () => Array<string>(w).fill(" "))
  const inks = Array.from({ length: h }, () => Array<string>(w).fill(neutral))
  const put = (x: number, y: number, text: string, color = neutral): void => {
    if (y < 0 || y >= h) return
    Array.from(text).forEach((char, i) => {
      if (x + i < 0 || x + i >= w) return
      chars[y]![x + i] = alpha > 0 ? char : " "
      inks[y]![x + i] = color
    })
  }
  const tint = (index: number, value: number): string => {
    const color = n.colorInitialized
      ? { r: n.colors[index * 3]!, g: n.colors[index * 3 + 1]!, b: n.colors[index * 3 + 2]! }
      : fallback
    const level = Math.round(clamp(value) * 15)
    const key = `${rgbToHex(color)}:${level}`
    const cached = colorCache.get(key)
    if (cached) return cached
    const intensity = level === 0 ? 0.42 : 0.65 + 0.35 * Math.sqrt(level / 15)
    const result = rgbToHex(mixRgb(theme.background, ink(color), alpha * intensity))
    colorCache.set(key, result)
    return result
  }
  const positions = Array.from({ length: n.columns }, (_, col) => neuralColumnX(col, n.columns, w))
  for (let col = 0; col < n.columns; col++) for (let row = 0; row < n.rows; row++) {
    const index = col * n.rows + row
    const value = n.nodes[index]!
    if (col === 0 || col === n.columns - 1) {
      put(positions[col]!, row, value > 0.45 ? "▣" : value > 0.08 ? "▫" : "·",
        rgbToHex(mixRgb(theme.background, theme.text, alpha * (0.35 + value * 0.65))))
    } else {
      put(positions[col]!, row, value > 0.32 ? "█" : value > 0.08 ? "▓" : "▒", tint(index, value))
    }
  }
  lines.forEach((line, i) => put(Math.floor((w - Array.from(line).length) / 2), h - lines.length + i, line,
    rgbToHex(mixRgb(theme.background, theme.text, alpha))))

  const chunks: TextChunk[] = []
  const chunkCache = new Map<string, TextChunk>()
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const color = inks[y]![x]!, char = chars[y]![x]!
      const key = `${color}:${char}`
      let chunk = chunkCache.get(key)
      if (!chunk) {
        chunk = fg(color)(bg(background)(char))
        chunkCache.set(key, chunk)
      }
      chunks.push(chunk)
    }
    if (y < h - 1) chunks.push(fg(neutral)("\n"))
  }
  return { rows: chars.map((row) => row.join("")), text: new StyledText(chunks) }
}
