import { describe, expect, it } from "vitest"
import { captionFor, paletteFor, renderField, renderSquare } from "../src/render.js"
import { buildPalette, EMPTY_PALETTE, type Mood } from "../src/mood.js"

const COLUMNS = 24
const PIXEL_ROWS = 18
const ROWS = PIXEL_ROWS / 2

const mood: Mood = {
  colors: ["#112244", "#ff8844"],
  words: "спокойствие",
  energy: 0.4,
  glyph: "✦",
}

function displayLength(value: string): number {
  return Array.from(value).length
}

function chunkText(square: { text: { chunks: Array<{ text: string }> } }): string {
  return square.text.chunks.map((chunk) => chunk.text).join("")
}

describe("renderSquare", () => {
  it("renders a dark empty rectangle by default", () => {
    const square = renderSquare(null, COLUMNS, PIXEL_ROWS, 0)
    expect(square.rows).toHaveLength(ROWS)
    expect(square.rows.every((row) => row === "▀".repeat(COLUMNS))).toBe(true)
    expect(chunkText(square)).toBe(square.rows.join("\n"))
  })

  it("puts words inside the bottom of the rectangle with image pixels beside them", () => {
    const square = renderSquare(mood, COLUMNS, PIXEL_ROWS, 0)
    const bottom = square.rows.at(-1) ?? ""
    expect(square.rows).toHaveLength(ROWS)
    expect(bottom).toContain("спокойствие")
    expect(bottom).toContain("✦")
    expect(bottom.startsWith("▀")).toBe(true)
    expect(bottom.endsWith("▀")).toBe(true)
    expect(chunkText(square)).toBe(square.rows.join("\n"))
  })

  it("keeps every row exactly the rectangle width", () => {
    for (const [columns, pixelRows] of [
      [16, 12],
      [24, 18],
      [32, 24],
    ] as const) {
      const square = renderSquare(mood, columns, pixelRows, 0)
      expect(square.rows).toHaveLength(pixelRows / 2)
      for (const row of square.rows) expect(displayLength(row)).toBe(columns)
    }
  })

  it("wraps long words into two caption rows", () => {
    const long: Mood = {
      colors: ["#000", "#fff"],
      words: "очень длинное описание настроения",
      energy: 0.5,
    }
    const square = renderSquare(long, COLUMNS, PIXEL_ROWS, 0)
    const bottom = square.rows.slice(-2)
    expect(bottom.join(" ")).toContain("очень")
    expect(square.rows).toHaveLength(ROWS)
    expect(square.rows.every((row) => displayLength(row) === COLUMNS)).toBe(true)
  })

  it("truncates a single overlong word with an ellipsis", () => {
    const long: Mood = { colors: ["#000"], words: "x".repeat(80), energy: 0.5 }
    const caption = captionFor(long, 12)
    expect(caption?.lines).toHaveLength(1)
    expect(caption?.lines[0]?.endsWith("…")).toBe(true)
    expect(displayLength(caption?.lines[0] ?? "")).toBeLessThanOrEqual(10)
  })

  it("renders glyph-only captions", () => {
    const glyph: Mood = { colors: ["#000"], glyph: "✧", energy: 0.2 }
    const square = renderSquare(glyph, COLUMNS, PIXEL_ROWS, 0)
    expect(square.rows.at(-1)).toContain("✧")
  })

  it("never emits control characters", () => {
    const square = renderSquare(mood, COLUMNS, PIXEL_ROWS, 0)
    expect(chunkText(square)).not.toMatch(/[\u0000-\u0009\u000b-\u001f\u007f]/)
    expect(chunkText(square)).not.toContain("\u001b")
  })
})

