import { describe, expect, it, vi } from "vitest"
import { handleVibe } from "../src/tool.js"
import type { Mood } from "../src/mood.js"

describe("handleVibe", () => {
  it("emits a normalized mood and returns ok", async () => {
    const emit = vi.fn(async (_sessionID: string, _mood: Mood | null) => {})
    const result = await handleVibe({ colors: ["#abc"], energy: 0.3, words: "calm" }, "ses_1", emit)

    expect(result).toEqual({ content: "ok" })
    expect(emit).toHaveBeenCalledTimes(1)
    expect(emit).toHaveBeenCalledWith("ses_1", {
      colors: ["#aabbcc"],
      energy: 0.3,
      words: "calm",
    })
  })

  it("emits null for clear", async () => {
    const emit = vi.fn(async (_sessionID: string, _mood: Mood | null) => {})
    const result = await handleVibe({ clear: true, colors: ["#f00"] }, "ses_1", emit)

    expect(result).toEqual({ content: "ok" })
    expect(emit).toHaveBeenCalledWith("ses_1", null)
  })

  it("does not emit for invalid input", async () => {
    const emit = vi.fn(async (_sessionID: string, _mood: Mood | null) => {})
    expect(await handleVibe({ colors: ["nope"] }, "ses_1", emit)).toEqual({ content: "ok" })
    expect(await handleVibe(undefined, "ses_1", emit)).toEqual({ content: "ok" })
    expect(emit).not.toHaveBeenCalled()
  })

  it("does not echo the mood in the tool result", async () => {
    const emit = vi.fn(async (_sessionID: string, _mood: Mood | null) => {})
    const result = await handleVibe({ colors: ["#000"], energy: 1 }, "ses_1", emit)
    expect(JSON.stringify(result)).toBe('{"content":"ok"}')
  })

  it("still returns ok when emission fails", async () => {
    const emit = vi.fn(async () => {
      throw new Error("rpc down")
    })
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    await expect(handleVibe({ colors: ["#000"], energy: 0 }, "ses_1", emit)).resolves.toEqual({
      content: "ok",
    })
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
