/** Visual styles are a TUI preference, independent of the mood protocol. */
export type VisualStyle = "morph" | "life" | "diffusion" | "embers" | "neural"
export type SimulationStyle = Exclude<VisualStyle, "morph">

export const STYLE_OPTIONS: ReadonlyArray<{ title: string; value: VisualStyle; description: string }> = [
  { title: "Morph", value: "morph", description: "Smooth, flowing blobs" },
  { title: "Life", value: "life", description: "Conway's Game of Life with fading trails" },
  { title: "Reaction–diffusion", value: "diffusion", description: "Growing organic patterns" },
  { title: "Embers", value: "embers", description: "Drifting, glowing sparks" },
  { title: "Neural", value: "neural", description: "Tokens flowing through transformer layers" },
]

export interface StyleSettings {
  defaultStyle: VisualStyle
  sessions: Record<string, VisualStyle>
}

export function isVisualStyle(value: unknown): value is VisualStyle {
  return STYLE_OPTIONS.some((option) => option.value === value)
}

/** Invalid or missing persisted values fall back without affecting other sessions. */
export function defaultStyleFor(settings: StyleSettings): VisualStyle {
  return isVisualStyle(settings.defaultStyle) ? settings.defaultStyle : "morph"
}

export function styleFor(settings: StyleSettings, sessionID: string): VisualStyle {
  const override = settings.sessions?.[sessionID]
  return isVisualStyle(override) ? override : defaultStyleFor(settings)
}

/** Smoothly fade simulation pixels in/out, including interrupted transitions. */
export function simulationOpacity(from: number, to: number, elapsed: number, duration: number): number {
  const t = Math.max(0, Math.min(1, elapsed / duration))
  return from + (to - from) * t * t * (3 - 2 * t)
}
