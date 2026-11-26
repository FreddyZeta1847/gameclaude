/*
 * gameclaude — tests for the pure game logic (no engine involved): Parola scoring and
 * the daily word, Campo minato mine placement / flood reveal / win and loss, Raddoppia
 * slide-and-merge, spawning and game over. Run with `claude plugin test .`.
 */
import { expect, test } from 'claude-code/testing'
import { dayKey, dailyIndex, keyboard, normalize, parolaGuess, score } from './parola'
import { newCampo, campoReveal, campoFlag, campoMove } from './campo'
import { slide, raddoppiaMove, newRaddoppia, canMove } from './raddoppia'

// A fixed random source so tests are repeatable.
function rng(seed = 1) {
  let s = seed
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
}

test('parola: score marks hits, near letters and misses, counting duplicates once', () => {
  expect(score('PANNO', 'PIANO')).toEqual(['hit', 'near', 'miss', 'hit', 'hit'])
  expect(score('SERRA', 'PIANO')).toEqual(['miss', 'miss', 'miss', 'miss', 'near'])
  expect(score('AAAAA', 'PIANO')).toEqual(['miss', 'miss', 'hit', 'miss', 'miss'])
})

test('parola: normalize strips accents and keeps only letters, uppercase', () => {
  expect(normalize(' perché ')).toBe('PERCHE')
  expect(normalize("po'")).toBe('PO')
})

test('parola: any 5 letters is a valid guess; game ends on the word or after 6', () => {
  let g = { day: '2026-11-26', guesses: [] as string[] }
  expect(parolaGuess(g, 'abc', 'PIANO').error).toBe('Servono 5 lettere')
  g = parolaGuess(g, 'aeiou', 'PIANO').game
  expect(g.guesses).toEqual(['AEIOU'])
  const won = parolaGuess(g, 'piano', 'PIANO')
  expect(won.status).toBe('won')
  let lost = { day: '2026-11-26', guesses: [] as string[] }
  for (let i = 0; i < 6; i++) lost = parolaGuess(lost, 'zzzzz', 'PIANO').game
  expect(parolaGuess(lost, 'piano', 'PIANO').error).toBe('Partita finita')
})

test('parola: the daily index is stable for a local day and changes the next day', () => {
  const a = new Date(2026, 10, 26, 0, 5)
  const b = new Date(2026, 10, 26, 23, 55)
  const c = new Date(2026, 10, 27, 0, 5)
  expect(dayKey(a)).toBe('2026-11-26')
  expect(dailyIndex(a, 2000)).toBe(dailyIndex(b, 2000))
  expect(dailyIndex(c, 2000)).not.toBe(dailyIndex(a, 2000))
  expect(dailyIndex(a, 2000) >= 0 && dailyIndex(a, 2000) < 2000).toBe(true)
})

test('parola: keyboard keeps the best state of each letter', () => {
  expect(keyboard(['SERRA', 'PANNO'], 'PIANO')).toMatchObject({ S: 'miss', A: 'near', P: 'hit', O: 'hit' })
})

test('campo: first reveal is never a mine and opens an area', () => {
  let c = newCampo('facile')
  c = campoReveal(c, 40, rng(3), 0)
  expect(c.mines.length).toBe(10)
  expect(c.mines.includes(40)).toBe(false)
  expect(c.status).toBe('playing')
  expect([...c.cells].filter(x => x === 'o').length > 1).toBe(true)
})

test('campo: revealing a mine loses; opening every safe cell wins', () => {
  let c = campoReveal(newCampo('facile'), 0, rng(5), 0)
  const lost = campoReveal(c, c.mines[0], rng(), 1000)
  expect(lost.status).toBe('lost')
  for (let i = 0; i < 81; i++) if (!c.mines.includes(i)) c = campoReveal(c, i, rng(), 2000)
  expect(c.status).toBe('won')
})

test('campo: flags toggle on covered cells and block reveal; cursor stays on the board', () => {
  let c = campoReveal(newCampo('facile'), 40, rng(7), 0)
  const covered = [...c.cells].findIndex(x => x === '.')
  c = campoFlag(c, covered)
  expect(c.cells[covered]).toBe('f')
  expect(campoReveal(c, covered, rng(), 0).cells[covered]).toBe('f')
  expect(campoFlag(c, covered).cells[covered]).toBe('.')
  expect(campoMove({ ...c, cursor: 0 }, 'up').cursor).toBe(0)
  expect(campoMove({ ...c, cursor: 0 }, 'right').cursor).toBe(1)
})

test('raddoppia: slide merges each pair once and moves to the edge', () => {
  expect(slide([2, 2, 4, 0])).toEqual({ line: [4, 4, 0, 0], gained: 4 })
  expect(slide([2, 2, 2, 2])).toEqual({ line: [4, 4, 0, 0], gained: 8 })
  expect(slide([0, 0, 0, 2])).toEqual({ line: [2, 0, 0, 0], gained: 0 })
})

test('raddoppia: a move in each direction, a new tile after a real move only', () => {
  const g = { grid: [2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], score: 0 }
  const left = raddoppiaMove(g, 'left', rng(2))
  expect(left.grid[0]).toBe(4)
  expect(left.score).toBe(4)
  expect(left.grid.filter(v => v > 0).length).toBe(2)
  const same = raddoppiaMove({ grid: [4, 0, 0, 0, ...Array(12).fill(0)], score: 0 }, 'left', rng(2))
  expect(same.grid.filter(v => v > 0).length).toBe(1)
  const down = raddoppiaMove(g, 'down', rng(2))
  expect(down.grid[12]).toBe(2)
})

test('raddoppia: new game has two tiles; a full board with no pairs cannot move', () => {
  expect(newRaddoppia(rng(4)).grid.filter(v => v > 0).length).toBe(2)
  expect(canMove([2, 4, 2, 4, 4, 2, 4, 2, 2, 4, 2, 4, 4, 2, 4, 2])).toBe(false)
  expect(canMove([2, 2, 4, 8, ...Array(12).fill(16).map((v, i) => v * (i % 2 ? 2 : 1))])).toBe(true)
})
