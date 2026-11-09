/** Smooth tempo transitions for the field phase. */

export interface MotionState {
  readonly phase: number
  readonly tempo: number
}

/** Separate Morph clocks: noise time and the energy-integrated blob phase. */
export interface MorphMotionState {
  readonly time: number
  readonly blobPhase: number
}

export const MORPH_SPEED_MULTIPLIER = 1.5

export function morphBlobSpeed(energy: number): number {
  const value = clamp(Number.isFinite(energy) ? energy : 0.5, 0, 1)
  // 0.5 matches the previous speed at 0.95; the upper range rises gently.
  return 0.18 + 0.7 * (2.4 * value - value * value)
}

/** Integrate only the new phase increment, never rescale accumulated time. */
export function advanceMorphMotion(state: MorphMotionState, phaseDelta: number, energy: number): MorphMotionState {
  if (!Number.isFinite(phaseDelta) || phaseDelta <= 0) return state
  const delta = phaseDelta * MORPH_SPEED_MULTIPLIER
  return { time: state.time + delta, blobPhase: state.blobPhase + delta * morphBlobSpeed(energy) }
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
