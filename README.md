# opencode-llm-vibe

An OpenCode V2 plugin that lets the model declare its current mood with a `vibe`
tool and renders it as an animated pseudo-graphic rectangle in the TUI.

The rectangle lives in the sidebar. `/vibe` toggles it on or off; with no mood
the slot blends into the theme background.

## Install

The package is loaded through `opencode.json(c)` because both the server and TUI
parts are required:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["opencode-llm-vibe"]
}
```

For local development, point at the package directory in the project config or
in the global `~/.config/opencode/opencode.json`:

```jsonc
{
  "plugins": ["/home/me/Projects/llm-vibe"]
}
```

Then build the package and start OpenCode:

```bash
npm install
npm run build
opencode
```

Putting only the TUI part in `cli.json` is not enough: the server part provides
the prompt instruction, the `vibe` tool, and the RPC event.

## Usage

The model may call the tool whenever it wants, with a preset or explicit colors:

```json
{
  "preset": "calm",
  "words": "спокойствие",
  "energy": 0.4,
  "glyph": "✦"
}
```

```json
{
  "colors": ["#112244", "#4b3f72", "#ff8844"],
  "words": "спокойствие",
  "energy": 0.4,
  "glyph": "✦"
}
```

- `preset` — `calm`, `focus`, `warm`, `alert`, `playful`, or `tired`.
- `colors` — 1–4 hex colors, darkest first, hottest last. Explicit colors
  override a preset.
- `words` — short mood words shown inside the lower part of the rectangle.
- `energy` — `0..1`; controls motion and turbulence.
- `glyph` — optional short pseudo-graphic accent.

The prompt asks the model to change the palette when the mood changes, so
different vibes do not collapse into the same blue/orange gradient.

The prompt makes the tool part of every turn: the first tool call should be
`vibe`, with updates between phases and immediately before the final answer
(2–4 calls is the normal range; the first and last are mandatory). The tool is
registered as a direct tool (`codemode: false`), so the model can call it
without routing through `execute`. The last call wins; there is no history. To
remove the mood, the model calls:

```json
{ "clear": true }
```

`clear` is a flag in the same tool, not a separate tool. The tool always returns
`ok` and never echoes the mood back, so the model does not pay for a copy of its
own input.

`/vibe` toggles the rectangle in the sidebar. Hiding it or restarting the TUI
does not change the mood; the state is live-only and is not restored from
session history.

## What it looks like

- Sidebar: measures its own width, fills it (24 columns by default, up to 64),
  and keeps a landscape aspect. The blob is sampled with a virtual margin so it
  does not touch the edges.
- The image is a moving gradient/blob field with low-frequency noise.
- Blob radius follows context-window fill: 0.8× when nearly empty, 1.25× when
  full. The level is eased over ~1 s, so it grows and shrinks smoothly,
  including after compaction.
- Empty pixels fade into the TUI theme background; there is no vignette or
  visible rectangle around the image.
- Words are rendered on the theme background at the bottom; image pixels remain
  on both sides.
- With no mood, nothing is drawn: the slot is just the theme background.
- Animation tempo follows live activity: idle 0.5×, waiting 0.9×, thinking
  1.7×, writing 2.1×, tool 2.6×, with a ~300 ms ease between speeds. The model
  does not need to call the tool for this; the TUI listens to session events.
  The renderer runs at 15 FPS.
- Mood changes morph over ~1 s. If a new `vibe` call arrives mid-morph, the next
  transition starts from the currently rendered field and palette instead of
  snapping back to the previous target.

The renderer uses half blocks (`▀`): `fg` is the top pixel and `bg` is the bottom
pixel, with 24-bit color.

## Token overhead

Measured on DeepSeek V4 Flash (Bifrost), 3 runs with the plugin and 3 without,
using a prompt that does not call the tool:

| | Without plugin | With plugin |
|---|---:|---:|
| Prompt tokens (input + cache read) | 6,171 | 6,306 |

**Fixed overhead was +135 input tokens per model request** in the last measured
build. That is the system instruction plus the tool schema, the preset enum, and
the description. The current mandatory-side-channel wording is slightly longer;
re-measure if the exact budget matters. Exact numbers vary by tokenizer and
model.

A direct `vibe` call adds roughly 30–50 tokens of JSON plus `ok`, and causes one
extra model request that re-reads the current context (~300–400 tokens plus
context). The tool call also stays in the session history and adds roughly
30–60 tokens per later request. The prompt asks for 2–4 calls on a normal turn:
first, between phases, and before the final answer; there is no hard limit.

See [`SPEC.md`](./SPEC.md) §9 for the full budget and caveats.

## How it works

```text
model
  │  vibe({ colors, words, energy, glyph, clear })
  ▼
server tool
  │  parse + normalize
  │  emit rpc.llm-vibe.updated { sessionID, mood | null }
  │  return { content: "ok" }
  ▼
TUI RPC subscription
  │  in-memory Record<sessionID, Mood | null>
  ▼
sidebar.content
  │  measured width + scalar field + half-block render
  ▼
animated rectangle
```

- Server part: `src/index.ts`, `src/tool.ts`, `src/prompt.ts`, `src/rpc.ts`.
- TUI part: `src/tui.tsx`, `src/square.tsx`, `src/dimensions.ts`, `src/activity.ts`, `src/context-usage.ts`, `src/motion.ts`, `src/morph.ts`, `src/field.ts`, `src/render.ts`.
- Shared protocol: `src/mood.ts`, `src/rpc.ts`.

There is no server-side storage, database, file cache, `ctx.storage`, history
scan, or auto-clear. The TUI keeps only in-memory maps. Context fill comes from
`session.step.ended` tokens plus the selected model's context limit and is not
persisted. An RPC event missed while the TUI is disconnected is intentionally
not recovered; the slot stays blank until the next `vibe` call.

## Development

Requirements: Node.js >= 22, npm, OpenCode V2 (tested with 2.2.5).

```bash
npm install
npm run typecheck
npm run test
npm run build
npm run check        # typecheck -> test -> build -> npm pack --dry-run
```

`npm ci` needs `.npmrc` with `legacy-peer-deps=true` because npm 10.9.8 fails to
resolve optional peers of `@opencode/plugin`.

For TUI testing without a GUI, run a standalone OpenCode in tmux and capture the
pane:

```bash
tmux new-session -d -s vibe -x 140 -y 45 -c /path/to/project "opencode --standalone"
tmux send-keys -t vibe "Say hi." Enter
tmux capture-pane -p -e -t vibe -S -100
```

The `-e` flag keeps ANSI colors, which is useful for checking the rectangle.

## License

MIT
