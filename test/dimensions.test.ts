import { describe, expect, it } from "vitest"
import {
  panelDimensions,
  SIDEBAR_COLUMNS,
  SIDEBAR_PIXEL_ROWS,
} from "../src/dimensions.js"

describe("panelDimensions", () => {
  it("fills a normal panel with a wide rectangle", () => {
    expect(panelDimensions(32)).toEqual({ columns: 30, pixelRows: 16 })
    expect(panelDimensions(36)).toEqual({ columns: 34, pixelRows: 18 })
  })

  it("clamps narrow panels to a usable minimum", () => {
    expect(panelDimensions(0)).toEqual({ columns: 16, pixelRows: 14 })
    expect(panelDimensions(12)).toEqual({ columns: 16, pixelRows: 14 })
  })

  it("clamps very wide panels for the field budget", () => {
    expect(panelDimensions(200)).toEqual({ columns: 64, pixelRows: 28 })
  })

  it("keeps both dimensions even", () => {
    for (const width of [10, 17, 32, 41, 80, 160]) {
      const dimensions = panelDimensions(width)
      expect(dimensions.columns % 2).toBe(0)
      expect(dimensions.pixelRows % 2).toBe(0)
    }
  })

  it("keeps the sidebar at its fixed size", () => {
    expect(SIDEBAR_COLUMNS).toBe(24)
    expect(SIDEBAR_PIXEL_ROWS).toBe(18)
  })
})
