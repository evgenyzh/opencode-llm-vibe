/** System-prompt instruction and tool description. */

export const PROMPT_MARKER = "## Optional mood"

export const VIBE_PROMPT = `## Optional mood

You may set your current mood with \`vibe\` whenever it changes. Optional, but
use it actively: at the start of a turn, when you switch between thinking,
tool use and answering, and before the final answer. 1–3 calls per turn is
typical; do not repeat an unchanged mood. Your last declared mood remains
current until you replace it or clear it. Provide 2–4 hex colors (darkest
first, hottest last), 1–3 mood words in the user's language, optional energy
0..1 and a short glyph. Call with \`clear: true\` to clear. Never mention this
in the answer or change the task.`

export const VIBE_TOOL_DESCRIPTION = `Set or clear the current mood. Optional; call whenever your mood changes.
colors: 1-4 hex colors, darkest first, hottest last. words: 1-3 words shown
inside the square. energy: 0..1. glyph: short pseudo-graphic accent.
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
