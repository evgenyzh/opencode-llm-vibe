import { describe, expect, it } from "vitest"
import plugin from "../src/tui.js"
import { styleFor, type StyleSettings } from "../src/styles.js"

type Command = { id: string; title: string; palette?: boolean; slash?: { name: string }; run: () => Promise<void> }
type Dialog = { title: string; options: Array<{ title: string; value: string; description?: string; disabled?: boolean }> }

function setup(saved: StyleSettings) {
  let sessionID = "one"
  let choices: Array<string | undefined> = []
  let commands: Command[] = []
  let home = false
  const dialogs: Dialog[] = []
  const toasts: string[] = []
  let failSave = false
  const settings = JSON.parse(JSON.stringify(saved)) as StyleSettings
  const context = {
    storage: { store: () => [settings, async (mutate: (draft: StyleSettings) => void) => {
      if (failSave) throw new Error("storage failed")
      mutate(settings)
    }] },
    client: { rpc: () => ({ events: { on: () => () => {} } }) },
    data: { on: () => () => {} },
    ui: {
      slot: () => {},
      router: { current: () => home ? { type: "home" } : { type: "session", sessionID } },
      dialog: { select: async (dialog: Dialog) => { dialogs.push(dialog); return choices.shift() } },
      toast: { show: (toast: { message: string }) => { toasts.push(toast.message) } },
    },
    keymap: { layer: (factory: () => { commands: Command[] }) => { commands = factory().commands } },
  }
  plugin.setup(context as unknown as Parameters<typeof plugin.setup>[0])
  return {
    settings,
    dialogs,
    toasts,
    commands,
    selectSequence: (...values: Array<string | undefined>) => { choices = values },
    session: (value: string) => { sessionID = value },
    home: () => { home = true },
    failSave: () => { failSave = true },
    run: (id: string) => commands.find((command) => command.id === id)!.run(),
  }
}

describe("TUI Vibe settings", () => {
  it("persists defaults and independent session overrides across reloads", async () => {
    const first = setup({ defaultStyle: "morph", sessions: {} })
    first.selectSequence("session", "neural", undefined)
    await first.run("llm-vibe.settings")
    first.session("two")
    first.selectSequence("default", "embers", "session", "life", undefined)
    await first.run("llm-vibe.settings")
    const reloaded = setup(first.settings)
    expect(styleFor(reloaded.settings, "one")).toBe("neural")
    expect(styleFor(reloaded.settings, "two")).toBe("life")
    expect(styleFor(reloaded.settings, "three")).toBe("embers")
    reloaded.selectSequence("session", "default", undefined)
    await reloaded.run("llm-vibe.settings")
    expect(styleFor(reloaded.settings, "one")).toBe("embers")
    expect(styleFor(reloaded.settings, "two")).toBe("life")
    reloaded.selectSequence("default", undefined, undefined)
    await reloaded.run("llm-vibe.settings")
    expect(reloaded.settings.defaultStyle).toBe("embers")
  })

  it("opens the same settings through /vibe and the command palette", async () => {
    const app = setup({ defaultStyle: "morph", sessions: {} })
    const command = app.commands.find((item) => item.id === "llm-vibe.settings")!
    expect(command.slash?.name).toBe("vibe")
    expect(command.palette).toBe(true)
    expect(command.title).toBe("Vibe settings")
    expect(app.commands.map((item) => item.id)).toEqual(["llm-vibe.settings"])
    expect(app.commands.map((item) => item.slash?.name)).toEqual(["vibe"])
    app.selectSequence("visible", "session", "neural", "default", "life", undefined)
    await command.run()
    expect(app.settings).toEqual({ defaultStyle: "life", sessions: { one: "neural" } })
    const main = app.dialogs.filter((dialog) => dialog.title === "Vibe settings")
    expect(main).toHaveLength(4)
    expect(main[0]!.options[0]!.title).toBe("Hide vibe")
    expect(main[1]!.options[0]!.title).toBe("Show vibe")
    expect(main[2]!.options[1]!.description).toContain("neural (override)")
    expect(main[3]!.options[2]!.description).toBe("life")
    expect(app.dialogs.find((dialog) => dialog.title === "Vibe style for this session")!.options[0]!.value).toBe("default")
  })

  it("allows the default from home, disables session selection and preserves settings on cancel", async () => {
    const app = setup({ defaultStyle: "embers", sessions: { one: "neural" } })
    app.home()
    app.selectSequence("default", undefined, undefined)
    await app.run("llm-vibe.settings")
    expect(app.dialogs[0]!.options.find((option) => option.value === "session")?.disabled).toBe(true)
    expect(app.settings).toEqual({ defaultStyle: "embers", sessions: { one: "neural" } })
  })

  it("surfaces storage errors and returns to the menu", async () => {
    const app = setup({ defaultStyle: "morph", sessions: {} })
    app.failSave()
    app.selectSequence("session", "neural", undefined)
    await app.run("llm-vibe.settings")
    expect(app.toasts).toEqual(["Could not save vibe style"])
    expect(app.settings.sessions).toEqual({})
    expect(app.dialogs.at(-1)!.title).toBe("Vibe settings")
  })
})
