import { describe, expect, it } from "vitest"
import {
  sidebarDimensions,
  SIDEBAR_COLUMNS,
  SIDEBAR_PIXEL_ROWS,
} from "../src/dimensions.js"

describe("sidebarDimensions", () => {
  it("fills a normal sidebar width", () => {
    expect(sidebarDimensions(24)).toEqual({ columns: 24, pixelRows: 18 })
    expect(sidebarDimensions(32)).toEqual({ columns: 32, pixelRows: 20 })
  })

  it("clamps narrow sidebars to a usable minimum", () => {
    expect(sidebarDimensions(0)).toEqual({ columns: 16, pixelRows: 18 })
    expect(sidebarDimensions(12)).toEqual({ columns: 16, pixelRows: 18 })
  })

  it("clamps very wide sidebars for the field budget", () => {
    expect(sidebarDimensions(200)).toEqual({ columns: 64, pixelRows: 28 })
  })

  it("keeps both dimensions even", () => {
    for (const width of [10, 17, 24, 32, 41, 80, 160]) {
      const dimensions = sidebarDimensions(width)
      expect(dimensions.columns % 2).toBe(0)
      expect(dimensions.pixelRows % 2).toBe(0)
    }
  })

  it("keeps the fallback size stable", () => {
    expect(SIDEBAR_COLUMNS).toBe(24)
    expect(SIDEBAR_PIXEL_ROWS).toBe(18)
  })
})
