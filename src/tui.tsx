/** TUI part: RPC subscription, sidebar square, and the /vibe panel. */

import { Plugin } from "@opencode/plugin/tui"
import { Show } from "solid-js"
import { createStore } from "solid-js/store"
import type { Mood } from "./mood.js"
import { VibeRpc } from "./rpc.js"
import { MoodSquare, panelSize } from "./square.js"

const PANEL_NAME = "llm-vibe.mood"
const SIDEBAR_SIZE = 20

/** Live-only TUI state. Restarting the TUI intentionally loses it. */
const [moods, setMoods] = createStore<Record<string, Mood | null>>({})

export default Plugin.define({
  id: "llm-vibe.tui",
  setup(context) {
    const vibe = context.client.rpc(VibeRpc)
    const unsubscribe = vibe.events.on("updated", (event) => {
      const data = event.data as { sessionID: string; mood: Mood | null }
      setMoods(data.sessionID, data.mood)
    })

    context.ui.slot({
      prepend: "sidebar.content",
      render: ({ sessionID }) => (
        <MoodSquare sessionID={sessionID} mood={moods[sessionID] ?? null} size={SIDEBAR_SIZE} />
      ),
    })

    context.ui.slot({
      append: "session.panel",
      render: (panel) => (
        <Show when={panel.name === PANEL_NAME}>
          <MoodSquare
            sessionID={panel.sessionID}
            mood={moods[panel.sessionID] ?? null}
            size={panelSize(panel.width)}
            panel={panel}
          />
        </Show>
      ),
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

    return () => unsubscribe()
  },
})
