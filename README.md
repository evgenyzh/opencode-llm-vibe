# opencode-llm-vibe

An OpenCode V2 plugin that lets the model declare its current mood with a `vibe`
tool and renders it as an animated pseudo-graphic rectangle in the TUI.

The rectangle lives in the sidebar by default. `/vibe` opens a larger panel; `f`
toggles fullscreen while the panel is focused. With no mood it shows a dark,
empty rectangle.

## Install

The package is loaded through `opencode.json(c)` because both the server and TUI
parts are required:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["opencode-llm-vibe"]
}
```

For local development, point at the package directory:

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

The model may call the tool whenever it wants:

```json
{
  "colors": ["#112244", "#4b3f72", "#ff8844"],
  "words": "спокойствие",
  "energy": 0.4,
  "glyph": "✦"
}
```

- `colors` — 1–4 hex colors, darkest first, hottest last.
- `words` — short mood words shown inside the lower part of the rectangle.
- `energy` — `0..1`; controls motion and turbulence.
- `glyph` — optional short pseudo-graphic accent.

Calls are optional. The last call wins; there is no history. To remove the mood,
the model calls:

```json
{ "clear": true }
```

`clear` is a flag in the same tool, not a separate tool. The tool always returns
`ok` and never echoes the mood back, so the model does not pay for a copy of its
own input.

`/vibe` toggles the larger panel. Closing the panel or restarting the TUI does
not change the mood; the state is live-only and is not restored from session
history.

## What it looks like

- Sidebar: fixed 24×18 pixel landscape rectangle (24 columns × 9 terminal rows).
- Panel: responsive width from 16 to 32 columns; height follows at 0.75× the
  width, so it stays a square/landscape rectangle instead of a tall column.
- The image is a moving gradient/blob field with low-frequency noise.
- Words are rendered inside a dark band around the text at the bottom; image
  pixels remain on both sides.
- With no mood, the rectangle is a static dark vignette.
- Animation tempo follows live activity: idle 0.45×, waiting 0.8×, thinking
  1.25×, writing 1.55×, tool 1.9×, with a ~300 ms ease between speeds. The model
  does not need to call the tool for this; the TUI listens to session events.

The renderer uses half blocks (`▀`): `fg` is the top pixel and `bg` is the bottom
pixel, with 24-bit color.

## Token overhead

Measured on DeepSeek V4 Flash (Bifrost), 3 runs with the plugin and 3 without,
using a prompt that does not call the tool:

| | Without plugin | With plugin |
|---|---:|---:|
| Prompt tokens (input + cache read) | 6,171 | 6,272 |

**Fixed overhead: +101 input tokens per model request.** That is the system
instruction plus the tool schema and description. Exact numbers vary by
tokenizer and model.

A `vibe` call adds roughly 30–50 tokens of JSON plus `ok`, and causes one extra
model request that re-reads the current context (~300–400 tokens plus context).
The tool call also stays in the session history and adds roughly 30–60 tokens
per later request. The prompt asks for 0–2 calls on a normal turn; there is no
hard limit.

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
sidebar.content + session.panel
  │  scalar field + half-block render
  ▼
animated rectangle
```

- Server part: `src/index.ts`, `src/tool.ts`, `src/prompt.ts`, `src/rpc.ts`.
- TUI part: `src/tui.tsx`, `src/square.tsx`, `src/activity.ts`, `src/motion.ts`, `src/field.ts`, `src/render.ts`.
- Shared protocol: `src/mood.ts`, `src/rpc.ts`.

There is no server-side storage, database, file cache, `ctx.storage`, history
scan, or auto-clear. The TUI keeps only an in-memory map. An RPC event missed
while the TUI is disconnected is intentionally not recovered; the rectangle
stays empty until the next `vibe` call.

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
