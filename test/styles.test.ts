import { describe, expect, it } from "vitest"
import { defaultStyleFor, styleFor, type StyleSettings } from "../src/styles.js"

describe("style preferences", () => {
  it("inherits the default until a session explicitly overrides it", () => {
    const settings: StyleSettings = { defaultStyle: "morph", sessions: {} }
    expect(styleFor(settings, "one")).toBe("morph")
    settings.sessions.one = "neural"
    settings.defaultStyle = "life"
    expect(styleFor(settings, "one")).toBe("neural")
    expect(styleFor(settings, "two")).toBe("life")
    delete settings.sessions.one
    expect(styleFor(settings, "one")).toBe("life")
  })

  it("restores serialized preferences and safely handles invalid styles", () => {
    const saved: StyleSettings = { defaultStyle: "embers", sessions: { one: "neural" } }
    const restored: StyleSettings = JSON.parse(JSON.stringify(saved))
    expect(styleFor(restored, "one")).toBe("neural")
    expect(styleFor(restored, "two")).toBe("embers")
    restored.defaultStyle = "obsolete" as StyleSettings["defaultStyle"]
    restored.sessions.one = "obsolete" as StyleSettings["defaultStyle"]
    expect(defaultStyleFor(restored)).toBe("morph")
    expect(styleFor(restored, "one")).toBe("morph")
  })
})
