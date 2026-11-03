import { describe, expect, it } from "vitest"
import {
  blendPalettes,
  buildPalette,
  colorToRgb,
  darken,
  EMPTY_PALETTE,
  FALLBACK_COLORS,
  MAX_GLYPH,
  MAX_WORDS,
  paletteColor,
  parseColor,
  parseVibe,
  rgbToHex,
  type Mood,
} from "../src/mood.js"

function setMood(input: unknown): Mood {
  const parsed = parseVibe(input)
  if (!parsed || parsed.kind !== "set") throw new Error("expected a set result")
  return parsed.mood
}

describe("parseColor", () => {
  it("normalizes #rgb and #rrggbb", () => {
    expect(parseColor("#ABC")).toBe("#aabbcc")
    expect(parseColor(" #112233 ")).toBe("#112233")
  })

  it("rejects non-hex input", () => {
    expect(parseColor("red")).toBeUndefined()
    expect(parseColor("#abcd")).toBeUndefined()
    expect(parseColor(42)).toBeUndefined()
  })
})

describe("parseVibe", () => {
  it("parses a minimal set call", () => {
    expect(parseVibe({ colors: ["#abc"], energy: 0.4 })).toEqual({
      kind: "set",
      mood: { colors: ["#aabbcc"], energy: 0.4 },
    })
  })

  it("defaults energy and keeps words and glyph", () => {
    const mood = setMood({ colors: ["#111", "#f00"], words: "  hello   world ", glyph: "✦" })
    expect(mood.colors).toEqual(["#111111", "#ff0000"])
    expect(mood.energy).toBe(0.5)
    expect(mood.words).toBe("hello world")
    expect(mood.glyph).toBe("✦")
  })

  it("truncates to four unique colors", () => {
    const mood = setMood({
      colors: ["#111", "#222", "#333", "#444", "#555"],
      energy: 1,
    })
    expect(mood.colors).toHaveLength(4)
    expect(mood.colors).toEqual(["#111111", "#222222", "#333333", "#444444"])
  })

  it("uses the fallback palette when only other fields are present", () => {
    const mood = setMood({ colors: ["not-a-color"], words: "calm", energy: 0.2 })
    expect(mood.colors).toEqual([...FALLBACK_COLORS])
    expect(mood.words).toBe("calm")
  })

  it("returns undefined for an empty or invalid call", () => {
    expect(parseVibe(undefined)).toBeUndefined()
    expect(parseVibe(null)).toBeUndefined()
    expect(parseVibe("mood")).toBeUndefined()
    expect(parseVibe([])).toBeUndefined()
    expect(parseVibe({})).toBeUndefined()
    expect(parseVibe({ colors: [], words: "" })).toBeUndefined()
    expect(parseVibe({ colors: ["nope"] })).toBeUndefined()
  })

  it("clamps energy", () => {
    expect(setMood({ colors: ["#000"], energy: -3 }).energy).toBe(0)
    expect(setMood({ colors: ["#000"], energy: 9 }).energy).toBe(1)
    expect(setMood({ colors: ["#000"], energy: Number.NaN }).energy).toBe(0.5)
  })

  it("strips control characters from words", () => {
    const mood = setMood({ colors: ["#000"], words: "a\u0000b\u001b[31mc\n d" })
    expect(mood.words).toBe("a b [31mc d")
    expect(mood.words).not.toMatch(/[\u0000-\u001f]/)
  })

  it("limits words and glyph length", () => {
    const mood = setMood({
      colors: ["#000"],
      words: "x".repeat(MAX_WORDS + 20),
      glyph: "✦✦✦✦✦✦✦✦✦✦",
    })
    expect(Array.from(mood.words ?? "")).toHaveLength(MAX_WORDS)
    expect(mood.words?.endsWith("…")).toBe(true)
    expect(Array.from(mood.glyph ?? "")).toHaveLength(MAX_GLYPH)
  })

  it("removes control and escape bytes from glyph", () => {
    const mood = setMood({ colors: ["#000"], glyph: "\u001b[31m✦" })
    expect(mood.glyph).not.toContain("\u001b")
    expect(mood.glyph).toContain("✦")
  })

  it("prioritizes clear over other fields", () => {
    expect(parseVibe({ clear: true, colors: ["#000"], words: "ignored" })).toEqual({ kind: "clear" })
  })

  it("does not clear for a non-true clear value", () => {
    const parsed = parseVibe({ clear: false, colors: ["#000"], energy: 0 })
    expect(parsed?.kind).toBe("set")
  })
})

describe("palette", () => {
  it("builds a fixed-length palette from one color", () => {
    const palette = buildPalette(["#3366ff"])
    expect(palette).toHaveLength(8)
    expect(palette[0]).not.toEqual(palette[7])
  })

  it("maps values to the palette endpoints", () => {
    const palette = buildPalette(["#000", "#fff"])
    expect(paletteColor(palette, -1)).toEqual(palette[0])
    expect(paletteColor(palette, 2)).toEqual(palette.at(-1))
  })

  it("keeps the empty palette dark", () => {
    expect(EMPTY_PALETTE).toHaveLength(8)
    for (const color of EMPTY_PALETTE) {
      expect(color.r + color.g + color.b).toBeLessThan(60)
    }
  })

  it("blends palettes and rounds hex values", () => {
    const blended = blendPalettes(buildPalette(["#000"]), buildPalette(["#fff"]), 0.5)
    expect(blended).toHaveLength(8)
    expect(blended.every((color) => color.r >= 0 && color.r <= 255)).toBe(true)
    expect(rgbToHex({ r: 1.4, g: 2.5, b: 300 })).toBe("#0103ff")
    expect(rgbToHex(darken({ r: 200, g: 200, b: 200 }, 0.5))).toBe("#646464")
  })

  it("round-trips hex colors", () => {
    expect(rgbToHex(colorToRgb("#123456"))).toBe("#123456")
  })
})
