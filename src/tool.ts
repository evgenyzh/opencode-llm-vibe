/** Tool execution logic kept separate from plugin wiring for tests. */

import { parseVibe, type Mood } from "./mood.js"

export type EmitMood = (sessionID: string, mood: Mood | null) => Promise<void>

/**
 * Parses a `vibe` call, emits one event when the input is meaningful, and
 * always returns `ok`. Invalid input is silent and does not throw.
 */
export async function handleVibe(
  input: unknown,
  sessionID: string,
  emit: EmitMood,
): Promise<{ readonly content: "ok" }> {
  const parsed = parseVibe(input)
  if (parsed) {
    try {
      await emit(sessionID, parsed.kind === "clear" ? null : parsed.mood)
    } catch (error) {
      console.warn("[llm-vibe] failed to emit mood update", error)
    }
  }
  return { content: "ok" }
}
