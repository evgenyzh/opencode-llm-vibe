import { describe, expect, it } from "vitest"
import { advanceMotion, TEMPO_TAU, type MotionState } from "../src/motion.js"

describe("advanceMotion", () => {
  it("advances phase and keeps it continuous", () => {
    const state: MotionState = { phase: 10, tempo: 0.5 }
    const next = advanceMotion(state, 2, 0.1)
    expect(next.phase).toBeGreaterThan(state.phase)
    expect(next.tempo).toBeGreaterThan(0.5)
    expect(next.tempo).toBeLessThan(2)
  })

  it("does not move when elapsed is zero", () => {
    const state: MotionState = { phase: 10, tempo: 0.5 }
    expect(advanceMotion(state, 2, 0)).toBe(state)
  })

  it("eases toward the target instead of jumping", () => {
    let state: MotionState = { phase: 0, tempo: 0.45 }
    const first = advanceMotion(state, 1.9, 0.1)
    expect(first.tempo).toBeGreaterThan(0.45)
    expect(first.tempo).toBeLessThan(1.9)

    for (let index = 0; index < 100; index += 1) {
      state = advanceMotion(state, 1.9, 0.1)
    }
    expect(state.tempo).toBeCloseTo(1.9, 2)
  })

  it("uses the configured time constant", () => {
    const state: MotionState = { phase: 0, tempo: 0 }
    const next = advanceMotion(state, 1, 0.25, TEMPO_TAU)
    expect(next.tempo).toBeCloseTo(1 - Math.exp(-0.25 / TEMPO_TAU), 5)
  })

  it("clamps bad time steps and targets", () => {
    const state: MotionState = { phase: 1, tempo: 1 }
    expect(advanceMotion(state, Number.NaN, 0.1)).toEqual(state)
    expect(advanceMotion(state, 1, Number.NaN)).toBe(state)
    const huge = advanceMotion(state, 1, 10)
    expect(huge.phase - state.phase).toBeLessThanOrEqual(0.25)
  })
})
