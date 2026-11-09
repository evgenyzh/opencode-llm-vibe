import { execFileSync } from "node:child_process"
import { describe, expect, it } from "vitest"
import { createMoodStore } from "../src/mood-store.js"
import { transitionEnergy, visualAt } from "../src/morph.js"
import { paletteFor } from "../src/render.js"
import type { Mood } from "../src/mood.js"

describe("live mood snapshots", () => {
  it("replaces rather than mutates moods, including omitted optional fields", () => {
    const store = createMoodStore()
    const old: Mood = { colors: ["#102040", "#6688cc"], energy: 0.2, words: "old", glyph: "✦" }
    const next: Mood = { colors: ["#301010", "#ff8844"], energy: 0.9 }
    store.set("one", old)
    store.set("two", old)
    const previous = store.get("one")!
    store.set("one", next)
    expect(store.get("one")).not.toBe(previous)
    expect(previous).toEqual(old)
    expect(store.get("one")).toEqual(next)
    expect(store.get("two")).toEqual(old)
    expect(store.get("missing")).toBeNull()
    store.set("one", null)
    expect(store.get("one")).toBeNull()
    expect(previous).toEqual(old)
  })

  it("keeps the source palette and energy for a transition after an event", () => {
    const store = createMoodStore()
    const old: Mood = { colors: ["#001020", "#4488ff"], energy: 0.2 }
    const next: Mood = { colors: ["#200500", "#ff8811"], energy: 0.9 }
    store.set("one", old)
    const previous = store.get("one")!
    store.set("one", next)
    const current = store.get("one")!
    const transition = { fromMood: previous, fromPalette: paletteFor(previous), to: current, start: 0 }
    expect(visualAt(current, transition, 0, 24, 18, 0, undefined, 1, 42).palette).toEqual(paletteFor(old))
    expect(visualAt(current, transition, 0, 24, 18, 750, undefined, 1, 42).palette).not.toEqual(paletteFor(next))
    expect(previous.energy).toBe(0.2)
  })

  it("continues from the visible frame when events interrupt a morph", () => {
    const store = createMoodStore()
    const first: Mood = { colors: ["#091a30", "#4488ff"], energy: 0.2 }
    const second: Mood = { colors: ["#200500", "#ff8811"], energy: 0.9 }
    const third: Mood = { colors: ["#081008", "#44ee88"], energy: 0.4 }
    store.set("one", first)
    const initial = store.get("one")!
    store.set("one", second)
    const middle = store.get("one")!
    const transition = { fromMood: initial, fromPalette: paletteFor(initial), to: middle, start: 0 }
    const before = visualAt(middle, transition, 3, 24, 18, 600, undefined, 1, 42)
    store.set("one", third)
    const target = store.get("one")!
    const interrupted = { fromMood: middle, fromPalette: before.palette, fromEnergy: transitionEnergy(transition, 600), to: target, start: 600 }
    const after = visualAt(target, interrupted, 3, 24, 18, 600, undefined, 1, 42)
    expect(after.field).toEqual(before.field)
    expect(after.palette).toEqual(before.palette)
    expect(middle.energy).toBe(0.9)
  })

  it("notifies real Solid reactive effects once per replacement", () => {
    const url = new URL("../src/mood-store.ts", import.meta.url).href
    const script = `
      import { createRoot, createRenderEffect } from 'solid-js';
      import { createMoodStore } from ${JSON.stringify(url)};
      const store = createMoodStore(), seen = [];
      store.set('one', { colors: ['#111111'], energy: 0.1, words: 'old' });
      let dispose;
      createRoot(d => { dispose = d; createRenderEffect(() => seen.push(store.get('one'))); });
      const old = seen[0];
      store.set('one', { colors: ['#eeeeee'], energy: 0.9 });
      store.set('one', null);
      if (seen.length !== 3 || seen[0] !== old || seen[1] === old || old.energy !== 0.1 || old.words !== 'old' || seen[1].words !== undefined || seen[2] !== null) throw new Error(JSON.stringify(seen));
      dispose();
    `
    expect(() => execFileSync(process.execPath, ["--conditions=browser", "--experimental-strip-types", "--input-type=module", "-e", script], { cwd: process.cwd(), stdio: "pipe" })).not.toThrow()
  })
})
