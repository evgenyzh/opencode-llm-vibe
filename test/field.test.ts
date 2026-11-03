import { describe, expect, it } from "vitest"
import { blendFields, normalizeSize, sampleField } from "../src/field.js"
import type { Mood } from "../src/mood.js"

const calm: Mood = { colors: ["#112244", "#ff8844"], energy: 0.2 }
const excited: Mood = { colors: ["#112244", "#ff8844"], energy: 0.95 }

function expectValidField(field: Float32Array, size: number): void {
  expect(field).toHaveLength(size * size)
  for (const value of field) {
    expect(Number.isFinite(value)).toBe(true)
    expect(value).toBeGreaterThanOrEqual(0)
    expect(value).toBeLessThanOrEqual(1)
  }
}

describe("normalizeSize", () => {
  it("keeps even sizes and floors odd ones", () => {
    expect(normalizeSize(20)).toBe(20)
    expect(normalizeSize(21)).toBe(20)
    expect(normalizeSize(32)).toBe(32)
  })

  it("clamps tiny and broken sizes", () => {
    expect(normalizeSize(0)).toBe(4)
    expect(normalizeSize(Number.NaN)).toBe(20)
    expect(normalizeSize(1000)).toBe(64)
  })
})

describe("sampleField", () => {
  it("returns a finite field in [0, 1]", () => {
    expectValidField(sampleField(calm, 0, 20), 20)
    expectValidField(sampleField(excited, 1.5, 31), 30)
  })

  it("is deterministic for the same mood, time and size", () => {
    expect(Array.from(sampleField(calm, 2.5, 20))).toEqual(Array.from(sampleField(calm, 2.5, 20)))
  })

  it("animates a mood over time", () => {
    const first = sampleField(calm, 0, 20)
    const later = sampleField(calm, 3, 20)
    expect(Array.from(first)).not.toEqual(Array.from(later))
  })

  it("reacts to energy", () => {
    const low = sampleField(calm, 1, 20)
    const high = sampleField(excited, 1, 20)
    expect(Array.from(low)).not.toEqual(Array.from(high))
  })

  it("keeps the empty state static", () => {
    expect(Array.from(sampleField(null, 0, 20))).toEqual(Array.from(sampleField(null, 100, 20)))
  })

  it("changes shape with the words/glyph seed", () => {
    const a = sampleField({ ...calm, words: "calm" }, 0, 20)
    const b = sampleField({ ...calm, words: "angry" }, 0, 20)
    expect(Array.from(a)).not.toEqual(Array.from(b))
  })
})

describe("blendFields", () => {
  it("blends by amount and clamps", () => {
    const from = new Float32Array([0, 0, 0])
    const to = new Float32Array([1, 1, 1])
    expect(Array.from(blendFields(from, to, 0))).toEqual([0, 0, 0])
    expect(Array.from(blendFields(from, to, 1))).toEqual([1, 1, 1])
    expect(Array.from(blendFields(from, to, 0.5))).toEqual([0.5, 0.5, 0.5])
    expect(Array.from(blendFields(from, to, 5))).toEqual([1, 1, 1])
  })

  it("tolerates mismatched lengths", () => {
    const field = blendFields(new Float32Array([0.5]), new Float32Array([0.5, 0.5]), 0.5)
    expect(field).toHaveLength(2)
  })
})
