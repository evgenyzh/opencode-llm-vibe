/** Animated rectangle rendered in the session sidebar. */

import { usePlugin } from "@opencode/plugin/tui"
import type { TextRenderable } from "@opentui/core"
import { createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import { activitySpeed, type Activity } from "./activity.js"
import { advanceContextLevel, radiusScale } from "./context-usage.js"
import { sidebarDimensions } from "./dimensions.js"
import type { Mood, Rgb } from "./mood.js"
import { MORPH_MS, visualAt, type Transition } from "./morph.js"
import { advanceMotion, type MotionState } from "./motion.js"
import { captionFor, renderField, type CaptionColors, type RenderedSquare } from "./render.js"

const FPS = 15
const FRAME_MS = 1000 / FPS

/** Motion survives host re-renders; each sidebar instance animates independently. */
const motions = new Map<string, MotionState>()
/** Smoothed context fill per session; survives the /vibe hide/show remount. */
const contextLevels = new Map<string, number>()

export interface MoodSquareProps {
  readonly sessionID: string
  readonly mood: Mood | null
  /** Fallback until the sidebar layout is measured. */
  readonly columns: number
  readonly pixelRows: number
  readonly activity: Activity
  /** 0..1 filled part of the model's context window. */
  readonly contextRatio: number
}

function now(): number {
  return typeof performance === "object" && typeof performance.now === "function"
    ? performance.now()
    : Date.now()
}

export function MoodSquare(props: MoodSquareProps) {
  const plugin = usePlugin()
  const background = (): Rgb => {
    const [r, g, b] = plugin.theme.background.raised.base.toInts()
    return { r, g, b }
  }
  const captionColors = (): CaptionColors => {
    const [br, bgColor, bb] = plugin.theme.background.raised.base.toInts()
    const [tr, tg, tb] = plugin.theme.text.base.toInts()
    return {
      background: { r: br, g: bgColor, b: bb },
      text: { r: tr, g: tg, b: tb },
    }
  }
  const [tick, setTick] = createSignal(0)
  const [measuredWidth, setMeasuredWidth] = createSignal<number>()
  const dimensions = createMemo(() => sidebarDimensions(measuredWidth() ?? props.columns))
  let boxNode:
    | { getLayout: () => { readonly width: number }; onSizeChange?: (() => void) | undefined }
    | undefined
  const measure = (): void => {
    const width = boxNode?.getLayout().width ?? 0
    if (width > 0) setMeasuredWidth(width)
  }
  let timer: ReturnType<typeof setInterval> | undefined
  let transition: Transition | undefined
  let initialized = false
  let last: Mood | null = null
  const motionKey = `${props.sessionID}:sidebar`
  let motion = motions.get(motionKey) ?? {
    phase: 0,
    tempo: activitySpeed(props.activity),
  }
  motions.set(motionKey, motion)
  const targetContext = (): number => {
    const value = Number(props.contextRatio)
    if (!Number.isFinite(value)) return 0.5
    return Math.min(1, Math.max(0, value))
  }
  let contextLevel = contextLevels.get(props.sessionID) ?? targetContext()
  contextLevels.set(props.sessionID, contextLevel)
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
    contextLevel = advanceContextLevel(contextLevel, targetContext(), elapsed)
    contextLevels.set(props.sessionID, contextLevel)

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

    const at = now()
    const { columns, pixelRows } = dimensions()
    const active = transition !== undefined && at - transition.start < MORPH_MS
    const snapshot = visualAt(
      last,
      active ? transition : undefined,
      motion.phase,
      columns,
      pixelRows,
      at,
      background(),
      radiusScale(contextLevel),
    )

    transition = {
      fromMood: last,
      ...(active ? { fromField: snapshot.field } : {}),
      fromPalette: snapshot.palette,
      to: next,
      start: at,
    }
    last = next
    setTick((value) => value + 1)
    if (next !== null) start()
  })

  onCleanup(stop)
  onCleanup(() => {
    if (boxNode) boxNode.onSizeChange = undefined
  })

  let text: TextRenderable | undefined

  const output = createMemo<RenderedSquare>(() => {
    tick()
    const { columns, pixelRows } = dimensions()
    const visual = visualAt(
      props.mood,
      transition,
      motion.phase,
      columns,
      pixelRows,
      now(),
      background(),
      radiusScale(contextLevel),
    )
    return renderField(
      visual.field,
      columns,
      pixelRows,
      visual.palette,
      captionFor(visual.mood, columns, captionColors()),
      background(),
    )
  })

  createEffect(() => {
    const square = output()
    if (text) text.content = square.text
  })

  return (
    <box
      ref={(node) => {
        boxNode = node
        measure()
        node.onSizeChange = measure
      }}
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      width="100%"
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
