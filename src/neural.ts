/** Continuous, synchronous branching impulses. Input and output are grid columns too. */
import type { Rgb } from "./mood.js"

export const NEURAL_TICK = 0.24

export interface NeuralState {
  columns: number
  rows: number
  clock: number
  nodes: Float32Array
  /** Conditional transition weights for impulses arriving on the latest tick. */
  front: Float32Array
  next: Float32Array
  /** RGB values per cell: visible colour, colour being approached, and travelling impulses. */
  colors: Float32Array
  targets: Float32Array
  frontColors: Float32Array
  nextColors: Float32Array
  nextMass: Float32Array
  colorInitialized: boolean
}

export function createNeural(width: number, rows: number): NeuralState {
  const columns = Math.max(3, Math.floor((width - 1) / 2) + 1)
  rows = Math.max(1, Math.floor(rows))
  return {
    columns, rows, clock: 0,
    nodes: new Float32Array(columns * rows),
    front: new Float32Array(columns * rows),
    next: new Float32Array(columns * rows),
    colors: new Float32Array(columns * rows * 3),
    targets: new Float32Array(columns * rows * 3),
    frontColors: new Float32Array(columns * rows * 3),
    nextColors: new Float32Array(columns * rows * 3),
    nextMass: new Float32Array(columns * rows),
    colorInitialized: false,
  }
}

export function neuralColumnX(column: number, columns: number, width: number): number {
  // A fixed two-cell stride avoids an extra gap in the middle when width is even.
  const margin = Math.max(0, Math.floor((width - 1 - (columns - 1) * 2) / 2))
  return margin + column * 2
}

/** Remap live activations, preserving input/output identity and the tick clock. */
export function resizeNeural(old: NeuralState, width: number, rows: number): NeuralState {
  const columns = Math.max(3, Math.floor((width - 1) / 2) + 1)
  rows = Math.max(1, Math.floor(rows))
  if (old.columns === columns && old.rows === rows) return old
  const n = createNeural(width, rows)
  n.clock = old.clock
  n.colorInitialized = old.colorInitialized
  // Fill new cells from their nearest old visible/target colour, not the newest mood.
  for (let col = 0; col < columns; col++) for (let row = 0; row < rows; row++) {
    const sourceCol = Math.round(col * (old.columns - 1) / (columns - 1))
    const sourceRow = Math.round(row * (old.rows - 1) / Math.max(1, rows - 1))
    const source = (sourceCol * old.rows + sourceRow) * 3, dest = (col * rows + row) * 3
    for (let c = 0; c < 3; c++) {
      n.colors[dest + c] = old.colors[source + c]!
      n.targets[dest + c] = old.targets[source + c]!
    }
  }
  const mapRow = (row: number): number => Math.round(row * (rows - 1) / Math.max(1, old.rows - 1))
  for (let col = 0; col < old.columns; col++) for (let row = 0; row < old.rows; row++) {
    const column = col === 0 ? 0 : col === old.columns - 1 ? columns - 1
      : Math.max(1, Math.min(columns - 2, Math.round(col * (columns - 1) / (old.columns - 1))))
    const from = col * old.rows + row, to = column * rows + mapRow(row)
    n.nodes[to] = Math.max(n.nodes[to]!, old.nodes[from]!)
    const weight = old.front[from]!
    if (weight > 0) {
      for (let c = 0; c < 3; c++) n.nextColors[to * 3 + c] = n.nextColors[to * 3 + c]! + old.frontColors[from * 3 + c]! * weight
      n.nextMass[to] = n.nextMass[to]! + weight
      n.front[to] = Math.min(1, n.nextMass[to]!)
    }
  }
  for (let i = 0; i < n.front.length; i++) if (n.nextMass[i]) {
    for (let c = 0; c < 3; c++) n.frontColors[i * 3 + c] = n.nextColors[i * 3 + c]! / n.nextMass[i]!
  }
  return n
}

export type NeuralInputColors = Rgb | readonly Rgb[]

