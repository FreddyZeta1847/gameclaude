/*
 * gameclaude — Campo minato game logic (pure functions, no engine). The board is a
 * string with one character per cell: '.' covered, 'o' open, 'f' flagged. Mines are
 * placed on the first reveal, away from the revealed cell and its neighbours, so the
 * first move never loses. Time is kept as elapsed milliseconds plus a start mark;
 * a negative start mark means the clock is paused (pane closed).
 * "Difficile" is 16 wide and 30 tall so it stays readable in a narrow side pane.
 */
export type Level = 'facile' | 'medio' | 'difficile'
export type CampoStatus = 'ready' | 'playing' | 'won' | 'lost'
export type Campo = {
  level: Level; w: number; h: number; count: number
  cells: string; mines: number[]; cursor: number
  status: CampoStatus; elapsed: number; startedAt: number
}
export type Dir = 'up' | 'down' | 'left' | 'right'

export const LEVELS: Record<Level, [number, number, number]> = {
  facile: [9, 9, 10], medio: [16, 16, 40], difficile: [16, 30, 99],
}

export function newCampo(level: Level): Campo {
  const [w, h, count] = LEVELS[level]
  return { level, w, h, count, cells: '.'.repeat(w * h), mines: [], cursor: Math.floor(h / 2) * w + Math.floor(w / 2), status: 'ready', elapsed: 0, startedAt: 0 }
}

export function neighbours(c: Pick<Campo, 'w' | 'h'>, i: number): number[] {
  const x = i % c.w, y = Math.floor(i / c.w), out: number[] = []
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const nx = x + dx, ny = y + dy
    if ((dx || dy) && nx >= 0 && ny >= 0 && nx < c.w && ny < c.h) out.push(ny * c.w + nx)
  }
  return out
}

export function minesAround(c: Campo, i: number): number {
  return neighbours(c, i).filter(n => c.mines.includes(n)).length
}

function placeMines(c: Campo, safe: number, rand: () => number): number[] {
  const banned = new Set([safe, ...neighbours(c, safe)])
  const free = [...Array(c.w * c.h).keys()].filter(i => !banned.has(i))
  for (let i = free.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[free[i], free[j]] = [free[j]!, free[i]!]
  }
  return free.slice(0, c.count)
}

export function campoReveal(c: Campo, i: number, rand: () => number, now: number): Campo {
  if (c.status === 'won' || c.status === 'lost') return c
  if (c.cells[i] === 'o') return chord(c, i, rand, now)
  if (c.cells[i] !== '.') return c
  let next = c
  if (c.status === 'ready') next = { ...c, mines: placeMines(c, i, rand), status: 'playing', startedAt: now }
  if (next.mines.includes(i)) return stop({ ...next, cells: next.cells.slice(0, i) + 'o' + next.cells.slice(i + 1) }, 'lost', now)
  const cells = next.cells.split('')
  const todo = [i]
  while (todo.length) {
    const k = todo.pop()!
    if (cells[k] !== '.') continue
    cells[k] = 'o'
    if (minesAround(next, k) === 0) todo.push(...neighbours(next, k))
  }
  next = { ...next, cells: cells.join('') }
  const opened = cells.filter(x => x === 'o').length
  return opened === next.w * next.h - next.count ? stop(next, 'won', now) : next
}

// Classic "chord": on an open number whose flags around it match the number, open every
// other covered neighbour at once (a wrong flag means hitting the real mine).
function chord(c: Campo, i: number, rand: () => number, now: number): Campo {
  const around = neighbours(c, i)
  const n = minesAround(c, i)
  if (!n || around.filter(k => c.cells[k] === 'f').length !== n) return c
  let next = c
  for (const k of around) if (next.cells[k] === '.') next = campoReveal(next, k, rand, now)
  return next
}

function stop(c: Campo, status: CampoStatus, now: number): Campo {
  return { ...c, status, elapsed: elapsedMs(c, now) }
}

export function campoFlag(c: Campo, i: number): Campo {
  if (c.status === 'won' || c.status === 'lost') return c
  const ch = c.cells[i] === '.' ? 'f' : c.cells[i] === 'f' ? '.' : c.cells[i]
  return { ...c, cells: c.cells.slice(0, i) + ch + c.cells.slice(i + 1) }
}

export function campoMove(c: Campo, dir: Dir): Campo {
  const x = c.cursor % c.w, y = Math.floor(c.cursor / c.w)
  const nx = Math.min(c.w - 1, Math.max(0, x + (dir === 'left' ? -1 : dir === 'right' ? 1 : 0)))
  const ny = Math.min(c.h - 1, Math.max(0, y + (dir === 'up' ? -1 : dir === 'down' ? 1 : 0)))
  return { ...c, cursor: ny * c.w + nx }
}

export function elapsedMs(c: Campo, now: number): number {
  return c.status === 'playing' && c.startedAt >= 0 ? c.elapsed + (now - c.startedAt) : c.elapsed
}

export function pauseCampo(c: Campo, now: number): Campo {
  return c.status === 'playing' && c.startedAt >= 0 ? { ...c, elapsed: elapsedMs(c, now), startedAt: -1 } : c
}

export function resumeCampo(c: Campo, now: number): Campo {
  return c.status === 'playing' && c.startedAt < 0 ? { ...c, startedAt: now } : c
}

export function flagsLeft(c: Campo): number {
  return c.count - [...c.cells].filter(x => x === 'f').length
}
