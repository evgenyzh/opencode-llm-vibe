import { describe, expect, it } from "vitest"
import { captionFor, renderField, renderSquare } from "../src/render.js"
import { buildPalette, EMPTY_PALETTE, type Mood } from "../src/mood.js"

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
  it("renders a dark empty square by default", () => {
    const square = renderSquare(null, 20, 0)
    expect(square.rows).toHaveLength(10)
    expect(square.rows.every((row) => row === "▀".repeat(20))).toBe(true)
    expect(chunkText(square)).toBe(square.rows.join("\n"))
  })

  it("puts words inside the bottom of the square", () => {
    const square = renderSquare(mood, 20, 0)
    expect(square.rows).toHaveLength(10)
    expect(square.rows.at(-1)).toContain("спокойствие")
    expect(square.rows.at(-1)).toContain("✦")
    expect(square.rows.at(-1)).not.toContain("▀")
  })

  it("keeps every row exactly the square width", () => {
    for (const size of [12, 20, 32]) {
      const square = renderSquare(mood, size, 0)
      expect(square.rows).toHaveLength(size / 2)
      for (const row of square.rows) expect(displayLength(row)).toBe(size)
    }
  })

  it("wraps long words into two caption rows", () => {
    const long: Mood = {
      colors: ["#000", "#fff"],
      words: "очень длинное описание настроения",
      energy: 0.5,
    }
    const square = renderSquare(long, 20, 0)
    const bottom = square.rows.slice(-2)
    expect(bottom.join(" ")).toContain("очень")
    expect(square.rows).toHaveLength(10)
    expect(square.rows.every((row) => displayLength(row) === 20)).toBe(true)
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
    const square = renderSquare(glyph, 20, 0)
    expect(square.rows.at(-1)).toContain("✧")
  })

  it("never emits control characters", () => {
    const square = renderSquare(mood, 20, 0)
    expect(chunkText(square)).not.toMatch(/[\u0000-\u0009\u000b-\u001f\u007f]/)
    expect(chunkText(square)).not.toContain("\u001b")
  })
})

describe("renderField", () => {
  it("renders a supplied field without needing a mood", () => {
    const field = new Float32Array(20 * 20).fill(0.5)
    const square = renderField(field, 20, buildPalette(["#000", "#fff"]))
    expect(square.rows).toHaveLength(10)
    expect(square.rows[0]).toBe("▀".repeat(20))
  })

  it("handles short fields by treating missing values as zero", () => {
    const square = renderField(new Float32Array(2), 20, EMPTY_PALETTE)
    expect(square.rows).toHaveLength(10)
  })

  it("respects a caption shorter than the available rows", () => {
    const field = new Float32Array(20 * 20).fill(0.5)
    const square = renderField(field, 20, EMPTY_PALETTE, {
      lines: ["hi"],
      textColor: "#ffffff",
      bandColor: "#000000",
    })
    expect(square.rows).toHaveLength(10)
    expect(square.rows.at(-1)).toContain("hi")
    expect(square.rows.at(-2)).toBe("▀".repeat(20))
  })
})
