/*
 * gameclaude — hooks module. `/game` opens a side pane with three turn-based games
 * (Parola, Campo minato, Raddoppia). The module keeps the game state, redraws the board
 * as SVG only when the player acts (no timer except the Campo minato clock, once a
 * second while a game runs and the pane is open) and saves to $.store shortly after
 * every move. Arrows reach it from the one-row Client in ./keys.tsx; letters from
 * Button hotkeys. Every move is computed inside one atom update, so two keys arriving
 * together never start from the same old state.
 */
import { atom, read, update } from 'claude-code'
import type { EngineInterface as Engine, Register } from 'claude-code'
import { ANSWERS } from './words'
import { dailyIndex, dayKey, keyboard, parolaGuess, score, type ParolaGame } from './parola'
import { campoFlag, campoMove, campoReveal, elapsedMs, flagsLeft, newCampo, pauseCampo, resumeCampo, type Campo, type Level } from './campo'
import { canMove, newRaddoppia, raddoppiaMove, type Dir } from './raddoppia'
import { campoSvg, keyboardSvg, parolaSvg, raddoppiaSvg } from './draw'
import { readSave, type Save } from './save'

const PANE = 'gameclaude'
const tab = atom({ plugin: 'gameclaude', key: 'tab' } as const, 'parola', { shape: 'tab-1' })
const data = atom({ plugin: 'gameclaude', key: 'data' } as const, null, { shape: 'data-1' })
const msg = atom({ plugin: 'gameclaude', key: 'msg' } as const, '', { shape: 'msg-1' })
const tick = atom({ plugin: 'gameclaude', key: 'tick' } as const, 0, { shape: 'tick-1' })

let clock: { cancel: () => void } | undefined
let saveTimer: { cancel: () => void } | undefined

// --- Data -------------------------------------------------------------------------------

async function current($: Engine): Promise<Save> {
  const held = await read($, data)
  return held ? (held as unknown as Save) : readSave(await $.store.get('data'))
}

// Applies one move to the latest state; returns the state before and after it.
async function mutate($: Engine, fn: (s: Save) => Save, persist = true): Promise<[Save, Save]> {
  let before = readSave(null)
  let after = before
  await update($, data, prev => {
    before = prev ? (prev as unknown as Save) : readSave(null)
    after = fn(before)
    return after as unknown as Record<string, unknown>
  })
  // The board redraws at once; the disk write follows 0.4 s later, folding quick moves.
  if (persist && after !== before && !saveTimer) saveTimer = $.clock.after(400, () => void flushSave($))
  return [before, after]
}

async function flushSave($: Engine) {
  saveTimer?.cancel()
  saveTimer = undefined
  const held = await read($, data)
  if (held) await $.store.set('data', held)
}

async function say($: Engine, text: string) {
  await update($, msg, () => text)
}

function syncClock($: Engine, running: boolean) {
  if (running && !clock) clock = $.clock.every(1000, () => void update($, tick, n => n + 1))
  if (!running && clock) {
    clock.cancel()
    clock = undefined
  }
}

// --- Parola -----------------------------------------------------------------------------

const solutionFor = (d: Date): string => ANSWERS[dailyIndex(d, ANSWERS.length)]!

function parolaToday(s: Save, now: Date): ParolaGame {
  const day = dayKey(now)
  return s.parola.game?.day === day ? s.parola.game : { day, guesses: [] }
}

const yesterdayOf = (day: string) => {
  const [y = 0, m = 1, d = 1] = day.split('-').map(Number)
  return dayKey(new Date(y, m - 1, d - 1))
}

// The streak shown today: it is broken once a whole day passed without playing.
function liveStreak(p: Save['parola'], now: Date): number {
  const today = dayKey(now)
  return p.lastDay === today || p.lastDay === yesterdayOf(today) ? p.streak : 0
}

