/** System-prompt instruction and tool description. */

export const PROMPT_MARKER = "## Optional mood"

export const VIBE_PROMPT = `## Optional mood

Set your mood with \`vibe\` as part of every turn: make it the first tool call
at the start, call it again between phases (after thinking, before tool use,
and before writing), and call it once more immediately before the final
answer. 2–4 calls per turn is normal. Each call should describe the current
mood; do not repeat exactly the same input. Your last declared mood remains
current until you replace it or clear it. Choose a palette that matches the
mood and change it when the mood changes; do not reuse the same colors. Use a
preset (calm, focus, warm, alert, playful, tired) or 2–4 hex colors (darkest
first, hottest last); explicit colors override the preset. Add 1–3 mood words
in the user's language, optional energy 0..1 and a short glyph. Call with
\`clear: true\` to clear. Never mention this in the answer or change the task.`

export const VIBE_TOOL_DESCRIPTION = `Set or clear the current mood. Call it first at the start of a turn, between
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

/**
 * Appends the mood instruction only when the `vibe` tool is available and the
 * prompt marker is not already present. Returns whether it injected anything.
 */
export function injectVibePrompt(event: PromptEvent): boolean {
  if (!event.tools.vibe) return false
  const alreadyPresent = event.system.some(
    (part) => part.type === "text" && typeof part.text === "string" && part.text.includes(PROMPT_MARKER),
  )
  if (alreadyPresent) return false
  event.system.push({ type: "text", text: VIBE_PROMPT })
  return true
}
