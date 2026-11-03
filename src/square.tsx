/** Animated rectangle shared by the sidebar slot and the /vibe panel. */

import { usePlugin } from "@opencode/plugin/tui"
import type { PanelInput } from "@opencode/plugin/tui/context"
import type { TextRenderable } from "@opentui/core"
import { createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import { activitySpeed, type Activity } from "./activity.js"
import { blendFields, normalizeSize, sampleField } from "./field.js"
import { blendPalettes, type Mood } from "./mood.js"
import { advanceMotion, type MotionState } from "./motion.js"
import {
  captionFor,
  paletteFor,
  renderField,
  renderSquare,
  type RenderedSquare,
} from "./render.js"

const FPS = 12
const FRAME_MS = 1000 / FPS
const MORPH_MS = 700

/** Motion survives host re-renders; sidebar and panel animate independently. */
const motions = new Map<string, MotionState>()

export const SIDEBAR_COLUMNS = 24
export const SIDEBAR_PIXEL_ROWS = 18

export interface SquareDimensions {
  readonly columns: number
  readonly pixelRows: number
}

/** Fits a landscape rectangle into the available panel width. */
export function panelDimensions(width: number): SquareDimensions {
  const columns = Math.max(16, Math.min(32, normalizeSize(width - 4)))
  const pixelRows = Math.max(12, normalizeSize(Math.round(columns * 0.75)))
  return { columns, pixelRows }
}

export interface MoodSquareProps {
  readonly sessionID: string
  readonly mood: Mood | null
  readonly columns: number
  readonly pixelRows: number
  readonly activity: Activity
  readonly panel?: PanelInput
}

interface Transition {
  readonly from: Mood | null
  readonly to: Mood | null
  readonly start: number
}

function now(): number {
  return typeof performance === "object" && typeof performance.now === "function"
    ? performance.now()
    : Date.now()
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function ease(value: number): number {
  return value * value * (3 - 2 * value)
}

export function MoodSquare(props: MoodSquareProps) {
  const plugin = usePlugin()
  const [tick, setTick] = createSignal(0)
  let timer: ReturnType<typeof setInterval> | undefined
  let transition: Transition | undefined
  let initialized = false
  let last: Mood | null = null
  const motionKey = `${props.sessionID}:${props.panel ? "panel" : "sidebar"}`
  let motion = motions.get(motionKey) ?? {
    phase: 0,
    tempo: activitySpeed(props.activity),
  }
  motions.set(motionKey, motion)
  let lastFrame = now()

  const start = (): void => {
    if (timer === undefined) {
      lastFrame = now()
      timer = setInterval(frame, FRAME_MS)
    }
  }

  const stop = (): void => {
    if (timer !== undefined) {
      clearInterval(timer)
      timer = undefined
    }
  }

  function frame(): void {
    const currentTime = now()
    const elapsed = Math.min(0.25, (currentTime - lastFrame) / 1000)
    lastFrame = currentTime
    motion = advanceMotion(motion, activitySpeed(props.activity), elapsed)
    motions.set(motionKey, motion)

    const current = transition
    if (current && currentTime - current.start >= MORPH_MS) {
      transition = undefined
      if (last === null) stop()
    }
    setTick((value) => value + 1)
  }

  createEffect(() => {
    const next = props.mood
    if (!initialized) {
      initialized = true
      last = next
      if (next !== null) start()
      return
    }
    if (next === last) return

    transition = { from: last, to: next, start: now() }
    last = next
    setTick((value) => value + 1)
    if (next !== null) start()
  })

  onCleanup(stop)

  if (props.panel) {
    plugin.keymap.layer(() => ({
      commands: [
        {
          id: "llm-vibe.fullscreen",
          title: "Toggle vibe fullscreen",
          bind: "f",
          run: () => props.panel?.toggleFullscreen(),
        },
      ],
    }))
  }

  let text: TextRenderable | undefined

  const output = createMemo<RenderedSquare>(() => {
    tick()
    const columns = normalizeSize(props.columns)
    const pixelRows = normalizeSize(props.pixelRows)
    const current = transition

    if (!current) return renderSquare(props.mood, columns, pixelRows, motion.phase)

    const raw = clamp((now() - current.start) / MORPH_MS, 0, 1)
    if (raw >= 1) return renderSquare(props.mood, columns, pixelRows, motion.phase)

    const progress = ease(raw)
    const field = blendFields(
      sampleField(current.from, motion.phase, columns, pixelRows),
      sampleField(current.to, motion.phase, columns, pixelRows),
      progress,
    )
    const palette = blendPalettes(paletteFor(current.from), paletteFor(current.to), progress)
    const caption = progress < 0.45 ? captionFor(current.from, columns) : captionFor(current.to, columns)
    return renderField(field, columns, pixelRows, palette, caption)
  })

  createEffect(() => {
    const square = output()
    if (text) text.content = square.text
  })

  return (
    <box
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      width="100%"
      flexGrow={props.panel ? 1 : 0}
    >
      <text
        ref={(node) => {
          text = node
          node.content = output().text
        }}
        selectable={false}
        wrapMode="none"
      />
    </box>
  )
}
