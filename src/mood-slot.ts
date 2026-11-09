import { createComponent, Show, type Component, type JSX } from "solid-js"
import type { MoodSquareProps } from "./square.js"

/** Keep the sidebar mounted while its live properties change. */
export function createMoodSlot(input: {
  sessionID: string
  columns: number
  pixelRows: number
  visible: () => boolean
  mood: () => MoodSquareProps["mood"]
  activity: () => MoodSquareProps["activity"]
  contextRatio: () => number
  style: () => MoodSquareProps["style"]
  square: Component<MoodSquareProps>
}): JSX.Element {
  // esbuild's automatic JSX runtime evaluates props eagerly. These getters
  // prevent every session event from tearing down and recreating the square.
  return createComponent(Show, {
    keyed: true,
    get when() { return input.visible() },
    get children() {
      return createComponent(input.square, {
        sessionID: input.sessionID,
        columns: input.columns,
        pixelRows: input.pixelRows,
        get mood() { return input.mood() },
        get activity() { return input.activity() },
        get contextRatio() { return input.contextRatio() },
        get style() { return input.style() },
      })
    },
  })
}
