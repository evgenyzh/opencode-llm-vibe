/** Animated rectangle rendered in the session sidebar. */

import { usePlugin } from "@opencode/plugin/tui"
import type { TextRenderable } from "@opentui/core"
import { createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import { activitySpeed, type Activity } from "./activity.js"
import { advanceContextLevel, radiusScale } from "./context-usage.js"
import { sidebarDimensions } from "./dimensions.js"
import { hashString } from "./field.js"
import type { Mood, Rgb } from "./mood.js"
import { MORPH_MS, transitionEnergy, visualAt, type Transition } from "./morph.js"
import { advanceMotion, type MotionState } from "./motion.js"
import { captionFor, renderField, type CaptionColors, type RenderedSquare } from "./render.js"

const FPS = 15
const FRAME_MS = 1000 / FPS

/** Motion survives host re-renders; each sidebar instance animates independently. */
const motions = new Map<string, MotionState>()
/** Smoothed context fill per session; survives the /vibe hide/show remount. */
const contextLevels = new Map<string, number>()

interface SessionVisual {
  last: Mood | null
  transition?: Transition
  /** Blob identity is pinned per session, so moods migrate instead of reseeding. */
  shapeSeed: number
}

/** Morph state survives the /vibe hide/show remount. */
const visuals = new Map<string, SessionVisual>()

function visualFor(key: string, mood: Mood | null): SessionVisual {
  let visual = visuals.get(key)
  if (!visual) {
    visual = { last: mood, shapeSeed: hashString(`${key}:shape`) }
    visuals.set(key, visual)
  }
  return visual
}

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
  const instanceKey = `${props.sessionID}:sidebar`
  const session = visualFor(instanceKey, props.mood)
  let motion = motions.get(instanceKey) ?? {
    phase: 0,
    tempo: activitySpeed(props.activity),
  }
  motions.set(instanceKey, motion)
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

  if (props.mood !== null || session.transition !== undefined) start()

  function frame(): void {
    const currentTime = now()
    const elapsed = Math.min(0.25, (currentTime - lastFrame) / 1000)
    lastFrame = currentTime
    motion = advanceMotion(motion, activitySpeed(props.activity), elapsed)
    motions.set(instanceKey, motion)
    contextLevel = advanceContextLevel(contextLevel, targetContext(), elapsed)
    contextLevels.set(props.sessionID, contextLevel)

    const current = session.transition
    if (current && currentTime - current.start >= MORPH_MS) {
      session.transition = undefined
      if (session.last === null) stop()
    }
    setTick((value) => value + 1)
  }

  createEffect(() => {
    const next = props.mood
    if (next === session.last) return

    const at = now()
    const { columns, pixelRows } = dimensions()
    const activeTransition =
      session.transition !== undefined && at - session.transition.start < MORPH_MS
        ? session.transition
        : undefined
    const snapshot = visualAt(
      session.last,
      activeTransition,
      motion.phase,
      columns,
      pixelRows,
      at,
      background(),
      radiusScale(contextLevel),
      session.shapeSeed,
    )

    const fromEnergy = activeTransition
      ? transitionEnergy(activeTransition, at)
      : (session.last?.energy ?? 0.5)
    const nullEdge =
      session.last === null ||
      next === null ||
      (activeTransition !== undefined &&
        (activeTransition.fromMood === null || activeTransition.to === null))

    session.transition = {
      fromMood: session.last,
      fromEnergy,
      ...(nullEdge ? { fromField: snapshot.field } : {}),
      fromPalette: snapshot.palette,
      to: next,
      start: at,
    }
    session.last = next
    setTick((value) => value + 1)
    start()
  })

  onCleanup(stop)
  onCleanup(() => {
    if (boxNode) boxNode.onSizeChange = undefined
  })

  let text: TextRenderable | undefined

  const output = createMemo<RenderedSquare>(() => {
    tick()
    const { columns, pixelRows } = dimensions()
    const target = session.transition ? session.transition.to : session.last
    const visual = visualAt(
      target,
      session.transition,
      motion.phase,
      columns,
      pixelRows,
      now(),
      background(),
      radiusScale(contextLevel),
      session.shapeSeed,
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