describe("renderField", () => {
  it("renders a supplied field without needing a mood", () => {
    const field = new Float32Array(COLUMNS * PIXEL_ROWS).fill(0.5)
    const square = renderField(field, COLUMNS, PIXEL_ROWS, buildPalette(["#000", "#fff"]))
    expect(square.rows).toHaveLength(ROWS)
    expect(square.rows[0]).toBe("▀".repeat(COLUMNS))
  })

  it("reuses identical pixel chunks without changing their positions or colors", () => {
    const background = { r: 24, g: 26, b: 28 }
    const square = renderField(new Float32Array(COLUMNS * PIXEL_ROWS), COLUMNS, PIXEL_ROWS, EMPTY_PALETTE, undefined, background, undefined, true)
    expect(square.text.chunks[0]).toBe(square.text.chunks[1])
    expect(square.text.chunks[0]!.fg!.toInts().slice(0, 3)).toEqual([24, 26, 28])
    expect(chunkText(square)).toBe(square.rows.join("\n"))
  })

  it("produces identical colored chunks with and without pixel reuse", () => {
    const field = Float32Array.from({ length: COLUMNS * PIXEL_ROWS }, (_, i) => (i % 11) / 10)
    const colors = Float32Array.from(field, (_, i) => i % 2 ? 0.5 : 0.95)
    const palette = buildPalette(["#040910", "#2050ee", "#ff9900"])
    const theme = { background: { r: 20, g: 22, b: 24 }, text: { r: 220, g: 220, b: 220 } }
    const caption = captionFor(mood, COLUMNS, theme)
    const uncached = renderField(field, COLUMNS, PIXEL_ROWS, palette, caption, theme.background, colors)
    const cached = renderField(field, COLUMNS, PIXEL_ROWS, palette, caption, theme.background, colors, true)
    const signature = (square: typeof cached) => square.text.chunks.map((chunk) => [chunk.text, chunk.fg?.toInts(), chunk.bg?.toInts(), chunk.attributes])
    expect(cached.rows).toEqual(uncached.rows)
    expect(signature(cached)).toEqual(signature(uncached))
  })

  it("handles short fields by treating missing values as zero", () => {
    const square = renderField(new Float32Array(2), COLUMNS, PIXEL_ROWS, EMPTY_PALETTE)
    expect(square.rows).toHaveLength(ROWS)
  })

  it("respects a caption shorter than the available rows", () => {
    const field = new Float32Array(COLUMNS * PIXEL_ROWS).fill(0.5)
    const square = renderField(field, COLUMNS, PIXEL_ROWS, EMPTY_PALETTE, {
      lines: ["hi"],
      textColor: "#ffffff",
      bandColor: "#000000",
    })
    expect(square.rows).toHaveLength(ROWS)
    expect(square.rows.at(-1)).toContain("hi")
    expect(square.rows.at(-2)).toBe("▀".repeat(COLUMNS))
  })

  it("fades empty pixels into the supplied theme background", () => {
    const background = { r: 24, g: 26, b: 28 }
    const square = renderField(
      new Float32Array(COLUMNS * PIXEL_ROWS),
      COLUMNS,
      PIXEL_ROWS,
      buildPalette(["#000"]),
      undefined,
      background,
    )
    const chunk = square.text.chunks[0]
    expect(chunk?.fg?.toInts().slice(0, 3)).toEqual([24, 26, 28])
    expect(chunk?.bg?.toInts().slice(0, 3)).toEqual([24, 26, 28])
  })

  it("renders different palette colours at equal brightness while preserving fading", () => {
    const field = new Float32Array(COLUMNS * PIXEL_ROWS)
    const colors = new Float32Array(COLUMNS * PIXEL_ROWS)
    field[0] = field[1] = 0.8
    colors[0] = 0.5
    colors[1] = 0.95
    const background = { r: 10, g: 10, b: 10 }
    const square = renderField(field, COLUMNS, PIXEL_ROWS, buildPalette(["#101020", "#0055ff", "#ff7700"]), undefined, background, colors)
    const first = square.text.chunks[0]!.fg!.toInts()
    const second = square.text.chunks[1]!.fg!.toInts()
    expect(first[2]).toBeGreaterThan(first[0]!)
    expect(second[0]).toBeGreaterThan(second[2]!)
    expect(square.text.chunks[0]!.bg!.toInts().slice(0, 3)).toEqual([10, 10, 10])
  })

  it("uses the theme background for the empty state palette", () => {
    const background = { r: 24, g: 26, b: 28 }
    const palette = paletteFor(null, background)
    expect(palette).toHaveLength(EMPTY_PALETTE.length)
    expect(palette.every((color) => color === background)).toBe(true)
  })

  it("accepts theme colors for the caption band and text", () => {
    const caption = captionFor(mood, COLUMNS, {
      background: { r: 20, g: 20, b: 20 },
      text: { r: 240, g: 240, b: 240 },
    })
    expect(caption?.bandColor).toBe("#141414")
    expect(caption?.textColor).toBe("#f0f0f0")
  })
})
