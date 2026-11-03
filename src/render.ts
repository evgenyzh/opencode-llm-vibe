/** Half-block rendering with an optional caption inside the lower square band. */

import { bg, fg, StyledText, type TextChunk } from "@opentui/core"
import { normalizeSize, sampleField } from "./field.js"
import {
  buildPalette,
  darken,
  EMPTY_PALETTE,
  lighten,
  mixRgb,
  paletteColor,
  rgbToHex,
  type Mood,
  type Palette,
} from "./mood.js"

export interface Caption {
  readonly lines: readonly string[]
  readonly textColor: string
  readonly bandColor: string
}

export interface RenderedSquare {
  readonly text: StyledText
  /** Plain rows for tests/debugging; one string per terminal row. */
  readonly rows: readonly string[]
}

export function paletteFor(mood: Mood | null): Palette {
  return mood === null ? EMPTY_PALETTE : buildPalette(mood.colors)
}

export function captionFor(mood: Mood | null, size: number): Caption | undefined {
  if (mood === null) return undefined
  const text = [mood.glyph, mood.words].filter((part): part is string => Boolean(part)).join(" ").trim()
  if (!text) return undefined

  const width = Math.max(4, normalizeSize(size) - 2)
  const lines = wrapCaption(text, width, 2)
  if (lines.length === 0) return undefined

  const palette = paletteFor(mood)
  const first = palette[0] ?? { r: 4, g: 5, b: 7 }
  const last = palette.at(-1) ?? first
  const band = darken(mixRgb(first, last, 0.18), 0.45)
  const textColor = lighten(last, 0.72)

  return {
    lines,
    textColor: rgbToHex(textColor),
    bandColor: rgbToHex(band),
  }
}

function charCount(value: string): number {
  return Array.from(value).length
}

function withEllipsis(value: string, width: number): string {
  const chars = Array.from(value)
  if (chars.length < width) return `${value}…`
  return `${chars.slice(0, Math.max(0, width - 1)).join("")}…`
}

function wrapCaption(text: string, width: number, maxLines: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ""
  let overflow = false

  for (let index = 0; index < words.length; index += 1) {
    const word = words[index]!
    const candidate = current ? `${current} ${word}` : word

    if (charCount(candidate) <= width) {
      current = candidate
      continue
    }

    if (current) {
      lines.push(current)
      current = ""
      if (lines.length === maxLines) {
        overflow = true
        break
      }
    }

    if (charCount(word) <= width) {
      current = word
      continue
    }

    lines.push(withEllipsis(word, width))
    if (lines.length === maxLines) {
      overflow = index < words.length - 1
      break
    }
  }

  if (current) {
    if (lines.length < maxLines) lines.push(current)
    else overflow = true
  }

  if (overflow && lines.length > 0) {
    const last = lines.length - 1
    lines[last] = withEllipsis(lines[last]!, width)
  }

  return lines.slice(0, maxLines)
}

/** Renders a field as `▀` cells. Caption rows replace the bottom pixel rows. */
export function renderField(
  field: Float32Array,
  size: number,
  palette: Palette,
  caption?: Caption,
): RenderedSquare {
  const n = normalizeSize(size)
  const rowCount = Math.floor(n / 2)
  const lines = caption?.lines.slice(0, rowCount) ?? []
  const captionRows = lines.length
  const pixelRows = rowCount - captionRows
  const chunks: TextChunk[] = []
  const rows: string[] = []

  const appendChunk = (chunk: TextChunk): void => {
    chunks.push(chunk)
  }

  const appendNewline = (): void => {
    appendChunk(fg("#000000")("\n"))
  }

  for (let row = 0; row < pixelRows; row += 1) {
    const topOffset = row * 2 * n
    const bottomOffset = (row * 2 + 1) * n
    for (let column = 0; column < n; column += 1) {
      const top = paletteColor(palette, field[topOffset + column] ?? 0)
      const bottom = paletteColor(palette, field[bottomOffset + column] ?? 0)
      appendChunk(fg(rgbToHex(top))(bg(rgbToHex(bottom))("▀")))
    }
    rows.push("▀".repeat(n))
    if (row < rowCount - 1) appendNewline()
  }

  if (caption) {
    lines.forEach((line, index) => {
      const width = Math.min(n, charCount(line))
      const left = Math.max(0, Math.floor((n - width) / 2))
      const right = Math.max(0, n - left - width)
      const plain = `${" ".repeat(left)}${line}${" ".repeat(right)}`
      if (left > 0) appendChunk(bg(caption.bandColor)(" ".repeat(left)))
      if (width > 0) appendChunk(bg(caption.bandColor)(fg(caption.textColor)(line)))
      if (right > 0) appendChunk(bg(caption.bandColor)(" ".repeat(right)))
      rows.push(plain)
      if (pixelRows + index < rowCount - 1) appendNewline()
    })
  }

  return { text: new StyledText(chunks), rows }
}

/** Convenience wrapper used by components and tests. */
export function renderSquare(mood: Mood | null, size: number, time: number): RenderedSquare {
  const n = normalizeSize(size)
  return renderField(sampleField(mood, time, n), n, paletteFor(mood), captionFor(mood, n))
}
