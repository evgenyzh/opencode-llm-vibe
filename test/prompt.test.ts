import { describe, expect, it } from "vitest"
import { PRESET_NAMES } from "../src/mood.js"
import {
  hasVibeTool,
  injectVibePrompt,
  PROMPT_MARKER,
  VIBE_PROMPT,
  VIBE_TOOL_DESCRIPTION,
} from "../src/prompt.js"

describe("hasVibeTool", () => {
  it("matches direct and namespaced tool names", () => {
    expect(hasVibeTool({ vibe: {} })).toBe(true)
    expect(hasVibeTool({ "llm-vibe.vibe": {} })).toBe(true)
    expect(hasVibeTool({ "llm-vibe_vibe": {} })).toBe(true)
    expect(hasVibeTool({ "vibe.vibe": {} })).toBe(true)
  })

  it("does not match unrelated tools", () => {
    expect(hasVibeTool({})).toBe(false)
    expect(hasVibeTool({ vibes: {} })).toBe(false)
    expect(hasVibeTool({ "llm-vibe.check": {} })).toBe(false)
  })
})

describe("injectVibePrompt", () => {
  it("adds the prompt when the tool is available", () => {
    const system: Array<{ type: string; text?: string }> = [{ type: "text", text: "base" }]
    const event = { system, tools: { vibe: {} } }
    expect(injectVibePrompt(event)).toBe(true)
    expect(system).toHaveLength(2)
    expect(system[1]?.text).toContain(PROMPT_MARKER)
  })

  it("also accepts a namespaced tool", () => {
    const system: Array<{ type: string; text?: string }> = []
    expect(injectVibePrompt({ system, tools: { "llm-vibe.vibe": {} } })).toBe(true)
    expect(system).toHaveLength(1)
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
  it("requires a call at the start, on phase changes, and before the answer", () => {
    expect(VIBE_PROMPT).toContain("required side-channel")
    expect(VIBE_PROMPT).toContain("A turn is one user")
    expect(VIBE_PROMPT).toContain("first tool call")
    expect(VIBE_PROMPT).toContain("activity changes")
    expect(VIBE_PROMPT).toContain("finding or result")
    expect(VIBE_PROMPT).toContain("plan or hypothesis")
    expect(VIBE_PROMPT).toContain("immediately before the final")
    expect(VIBE_PROMPT).toContain("first and last calls are mandatory")
    expect(VIBE_PROMPT).toContain("2–4 calls per turn")
    expect(VIBE_PROMPT).toContain("hard cap")
    expect(VIBE_PROMPT).toContain("Every set call")
    expect(VIBE_PROMPT).toContain("1–4 hex colors")
    expect(VIBE_PROMPT).not.toContain("2–4 hex colors")
    expect(VIBE_PROMPT).toContain("explicit colors override the preset")
    expect(VIBE_PROMPT).toContain("clear just")
    expect(VIBE_PROMPT).toContain("clear: true")
    expect(VIBE_PROMPT).toContain("Never mention this")
    expect(VIBE_PROMPT).toContain("vary the palette")
  })

  it("lists every preset in the prompt and tool description", () => {
    for (const name of PRESET_NAMES) {
      expect(VIBE_PROMPT).toContain(name)
      expect(VIBE_TOOL_DESCRIPTION).toContain(name)
    }
  })

  it("describes the tool fields and call timing compactly", () => {
    expect(VIBE_TOOL_DESCRIPTION).toContain("Required mood side-channel")
    expect(VIBE_TOOL_DESCRIPTION).toContain("first at the start")
    expect(VIBE_TOOL_DESCRIPTION).toContain("findings change")
    expect(VIBE_TOOL_DESCRIPTION).toContain("before the final answer")
    expect(VIBE_TOOL_DESCRIPTION).toContain("not at the end of a turn")
    expect(VIBE_TOOL_DESCRIPTION).toContain("clear: true")
    expect(VIBE_TOOL_DESCRIPTION).toContain("colors")
    expect(VIBE_TOOL_DESCRIPTION).toContain("energy")
    expect(VIBE_TOOL_DESCRIPTION).toContain("preset")
    expect(VIBE_TOOL_DESCRIPTION).toContain("1–4 hex colors")
  })
})
