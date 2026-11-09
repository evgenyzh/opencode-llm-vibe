import { describe, expect, it } from "vitest"
import { advanceSimulation, createSimulation, lifeStep, resizeSimulation, simulationField, simulationFor } from "../src/simulation.js"
import { simulationOpacity, STYLE_OPTIONS } from "../src/styles.js"

describe("life", () => {
  it("applies Conway's B3/S23 rules to a blinker", () => {
    const cells = new Uint8Array(25)
    cells[11] = cells[12] = cells[13] = 1
    const next = lifeStep(cells, 5, 5)
    expect(Array.from(next).flatMap((v, i) => v ? [i] : [])).toEqual([7, 12, 17])
    expect(lifeStep(next, 5, 5)).toEqual(cells)
  })

  it("repopulates an extinct or periodic board", () => {
    const s = createSimulation("life", 24, 18, 42)
    s.cells.fill(0)
    advanceSimulation(s, 0.25, 2, 0.5, 0.5)
    expect(s.cells.some(Boolean)).toBe(true)
    s.cells.fill(0)
    s.cells[12] = s.cells[13] = s.cells[24] = s.cells[25] = 1
    s.history = []
    advanceSimulation(s, 0.25, 2, 0.5, 0.5)
    advanceSimulation(s, 0.25, 2, 0.5, 0.5)
    expect(s.history).toHaveLength(0)
    expect(s.cells.reduce((sum, value) => sum + value, 0)).toBeGreaterThan(4)
  })

  it("fades dead cells between generations rather than in discrete jumps", () => {
    const s = createSimulation("life", 24, 18, 42)
    s.cells.fill(0)
    s.trails[0] = 1
    advanceSimulation(s, 0.05, 1, 0.5, 0.5)
    const first = s.trails[0]!
    advanceSimulation(s, 0.05, 1, 0.5, 0.5)
    expect(first).toBeLessThan(1)
    expect(s.trails[0]).toBeLessThan(first)
    expect(s.cells.some(Boolean)).toBe(false)
  })

  it("preserves cells and random state on remount and when resized", () => {
    const cache = new Map()
    let s = simulationFor(cache, "session:life", "life", 24, 18)
    s.cells.fill(0)
    s.cells[4 * 12 + 5] = 1
    s.trails[4 * 12 + 5] = 0.7
    const rng = s.random
    // Mood, activity, and component remounts do not participate in the cache key.
    expect(simulationFor(cache, "session:life", "life", 24, 18)).toBe(s)
    s = simulationFor(cache, "session:life", "life", 32, 22)
    expect(s.cells[5 * 16 + 7]).toBe(1)
    expect(s.trails[5 * 16 + 7]).toBeCloseTo(0.7)
    expect(s.random).toBe(rng)
    expect(simulationFor(cache, "session:life", "life", 32, 22)).toBe(s)
    s = simulationFor(cache, "session:life", "life", 24, 18)
    expect(s.cells[4 * 12 + 5]).toBe(1)
  })
})

