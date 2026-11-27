/*
 * gameclaude — Parola game logic (pure functions, no engine): scoring a guess against
 * the solution, the keyboard colours, playing a guess, and the word of the day.
 * The daily word depends on the local date and on the ORDER of the answer list, so
 * both `dailyIndex` and the list order are frozen once published.
 */
export type Mark = 'hit' | 'near' | 'miss'
export type ParolaGame = { day: string; guesses: string[] }
export type ParolaStatus = 'playing' | 'won' | 'lost'

export const TRIES = 6

export function normalize(text: string): string {
  return text.normalize('NFD').replace(/[^A-Za-z]/g, '').toUpperCase()
}

export function score(guess: string, solution: string): Mark[] {
  const marks: Mark[] = Array(5).fill('miss')
  const left: Record<string, number> = {}
  for (let i = 0; i < 5; i++) {
    const s = solution[i]!
    if (guess[i] === s) marks[i] = 'hit'
    else left[s] = (left[s] ?? 0) + 1
  }
  for (let i = 0; i < 5; i++) {
    const g = guess[i]!
    if (marks[i] !== 'hit' && left[g]) {
      marks[i] = 'near'
      left[g]!--
    }
  }
  return marks
}

export function status(game: ParolaGame, solution: string): ParolaStatus {
  if (game.guesses.includes(solution)) return 'won'
  return game.guesses.length >= TRIES ? 'lost' : 'playing'
}

// Any 5 letters is accepted (decision: no dictionary of valid guesses).
export function parolaGuess(game: ParolaGame, text: string, solution: string) {
  if (status(game, solution) !== 'playing') return { game, status: status(game, solution), error: 'Partita finita' }
  const word = normalize(text)
  if (word.length !== 5) return { game, status: 'playing' as ParolaStatus, error: 'Servono 5 lettere' }
  const next = { ...game, guesses: [...game.guesses, word] }
  return { game: next, status: status(next, solution), error: '' }
}

export function keyboard(guesses: string[], solution: string): Record<string, Mark> {
  const rank: Record<Mark, number> = { miss: 0, near: 1, hit: 2 }
  const keys: Record<string, Mark> = {}
  for (const g of guesses) {
    score(g, solution).forEach((m, i) => {
      const k = g[i]!
      const had = keys[k]
      if (!had || rank[m] > rank[had]) keys[k] = m
    })
  }
  return keys
}

export function dayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// Days since 2026-01-01 in local time: day N uses word N of the frozen, pre-shuffled
// list, so appending words never changes a day already assigned (wraps after the end).
export function dailyIndex(d: Date, listLength: number): number {
  const day = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - new Date(2026, 0, 1).getTime()) / 86400000)
  return ((day % listLength) + listLength) % listLength
}
