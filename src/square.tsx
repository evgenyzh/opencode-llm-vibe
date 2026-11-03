/** Animated square shared by the sidebar slot and the /vibe panel. */

import { usePlugin } from "@opencode/plugin/tui"
import type { PanelInput } from "@opencode/plugin/tui/context"
import type { TextRenderable } from "@opentui/core"
import { createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import { blendFields, normalizeSize, sampleField } from "./field.js"
import { blendPalettes, type Mood } from "./mood.js"
import {
  captionFor,
  paletteFor,
  renderField,
  renderSquare,
  type RenderedSquare,
} from "./render.js"

const FPS = 10
const FRAME_MS = 1000 / FPS
const MORPH_MS = 700

export interface MoodSquareProps {
  readonly sessionID: string
  readonly mood: Mood | null
  readonly size: number
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

/** Fits a panel square into the available width. */
export function panelSize(width: number): number {
  if (!Number.isFinite(width)) return 12
  return Math.max(12, Math.min(32, normalizeSize(width - 4)))
}

export function MoodSquare(props: MoodSquareProps) {
  const plugin = usePlugin()
  const [tick, setTick] = createSignal(0)
  let timer: ReturnType<typeof setInterval> | undefined
  let transition: Transition | undefined
  let initialized = false
  let last: Mood | null = null

  const start = (): void => {
    if (timer === undefined) timer = setInterval(frame, FRAME_MS)
  }

  const stop = (): void => {
    if (timer !== undefined) {
      clearInterval(timer)
      timer = undefined
    }
  }

  function frame(): void {
    const current = transition
    if (current && now() - current.start >= MORPH_MS) {
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
    const time = now() / 1000
    const size = normalizeSize(props.size)
    const current = transition

    if (!current) return renderSquare(props.mood, size, time)

    const raw = clamp((now() - current.start) / MORPH_MS, 0, 1)
    if (raw >= 1) return renderSquare(props.mood, size, time)

    const progress = ease(raw)
    const field = blendFields(
      sampleField(current.from, time, size),
      sampleField(current.to, time, size),
      progress,
    )
    const palette = blendPalettes(paletteFor(current.from), paletteFor(current.to), progress)
    const caption = progress < 0.45 ? captionFor(current.from, size) : captionFor(current.to, size)
    return renderField(field, size, palette, caption)
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
