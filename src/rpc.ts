/** Typed RPC contract shared by the server and TUI parts. */

import { Rpc } from "@opencode/plugin/rpc"

export const MoodSchema = {
  type: "object",
  properties: {
    colors: {
      type: "array",
      items: { type: "string" },
      minItems: 1,
      maxItems: 4,
    },
    words: { type: "string" },
    energy: { type: "number", minimum: 0, maximum: 1 },
    glyph: { type: "string" },
  },
  required: ["colors", "energy"],
  additionalProperties: false,
} as const

export const VibeRpc = Rpc.define({
  id: "llm-vibe",
  methods: {},
  events: {
    updated: {
      schema: {
        type: "object",
        properties: {
          sessionID: { type: "string" },
          mood: {
            anyOf: [MoodSchema, { type: "null" }],
          },
        },
        required: ["sessionID", "mood"],
        additionalProperties: false,
      },
    },
  },
})
