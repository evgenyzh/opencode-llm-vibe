/** Server part: prompt hook, `vibe` tool, and RPC event emission. */

import { Plugin } from "@opencode/plugin"
import { VIBE_INPUT_SCHEMA } from "./mood.js"
import { injectVibePrompt, VIBE_TOOL_DESCRIPTION } from "./prompt.js"
import { VibeRpc } from "./rpc.js"
import { handleVibe } from "./tool.js"

export default Plugin.define({
  id: "llm-vibe",
  async setup(context) {
    const rpc = await context.rpc.register(VibeRpc, {})

    const tools = await context.tool.transform((editor) => {
      editor.add({
        name: "vibe",
        description: VIBE_TOOL_DESCRIPTION,
        input: VIBE_INPUT_SCHEMA,
        execute: async (input, toolContext) =>
          handleVibe(input, toolContext.sessionID, (sessionID, mood) =>
            rpc.events.emit("updated", { sessionID, mood }),
          ),
      })
    })

    const hook = await context.session.hook("context", (event) => {
      injectVibePrompt(event)
    })

    return async () => {
      await hook.dispose()
      await tools.dispose()
      await rpc.dispose()
    }
  },
})
