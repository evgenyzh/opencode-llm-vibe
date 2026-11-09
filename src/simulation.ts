/** Stateful, deterministic visual simulations. No timers or TUI dependencies. */
import { hashString, normalizeSize } from "./field.js"
import type { Activity } from "./activity.js"
import type { SimulationStyle } from "./styles.js"
import { advanceNeural, createNeural, neuralColumnX, resizeNeural, type NeuralInputColors, type NeuralState } from "./neural.js"

const clamp = (n: number, low = 0, high = 1): number => Math.max(low, Math.min(high, n))

export interface Simulation {
  readonly style: SimulationStyle
  readonly width: number
  readonly height: number
  random: number
  elapsed: number
  cells: Uint8Array
  nextCells: Uint8Array
  trails: Float32Array
  history: string[]
  u: Float32Array
  v: Float32Array
  nextU: Float32Array
  nextV: Float32Array
  field: Float32Array
  colorField: Float32Array
  neighbors: Uint32Array
  particles: Particle[]
  neural: NeuralState
}

interface Particle { x: number; y: number; life: number; speed: number; strength: number; color: number }

function random(s: Simulation): number {
  s.random = (Math.imul(s.random, 1664525) + 1013904223) >>> 0
  return s.random / 4294967296
}

function gridWidth(s: Simulation): number { return Math.ceil(s.width / 2) }
function gridHeight(s: Simulation): number { return Math.ceil(s.height / 2) }

/** Conway B3/S23 with wrapping edges. Exposed separately for rule tests. */
export function lifeStep(cells: Uint8Array, width: number, height: number, next: Uint8Array = new Uint8Array(width * height)): Uint8Array {
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let neighbors = 0
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (dx || dy) neighbors += cells[((y + dy + height) % height) * width + (x + dx + width) % width] ?? 0
    }
    const i = y * width + x
    next[i] = neighbors === 3 || (cells[i] === 1 && neighbors === 2) ? 1 : 0
  }
  return next
}

function seedLife(s: Simulation, count: number): void {
  const w = gridWidth(s), h = gridHeight(s)
  const patterns = [
    [[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]], // glider
    [[1, 0], [2, 0], [0, 1], [1, 1], [1, 2]], // R-pentomino
  ]
  for (let n = 0; n < count; n++) {
    const x = Math.floor(random(s) * w), y = Math.floor(random(s) * h)
    const pattern = patterns[Math.floor(random(s) * patterns.length)]!
    for (const [dx, dy] of pattern) s.cells[((y + dy!) % h) * w + (x + dx!) % w] = 1
  }
  s.history = []
}

export function createSimulation(style: SimulationStyle, width: number, height: number, seed: number): Simulation {
  const w = normalizeSize(width), h = normalizeSize(height)
  const lifeSize = style === "life" ? Math.ceil(w / 2) * Math.ceil(h / 2) : 0
  const diffusionSize = style === "diffusion" ? w * h : 0
  const s: Simulation = {
    style, width: w, height: h, random: seed >>> 0, elapsed: 0,
    cells: new Uint8Array(lifeSize), nextCells: new Uint8Array(lifeSize),
    trails: new Float32Array(lifeSize), history: [],
    u: new Float32Array(diffusionSize).fill(1), v: new Float32Array(diffusionSize),
    nextU: new Float32Array(diffusionSize), nextV: new Float32Array(diffusionSize),
    field: new Float32Array(w * h), colorField: new Float32Array(style === "embers" ? w * h : 0), neighbors: new Uint32Array(style === "diffusion" ? w * h * 8 : 0), particles: [],
    // Other engines never advance or render this minimal placeholder.
    neural: style === "neural" ? createNeural(w, h / 2) : createNeural(4, 1),
  }
  if (style === "life") seedLife(s, 3)
  if (style === "diffusion") {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let n = (y * w + x) * 8
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (dx || dy) s.neighbors[n++] = ((y + dy + h) % h) * w + (x + dx + w) % w
      }
    }
    for (let n = 0; n < 5; n++) {
      const cx = Math.floor(random(s) * w), cy = Math.floor(random(s) * h)
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const i = ((cy + dy + h) % h) * w + (cx + dx + w) % w
        s.u[i] = 0.5; s.v[i] = 0.25 + random(s) * 0.3
      }
    }
  }
  return s
}

