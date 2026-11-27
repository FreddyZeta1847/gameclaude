/*
 * gameclaude — the saved data: one object with its own data version `v` (separate from
 * the mod version), stats per game and the game in progress, written to $.store under
 * "data" after every move. New fields are only ever added; a missing field is read with
 * its default.
 */
import type { ParolaGame } from './parola'
import type { Campo, Level } from './campo'
import type { Raddoppia } from './raddoppia'

export const DATA_V = 1
export const LIST_V = 1

export type LevelStats = { bestMs?: number; played: number; won: number }
export type Save = {
  v: number
  parola: { played: number; won: number; streak: number; maxStreak: number; dist: number[]; lastDay?: string; listV: number; game?: ParolaGame }
  campo: { level: Level; stats: Record<Level, LevelStats>; game?: Campo }
  raddoppia: { best: number; maxTile: number; played: number; game?: Raddoppia }
}

const lvl = (): LevelStats => ({ played: 0, won: 0 })

export function emptySave(): Save {
  return {
    v: DATA_V,
    parola: { played: 0, won: 0, streak: 0, maxStreak: 0, dist: [0, 0, 0, 0, 0, 0], listV: LIST_V },
    campo: { level: 'facile', stats: { facile: lvl(), medio: lvl(), difficile: lvl() } },
    raddoppia: { best: 0, maxTile: 0, played: 0 },
  }
}

// Reads whatever the store held: unknown or newer data versions start fresh; missing
// fields fall back to their defaults.
export function readSave(raw: unknown): Save {
  const base = emptySave()
  if (!raw || typeof raw !== 'object' || (raw as Save).v !== DATA_V) return base
  const r = raw as Partial<Save>
  return {
    v: DATA_V,
    parola: { ...base.parola, ...r.parola },
    campo: { ...base.campo, ...r.campo, stats: { ...base.campo.stats, ...r.campo?.stats } },
    raddoppia: { ...base.raddoppia, ...r.raddoppia },
  }
}
