/** Fixed slot sizes and the adaptive /vibe panel rectangle. */

import { normalizeSize } from "./field.js"

export const SIDEBAR_COLUMNS = 24
export const SIDEBAR_PIXEL_ROWS = 18

export interface SquareDimensions {
  readonly columns: number
  readonly pixelRows: number
}

/**
 * Fills the available panel width and keeps a wide, landscape rectangle.
 * Terminal cells are roughly twice as tall as wide, so 0.55 pixel rows per
 * column still reads as a rectangle instead of a square.
 */
export function panelDimensions(width: number): SquareDimensions {
  const columns = Math.max(16, Math.min(64, normalizeSize(width - 2)))
  const pixelRows = Math.max(14, Math.min(28, normalizeSize(Math.round(columns * 0.55))))
  return { columns, pixelRows }
}