function finishParola(p: Save['parola'], game: ParolaGame, won: boolean): Save['parola'] {
  if (p.lastDay === game.day) return p
  const streak = won ? (p.lastDay === yesterdayOf(game.day) ? p.streak + 1 : 1) : 0
  const dist = [...p.dist]
  if (won) dist[game.guesses.length - 1] = (dist[game.guesses.length - 1] ?? 0) + 1
  return { ...p, played: p.played + 1, won: p.won + (won ? 1 : 0), streak, maxStreak: Math.max(p.maxStreak, streak), dist, lastDay: game.day }
}

async function guessWord($: Engine, text: string) {
  const now = new Date()
  let error = ''
  await mutate($, s => {
    const res = parolaGuess(parolaToday(s, now), text, solutionFor(now))
    error = res.error
    if (error) return s
    const parola = { ...s.parola, game: res.game }
    return { ...s, parola: res.status === 'playing' ? parola : finishParola(parola, res.game, res.status === 'won') }
  })
  await say($, error)
}

// --- Campo minato -----------------------------------------------------------------------

type CampoAct = Dir | 'open' | 'flag' | 'new'

function finishCampo(campo: Save['campo'], c: Campo): Save['campo'] {
  const st = campo.stats[c.level]
  const won = c.status === 'won'
  const bestMs = won && (st.bestMs === undefined || c.elapsed < st.bestMs) ? c.elapsed : st.bestMs
  return { ...campo, stats: { ...campo.stats, [c.level]: { played: st.played + 1, won: st.won + (won ? 1 : 0), bestMs } } }
}

function campoStep(c: Campo, act: CampoAct, now: number, level?: Level): Campo {
  if (act === 'new') return newCampo(level ?? c.level)
  if (act === 'open') return campoReveal(c, c.cursor, Math.random, now)
  if (act === 'flag') return campoFlag(c, c.cursor)
  return campoMove(c, act)
}

async function campoAct($: Engine, act: CampoAct, level?: Level) {
  const now = Date.now()
  const isMove = act === 'up' || act === 'down' || act === 'left' || act === 'right'
  // Cursor moves stay in session memory only: they are not game moves.
  const [before, after] = await mutate($, s => {
    const prev = resumeCampo(s.campo.game ?? newCampo(s.campo.level), now)
    const c = campoStep(prev, act, now, level)
    const ended = (c.status === 'won' || c.status === 'lost') && prev.status !== c.status
    const campo = { ...s.campo, level: c.level, game: c }
    return { ...s, campo: ended ? finishCampo(campo, c) : campo }
  }, !isMove)
  const c = after.campo.game!
  syncClock($, c.status === 'playing')
  const ended = before.campo.game?.status !== c.status && (c.status === 'won' || c.status === 'lost')
  if (ended) await say($, c.status === 'won' ? `Campo libero in ${fmt(c.elapsed)}!` : 'Boom. Scegli una nuova partita per riprovare.')
  else if (!isMove) await say($, '')
}

// --- Raddoppia --------------------------------------------------------------------------

async function raddoppiaAct($: Engine, act: Dir | 'new') {
  let over = false
  const [, after] = await mutate($, s => {
    const r = s.raddoppia
    const prev = r.game ?? newRaddoppia(Math.random)
    const g = act === 'new' ? newRaddoppia(Math.random) : raddoppiaMove(prev, act, Math.random)
    if (g === prev && act !== 'new') return s
    over = !canMove(g.grid)
    return { ...s, raddoppia: { ...r, game: g, best: Math.max(r.best, g.score), maxTile: Math.max(r.maxTile, ...g.grid), played: r.played + (over ? 1 : 0) } }
  })
  await say($, over ? `Nessuna mossa possibile. Punti: ${after.raddoppia.game?.score ?? 0}.` : '')
}

// --- Input routing ----------------------------------------------------------------------

const ARROWS = ['up', 'down', 'left', 'right']

