/** Smooth tempo transitions for the field phase. */

export interface MotionState {
  readonly phase: number
  readonly tempo: number
}

/** Time constant for easing the tempo toward the activity target. */
export const TEMPO_TAU = 0.3

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Advances the animation by `elapsed` seconds while easing the current tempo
 * toward `targetTempo`. Phase is continuous across tempo changes, so activity
 * switches never restart or jump the field.
 */
export function advanceMotion(
  state: MotionState,
  targetTempo: number,
  elapsed: number,
  tau: number = TEMPO_TAU,
): MotionState {
  if (!Number.isFinite(targetTempo)) return state
  const dt = Number.isFinite(elapsed) ? clamp(elapsed, 0, 0.25) : 0
  if (dt === 0) return state

  const target = Math.max(0.05, targetTempo)
  const alpha = 1 - Math.exp(-dt / Math.max(0.001, tau))
  const tempo = state.tempo + (target - state.tempo) * alpha

  return {
    phase: state.phase + dt * tempo,
    tempo,
  }
}
