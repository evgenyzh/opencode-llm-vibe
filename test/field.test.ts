import { describe, expect, it } from "vitest"
import { blendFields, normalizeSize, sampleField } from "../src/field.js"
import type { Mood } from "../src/mood.js"
import { morphBlobSpeed } from "../src/motion.js"

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

  it("supports rectangular fields", () => {
    const field = sampleField(calm, 0, 24, 18)
    expect(field).toHaveLength(24 * 18)
    for (const value of field) {
      expect(Number.isFinite(value)).toBe(true)
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(1)
    }
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

  it("pins the shape when a seed is supplied", () => {
    const a = sampleField({ ...calm, words: "calm" }, 0, 20, 20, 1, 42)
    const b = sampleField({ ...calm, words: "angry" }, 0, 20, 20, 1, 42)
    expect(Array.from(a)).toEqual(Array.from(b))
  })

  it("accepts an energy override", () => {
    const low = sampleField(calm, 1, 20, 20, 1, 42, 0.1)
    const high = sampleField(calm, 1, 20, 20, 1, 42, 0.9)
    expect(Array.from(low)).not.toEqual(Array.from(high))
  })

  it("accepts an integrated blob phase independently of noise time", () => {
    const time = 123.4, energy = 0.3, seed = 42
    const original = sampleField(calm, time, 24, 18, 1, seed, energy)
    const equivalent = sampleField(calm, time, 24, 18, 1, seed, energy, time * morphBlobSpeed(energy))
    expect(equivalent).toEqual(original)
    const differentPhase = sampleField(calm, time, 24, 18, 1, seed, energy, 7)
    expect(differentPhase).not.toEqual(original)
  })

  it("grows the blob with the radius scale", () => {
    const small = sampleField(calm, 1, 32, 24, 0.8)
    const large = sampleField(calm, 1, 32, 24, 1.25)
    const brightness = (field: Float32Array): number =>
      field.reduce((sum, value) => sum + value, 0)
    expect(brightness(large)).toBeGreaterThan(brightness(small))
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
