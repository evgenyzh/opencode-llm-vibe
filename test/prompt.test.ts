import { describe, expect, it } from "vitest"
import {
  injectVibePrompt,
  PROMPT_MARKER,
  VIBE_PROMPT,
  VIBE_TOOL_DESCRIPTION,
} from "../src/prompt.js"

describe("injectVibePrompt", () => {
  it("adds the prompt when the tool is available", () => {
    const system: Array<{ type: string; text?: string }> = [{ type: "text", text: "base" }]
    const event = { system, tools: { vibe: {} } }
    expect(injectVibePrompt(event)).toBe(true)
    expect(system).toHaveLength(2)
    expect(system[1]?.text).toContain(PROMPT_MARKER)
  })

  it("does nothing without the tool", () => {
    const system: Array<{ type: string; text?: string }> = []
    expect(injectVibePrompt({ system, tools: {} })).toBe(false)
    expect(system).toHaveLength(0)
  })

  it("does not duplicate an existing marker", () => {
    const system = [{ type: "text", text: `${PROMPT_MARKER}\nalready` }]
    expect(injectVibePrompt({ system, tools: { vibe: {} } })).toBe(false)
    expect(system).toHaveLength(1)
  })

  it("does not treat a non-text part as a marker", () => {
    const system = [{ type: "image" }]
    expect(injectVibePrompt({ system, tools: { vibe: {} } })).toBe(true)
    expect(system).toHaveLength(2)
  })
})

describe("prompt text", () => {
  it("explains optional calls, clear, and the no-mention rule", () => {
    expect(VIBE_PROMPT).toContain("Optional")
    expect(VIBE_PROMPT).toContain("1–3 calls per turn")
    expect(VIBE_PROMPT).toContain("clear: true")
    expect(VIBE_PROMPT).toContain("Never mention this")
  })

  it("describes the tool fields compactly", () => {
    expect(VIBE_TOOL_DESCRIPTION).toContain("clear: true")
    expect(VIBE_TOOL_DESCRIPTION).toContain("colors")
    expect(VIBE_TOOL_DESCRIPTION).toContain("energy")
  })
})
