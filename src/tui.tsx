/** TUI part: RPC subscription, sidebar rectangle, and the /vibe toggle. */

import { Plugin } from "@opencode/plugin/tui"
import { createSignal, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { nextActivity, type Activity, type ActivityEvent } from "./activity.js"
import {
  contextLimit,
  contextRatio,
  contextTokens,
  type TokenUsageLike,
} from "./context-usage.js"
import { SIDEBAR_COLUMNS, SIDEBAR_PIXEL_ROWS } from "./dimensions.js"
import type { Mood } from "./mood.js"
import { VibeRpc } from "./rpc.js"
import { MoodSquare } from "./square.js"

/** Live-only TUI state. Restarting the TUI intentionally loses it. */
const [moods, setMoods] = createStore<Record<string, Mood | null>>({})
const [activities, setActivities] = createStore<Record<string, Activity>>({})
const [contextLevels, setContextLevels] = createStore<Record<string, number>>({})

export default Plugin.define({
  id: "llm-vibe.tui",
  setup(context) {
    const [visible, setVisible] = createSignal(true)
    const vibe = context.client.rpc(VibeRpc)
    const unsubscribe = vibe.events.on("updated", (event) => {
      const data = event.data as { sessionID: string; mood: Mood | null }
      setMoods(data.sessionID, data.mood)
    })

    const update = (sessionID: string, event: ActivityEvent): void => {
      setActivities(sessionID, nextActivity(activities[sessionID] ?? "idle", event))
    }

    const updateContext = (
      sessionID: string,
      assistantMessageID: string,
      usage: TokenUsageLike,
    ): void => {
      const session = context.data.session.get(sessionID)
      const assistant = context.data.session.message.get(sessionID, assistantMessageID)
      const ref =
        session?.model ?? (assistant?.type === "assistant" ? assistant.model : undefined)
      const model = ref
        ? context.data.location.model.list()?.find(
            (candidate) =>
              candidate.providerID === ref.providerID && candidate.modelID === ref.id,
          )
        : undefined
      setContextLevels(sessionID, contextRatio(contextTokens(usage), contextLimit(model?.limit)))
    }

    const stops: Array<() => void> = []
    stops.push(
      context.data.on("session.execution.started", (event) => update(event.data.sessionID, "execution.started")),
      context.data.on("session.execution.succeeded", (event) => update(event.data.sessionID, "execution.succeeded")),
      context.data.on("session.execution.failed", (event) => update(event.data.sessionID, "execution.failed")),
      context.data.on("session.execution.interrupted", (event) => update(event.data.sessionID, "execution.interrupted")),
      context.data.on("session.step.started", (event) => update(event.data.sessionID, "step.started")),
      context.data.on("session.step.ended", (event) => {
        update(event.data.sessionID, "step.ended")
        updateContext(event.data.sessionID, event.data.assistantMessageID, event.data.tokens)
      }),
      context.data.on("session.step.failed", (event) => update(event.data.sessionID, "step.failed")),
      context.data.on("session.reasoning.started", (event) => update(event.data.sessionID, "reasoning.started")),
      context.data.on("session.reasoning.ended", (event) => update(event.data.sessionID, "reasoning.ended")),
      context.data.on("session.text.started", (event) => update(event.data.sessionID, "text.started")),
      context.data.on("session.text.ended", (event) => update(event.data.sessionID, "text.ended")),
      context.data.on("session.tool.input.started", (event) => update(event.data.sessionID, "tool.started")),
      context.data.on("session.tool.called", (event) => update(event.data.sessionID, "tool.started")),
      context.data.on("session.tool.success", (event) => update(event.data.sessionID, "tool.finished")),
      context.data.on("session.tool.failed", (event) => update(event.data.sessionID, "tool.finished")),
      context.data.on("session.retry.scheduled", (event) => update(event.data.sessionID, "retry")),
      context.data.on("session.idle", (event) => update(event.data.sessionID, "idle")),
      context.data.on("session.status", (event) => {
        const sessionID = event.data.sessionID
        if (event.data.status.type === "idle") setActivities(sessionID, "idle")
        else if ((activities[sessionID] ?? "idle") === "idle") setActivities(sessionID, "waiting")
      }),
    )

    context.ui.slot({
      prepend: "sidebar.content",
      render: ({ sessionID }) => (
        <Show when={visible()}>
          <MoodSquare
            sessionID={sessionID}
            mood={moods[sessionID] ?? null}
            columns={SIDEBAR_COLUMNS}
            pixelRows={SIDEBAR_PIXEL_ROWS}
            activity={activities[sessionID] ?? "idle"}
            contextRatio={contextLevels[sessionID] ?? 0.5}
          />
        </Show>
      ),
    })

    context.keymap.layer(() => ({
      mode: "global",
      commands: [
        {
          id: "llm-vibe.toggle",
          title: "Toggle vibe in sidebar",
          description: "Show or hide the mood rectangle in the sidebar",
          group: "Vibe",
          slash: { name: "vibe" },
          enabled: () => context.ui.router.current().type === "session",
          run: () => {
            setVisible((value) => !value)
          },
        },
      ],
    }))

    return () => {
      unsubscribe()
      for (const stop of stops) stop()
    }
  },
})
