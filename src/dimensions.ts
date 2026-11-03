/** Fixed fallbacks and the adaptive sidebar rectangle. */

import { normalizeSize } from "./field.js"

export const SIDEBAR_COLUMNS = 24
export const SIDEBAR_PIXEL_ROWS = 18

export interface SquareDimensions {
  readonly columns: number
  readonly pixelRows: number
}

/**
 * Uses the measured sidebar width and keeps the rectangle landscape. Terminal
 * cells are roughly twice as tall as wide, so 0.65 pixel rows per column reads
 * as a wide rectangle rather than a square.
 */
export function sidebarDimensions(width: number): SquareDimensions {
  const columns = Math.max(16, Math.min(64, normalizeSize(width)))
  const pixelRows = Math.max(18, Math.min(28, normalizeSize(Math.round(columns * 0.65))))
  return { columns, pixelRows }
}