describe("visual simulations", () => {
  it("offers the five visual styles in order", () => {
    expect(STYLE_OPTIONS.map((option) => option.value)).toEqual(["morph", "life", "diffusion", "embers", "neural"])
  })

  it("continues an interrupted clear without jumping", () => {
    const duringClear = simulationOpacity(1, 0, 750, 1500)
    expect(duringClear).toBeCloseTo(0.5)
    expect(simulationOpacity(duringClear, 1, 0, 1500)).toBeCloseTo(duringClear)
    expect(simulationOpacity(duringClear, 1, 1500, 1500)).toBe(1)
  })

  for (const style of ["life", "diffusion", "embers", "neural"] as const) {
    it(`${style} is deterministic, animated and bounded`, () => {
      const a = createSimulation(style, 24, 18, 123)
      const b = createSimulation(style, 24, 18, 123)
      const initial = simulationField(a)
      for (let i = 0; i < 200; i++) {
        advanceSimulation(a, 1 / 15, 1.7, 0.7, 0.8)
        advanceSimulation(b, 1 / 15, 1.7, 0.7, 0.8)
      }
      const field = simulationField(a)
      expect(field).toHaveLength(24 * 18)
      expect(field).toEqual(simulationField(b))
      expect(field).not.toEqual(initial)
      expect(Array.from(field).every((value) => Number.isFinite(value) && value >= 0 && value <= 1)).toBe(true)
      expect(Array.from(field).some((value) => value > 0.1)).toBe(true)
    })
  }

  it("normalizes dimensions and limits large elapsed times", () => {
    const a = createSimulation("diffusion", 25, 19, 3)
    const b = createSimulation("diffusion", 24, 18, 3)
    advanceSimulation(a, 999, 2, 0.5, 0.5)
    advanceSimulation(b, 0.25, 2, 0.5, 0.5)
    expect(simulationField(a)).toEqual(simulationField(b))
  })

  it("reuses diffusion and field buffers", () => {
    const s = createSimulation("diffusion", 24, 18, 3)
    const buffers = [s.u, s.nextU, s.v, s.nextV]
    advanceSimulation(s, 0.1, 1, 0.5, 0.5)
    expect(buffers).toContain(s.u)
    expect(buffers).toContain(s.nextU)
    expect(buffers).toContain(s.v)
    expect(buffers).toContain(s.nextV)
    expect(simulationField(s, s.field)).toBe(s.field)
  })

  it("allocates simulation buffers only for the selected engine", () => {
    for (const style of ["life", "diffusion", "embers", "neural"] as const) {
      const s = createSimulation(style, 24, 18, 3)
      expect(s.cells.length > 0).toBe(style === "life")
      expect(s.trails.length > 0).toBe(style === "life")
      expect(s.u.length > 0).toBe(style === "diffusion")
      expect(s.nextV.length > 0).toBe(style === "diffusion")
      expect(s.colorField.length > 0).toBe(style === "embers")
      expect(s.field).toHaveLength(24 * 18)
      expect(s.neural.columns).toBe(style === "neural" ? 12 : 3)
      expect(s.neural.rows).toBe(style === "neural" ? 9 : 1)
    }
  })

  it("distributes an ember smoothly across adjacent pixels", () => {
    const s = createSimulation("embers", 24, 18, 2)
    s.particles = [{ x: 4.5, y: 5.5, life: 0.5, speed: 0.2, strength: 1, color: 0.5 }]
    const field = simulationField(s)
    for (const index of [5 * 24 + 4, 5 * 24 + 5, 6 * 24 + 4, 6 * 24 + 5]) {
      expect(field[index]).toBeCloseTo(0.25)
    }
  })

  it("tracks each ember's palette position independently of brightness and through resize", () => {
    const s = createSimulation("embers", 24, 18, 2)
    s.particles = [
      { x: 4, y: 5, life: 0.5, speed: 0.2, strength: 1, color: 0.5 },
      { x: 8, y: 5, life: 0.5, speed: 0.2, strength: 1, color: 0.95 },
    ]
    const field = simulationField(s, s.field, s.colorField)
    expect(field[5 * 24 + 4]).toBe(field[5 * 24 + 8])
    expect(s.colorField[5 * 24 + 4]).toBeCloseTo(0.5)
    expect(s.colorField[5 * 24 + 8]).toBeCloseTo(0.95)
    const resized = resizeSimulation(s, 48, 28)
    expect(resized.particles.map((particle) => particle.color)).toEqual([0.5, 0.95])
    expect(resized.colorField).toHaveLength(48 * 28)
  })

  it("selects both ember colours and retains each until respawn", () => {
    const s = createSimulation("embers", 24, 18, 42)
    advanceSimulation(s, 0, 1, 0.5, 0.5)
    expect(new Set(s.particles.map((particle) => particle.color))).toEqual(new Set([0.5, 0.95]))
    const colors = s.particles.map((particle) => particle.color)
    advanceSimulation(s, 0.01, 1, 0.5, 0.5)
    expect(s.particles.map((particle) => particle.color)).toEqual(colors)
  })

  it("keeps embers distributed over the field after repeated respawns", () => {
    const s = createSimulation("embers", 48, 28, 42)
    const occupied = new Set<number>()
    for (let frame = 0; frame < 900; frame++) {
      advanceSimulation(s, 1 / 15, 1, 0.7, 0.7)
      if (frame < 300) continue
      for (const particle of s.particles) if (particle.life > 0.2 && particle.life < 0.8) {
        occupied.add(Math.min(3, Math.floor(particle.y / s.height * 4)))
      }
    }
    expect([...occupied].sort()).toEqual([0, 1, 2, 3])
  })

})
