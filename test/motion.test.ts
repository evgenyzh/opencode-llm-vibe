import { describe, expect, it } from "vitest"
import { ACTIVITY_SPEED } from "../src/activity.js"
import { advanceMorphMotion, advanceMotion, morphBlobSpeed, MORPH_SPEED_MULTIPLIER, TEMPO_TAU, type MotionState } from "../src/motion.js"
import { MORPH_MS, transitionEnergy } from "../src/morph.js"

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

describe("Morph phase", () => {
  it("speeds up Morph in every activity without altering shared tempo", () => {
    expect(MORPH_SPEED_MULTIPLIER).toBe(1.5)
    for (const speed of Object.values(ACTIVITY_SPEED)) {
      const shared = advanceMotion({ phase: 0, tempo: speed }, speed, 0.1)
      const morph = advanceMorphMotion({ time: 0, blobPhase: 0 }, shared.phase, 0.5)
      expect(shared.tempo).toBe(speed)
      expect(morph.time).toBeCloseTo(shared.phase * 1.5)
      expect(morph.blobPhase).toBeCloseTo(shared.phase * 1.5 * morphBlobSpeed(0.5))
    }
  })

  it("applies energy changes only to future motion even after a long session", () => {
    const short = { time: 2, blobPhase: 1 }
    const long = { time: 10002, blobPhase: 10001 }
    const nextShort = advanceMorphMotion(short, 0.1, 0.9)
    const nextLong = advanceMorphMotion(long, 0.1, 0.9)
    expect(nextShort.blobPhase - short.blobPhase).toBeCloseTo(nextLong.blobPhase - long.blobPhase, 10)
    expect(nextLong.blobPhase - long.blobPhase).toBeCloseTo(0.1 * 1.5 * morphBlobSpeed(0.9), 10)
    const changed = advanceMorphMotion(nextLong, 0.1, 0.1)
    expect(changed.blobPhase - nextLong.blobPhase).toBeCloseTo(0.1 * 1.5 * morphBlobSpeed(0.1), 10)
    expect(advanceMorphMotion(long, 0, 1)).toBe(long)
  })

  it("handles invalid phase increments and bounds energy", () => {
    const state = { time: 3, blobPhase: 4 }
    expect(advanceMorphMotion(state, Number.NaN, 0.5)).toBe(state)
    expect(advanceMorphMotion(state, -1, 0.5)).toBe(state)
    expect(morphBlobSpeed(-3)).toBeCloseTo(0.18)
    expect(morphBlobSpeed(3)).toBeCloseTo(1.16)
    expect(morphBlobSpeed(Number.NaN)).toBeCloseTo(0.845)
  })

  it("maps medium energy to the old high-energy speed and rises smoothly", () => {
    expect(morphBlobSpeed(0.5)).toBeCloseTo(0.18 + 0.7 * 0.95, 12)
    let previous = morphBlobSpeed(0)
    for (let i = 1; i <= 100; i++) {
      const energy = i / 100
      const speed = morphBlobSpeed(energy)
      expect(speed).toBeGreaterThan(previous)
      expect(speed).toBeGreaterThan(0.18 + 0.7 * energy)
      previous = speed
    }
    expect(morphBlobSpeed(1)).toBeGreaterThan(morphBlobSpeed(0.95))
  })

  it("does not spike while energy morphs in a long-running session", () => {
    const transition = {
      fromMood: { colors: ["#111111"], energy: 0.1 },
      to: { colors: ["#ffffff"], energy: 0.9 },
      fromPalette: [],
      start: 0,
    }
    let state = { time: 10000, blobPhase: 7000 }
    let largestStep = 0
    for (let at = 0; at <= MORPH_MS; at += 1000 / 15) {
      const next = advanceMorphMotion(state, 2.6 / 15, transitionEnergy(transition, at))
      largestStep = Math.max(largestStep, next.blobPhase - state.blobPhase)
      state = next
    }
    expect(largestStep).toBeLessThanOrEqual((2.6 / 15) * 1.5 * morphBlobSpeed(0.9) + 1e-9)
  })
})
