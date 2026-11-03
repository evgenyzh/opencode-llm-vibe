/** Context-window fill from OpenCode step usage, and the smoothed blob radius. */

export interface TokenUsageLike {
  readonly input: number
  readonly output: number
  readonly reasoning: number
  readonly cache: {
    readonly read: number
    readonly write: number
  }
}

export interface ModelLimitLike {
  readonly context: number
  readonly input?: number
}

/** Radius multiplier at an empty context. */
export const MIN_RADIUS_SCALE = 0.8
/** Radius multiplier at a full context window. */
export const MAX_RADIUS_SCALE = 1.25
/** Time constant for growing or shrinking the blob after usage changes. */
export const CONTEXT_TAU = 1

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function finite(value: number | undefined): number {
  return Number.isFinite(value) ? (value as number) : 0
}

/** The same token sum OpenCode uses to estimate how full the context is. */
export function contextTokens(usage: TokenUsageLike): number {
  return (
    finite(usage.input) +
    finite(usage.cache.read) +
    finite(usage.cache.write) +
    finite(usage.output) +
    finite(usage.reasoning)
  )
}

/** Model input limit when present, otherwise the whole context window. */
export function contextLimit(limit: ModelLimitLike | undefined): number {
  if (!limit) return 0
  const context = finite(limit.context)
  const input = finite(limit.input)
  if (input > 0 && context > 0) return Math.min(input, context)
  return input > 0 ? input : context
}

/**
 * Fraction of the context window in use. Unknown limits use a neutral 0.5 so
 * the blob keeps its normal size until the model list is available.
 */
export function contextRatio(used: number, limit: number): number {
  if (!(limit > 0)) return 0.5
  return clamp(finite(used) / limit, 0, 1)
}

/** Linear mapping from context fill to blob radius. */
export function radiusScale(ratio: number): number {
  const amount = clamp(finite(ratio), 0, 1)
  return MIN_RADIUS_SCALE + (MAX_RADIUS_SCALE - MIN_RADIUS_SCALE) * amount
}

/** Eases the displayed context level toward the latest step's value. */
export function advanceContextLevel(
  current: number,
  target: number,
  elapsed: number,
  tau: number = CONTEXT_TAU,
): number {
  const from = clamp(finite(current), 0, 1)
  const to = clamp(finite(target), 0, 1)
  const dt = clamp(finite(elapsed), 0, 0.25)
  if (dt === 0) return from
  const alpha = 1 - Math.exp(-dt / Math.max(0.001, tau))
  return from + (to - from) * alpha
}
