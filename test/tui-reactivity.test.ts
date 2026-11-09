import { execFileSync } from "node:child_process"
import { describe, expect, it } from "vitest"

describe("reactive sidebar lifecycle", () => {
  it("updates live props without remounting; hide and show still remount", () => {
    const slot = new URL("../src/mood-slot.ts", import.meta.url).href
    const store = new URL("../src/mood-store.ts", import.meta.url).href
    const script = `
      import { createRoot, createRenderEffect, createSignal, onCleanup } from 'solid-js';
      import { createMoodSlot } from ${JSON.stringify(slot)};
      import { createMoodStore } from ${JSON.stringify(store)};
      const moods = createMoodStore();
      const [visible, setVisible] = createSignal(true);
      const [activity, setActivity] = createSignal('idle');
      const [style, setStyle] = createSignal('morph');
      const [ratio, setRatio] = createSignal(0.5);
      let mounts = 0, cleanups = 0, outerRuns = 0, current, dispose;
      const square = props => {
        mounts++;
        onCleanup(() => cleanups++);
        createRenderEffect(() => { current = { mood: props.mood, activity: props.activity, style: props.style, ratio: props.contextRatio }; });
        return 'square';
      };
      createRoot(d => {
        dispose = d;
        createRenderEffect(() => {
          outerRuns++;
          const value = createMoodSlot({ sessionID: 'one', columns: 24, pixelRows: 18, visible, mood: () => moods.get('one'), activity, contextRatio: ratio, style, square });
          createRenderEffect(() => { if (typeof value === 'function') value(); });
        });
      });
      if (mounts !== 1 || outerRuns !== 1) throw new Error('initial mount: ' + JSON.stringify({ mounts, outerRuns }));
      moods.set('one', { colors: ['#112233'], energy: 0.2, words: 'before' });
      const previous = current.mood;
      for (const state of ['thinking', 'waiting', 'tool', 'waiting', 'writing', 'idle']) setActivity(state);
      moods.set('one', { colors: ['#ffaa00'], energy: 0.9 });
      setRatio(0.8); setStyle('neural');
      if (mounts !== 1 || cleanups !== 0 || outerRuns !== 1) throw new Error('unexpected remount: ' + JSON.stringify({ mounts, cleanups, outerRuns }));
      if (current.mood === previous || previous.energy !== 0.2 || current.mood.energy !== 0.9 || current.mood.words !== undefined || current.activity !== 'idle' || current.ratio !== 0.8 || current.style !== 'neural') throw new Error('stale props');
      setVisible(false);
      if (cleanups !== 1) throw new Error('hide did not unmount');
      setVisible(true);
      if (mounts !== 2 || cleanups !== 1) throw new Error('show did not remount: ' + JSON.stringify({ mounts, cleanups, outerRuns }));
      dispose();
      if (cleanups !== 2) throw new Error('dispose did not clean up');
    `
    expect(() => execFileSync(process.execPath, ["--conditions=browser", "--experimental-strip-types", "--input-type=module", "-e", script], { cwd: process.cwd(), stdio: "pipe" })).not.toThrow()
  })
})
