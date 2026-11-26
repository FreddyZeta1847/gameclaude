/*
 * gameclaude — Raddoppia game logic (pure functions, no engine): a 4x4 grid of tiles
 * (0 = empty) that slide with the arrows; two equal tiles merge into their double once
 * per move. After a move that changed something a new 2 (90%) or 4 appears.
 */
export type Raddoppia = { grid: number[]; score: number }
export type Dir = 'up' | 'down' | 'left' | 'right'

export function slide(line: number[]): { line: number[]; gained: number } {
  const tiles = line.filter(v => v > 0)
  const out: number[] = []
  let gained = 0
  for (let i = 0; i < tiles.length; i++) {
    const v = tiles[i]!
    if (v === tiles[i + 1]) {
      out.push(v * 2)
      gained += v * 2
      i++
    } else out.push(v)
  }
  while (out.length < 4) out.push(0)
  return { line: out, gained }
}

// Indices of each line, ordered so that sliding "towards index 0" is the move's direction.
function lines(dir: Dir): number[][] {
  const out: number[][] = []
  for (let k = 0; k < 4; k++) {
    const row = [0, 1, 2, 3].map(j => k * 4 + j)
    const col = [0, 1, 2, 3].map(j => j * 4 + k)
    out.push(dir === 'left' ? row : dir === 'right' ? row.reverse() : dir === 'up' ? col : col.reverse())
  }
  return out
}

export function spawn(grid: number[], rand: () => number): number[] {
  const empty = grid.flatMap((v, i) => (v ? [] : [i]))
  if (!empty.length) return grid
  const next = [...grid]
  next[empty[Math.floor(rand() * empty.length)]!] = rand() < 0.9 ? 2 : 4
  return next
}

export function raddoppiaMove(g: Raddoppia, dir: Dir, rand: () => number): Raddoppia {
  const grid = [...g.grid]
  let gained = 0
  for (const idx of lines(dir)) {
    const res = slide(idx.map(i => grid[i]!))
    idx.forEach((i, j) => (grid[i] = res.line[j]!))
    gained += res.gained
  }
  if (grid.every((v, i) => v === g.grid[i])) return g
  return { grid: spawn(grid, rand), score: g.score + gained }
}

export function newRaddoppia(rand: () => number): Raddoppia {
  return { grid: spawn(spawn(Array(16).fill(0), rand), rand), score: 0 }
}

export function canMove(grid: number[]): boolean {
  if (grid.includes(0)) return true
  for (let i = 0; i < 16; i++) {
    if (i % 4 < 3 && grid[i] === grid[i + 1]) return true
    if (i < 12 && grid[i] === grid[i + 4]) return true
  }
  return false
}