/** Preserve the evolving pattern and random sequence across a real resize. */
export function resizeSimulation(s: Simulation, width: number, height: number): Simulation {
  const w = normalizeSize(width), h = normalizeSize(height)
  if (s.width === w && s.height === h) return s
  const resized = createSimulation(s.style, w, h, s.random)
  resized.random = s.random
  resized.elapsed = s.elapsed
  resized.history = [] // old signatures have different dimensions
  if (s.style === "life") {
    resized.cells.fill(0)
    const oldW = gridWidth(s), oldH = gridHeight(s), newW = gridWidth(resized), newH = gridHeight(resized)
    const dx = Math.floor((newW - oldW) / 2), dy = Math.floor((newH - oldH) / 2)
    for (let y = 0; y < oldH; y++) for (let x = 0; x < oldW; x++) {
      const nx = x + dx, ny = y + dy
      if (nx >= 0 && nx < newW && ny >= 0 && ny < newH) {
        resized.cells[ny * newW + nx] = s.cells[y * oldW + x]!
        resized.trails[ny * newW + nx] = s.trails[y * oldW + x]!
      }
    }
  } else if (s.style === "diffusion") {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const sx = Math.min(s.width - 1, Math.floor(x * s.width / w))
      const sy = Math.min(s.height - 1, Math.floor(y * s.height / h))
      resized.u[y * w + x] = s.u[sy * s.width + sx]!
      resized.v[y * w + x] = s.v[sy * s.width + sx]!
    }
  } else if (s.style === "embers") {
    resized.particles = s.particles.map((p) => ({ ...p, x: p.x * w / s.width, y: p.y * h / s.height }))
  } else {
    resized.neural = resizeNeural(s.neural, w, h / 2 - (s.height / 2 - s.neural.rows))
  }
  return resized
}

/** Per-session/style state is independent of mood and component lifetime. */
export function simulationFor(
  cache: Map<string, Simulation>, key: string, style: SimulationStyle, width: number, height: number,
): Simulation {
  const existing = cache.get(key)
  const state = existing
    ? resizeSimulation(existing, width, height)
    : createSimulation(style, width, height, hashString(key))
  if (state !== existing) cache.set(key, state)
  return state
}

function advanceLife(s: Simulation, context: number): void {
  for (let i = 0; i < s.cells.length; i++) if (s.cells[i]) s.trails[i] = 1
  lifeStep(s.cells, gridWidth(s), gridHeight(s), s.nextCells)
  const previous = s.cells
  s.cells = s.nextCells
  s.nextCells = previous
  const signature = Array.from(s.cells).join("")
  if (!s.cells.some(Boolean) || s.history.includes(signature)) seedLife(s, 1 + Math.floor(clamp(context) * 2))
  else {
    s.history.push(signature)
    if (s.history.length > 24) s.history.shift()
  }
}

/** Gray–Scott reaction diffusion, using a periodic 9-point Laplacian. */
function advanceDiffusion(s: Simulation, context: number, energy: number): void {
  const nextU = s.nextU, nextV = s.nextV
  const feed = 0.035 + clamp(context) * 0.008
  const kill = 0.061 + clamp(energy) * 0.002
  for (let i = 0; i < s.u.length; i++) {
    const u = s.u[i]!, v = s.v[i]!
    let lapU = -u, lapV = -v
    for (let n = 0; n < 8; n++) {
      const j = s.neighbors[i * 8 + n]!
      const weight = n === 0 || n === 2 || n === 5 || n === 7 ? 0.05 : 0.2
      lapU += s.u[j]! * weight; lapV += s.v[j]! * weight
    }
    const reaction = u * v * v
    nextU[i] = clamp(u + 0.16 * lapU - reaction + feed * (1 - u))
    nextV[i] = clamp(v + 0.08 * lapV + reaction - (feed + kill) * v)
  }
  s.nextU = s.u; s.nextV = s.v
  s.u = nextU; s.v = nextV
}

