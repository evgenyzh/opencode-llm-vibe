/** Smooth field and palette morphs between mood states. */

import { blendFields, sampleField } from "./field.js"
import { blendPalettes, type Mood, type Palette, type Rgb } from "./mood.js"
import { paletteFor } from "./render.js"

export const MORPH_MS = 1500

export interface Transition {
  readonly fromMood: Mood | null
  /** Interpolated energy at the start of the transition. */
  readonly fromEnergy?: number
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

/** Palette/caption transition without generating the Morph field. */
export function visualColorsAt(
  mood: Mood | null,
  transition: Transition | undefined,
  at: number,
  background?: Rgb,
): Pick<Visual, "palette" | "mood"> {
  if (!transition) return { palette: paletteFor(mood, background), mood }
  const raw = clamp((at - transition.start) / MORPH_MS, 0, 1)
  if (raw >= 1) return { palette: paletteFor(transition.to, background), mood: transition.to }
  const progress = ease(raw)
  return {
    palette: blendPalettes(transition.fromPalette, paletteFor(transition.to, background), progress),
    mood: progress < 0.45 ? transition.fromMood : transition.to,
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function ease(value: number): number {
  return value * value * (3 - 2 * value)
}

function energyOf(mood: Mood | null, fallback = 0.5): number {
  return mood !== null && Number.isFinite(mood.energy) ? mood.energy : fallback
}

/** Energy at `at`, following the same easing as the field morph. */
export function transitionEnergy(transition: Transition, at: number): number {
  const raw = clamp((at - transition.start) / MORPH_MS, 0, 1)
  const progress = ease(raw)
  const from = transition.fromEnergy ?? energyOf(transition.fromMood)
  const to = energyOf(transition.to, from)
  return clamp(from + (to - from) * progress, 0, 1)
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
  radiusScale: number = 1,
  seed?: number,
  blobPhase?: number,
): Visual {
  if (!transition) {
    return {
      field: sampleField(mood, phase, columns, pixelRows, radiusScale, seed, undefined, blobPhase),
      palette: paletteFor(mood, background),
      mood,
    }
  }

  const raw = clamp((at - transition.start) / MORPH_MS, 0, 1)
  if (raw >= 1) {
    return {
      field: sampleField(transition.to, phase, columns, pixelRows, radiusScale, seed, undefined, blobPhase),
      palette: paletteFor(transition.to, background),
      mood: transition.to,
    }
  }

  const progress = ease(raw)
  const palette = blendPalettes(transition.fromPalette, paletteFor(transition.to, background), progress)
  const visibleMood = progress < 0.45 ? transition.fromMood : transition.to
  const fromEnergy = transition.fromEnergy ?? energyOf(transition.fromMood)
  const toEnergy = energyOf(transition.to, fromEnergy)
  const energy = fromEnergy + (toEnergy - fromEnergy) * progress

  // With a pinned seed the whole field is determined by energy, so a single
  // sample makes the blobs themselves migrate instead of crossfading.
  if (
    seed !== undefined &&
    transition.fromField === undefined &&
    transition.fromMood !== null &&
    transition.to !== null
  ) {
    return {
      field: sampleField(transition.to, phase, columns, pixelRows, radiusScale, seed, energy, blobPhase),
      palette,
      mood: visibleMood,
    }
  }

  const source =
    transition.fromField ??
    sampleField(transition.fromMood, phase, columns, pixelRows, radiusScale, seed, fromEnergy, blobPhase)
  const target = sampleField(transition.to, phase, columns, pixelRows, radiusScale, seed, toEnergy, blobPhase)
  return {
    field: blendFields(source, target, progress),
    palette,
    mood: visibleMood,
  }
}
