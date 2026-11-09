import { describe, expect, it } from "vitest"
import { buildPalette, mixRgb, type Rgb } from "../src/mood.js"
import { inkFor, renderNeural } from "../src/neural-render.js"
import { captionFor, type CaptionColors } from "../src/render.js"
import { advanceSimulation, createSimulation } from "../src/simulation.js"
import { advanceNeural, neuralColumnX } from "../src/neural.js"

const theme: CaptionColors = { background: { r: 28, g: 28, b: 28 }, text: { r: 220, g: 220, b: 220 } }
const palette = buildPalette(["#050510", "#3333cc", "#9999ff"])

function state(width = 24, height = 18) {
  const s = createSimulation("neural", width, height, 42)
  for (let i = 0; i < 40; i++) advanceSimulation(s, 0.1, 1, 0.6, 0.6)
  return s
}

describe("Neural diagram", () => {
  it("matches the original contrast scan for varied colors and theme surfaces", () => {
    const luminance = (rgb: Rgb): number => {
      const linear = (v: number): number => v <= 10.31475 ? v / 3294.6 : ((v / 255 + 0.055) / 1.055) ** 2.4
      return 0.2126 * linear(rgb.r) + 0.7152 * linear(rgb.g) + 0.0722 * linear(rgb.b)
    }
    const original = (color: Rgb, background: Rgb): Rgb => {
      const surface = luminance(background)
      const contrast = (candidate: Rgb): number => {
        const value = luminance(candidate)
        return (Math.max(value, surface) + 0.05) / (Math.min(value, surface) + 0.05)
      }
      if (contrast(color) >= 2.5) return color
      const peak = Math.max(color.r, color.g, color.b)
      const brighter = peak > 0 ? { r: color.r * 255 / peak, g: color.g * 255 / peak, b: color.b * 255 / peak } : color
      const darkSurface = surface < 0.18
      const anchor = darkSurface ? brighter : { r: 0, g: 0, b: 0 }
      const target = contrast(anchor) >= 2.5 ? anchor : darkSurface ? { r: 255, g: 255, b: 255 } : anchor
      const source = target === anchor ? color : brighter
      for (let step = 0; step <= 100; step++) {
        const candidate = mixRgb(source, target, step / 100)
        if (contrast(candidate) >= 2.5) return candidate
      }
      return target
    }
    let seed = 42
    const random = (): number => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
    for (const background of [theme.background, { r: 245, g: 245, b: 245 }, { r: 8, g: 34, b: 62 }, { r: 168, g: 60, b: 190 }]) {
      const ink = inkFor({ background, text: theme.text })
      for (let i = 0; i < 3000; i++) {
        const color = i === 0 ? { r: 0, g: 0, b: 0 } : { r: random() * 255, g: random() * 255, b: random() * 255 }
        expect(ink(color)).toEqual(original(color, background))
      }
    }
  })

  it("fills the area with whole glyphs without labels or arrows", () => {
    const s = state()
    const frame = renderNeural(s, palette, theme)
    expect(frame.rows.join("\n")).not.toMatch(/[A-Za-z▶→]/u)
    expect(frame.rows.filter((row) => /[▒▓█]/u.test(row))).toHaveLength(s.height / 2)
    expect(frame.rows.join("\n")).not.toContain("▀")
    expect(frame.text.chunks.map((chunk) => chunk.text).join("")).toBe(frame.rows.join("\n"))
  })

  it("reuses identical cells only within a frame and respects theme changes", () => {
    const s = state()
    const frame = renderNeural(s, palette, theme)
    expect(frame.text.chunks[1]).toBe(frame.text.chunks[3])
    const light = { background: { r: 245, g: 245, b: 245 }, text: { r: 20, g: 20, b: 20 } }
    const next = renderNeural(s, palette, light)
    expect(next.text.chunks[1]).not.toBe(frame.text.chunks[1])
    expect(next.text.chunks[1]!.bg!.toInts().slice(0, 3)).toEqual([245, 245, 245])
    expect(frame.text.chunks[1]!.bg!.toInts().slice(0, 3)).toEqual([28, 28, 28])
  })

  it("fits narrow and wide sidebars without colliding with a two-line caption", () => {
    for (const [width, height] of [[16, 18], [24, 18], [32, 20], [64, 28]]) {
      const s = state(width, height)
      const caption = captionFor({ colors: ["#fff"], energy: 0.5, words: "Думаю над задачей внимательно" }, s.width, theme)
      const frame = renderNeural(s, palette, theme, caption)
      expect(frame.rows).toHaveLength(s.height / 2)
      expect(frame.rows.every((row) => Array.from(row).length === s.width)).toBe(true)
      const diagram = frame.rows.slice(0, frame.rows.length - caption!.lines.length)
      const output = neuralColumnX(s.neural.columns - 1, s.neural.columns, s.width)
      expect(diagram.every((row) => row[0] !== " " && row[output] !== " ")).toBe(true)
      expect(diagram.every((row) => /[▒▓█]/u.test(row))).toBe(true)
      expect(diagram.join("\n")).not.toMatch(/[A-Za-z▶→]/u)
      for (const line of caption!.lines) expect(frame.rows.some((row) => row.trim() === line)).toBe(true)
    }
  })

  it("uses mood colors only inside the model", () => {
    const s = state()
    const a = renderNeural(s, palette, theme)
    const b = renderNeural(s, buildPalette(["#ff3300", "#ffcc00"]), theme)
    let changed = 0
    a.text.chunks.forEach((chunk, i) => {
      const sameColor = JSON.stringify(chunk.fg?.toInts()) === JSON.stringify(b.text.chunks[i]!.fg?.toInts())
      const x = i % (s.width + 1)
      const first = neuralColumnX(1, s.neural.columns, s.width)
      const last = neuralColumnX(s.neural.columns - 2, s.neural.columns, s.width)
      if (x < first || x > last || chunk.text.trim() === "") expect(sameColor).toBe(true)
      else if (!sameColor) changed++
    })
    expect(changed).toBeGreaterThan(0)
  })

  it("renders individual neuron and token activations instead of a column wave", () => {
    const s = createSimulation("neural", 24, 18, 42), n = s.neural
    n.nodes[2] = 1
    n.nodes[n.rows + 4] = 1
    n.nodes[(n.columns - 1) * n.rows + 5] = 1
    const rows = renderNeural(s, palette, theme).rows
    expect(rows.map((row) => row[0]).join("")).toBe("··▣······")
    const output = neuralColumnX(n.columns - 1, n.columns, s.width)
    expect(rows.map((row) => row[output]).join("")).toBe("·····▣···")
    const first = neuralColumnX(1, n.columns, s.width)
    expect(rows.map((row) => row[first]).join("")).toBe("▒▒▒▒█▒▒▒▒")
  })

  it("uses each neuron's stored colour while keeping the input and output neutral", () => {
    const s = createSimulation("neural", 24, 18, 42), n = s.neural
    advanceNeural(n, 0, 0, 0, false, () => 0.5, { r: 0, g: 30, b: 255 })
    const first = n.rows + 2, second = n.rows * 2 + 2
    n.colors.set([255, 20, 0], first * 3)
    n.nodes[first] = n.nodes[second] = 0.5
    const frame = renderNeural(s, palette, theme)
    const colorAt = (column: number): number[] => frame.text.chunks[2 * (s.width + 1) + neuralColumnX(column, n.columns, s.width)]!.fg!.toInts().slice(0, 3)
    const a = colorAt(1), b = colorAt(2)
    expect(a[0]!).toBeGreaterThan(a[2]!)
    expect(b[2]!).toBeGreaterThan(b[0]!)
    for (const column of [0, n.columns - 1]) {
      const neutral = colorAt(column)
      expect(neutral[0]).toBe(neutral[1])
      expect(neutral[1]).toBe(neutral[2])
    }
  })

  it("shows stronger accumulated weights more densely, including neutral output tokens", () => {
    const s = createSimulation("neural", 24, 18, 42), n = s.neural
    n.nodes[n.rows + 1] = 0.04
    n.nodes[n.rows + 2] = 0.2
    n.nodes[n.rows + 3] = 0.8
    n.nodes[(n.columns - 1) * n.rows + 1] = 0.2
    n.nodes[(n.columns - 1) * n.rows + 2] = 0.45
    n.nodes[(n.columns - 1) * n.rows + 3] = 0.8
    const frame = renderNeural(s, palette, theme)
    const first = neuralColumnX(1, n.columns, s.width)
    expect([1, 2, 3].map((row) => frame.rows[row]![first]).join("")).toBe("▒▓█")
    const output = neuralColumnX(n.columns - 1, n.columns, s.width)
    expect([1, 2, 3].map((row) => frame.rows[row]![output]).join("")).toBe("▫▫▣")
    const outputChunks = [1, 2, 3].map((row) => frame.text.chunks[row * (s.width + 1) + output]!)
    const levels = outputChunks.map((chunk) => chunk.fg!.toInts()[0]!)
    expect(levels[0]!).toBeLessThan(levels[1]!)
    expect(levels[1]!).toBeLessThan(levels[2]!)
  })

  it("keeps active mood colors vivid on dark and light themes without tinting tokens", () => {
    for (const surface of [28, 245]) {
      const themeColor = surface === 28 ? 220 : 20
      const colors: CaptionColors = { background: { r: surface, g: surface, b: surface }, text: { r: themeColor, g: themeColor, b: themeColor } }
      for (const color of [{ r: 0, g: 20, b: 255 }, { r: 255, g: 35, b: 10 }, { r: 240, g: 210, b: 10 }]) {
        const s = createSimulation("neural", 24, 18, 42), n = s.neural
        advanceNeural(n, 0, 0, 0, false, () => 0.5, color)
        const i = n.rows + 2
        n.nodes[i] = 0.8
        const square = renderNeural(s, palette, colors)
        const x = neuralColumnX(1, n.columns, s.width)
        const actual = square.text.chunks[2 * (s.width + 1) + x]!.fg!.toInts().slice(0, 3)
        expect(Math.max(...actual) - Math.min(...actual)).toBeGreaterThan(90)
        expect(Math.max(...actual.map((value) => Math.abs(value - surface)))).toBeGreaterThan(45)
        const input = square.text.chunks[2 * (s.width + 1)]!.fg!.toInts().slice(0, 3)
        expect(input[0]).toBe(input[1])
        expect(input[1]).toBe(input[2])
      }
    }
  })

  it("never renders connection lines, even while the network is active", () => {
    const frame = renderNeural(state(), palette, theme)
    expect(frame.rows.join("\n")).not.toMatch(/[─╲╱→▶]/u)
  })

  it("uses the same column spacing for input, internal layers and output", () => {
    for (let width = 16; width <= 64; width += 2) {
      const s = createSimulation("neural", width, 18, 42)
      const row = renderNeural(s, palette, theme).rows[0]!
      const positions = Array.from(row).flatMap((char, x) => char !== " " ? [x] : [])
      const gaps = positions.slice(1).map((x, i) => x - positions[i]!)
      expect(gaps.every((gap) => gap === 2)).toBe(true)
      expect(s.neural.columns).toBeGreaterThan(Math.floor((s.width - 1) / 3) + 1)
      expect(positions[0]).toBe(0)
      expect(positions.at(-1)).toBe(s.width - 2)
      expect(row.at(-1)).toBe(" ")
    }
  })

  it("adds layers with width and token positions with height", () => {
    const small = renderNeural(state(16, 18), palette, theme)
    const wide = renderNeural(state(64, 28), palette, theme)
    const layers = (row: string): number => (row.match(/[▒▓█]/gu) ?? []).length
    expect(layers(wide.rows[0]!)).toBeGreaterThan(layers(small.rows[0]!))
    expect(wide.rows.length).toBeGreaterThan(small.rows.length)
    for (const frame of [small, wide]) {
      expect(frame.rows.every((row) => layers(row) === layers(frame.rows[0]!))).toBe(true)
      expect(frame.rows.every((row) => /[▣▫▤·]/u.test(row[0]!) && /[▣▫▤·]/u.test(row.at(-2)!))).toBe(true)
    }
  })

  it("keeps an idle structure but clears all glyphs and theme text on clear", () => {
    const s = state()
    s.neural.nodes.fill(0)
    const idle = renderNeural(s, palette, theme)
    expect(idle.rows.join("\n")).toContain("▒")
    expect(idle.rows.join("\n")).not.toContain("▣")
    const blank = renderNeural(s, palette, theme, undefined, 0)
    expect(blank.rows.every((row) => row.trim() === "")).toBe(true)
    for (const chunk of blank.text.chunks) {
      expect(chunk.fg?.toInts().slice(0, 3)).toEqual([28, 28, 28])
    }
  })

  it("lifts very dark mood colors on dark themes and darkens pale ones on light themes", () => {
    for (const [surface, text, color] of [[28, 220, "#000005"], [245, 20, "#ffffff"]] as const) {
      const colors = { background: { r: surface, g: surface, b: surface }, text: { r: text, g: text, b: text } }
      const square = renderNeural(state(), buildPalette([color]), colors)
      for (const chunk of square.text.chunks.filter((chunk) => /[▒▓█]/u.test(chunk.text))) {
        const channels = chunk.fg!.toInts().slice(0, 3)
        expect(Math.max(...channels.map((value) => Math.abs(value - surface)))).toBeGreaterThan(25)
      }
    }
  })
})
