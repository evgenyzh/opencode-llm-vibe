import { describe, expect, it } from "vitest"
import {
  advanceContextLevel,
  contextLimit,
  contextRatio,
  contextTokens,
  MAX_RADIUS_SCALE,
  MIN_RADIUS_SCALE,
  radiusScale,
} from "../src/context-usage.js"

const usage = {
  input: 20_000,
  output: 1_000,
  reasoning: 500,
  cache: { read: 4_000, write: 1_000 },
}

describe("contextTokens", () => {
  it("sums every part of the context fill", () => {
    expect(contextTokens(usage)).toBe(26_500)
  })

  it("ignores broken numbers", () => {
    expect(
      contextTokens({
        input: Number.NaN,
        output: 10,
        reasoning: 2,
        cache: { read: 3, write: Number.POSITIVE_INFINITY },
      }),
    ).toBe(15)
  })
})

describe("contextLimit", () => {
  it("uses the smaller of input and context limits", () => {
    expect(contextLimit({ context: 200_000, input: 128_000 })).toBe(128_000)
    expect(contextLimit({ context: 128_000, input: 200_000 })).toBe(128_000)
  })

  it("falls back to whichever limit exists", () => {
    expect(contextLimit({ context: 64_000 })).toBe(64_000)
    expect(contextLimit({ context: 0, input: 32_000 })).toBe(32_000)
    expect(contextLimit(undefined)).toBe(0)
  })
})

describe("contextRatio", () => {
  it("maps tokens to a clamped fraction", () => {
    expect(contextRatio(0, 100_000)).toBe(0)
    expect(contextRatio(50_000, 100_000)).toBe(0.5)
    expect(contextRatio(200_000, 100_000)).toBe(1)
  })

  it("uses a neutral value when the limit is unknown", () => {
    expect(contextRatio(50_000, 0)).toBe(0.5)
    expect(contextRatio(50_000, Number.NaN)).toBe(0.5)
  })
})

describe("radiusScale", () => {
  it("grows linearly from the empty to the full context", () => {
    expect(radiusScale(0)).toBe(MIN_RADIUS_SCALE)
    expect(radiusScale(1)).toBe(MAX_RADIUS_SCALE)
    expect(radiusScale(0.5)).toBeCloseTo((MIN_RADIUS_SCALE + MAX_RADIUS_SCALE) / 2)
  })

  it("clamps out-of-range and broken values", () => {
    expect(radiusScale(-1)).toBe(MIN_RADIUS_SCALE)
    expect(radiusScale(2)).toBe(MAX_RADIUS_SCALE)
    expect(radiusScale(Number.NaN)).toBe(MIN_RADIUS_SCALE)
  })
})

describe("advanceContextLevel", () => {
  it("eases toward the target without overshooting", () => {
    const next = advanceContextLevel(0, 1, 0.1)
    expect(next).toBeGreaterThan(0)
    expect(next).toBeLessThan(1)

    const later = advanceContextLevel(next, 1, 0.1)
    expect(later).toBeGreaterThan(next)
    expect(later).toBeLessThan(1)
  })

  it("respects the time constant and clamps the step", () => {
    expect(advanceContextLevel(0, 1, 0.25)).toBeCloseTo(1 - Math.exp(-0.25), 5)
    expect(advanceContextLevel(0.4, 0.2, 10)).toBeGreaterThanOrEqual(0.2)
    expect(advanceContextLevel(0.4, 0.2, 10)).toBeLessThan(0.4)
    expect(advanceContextLevel(0.4, 0.2, 0)).toBe(0.4)
  })
})