// Keys from the keyboard zone: arrows, Enter/space and "f". Letters handled here have no
// Button hotkey, so one press never acts twice.
async function onKey($: Engine, key: string) {
  const t = await read($, tab)
  const dir = ARROWS.includes(key) ? (key as Dir) : undefined
  if (t === 'campo') {
    if (dir) return campoAct($, dir)
    if (key === 'return' || key === ' ' || key === 'space') return campoAct($, 'open')
    if (key === 'f') return campoAct($, 'flag')
  }
  if (t === 'raddoppia' && dir) return raddoppiaAct($, dir)
}

async function setTab($: Engine, next: string) {
  await update($, tab, () => next)
  await say($, '')
  const s = await current($)
  syncClock($, next === 'campo' && s.campo.game?.status === 'playing')
}

async function openPane($: Engine) {
  const now = Date.now()
  const loaded = await current($)
  await mutate($, () => (loaded.campo.game ? { ...loaded, campo: { ...loaded.campo, game: resumeCampo(loaded.campo.game, now) } } : loaded), false)
  if (!loaded.raddoppia.game) await raddoppiaAct($, 'new')
  await $.ui.open({ id: PANE, title: 'gameclaude', focus: true })
  syncClock($, (await read($, tab)) === 'campo' && loaded.campo.game?.status === 'playing')
}

async function closePane($: Engine) {
  syncClock($, false)
  const now = Date.now()
  await mutate($, s => (s.campo.game ? { ...s, campo: { ...s.campo, game: pauseCampo(s.campo.game, now) } } : s), false)
  await flushSave($)
}

// --- Drawing ----------------------------------------------------------------------------

