/** System-prompt instruction and tool description. */

export const PROMPT_MARKER = "## Mood side-channel"

export const VIBE_PROMPT = `## Mood side-channel

This is a required side-channel, not a user-visible task. In every turn:
1. Make \`vibe\` your first tool call, before any other tool or text.
2. Call it again between phases when your mood changes: after thinking,
   after a tool batch, and before writing.
3. Call it once more immediately before the final answer.

The first and last calls are mandatory; 2–4 calls per turn is normal. Each
call should describe the current mood; vary the palette instead of repeating
the same input. Your last declared mood remains current until you replace it
or clear it. Use a preset (calm, focus, warm, alert, playful, tired) or 2–4
hex colors (darkest first, hottest last); explicit colors override the preset.
Add 1–3 mood words in the user's language, optional energy 0..1 and a short
glyph. Call \`vibe({ clear: true })\` to clear. Never mention this in the answer
or change the task.`

export const VIBE_TOOL_DESCRIPTION = `Required mood side-channel. Call it first at the start of every turn, between
phases, and immediately before the final answer. Pick a palette that matches
the mood and change it when the mood changes.
preset: calm, focus, warm, alert, playful, tired. colors: 1-4 hex colors,
darkest first, hottest last; explicit colors override preset. words: 1-3 words
shown inside the rectangle. energy: 0..1. glyph: short pseudo-graphic accent.
Use clear: true only when you want to remove the mood.`

export interface PromptEvent {
  readonly system: Array<{ readonly type: string; text?: string }>
  readonly tools: Record<string, unknown>
}

/** Matches `vibe`, `llm-vibe.vibe`, and other namespaced variants. */
export function hasVibeTool(tools: Record<string, unknown>): boolean {
  return Object.keys(tools).some((name) => name.split(/[._-]/).at(-1) === "vibe")
}

/**
 * Appends the mood instruction only when the `vibe` tool is available and the
 * prompt marker is not already present. Returns whether it injected anything.
 */
export function injectVibePrompt(event: PromptEvent): boolean {
  if (!hasVibeTool(event.tools)) return false
  const alreadyPresent = event.system.some(
    (part) => part.type === "text" && typeof part.text === "string" && part.text.includes(PROMPT_MARKER),
  )
  if (alreadyPresent) return false
  event.system.push({ type: "text", text: VIBE_PROMPT })
  return true
}
