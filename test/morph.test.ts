import { describe, expect, it } from "vitest"
import { sampleField } from "../src/field.js"
import type { Mood } from "../src/mood.js"
import { MORPH_MS, transitionEnergy, visualAt, visualColorsAt, type Transition } from "../src/morph.js"
import { paletteFor } from "../src/render.js"

const calm: Mood = { colors: ["#08131f", "#1f6f78", "#8fd6c9"], energy: 0.3 }
const alert: Mood = { colors: ["#1a0505", "#d7263d", "#ffd166"], energy: 0.9 }

const COLUMNS = 8
const PIXEL_ROWS = 6

function transitionTo(to: Mood, start = 0): Transition {
  return {
    fromMood: calm,
    fromPalette: paletteFor(calm),
    to,
    start,
  }
}

describe("visualAt", () => {
  it("provides identical palette and caption transitions without a Morph field", () => {
    for (const transition of [undefined, transitionTo(alert), { ...transitionTo(alert), to: null }]) {
      for (const at of [0, MORPH_MS / 2, MORPH_MS]) {
        const visual = visualAt(alert, transition, 0, COLUMNS, PIXEL_ROWS, at)
        expect(visualColorsAt(alert, transition, at)).toEqual({ palette: visual.palette, mood: visual.mood })
      }
    }
  })
  it("returns the current mood when there is no transition", () => {
    const visual = visualAt(calm, undefined, 1.2, COLUMNS, PIXEL_ROWS, 0)
    expect(visual.mood).toBe(calm)
    expect(visual.palette).toEqual(paletteFor(calm))
    expect(visual.field).toHaveLength(COLUMNS * PIXEL_ROWS)
  })

  it("starts exactly at the source visual", () => {
    const visual = visualAt(alert, transitionTo(alert), 0, COLUMNS, PIXEL_ROWS, 0)
    expect(visual.mood).toBe(calm)
    expect(visual.palette).toEqual(paletteFor(calm))
  })

  it("ends exactly at the target visual", () => {
    const visual = visualAt(alert, transitionTo(alert), 0, COLUMNS, PIXEL_ROWS, MORPH_MS)
    expect(visual.mood).toBe(alert)
    expect(visual.palette).toEqual(paletteFor(alert))
  })

  it("uses a frozen field snapshot when a morph is interrupted", () => {
    const snapshot = new Float32Array(COLUMNS * PIXEL_ROWS).fill(0.42)
    const transition: Transition = {
      ...transitionTo(alert),
      fromField: snapshot,
    }
    const visual = visualAt(alert, transition, 0, COLUMNS, PIXEL_ROWS, 0)
    expect(visual.field).toEqual(snapshot)
  })

  it("moves palette and field gradually instead of snapping", () => {
    const transition = transitionTo(alert)
    const middle = visualAt(alert, transition, 0, COLUMNS, PIXEL_ROWS, MORPH_MS / 2)
    const source = paletteFor(calm)
    const target = paletteFor(alert)
    expect(middle.palette).not.toEqual(source)
    expect(middle.palette).not.toEqual(target)
    expect(middle.field).toHaveLength(COLUMNS * PIXEL_ROWS)
  })

  it("interpolates energy for a mood-to-mood transition with a pinned seed", () => {
    const seed = 42
    const transition = transitionTo(alert)
    const middle = visualAt(
      alert,
      transition,
      0,
      COLUMNS,
      PIXEL_ROWS,
      MORPH_MS / 2,
      undefined,
      1,
      seed,
    )
    const expected = sampleField(alert, 0, COLUMNS, PIXEL_ROWS, 1, seed, 0.6)
    expect(middle.field).toEqual(expected)
  })

  it("preserves an integrated blob phase across an energy transition", () => {
    const seed = 42, time = 10000, blobPhase = 1234
    const transition = transitionTo(alert)
    const start = visualAt(alert, transition, time, COLUMNS, PIXEL_ROWS, 0, undefined, 1, seed, blobPhase)
    expect(start.field).toEqual(sampleField(calm, time, COLUMNS, PIXEL_ROWS, 1, seed, calm.energy, blobPhase))
    const middle = visualAt(alert, transition, time, COLUMNS, PIXEL_ROWS, MORPH_MS / 2, undefined, 1, seed, blobPhase)
    expect(middle.field).toEqual(sampleField(alert, time, COLUMNS, PIXEL_ROWS, 1, seed, 0.6, blobPhase))
    const end = visualAt(alert, transition, time, COLUMNS, PIXEL_ROWS, MORPH_MS, undefined, 1, seed, blobPhase)
    expect(end.field).toEqual(sampleField(alert, time, COLUMNS, PIXEL_ROWS, 1, seed, alert.energy, blobPhase))
  })

  it("starts and ends on the same field when the seed is pinned", () => {
    const seed = 7
    const transition = transitionTo(alert)
    const start = visualAt(
      alert,
      transition,
      0,
      COLUMNS,
      PIXEL_ROWS,
      0,
      undefined,
      1,
      seed,
    )
    const end = visualAt(
      alert,
      transition,
      0,
      COLUMNS,
      PIXEL_ROWS,
      MORPH_MS,
      undefined,
      1,
      seed,
    )
    expect(start.field).toEqual(sampleField(calm, 0, COLUMNS, PIXEL_ROWS, 1, seed))
    expect(end.field).toEqual(sampleField(alert, 0, COLUMNS, PIXEL_ROWS, 1, seed))
  })

  it("reports the interpolated energy", () => {
    const transition = transitionTo(alert)
    expect(transitionEnergy(transition, 0)).toBeCloseTo(calm.energy)
    expect(transitionEnergy(transition, MORPH_MS / 2)).toBeCloseTo(0.6)
    expect(transitionEnergy(transition, MORPH_MS)).toBeCloseTo(alert.energy)
  })

  it("fades a cleared mood to the theme background", () => {
    const background = { r: 24, g: 26, b: 28 }
    const transition: Transition = {
      fromMood: calm,
      fromPalette: paletteFor(calm),
      to: null,
      start: 0,
    }
    const visual = visualAt(null, transition, 0, COLUMNS, PIXEL_ROWS, MORPH_MS, background)
    expect(visual.palette.every((color) => color === background)).toBe(true)
    expect(visual.mood).toBeNull()
  })
})