function advanceEmbers(s: Simulation, dt: number, context: number, energy: number): void {
  const target = Math.round(4 + clamp(context) * 12 + clamp(energy) * 8)
  while (s.particles.length < target) {
    s.particles.push({ x: random(s) * s.width, y: random(s) * s.height, life: 0.3 + random(s) * 0.7, speed: 0.12 + random(s) * 0.35, strength: 0.55 + random(s) * 0.45, color: random(s) < 0.5 ? 0.5 : 0.95 })
  }
  for (const p of s.particles) {
    p.life -= dt * p.speed
    // A full lifetime crosses the full field, regardless of its height.
    p.y -= dt * p.speed * s.height
    p.x += Math.sin(p.y * 0.4 + p.strength * 20) * dt * 0.5
    if (p.life <= 0 || p.y < 0) {
      p.x = random(s) * s.width; p.y = s.height - 1; p.life = 1; p.color = random(s) < 0.5 ? 0.5 : 0.95
    }
  }
  if (s.particles.length > target) s.particles.length = target
}

/** Advance in bounded fixed steps so rendering FPS and pauses cannot destabilize the simulation. */
export function advanceSimulation(s: Simulation, elapsed: number, tempo: number, energy: number, context: number, activity: Activity | boolean = true, inputColor?: NeuralInputColors): void {
  const dt = clamp(Number.isFinite(elapsed) ? elapsed : 0, 0, 0.25) * clamp(tempo, 0, 3)
  if (s.style === "embers") { advanceEmbers(s, dt, context, energy); return }
  if (s.style === "neural") {
    advanceNeural(s.neural, dt, energy, context, activity !== false && activity !== "idle", () => random(s), inputColor)
    return
  }
  if (s.style === "life") {
    const decay = Math.exp(-dt * 1.8)
    for (let i = 0; i < s.trails.length; i++) s.trails[i] = (s.trails[i] ?? 0) * decay
  }
  s.elapsed += dt
  const step = s.style === "life" ? 0.45 / (0.75 + clamp(energy) * 0.5) : 0.025
  let count = 0
  while (s.elapsed >= step && count++ < 30) {
    s.elapsed -= step
    if (s.style === "life") advanceLife(s, context)
    else advanceDiffusion(s, context, energy)
  }
  s.elapsed = Math.min(s.elapsed, step * 2)
}

export function simulationField(s: Simulation, field: Float32Array = new Float32Array(s.width * s.height), colorField?: Float32Array): Float32Array {
  field.fill(0)
  colorField?.fill(0)
  if (s.style === "life") {
    const w = gridWidth(s)
    for (let y = 0; y < gridHeight(s); y++) for (let x = 0; x < w; x++) {
      const i = y * w + x
      field[(y * 2) * s.width + x * 2] = s.cells[i] ? 1 : (s.trails[i] ?? 0) * 0.75
    }
  } else if (s.style === "diffusion") {
    for (let i = 0; i < field.length; i++) field[i] = clamp((s.v[i] ?? 0) * 2.5)
  } else if (s.style === "embers") {
    for (const p of s.particles) {
      const x = Math.floor(p.x), y = Math.floor(p.y)
      const fx = p.x - x, fy = p.y - y
      const brightness = Math.sin(clamp(p.life) * Math.PI) * p.strength
      for (let dy = 0; dy <= 1; dy++) for (let dx = 0; dx <= 1; dx++) {
        const px = x + dx, py = y + dy
        if (px < 0 || px >= s.width || py < 0 || py >= s.height) continue
        const i = py * s.width + px
        const weight = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy)
        const value = brightness * weight
        if (value > (field[i] ?? 0)) {
          field[i] = value
          if (colorField) colorField[i] = p.color
        }
      }
    }
  } else {
    renderNeural(s, field)
  }
  return field
}

/** Low-resolution transition proxy only; Neural itself uses neural-render.ts. */
function renderNeural(s: Simulation, field: Float32Array): void {
  const n = s.neural
  for (let col = 0; col < n.columns; col++) for (let row = 0; row < n.rows; row++) {
    const value = 0.18 + n.nodes[col * n.rows + row]! * 0.82
    const x = neuralColumnX(col, n.columns, s.width)
    field[row * 2 * s.width + x] = value
    field[(row * 2 + 1) * s.width + x] = value
  }
}
