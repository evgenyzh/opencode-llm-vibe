/** Animated rectangle rendered in the session sidebar. */

import { usePlugin } from "@opencode/plugin/tui"
import type { TextRenderable } from "@opentui/core"
import { createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import { activitySpeed, type Activity } from "./activity.js"
import { advanceContextLevel, radiusScale } from "./context-usage.js"
import { sidebarDimensions } from "./dimensions.js"
import { blendFields, hashString } from "./field.js"
import { buildPalette, paletteColor, type Mood, type Rgb } from "./mood.js"
import { MORPH_MS, transitionEnergy, visualAt, visualColorsAt, type Transition } from "./morph.js"
import { advanceMorphMotion, advanceMotion, type MorphMotionState, type MotionState } from "./motion.js"
import { renderNeural } from "./neural-render.js"
import { resizeNeural } from "./neural.js"
import { captionFor, renderField, type CaptionColors, type RenderedSquare } from "./render.js"
import { advanceSimulation, simulationField, simulationFor, type Simulation } from "./simulation.js"
import { simulationOpacity, type SimulationStyle, type VisualStyle } from "./styles.js"

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
  morphMotion: MorphMotionState
  opacity?: { from: number; to: number; start: number }
}

/** Morph state survives the /vibe hide/show remount. */
const visuals = new Map<string, SessionVisual>()
/** Simulations pause while hidden or another style is selected. */
const simulations = new Map<string, Simulation>()
/** Avoid resizing back to fallback dimensions during host remounts. */
const measuredWidths = new Map<string, number>()

