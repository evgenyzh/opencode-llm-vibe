/** Smooth field and palette morphs between mood states. */

import { blendFields, sampleField } from "./field.js"
import { blendPalettes, type Mood, type Palette, type Rgb } from "./mood.js"
import { paletteFor } from "./render.js"

export const MORPH_MS = 1000

export interface Transition {
  readonly fromMood: Mood | null
  /** Frozen visual snapshot used when a new mood interrupts an active morph. */
  readonly fromField?: Float32Array
  readonly fromPalette: Palette
  readonly to: Mood | null
  readonly start: number
}

export interface Visual {
  readonly field: Float32Array
  readonly palette: Palette
  readonly mood: Mood | null
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function ease(value: number): number {
  return value * value * (3 - 2 * value)
}

/**
 * Returns the visual at `at`. An interrupted morph starts from the frozen
 * `fromField`/`fromPalette` snapshot, so a new mood never rolls the image back
 * to the previous target.
 */
export function visualAt(
  mood: Mood | null,
  transition: Transition | undefined,
  phase: number,
  columns: number,
  pixelRows: number,
  at: number,
  background?: Rgb,
): Visual {
  if (!transition) {
    return {
      field: sampleField(mood, phase, columns, pixelRows),
      palette: paletteFor(mood, background),
      mood,
    }
  }

  const raw = clamp((at - transition.start) / MORPH_MS, 0, 1)
  if (raw >= 1) {
    return {
      field: sampleField(transition.to, phase, columns, pixelRows),
      palette: paletteFor(transition.to, background),
      mood: transition.to,
    }
  }

  const progress = ease(raw)
  const source = transition.fromField ?? sampleField(transition.fromMood, phase, columns, pixelRows)
  return {
    field: blendFields(source, sampleField(transition.to, phase, columns, pixelRows), progress),
    palette: blendPalettes(transition.fromPalette, paletteFor(transition.to, background), progress),
    mood: progress < 0.45 ? transition.fromMood : transition.to,
  }
}
