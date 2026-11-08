import { describe, expect, it } from "vitest"
import { advanceNeural, createNeural, NEURAL_TICK, resizeNeural } from "../src/neural.js"
import { advanceSimulation, createSimulation, simulationFor } from "../src/simulation.js"

describe("branching neural impulses", () => {
  const red = { r: 240, g: 20, b: 30 }
  const blue = { r: 20, g: 30, b: 240 }
  const rgb = (buffer: Float32Array, index: number): number[] => Array.from(buffer.slice(index * 3, index * 3 + 3))

  it("carries the input mood along impulses instead of recoloring distant layers", () => {
    const n = createNeural(16, 3)
    advanceNeural(n, 0, 0, 0, false, () => 0.5, blue)
    const input = [0, 0.99, 0.99]
    advanceNeural(n, NEURAL_TICK, 0.5, 0.5, true, () => input.shift() ?? 0.99, red)
    expect(rgb(n.frontColors, 0)).toEqual([240, 20, 30])
    expect(rgb(n.colors, n.rows * 3)).toEqual([20, 30, 240])
    advanceNeural(n, NEURAL_TICK, 0, 0, false, () => 0.5, blue)
    const reached = Array.from(n.front).findIndex((value) => value > 0)
    expect(Math.floor(reached / n.rows)).toBe(1)
    expect(rgb(n.frontColors, reached)).toEqual([240, 20, 30])
    expect(rgb(n.targets, reached)).toEqual([240, 20, 30])
    expect(rgb(n.colors, reached)).toEqual([20, 30, 240])
    advanceNeural(n, 0.1, 0, 0, false, () => 0.5, blue)
    expect(n.colors[reached * 3]!).toBeGreaterThan(20)
    expect(n.colors[reached * 3]!).toBeLessThan(240)
    expect(rgb(n.colors, n.rows * 3)).toEqual([20, 30, 240])
    for (let column = 2; column < n.columns; column++) {
      advanceNeural(n, NEURAL_TICK, 0, 0, false, () => 0.5, blue)
      const index = Array.from(n.front).findIndex((value) => value > 0)
      expect(Math.floor(index / n.rows)).toBe(column)
      rgb(n.frontColors, index).forEach((value, c) => expect(value).toBeCloseTo([240, 20, 30][c]!, 3))
    }
  })

  it("keeps consecutive mood changes in flight independently and does not recolor idle layers", () => {
    const n = createNeural(16, 1)
    const green = { r: 20, g: 240, b: 30 }
    advanceNeural(n, NEURAL_TICK, 0.5, 0.5, true, () => 0, red)
    advanceNeural(n, NEURAL_TICK, 0.5, 0.5, true, () => 0, blue)
    advanceNeural(n, NEURAL_TICK, 0.5, 0.5, true, () => 0, green)
    expect(rgb(n.frontColors, 0)).toEqual([20, 240, 30])
    expect(rgb(n.frontColors, 1)).toEqual([20, 30, 240])
    expect(rgb(n.frontColors, 2)).toEqual([240, 20, 30])
    expect(rgb(n.colors, 5)).toEqual([240, 20, 30])
    advanceNeural(n, NEURAL_TICK, 0.5, 0.5, false, () => 0.5, blue)
    expect(rgb(n.frontColors, 1)).toEqual([20, 240, 30])
    expect(rgb(n.frontColors, 2)).toEqual([20, 30, 240])
    expect(rgb(n.frontColors, 3)).toEqual([240, 20, 30])
    expect(rgb(n.colors, 6)).toEqual([240, 20, 30])
  })

  it("mixes simultaneous colours by their uncapped incoming weights", () => {
    const n = createNeural(16, 5)
    advanceNeural(n, 0, 0, 0, false, () => 0.5, blue)
    const source = (n.columns - 2) * n.rows
    for (const row of [1, 2, 3]) {
      n.front[source + row] = 1
      const color = row === 3 ? blue : red
      n.frontColors.set([color.r, color.g, color.b], (source + row) * 3)
    }
    const rolls = [0, 0, 1, 0.99, 0.9, 0, 1, 0, 0.5, 0.9, 1, 0, 0, 0, 0.9]
    advanceNeural(n, NEURAL_TICK, 0, 0, false, () => rolls.shift() ?? 0.5, blue)
    const output = (n.columns - 1) * n.rows + 2
    expect(n.front[output]).toBe(1)
    expect(n.frontColors[output * 3]).toBeCloseTo((red.r * 2 + blue.r) / 3)
    expect(n.frontColors[output * 3 + 2]).toBeCloseTo((red.b * 2 + blue.b) / 3)
    expect(n.targets[output * 3]).toBeCloseTo((red.r * 2 + blue.r) / 3)
  })

  it("retains in-flight, visible and target colours across resize and idle mood changes", () => {
    const n = createNeural(24, 9)
    advanceNeural(n, 0, 0, 0, false, () => 0.5, blue)
    const i = n.rows * 2 + 4
    n.front[i] = 0.5
    n.frontColors.set([red.r, red.g, red.b], i * 3)
    n.targets.set([red.r, red.g, red.b], i * 3)
    advanceNeural(n, 0.1, 0, 0, false, () => 0.5, red)
    const before = rgb(n.colors, i)
    const bigger = resizeNeural(n, 48, 17)
    const mapped = Math.round(2 * (bigger.columns - 1) / (n.columns - 1)) * bigger.rows + 8
    expect(rgb(bigger.colors, mapped)).toEqual(before)
    expect(rgb(bigger.targets, mapped)).toEqual([240, 20, 30])
    expect(rgb(bigger.frontColors, mapped)).toEqual([240, 20, 30])
    expect(rgb(bigger.colors, bigger.rows * 10)).toEqual([20, 30, 240])
    expect(bigger.clock).toBe(n.clock)
  })

  it("trials every input independently, including empty, isolated and noncontiguous arrivals", () => {
    const s = createSimulation("neural", 32, 24, 42)
    const counts = new Set<number>(), positions = new Set<number>()
    let separated = false, overlapping = false
    for (let i = 0; i < 600; i++) {
      advanceSimulation(s, NEURAL_TICK, 1, 0.6, 0.6)
      const rows = Array.from(s.neural.front.slice(0, s.neural.rows)).flatMap((v, row) => v ? [row] : [])
      counts.add(rows.length)
      for (const row of rows) positions.add(row)
      if (rows.length > 1 && rows.at(-1)! - rows[0]! >= rows.length) separated = true
      if (rows.length && s.neural.front.slice(s.neural.rows * 2).some(Boolean)) overlapping = true
    }
    expect(counts.has(0)).toBe(true)
    expect(counts.has(1)).toBe(true)
    expect(Math.max(...counts)).toBeGreaterThan(1)
    expect(positions.size).toBe(s.neural.rows)
    expect(separated).toBe(true)
    expect(overlapping).toBe(true)
  })

  it("continues an isolated impulse one column per tick all the way to the output in idle", () => {
    const n = createNeural(24, 7)
    n.front[3] = 1
    n.nodes[3] = 1
    for (let column = 1; column < n.columns; column++) {
      // Equal transition weights, choose the same row, and do not split.
      advanceNeural(n, NEURAL_TICK, 0.5, 0.5, false, () => 0.5)
      expect(Array.from(n.front).flatMap((value, index) => value ? [index] : [])).toEqual([column * n.rows + 3])
      expect(n.nodes[column * n.rows + 3]).toBeCloseTo(1 / 3)
      expect(n.nodes[(column - 1) * n.rows + 3]).toBeLessThan(1)
    }
    for (let i = 0; i < 40; i++) advanceNeural(n, NEURAL_TICK, 0.5, 0.5, false, () => 0.5)
    expect(n.front.some(Boolean)).toBe(false)
    expect(Math.max(...n.nodes)).toBeLessThan(0.001)
  })

  it("splits and merges weighted branches without losing them", () => {
    const n = createNeural(24, 7)
    n.front[3] = 1
    const rolls = [0.5, 0.5, 0.5, 0.5, 0.1, 0.9] // equal weights, middle, split, lower
    advanceNeural(n, NEURAL_TICK, 0, 0, false, () => rolls.shift() ?? 0.5)
    expect(Array.from(n.front).flatMap((value, index) => value ? [index] : [])).toEqual([n.rows + 3, n.rows + 4])
    expect(n.front[n.rows + 3]).toBeCloseTo(1 / 3)
    expect(n.front[n.rows + 4]).toBeCloseTo(1 / 3)
    const merge = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0, 0.5]
    advanceNeural(n, NEURAL_TICK, 0, 0, false, () => merge.shift() ?? 0.5)
    expect(Array.from(n.front).flatMap((value, index) => value ? [index] : [])).toEqual([2 * n.rows + 3])
    expect(n.front[2 * n.rows + 3]).toBeCloseTo(2 / 3)
    expect(n.nodes[2 * n.rows + 3]).toBeCloseTo(2 / 3)
    advanceNeural(n, NEURAL_TICK, 0, 0, false, () => 0)
    expect(n.front.some(Boolean)).toBe(true)
  })

  it("adds simultaneous output arrivals and clamps their sum at one", () => {
    const n = createNeural(16, 5)
    const source = (n.columns - 2) * n.rows
    n.front[source + 1] = 0.2
    n.front[source + 2] = 0.7
    n.front[source + 3] = 0.9
    // Same row 2 selected from three different source rows, all with uneven weights.
    const rolls = [0, 0, 1, 0.99, 0.9, 0, 1, 0, 0.5, 0.9, 1, 0, 0, 0, 0.9]
    advanceNeural(n, NEURAL_TICK, 0, 0, false, () => rolls.shift() ?? 0.5)
    const output = (n.columns - 1) * n.rows + 2
    expect(n.front[output]).toBe(1)
    expect(n.nodes[output]).toBe(1)
    expect(Array.from(n.front).every((value) => value >= 0 && value <= 1)).toBe(true)
  })

  it("lights output only when an incoming edge delivers an impulse", () => {
    const s = createSimulation("neural", 32, 24, 7)
    const n = s.neural, output = (n.columns - 1) * n.rows
    let arrivals = 0
    for (let i = 0; i < 400; i++) {
      const previous = n.front.slice()
      advanceSimulation(s, NEURAL_TICK, 1, 0.6, 0.6)
      for (let row = 0; row < n.rows; row++) if (n.front[output + row]) {
        arrivals++
        const sources = [row - 1, row, row + 1].filter((from) => from >= 0 && from < n.rows)
        expect(sources.some((from) => previous[output - n.rows + from])).toBe(true)
      }
    }
    expect(arrivals).toBeGreaterThan(0)
    const empty = createNeural(32, 12)
    for (let i = 0; i < 30; i++) advanceNeural(empty, NEURAL_TICK, 1, 1, false, () => 0.5)
    expect(empty.nodes.some(Boolean)).toBe(false)
  })

  it("does not kill any single path, for any random branch choices", () => {
    for (const seed of [0, 0.1, 0.5, 0.99]) {
      const n = createNeural(64, 9)
      n.front[4] = 1
      for (let col = 1; col < n.columns; col++) {
        advanceNeural(n, NEURAL_TICK, 0, 0, false, () => seed)
        expect(n.front.slice(col * n.rows, (col + 1) * n.rows).some(Boolean)).toBe(true)
      }
    }
  })

  it("keeps its live state and clock on remount and maps both boundary columns on resize", () => {
    const cache = new Map()
    const s = simulationFor(cache, "neural", "neural", 24, 18)
    s.neural.nodes[0] = 0.8
    s.neural.front[0] = 1
    s.neural.nodes[s.neural.nodes.length - 1] = 0.7
    s.neural.clock = 0.1
    expect(simulationFor(cache, "neural", "neural", 24, 18)).toBe(s)
    const bigger = simulationFor(cache, "neural", "neural", 48, 28)
    expect(bigger.neural.nodes[0]).toBeCloseTo(0.8)
    expect(bigger.neural.front[0]).toBe(1)
    expect(bigger.neural.nodes.at(-1)).toBeCloseTo(0.7)
    expect(bigger.neural.clock).toBe(0.1)
    expect(bigger.random).toBe(s.random)
    expect(resizeNeural(bigger.neural, 48, 14)).toBe(bigger.neural)
    const smaller = resizeNeural(bigger.neural, 16, 7)
    expect(smaller.nodes[0]).toBeCloseTo(0.8)
    expect(smaller.nodes.at(-1)).toBeCloseTo(0.7)
    expect(smaller.nodes.length).toBe(smaller.columns * smaller.rows)
  })

  it("uses the same continuous clock across different frame rates", () => {
    const a = createSimulation("neural", 32, 24, 42), b = createSimulation("neural", 32, 24, 42)
    for (let i = 0; i < 120; i++) advanceSimulation(a, 0.1, 1, 0.5, 0.5)
    for (let i = 0; i < 600; i++) advanceSimulation(b, 0.02, 1, 0.5, 0.5)
    expect(a.random).toBe(b.random)
    expect(a.neural.front).toEqual(b.neural.front)
    for (let i = 0; i < a.neural.nodes.length; i++) expect(a.neural.nodes[i]).toBeCloseTo(b.neural.nodes[i]!, 5)
  })

  it("does not turn internal activations into input or output tokens when shrinking", () => {
    const n = createNeural(64, 14)
    n.nodes[n.rows] = 1
    n.front[n.rows] = 1
    n.nodes[(n.columns - 2) * n.rows] = 1
    n.front[(n.columns - 2) * n.rows] = 1
    const smaller = resizeNeural(n, 16, 7)
    expect(smaller.nodes.slice(0, smaller.rows).some(Boolean)).toBe(false)
    expect(smaller.nodes.slice(-smaller.rows).some(Boolean)).toBe(false)
    expect(smaller.front.slice(0, smaller.rows).some(Boolean)).toBe(false)
    expect(smaller.front.slice(-smaller.rows).some(Boolean)).toBe(false)
    expect(smaller.front.some(Boolean)).toBe(true)
  })
})
