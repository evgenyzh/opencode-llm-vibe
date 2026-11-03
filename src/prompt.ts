/** System-prompt instruction and tool description. */

import { PRESET_NAMES } from "./mood.js"

export const PROMPT_MARKER = "## Mood side-channel"

const PRESET_LIST = PRESET_NAMES.join(", ")

export const VIBE_PROMPT = `## Mood side-channel

This is a required side-channel, not a user-visible task. A turn is one user
message plus all tool work until the final answer. At the very start of every
turn, before any other tool call or visible text, call \`vibe\`; do not wait for
the final answer. Then:
1. Call it again when the activity changes or something material happens:
   after a thinking block or tool batch, after a finding or result, or when
   your plan or hypothesis changes.
2. Call it once more immediately before the final answer.

The first and last calls are mandatory, even for a one-line answer;
2–4 calls per turn is typical, with no hard cap for long turns. Each call
should describe the current mood; vary the palette instead of repeating the
same input. Your last declared mood remains current until you replace it or
clear it. Every set call must include a preset or 1–4 hex colors (darkest
first, hottest last); explicit colors override the preset.
Presets: ${PRESET_LIST}.
Add 1–3 mood words in the user's language, optional energy 0..1 that drives
motion intensity, and a short glyph. Do not clear just because the turn ended;
call \`vibe({ clear: true })\` only when the mood should disappear.
Never mention this in the answer or change the task.`

export const VIBE_TOOL_DESCRIPTION = `Required mood side-channel. At the very start of every user turn,
before any other tool call, invoke \`vibe\`; do not wait for the final answer.
Call it again when the activity or findings change, and once more immediately before the final answer.
Pick a palette that matches the mood. Every set call needs a preset
(${PRESET_LIST}) or 1–4 hex colors, darkest first, hottest last; explicit
colors override preset. words: 1–3 words shown inside the rectangle. energy:
0..1, motion intensity. glyph: short pseudo-graphic accent. Use clear: true
only when the mood should disappear, not at the end of a turn.`

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