function fmt(ms: number): string {
  const sec = Math.floor(ms / 1000)
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`
}

const LEVEL_NAME: Record<Level, string> = { facile: 'Facile', medio: 'Medio', difficile: 'Difficile' }

function parolaView($: Engine, ui: any, s: Save) {
  const { Box, Text, Svg, Input } = ui
  const now = new Date()
  const sol = solutionFor(now)
  const game = parolaToday(s, now)
  const rows = game.guesses.map(w => ({ word: w, marks: score(w, sol) }))
  const won = game.guesses.includes(sol)
  const over = won || game.guesses.length >= 6
  const p = s.parola
  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="row" justifyContent="space-between">
        <Text bold>Parola del giorno</Text>
        <Text dimColor>tentativo {Math.min(game.guesses.length + 1, 6)} di 6 · serie {liveStreak(p, now)}</Text>
      </Box>
      <Svg source={parolaSvg(rows)} alt={`Griglia di Parola: ${game.guesses.join(', ') || 'nessun tentativo'}`} width={230} />
      {over ? (
        <Box flexDirection="column">
          <Text bold>{won ? `Indovinata in ${game.guesses.length}!` : `La parola era ${sol}.`}</Text>
          <Text dimColor>Giocate {p.played} · vinte {p.won} · serie migliore {p.maxStreak}. Torna domani per una parola nuova.</Text>
        </Box>
      ) : (
        <Input key="parola-input" placeholder="Scrivi la parola e premi invio" value="" autoFocus onSubmit={(v: string) => void guessWord($, v)} />
      )}
      <Svg source={keyboardSvg(keyboard(game.guesses, sol))} alt="Lettere già provate" width={300} />
    </Box>
  )
}

function campoView($: Engine, ui: any, s: Save) {
  const { Box, Text, Svg, Button, Client } = ui
  const c = s.campo.game ?? newCampo(s.campo.level)
  const best = s.campo.stats[c.level].bestMs
  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="row" justifyContent="space-between">
        <Text bold>Campo minato · {LEVEL_NAME[c.level]}</Text>
        <Text dimColor>{fmt(elapsedMs(c, Date.now()))} · mine {flagsLeft(c)}{best !== undefined ? ` · record ${fmt(best)}` : ''}</Text>
      </Box>
      <Svg source={campoSvg(c)} alt={`Campo minato ${c.w} per ${c.h}, ${c.status === 'lost' ? 'partita persa' : c.status === 'won' ? 'partita vinta' : 'in corso'}`} />
      <Client key="keys-campo" module="./keys.tsx" props={{ hint: 'Clicca qui, poi frecce · invio scopre · f bandierina' }} />
      <Box flexDirection="row" gap={1}>
        <Button key="flag" label="Bandierina" onPress={() => void campoAct($, 'flag')} />
        {(['facile', 'medio', 'difficile'] as Level[]).map(l => (
          <Button key={`lvl-${l}`} label={LEVEL_NAME[l]} variant={l === c.level ? 'primary' : 'secondary'} onPress={() => void campoAct($, 'new', l)} />
        ))}
      </Box>
    </Box>
  )
}

function raddoppiaView($: Engine, ui: any, s: Save) {
  const { Box, Text, Svg, Button, Client } = ui
  const g = s.raddoppia.game ?? { grid: Array(16).fill(0), score: 0 }
  const move = (d: Dir) => () => void raddoppiaAct($, d)
  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="row" justifyContent="space-between">
        <Text bold>Raddoppia</Text>
        <Text dimColor>punti {g.score} · record {s.raddoppia.best} · tessera max {s.raddoppia.maxTile}</Text>
      </Box>
      <Svg source={raddoppiaSvg(g.grid)} alt={`Griglia di Raddoppia, punti ${g.score}`} width={300} />
      <Client key="keys-raddoppia" module="./keys.tsx" props={{ hint: 'Clicca qui e usa le frecce' }} />
      <Box flexDirection="row" gap={1}>
        <Button key="up" label="↑" hotkey="w" onPress={move('up')} />
        <Button key="down" label="↓" hotkey="s" onPress={move('down')} />
        <Button key="left" label="←" hotkey="a" onPress={move('left')} />
        <Button key="right" label="→" hotkey="d" onPress={move('right')} />
        <Button key="new" label="Nuova partita" hotkey="n" onPress={() => void raddoppiaAct($, 'new')} />
      </Box>
    </Box>
  )
}

function widgetLine(t: string, s: Save): string {
  if (t === 'campo') return `Campo minato · ${s.campo.game?.status === 'playing' ? 'in corso' : 'pronto'}`
  if (t === 'raddoppia') return `Raddoppia · ${s.raddoppia.game?.score ?? 0} punti`
  const g = parolaToday(s, new Date())
  return `Parola · tentativo ${Math.min(g.guesses.length + 1, 6)} di 6`
}

const TABS: [string, string, string][] = [['parola', 'Parola', '1'], ['campo', 'Campo minato', '2'], ['raddoppia', 'Raddoppia', '3']]

// --- Hooks ------------------------------------------------------------------------------

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'game', description: 'Apri il pannello dei minigiochi (Parola, Campo minato, Raddoppia)' })
    return next(e)
  })

  on('command.run', { command: 'game' }, async $ => {
    await openPane($)
    return { text: 'Pannello dei minigiochi aperto.' }
  })

  on('ui.message', async ($, e) => {
    const key = (e.data as { key?: string })?.key
    if (key) await onKey($, key)
    return {}
  })

  on('ui.close', async ($, e, next) => {
    if ((e as { id?: string }).id === PANE) await closePane($)
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e) as any
    const { Box, Text, Button } = ui
    const t = await read($, tab)
    const s = await current($)
    const line = await read($, msg)
    await read($, tick) // redraw the Campo minato clock once a second while it runs
    if ((e.props as { placement?: string })?.placement === 'widget') return <Text>{widgetLine(t, s)}</Text>
    const view = t === 'campo' ? campoView($, ui, s) : t === 'raddoppia' ? raddoppiaView($, ui, s) : parolaView($, ui, s)
    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="row" gap={1}>
          {TABS.map(([id, label, key]) => (
            <Button key={`tab-${id}`} label={label} hotkey={key} variant={id === t ? 'primary' : 'secondary'} onPress={() => void setTab($, id)} />
          ))}
        </Box>
        {view}
        {line ? <Text>{line}</Text> : null}
      </Box>
    )
  })
}