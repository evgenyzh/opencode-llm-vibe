/** Deterministic scalar field sampled for the half-block renderer. */

import type { Mood } from "./mood.js"

export const DEFAULT_SIZE = 20

export function normalizeSize(size: number): number {
  if (!Number.isFinite(size)) return DEFAULT_SIZE
  const even = Math.floor(size / 2) * 2
  return Math.max(4, Math.min(64, even))
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function mix(a: number, b: number, amount: number): number {
  return a + (b - a) * amount
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) return value < edge0 ? 0 : 1
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

function hashString(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function hash2(x: number, y: number, seed: number): number {
  let hash = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 1442695041)
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177)
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967295
}

function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  const top = mix(hash2(xi, yi, seed), hash2(xi + 1, yi, seed), u)
  const bottom = mix(hash2(xi, yi + 1, seed), hash2(xi + 1, yi + 1, seed), u)
  return mix(top, bottom, v)
}

/**
 * Samples a width×height pixel field in [0, 1]. `mood: null` is a static dark
 * vignette; a mood produces moving blobs plus low-frequency noise.
 */
export function sampleField(
  mood: Mood | null,
  time: number,
  width: number,
  height: number = width,
): Float32Array {
  const w = normalizeSize(width)
  const h = normalizeSize(height)
  const field = new Float32Array(w * h)
  const t = Number.isFinite(time) ? time : 0

  if (mood === null) {
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const nx = ((x + 0.5) / w) * 2 - 1
        const ny = ((y + 0.5) / h) * 2 - 1
        const distance = Math.max(Math.abs(nx), Math.abs(ny))
        field[y * w + x] = clamp(0.58 - distance * 0.38, 0, 1)
      }
    }
    return field
  }

  const energy = clamp(Number.isFinite(mood.energy) ? mood.energy : 0.5, 0, 1)
  const seed = hashString(`${mood.colors.join(",")}|${mood.words ?? ""}|${mood.glyph ?? ""}`)
  const blobCount = 3 + Math.round(energy * 2)
  const speed = 0.18 + energy * 0.7
  const noiseAmplitude = 0.1 + energy * 0.22

  const blobs = Array.from({ length: blobCount }, (_, index) => {
    const phase = (seed / 4294967295) * Math.PI * 2 + index * 2.399
    const offset = 0.21 + energy * 0.09
    return {
      phase,
      weight: 0.72 + 0.28 * Math.abs(Math.sin(phase * 1.7 + 0.9)),
      x: 0.5 + Math.sin(t * speed * (0.72 + index * 0.045) + phase) * offset,
      y: 0.5 + Math.cos(t * speed * (0.57 + index * 0.035) + phase * 1.37) * (offset * 0.86),
      radius: 0.26 + 0.07 * Math.sin(phase * 1.9) + energy * 0.11,
    }
  })

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const nx = (x + 0.5) / w
      const ny = (y + 0.5) / h

      let value = 0
      let total = 0
      for (const blob of blobs) {
        const dx = nx - blob.x
        const dy = ny - blob.y
        const distance = dx * dx + dy * dy
        const radius = Math.max(0.08, blob.radius)
        value += Math.exp(-distance / (2 * radius * radius)) * blob.weight
        total += blob.weight
      }
      value = total > 0 ? value / total : 0

      const noise = valueNoise(nx * 3.2 + t * 0.13, ny * 3.2 - t * 0.09, seed)
      value = value * 0.86 + (noise - 0.5) * noiseAmplitude
      value = clamp(value * 1.18 + 0.02, 0, 1)

      const nxCentered = nx * 2 - 1
      const nyCentered = ny * 2 - 1
      const edge = 1 - smoothstep(0.72, 1.12, Math.max(Math.abs(nxCentered), Math.abs(nyCentered)))
      value *= 0.58 + edge * 0.42

      // Push the brightest core into the hot end of the palette; without this
      // the last color often stays almost invisible.
      value = smoothstep(0.12, 0.85, value)

      field[y * w + x] = clamp(value, 0, 1)
    }
  }

  return field
}

export function blendFields(from: Float32Array, to: Float32Array, amount: number): Float32Array {
  const length = Math.max(from.length, to.length)
  const result = new Float32Array(length)
  const t = clamp(amount, 0, 1)
  for (let index = 0; index < length; index += 1) {
    result[index] = mix(from[index] ?? 0, to[index] ?? 0, t)
  }
  return result
}
