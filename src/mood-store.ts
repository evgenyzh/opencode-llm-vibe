/** Each event replaces the complete mood, preserving the previous snapshot. */
import { createStore } from "solid-js/store"
import type { Mood } from "./mood.js"

export function createMoodStore() {
  // Solid merges object values in place. Arrays are replaced instead, so old
  // mood references remain immutable and omitted optional fields disappear.
  const [moods, setMoods] = createStore<Record<string, [Mood | null]>>({})
  return {
    get: (sessionID: string): Mood | null => moods[sessionID]?.[0] ?? null,
    set: (sessionID: string, mood: Mood | null): void => setMoods(sessionID, [mood]),
  }
}