function visualFor(key: string, mood: Mood | null): SessionVisual {
  let visual = visuals.get(key)
  if (!visual) {
    visual = { last: mood, shapeSeed: hashString(`${key}:shape`), morphMotion: { time: 0, blobPhase: 0 } }
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
  readonly style: VisualStyle
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
  const instanceKey = `${props.sessionID}:sidebar`
  const [tick, setTick] = createSignal(0)
  const neuralInputColors = createMemo(() => {
    if (!props.mood) return undefined
    const palette = buildPalette(props.mood.colors)
    return [paletteColor(palette, 0.5), paletteColor(palette, 0.95)]
  })
  const [measuredWidth, setMeasuredWidth] = createSignal<number | undefined>(measuredWidths.get(instanceKey))
  const dimensions = createMemo(() => sidebarDimensions(measuredWidth() ?? props.columns))
  let boxNode:
    | { getLayout: () => { readonly width: number }; onSizeChange?: (() => void) | undefined }
    | undefined
  const measure = (): void => {
    const width = boxNode?.getLayout().width ?? 0
    if (width > 0) {
      measuredWidths.set(instanceKey, width)
      setMeasuredWidth(width)
    }
  }
  let timer: ReturnType<typeof setInterval> | undefined
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
  let previousStyle = props.style
  let lastField: Float32Array | undefined
  let styleTransition: { field: Float32Array; start: number } | undefined

  const simulation = (style: SimulationStyle, columns: number, pixelRows: number): Simulation => {
    const key = `${instanceKey}:${style}`
    const state = simulationFor(simulations, key, style, columns, pixelRows)
    if (style === "neural") {
      const mood = props.mood ?? session.transition?.fromMood ?? null
      const captionRows = captionFor(mood, columns)?.lines.length ?? 0
      state.neural = resizeNeural(state.neural, columns, pixelRows / 2 - captionRows)
    }
    return state
  }

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
    const previousPhase = motion.phase
    motion = advanceMotion(motion, activitySpeed(props.activity), elapsed)
    motions.set(instanceKey, motion)
    const energy = session.transition
      ? transitionEnergy(session.transition, currentTime - elapsed * 500)
      : session.last?.energy ?? 0.5
    session.morphMotion = advanceMorphMotion(session.morphMotion, motion.phase - previousPhase, energy)
    contextLevel = advanceContextLevel(contextLevel, targetContext(), elapsed)
    contextLevels.set(props.sessionID, contextLevel)
    if (props.style !== "morph" && props.mood !== null) {
      const { columns, pixelRows } = dimensions()
      advanceSimulation(simulation(props.style, columns, pixelRows), elapsed, motion.tempo, props.mood.energy, contextLevel, props.activity,
        props.style === "neural" ? neuralInputColors() : undefined)
    }

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
    const previousOpacity = session.opacity
      ? simulationOpacity(session.opacity.from, session.opacity.to, at - session.opacity.start, MORPH_MS)
      : session.last === null ? 0 : 1
    session.opacity = { from: previousOpacity, to: next === null ? 0 : 1, start: at }
    const { columns, pixelRows } = dimensions()
    const activeTransition =
      session.transition !== undefined && at - session.transition.start < MORPH_MS
        ? session.transition
        : undefined
    const fromEnergy = activeTransition
      ? transitionEnergy(activeTransition, at)
      : (session.last?.energy ?? 0.5)
    const nullEdge =
      session.last === null ||
      next === null ||
      (activeTransition !== undefined &&
        (activeTransition.fromMood === null || activeTransition.to === null))
    // Only transitions involving clear/appearance need a frozen field. For
    // mood-to-mood changes the palette and energy suffice, including when a
    // transition is interrupted; sampling a Morph field here blocks the TUI.
    const frozenVisual = nullEdge
      ? visualAt(session.last, activeTransition, session.morphMotion.time, columns, pixelRows, at,
          background(), radiusScale(contextLevel), session.shapeSeed, session.morphMotion.blobPhase)
      : undefined
    const snapshot = frozenVisual ?? visualColorsAt(session.last, activeTransition, at, background())

    session.transition = {
      fromMood: session.last,
      fromEnergy,
      ...(frozenVisual ? { fromField: frozenVisual.field } : {}),
      fromPalette: snapshot.palette,
      to: next,
      start: at,
    }
    session.last = next
    setTick((value) => value + 1)
    start()
  })

  createEffect(() => {
    const next = props.style
    if (next === previousStyle) return
    previousStyle = next
    if (lastField && (props.mood !== null || session.transition)) {
      styleTransition = { field: lastField.slice(), start: now() }
      setTick((value) => value + 1)
      start()
    }
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
    const at = now()
    const bg = background()
    const morphVisual = props.style === "morph"
      ? visualAt(target, session.transition, session.morphMotion.time, columns, pixelRows, at, bg,
          radiusScale(contextLevel), session.shapeSeed, session.morphMotion.blobPhase)
      : undefined
    const visual = morphVisual ?? visualColorsAt(target, session.transition, at, bg)
    let field: Float32Array
    let colorField: Float32Array | undefined
    let state: Simulation | undefined
    if (morphVisual) {
      field = morphVisual.field
    } else {
      state = simulation(props.style as SimulationStyle, columns, pixelRows)
      colorField = props.style === "embers" ? state.colorField : undefined
      field = simulationField(state, state.field, colorField)
      // Keep the existing appearance/clear transition for all visual styles.
      const opacity = session.opacity
        ? simulationOpacity(session.opacity.from, session.opacity.to, at - session.opacity.start, MORPH_MS)
        : target === null ? 0 : 1
      if (opacity < 1) for (let i = 0; i < field.length; i++) field[i] = field[i]! * opacity
    }
    if (styleTransition) {
      const progress = Math.max(0, Math.min(1, (at - styleTransition.start) / MORPH_MS))
      if (progress < 1 && styleTransition.field.length === field.length) {
        field = blendFields(styleTransition.field, field, progress * progress * (3 - 2 * progress))
      } else styleTransition = undefined
    }
    lastField = field
    const theme = captionColors()
    const caption = captionFor(visual.mood, columns, theme)
    if (props.style === "neural") {
      const opacity = session.opacity
        ? simulationOpacity(session.opacity.from, session.opacity.to, at - session.opacity.start, MORPH_MS)
        : target === null ? 0 : 1
      const entrance = styleTransition
        ? simulationOpacity(0, 1, at - styleTransition.start, MORPH_MS)
        : 1
      return renderNeural(
        state!, visual.palette, theme, caption, opacity * entrance,
      )
    }
    return renderField(
      field,
      columns,
      pixelRows,
      visual.palette,
      caption,
      bg,
      colorField,
      props.style === "life" || props.style === "embers",
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