function tick(n: NeuralState, inputChance: number, random: () => number, inputColors: NeuralInputColors | undefined): void {
  n.next.fill(0)
  n.nextColors.fill(0)
  n.nextMass.fill(0)
  const weights = new Float64Array(3)
  // Every input gets its own Bernoulli trial. There is no batch size or shared trigger.
  for (let row = 0; row < n.rows; row++) {
    if (inputChance > 0 && random() < inputChance) {
      n.next[row] = 1
      n.nextMass[row] = 1
      const color = Array.isArray(inputColors)
        ? inputColors[Math.min(inputColors.length - 1, Math.floor(random() * inputColors.length))]
        : inputColors as Rgb | undefined
      const ink = color ?? { r: 0, g: 0, b: 0 }
      n.nextColors[row * 3] = ink.r
      n.nextColors[row * 3 + 1] = ink.g
      n.nextColors[row * 3 + 2] = ink.b
    }
  }
  for (let col = 0; col < n.columns - 1; col++) for (let row = 0; row < n.rows; row++) {
    const source = col * n.rows + row
    if (!n.front[source]) continue
    const low = Math.max(0, row - 1), high = Math.min(n.rows - 1, row + 1)
    const count = high - low + 1
    // These are conditional visual weights, not model telemetry. Choose a
    // continuation proportionally to its weight; do not multiply weights
    // over a path, which would make long paths disappear before the output.
    let total = 0
    for (let i = 0; i < count; i++) {
      weights[i] = 0.25 + random() * 0.75
      total += weights[i]!
    }
    let pick = random() * total, chosen = 0
    while (chosen < count - 1 && pick >= weights[chosen]!) pick -= weights[chosen++]!
    const first = low + chosen
    const send = (target: number): void => {
      const targetIndex = (col + 1) * n.rows + target
      const weight = weights[target - low]! / total
      n.nextMass[targetIndex] = n.nextMass[targetIndex]! + weight
      n.next[targetIndex] = Math.min(1, n.nextMass[targetIndex]!)
      for (let c = 0; c < 3; c++) {
        n.nextColors[targetIndex * 3 + c] = n.nextColors[targetIndex * 3 + c]! + n.frontColors[source * 3 + c]! * weight
      }
    }
    send(first)
    if (count > 1 && random() < 0.3) {
      const other = low + Math.floor(random() * (count - 1))
      send(other >= first ? other + 1 : other)
    }
  }
  for (let i = 0; i < n.nodes.length; i++) if (n.next[i]) {
    n.nodes[i] = n.next[i]!
    for (let c = 0; c < 3; c++) {
      const color = n.nextColors[i * 3 + c]! / n.nextMass[i]!
      n.nextColors[i * 3 + c] = color
      n.targets[i * 3 + c] = color
    }
  }
  const previous = n.front
  n.front = n.next
  n.next = previous
  const previousColors = n.frontColors
  n.frontColors = n.nextColors
  n.nextColors = previousColors
}

/** Idle stops input injection; existing branches still propagate to the output. */
export function advanceNeural(
  n: NeuralState, dt: number, energy: number, context: number, active: boolean, random: () => number,
  inputColors?: NeuralInputColors,
): void {
  const inputColor = Array.isArray(inputColors) ? inputColors[0] : inputColors as Rgb | undefined
  if (inputColor && !n.colorInitialized) {
    for (let i = 0; i < n.nodes.length; i++) {
      n.colors.set([inputColor.r, inputColor.g, inputColor.b], i * 3)
      n.targets.set([inputColor.r, inputColor.g, inputColor.b], i * 3)
      if (n.front[i]) n.frontColors.set([inputColor.r, inputColor.g, inputColor.b], i * 3)
    }
    n.colorInitialized = true
  }
  const clamp = (value: number): number => Math.max(0, Math.min(1, value))
  const chance = active ? 0.035 + clamp(energy) * 0.07 + clamp(context) * 0.04 : 0
  let remaining = dt
  while (remaining > 1e-9) {
    const step = Math.min(remaining, NEURAL_TICK - n.clock)
    const decay = Math.exp(-step * 4)
    for (let i = 0; i < n.nodes.length; i++) n.nodes[i] = n.nodes[i]! * decay
    // Ease the displayed colour independently of the travelling impulse colour.
    const blend = 1 - Math.exp(-step * 6)
    if (n.colorInitialized) for (let i = 0; i < n.colors.length; i++) {
      n.colors[i] = n.colors[i]! + (n.targets[i]! - n.colors[i]!) * blend
    }
    remaining -= step
    n.clock += step
    if (n.clock >= NEURAL_TICK - 1e-9) {
      n.clock = 0
      tick(n, chance, random, inputColors)
    }
  }
}
