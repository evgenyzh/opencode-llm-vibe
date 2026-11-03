import { describe, expect, it } from "vitest"
import type { Mood } from "../src/mood.js"
import { MORPH_MS, visualAt, type Transition } from "../src/morph.js"
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
