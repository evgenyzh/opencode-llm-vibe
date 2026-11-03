/** TUI part: RPC subscription, sidebar rectangle, and the /vibe panel. */

import { Plugin } from "@opencode/plugin/tui"
import { Show } from "solid-js"
import { createStore } from "solid-js/store"
import { nextActivity, type Activity, type ActivityEvent } from "./activity.js"
import type { Mood } from "./mood.js"
import { VibeRpc } from "./rpc.js"
import {
  MoodSquare,
  SIDEBAR_COLUMNS,
  SIDEBAR_PIXEL_ROWS,
  panelDimensions,
} from "./square.js"

const PANEL_NAME = "llm-vibe.mood"

/** Live-only TUI state. Restarting the TUI intentionally loses it. */
const [moods, setMoods] = createStore<Record<string, Mood | null>>({})
const [activities, setActivities] = createStore<Record<string, Activity>>({})

export default Plugin.define({
  id: "llm-vibe.tui",
  setup(context) {
    const vibe = context.client.rpc(VibeRpc)
    const unsubscribe = vibe.events.on("updated", (event) => {
      const data = event.data as { sessionID: string; mood: Mood | null }
      setMoods(data.sessionID, data.mood)
    })

    const update = (sessionID: string, event: ActivityEvent): void => {
      setActivities(sessionID, nextActivity(activities[sessionID] ?? "idle", event))
    }

    const stops: Array<() => void> = []
    stops.push(
      context.data.on("session.execution.started", (event) => update(event.data.sessionID, "execution.started")),
      context.data.on("session.execution.succeeded", (event) => update(event.data.sessionID, "execution.succeeded")),
      context.data.on("session.execution.failed", (event) => update(event.data.sessionID, "execution.failed")),
      context.data.on("session.execution.interrupted", (event) => update(event.data.sessionID, "execution.interrupted")),
      context.data.on("session.step.started", (event) => update(event.data.sessionID, "step.started")),
      context.data.on("session.step.ended", (event) => update(event.data.sessionID, "step.ended")),
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
        <MoodSquare
          sessionID={sessionID}
          mood={moods[sessionID] ?? null}
          columns={SIDEBAR_COLUMNS}
          pixelRows={SIDEBAR_PIXEL_ROWS}
          activity={activities[sessionID] ?? "idle"}
        />
      ),
    })

    context.ui.slot({
      append: "session.panel",
      render: (panel) => {
        const dimensions = (): ReturnType<typeof panelDimensions> => panelDimensions(panel.width)
        return (
          <Show when={panel.name === PANEL_NAME}>
            <MoodSquare
              sessionID={panel.sessionID}
              mood={moods[panel.sessionID] ?? null}
              columns={dimensions().columns}
              pixelRows={dimensions().pixelRows}
              activity={activities[panel.sessionID] ?? "idle"}
              panel={panel}
            />
          </Show>
        )
      },
    })

    context.keymap.layer(() => ({
      mode: "global",
      commands: [
        {
          id: "llm-vibe.toggle",
          title: "Toggle vibe panel",
          description: "Show or hide the current mood square",
          group: "Vibe",
          slash: { name: "vibe" },
          enabled: () => context.ui.router.current().type === "session",
          run: () => {
            if (context.ui.panel.current()?.name === PANEL_NAME) {
              context.ui.panel.close()
              return
            }
            context.ui.panel.open(PANEL_NAME)
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
