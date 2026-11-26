/*
 * gameclaude — hooks module. `/game` opens a side pane with three turn-based games
 * (Parola, Campo minato, Raddoppia). The module keeps the game state, redraws the board
 * as SVG only when the player acts (no timer except the Campo minato clock, once a
 * second while a game runs and the pane is open) and saves to $.store after every move.
 * Keys reach it from the one-row Client in ./keys.tsx (arrows) or from Button hotkeys.
 */
import { atom, read, update } from 'claude-code'
import type { Engine, Register } from 'claude-code'
import { ANSWERS } from './words'
import { dailyIndex, dayKey, keyboard, parolaGuess, score, type ParolaGame } from './parola'
import { campoFlag, campoMove, campoReveal, elapsedMs, flagsLeft, newCampo, type Campo, type Level } from './campo'
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

// The board redraws at once; the disk write follows 0.4 s later, folding quick moves
// into one write (awaiting it made each flag feel laggy).
async function store($: Engine, next: Save, persist = true) {
  await update($, data, () => next as unknown as Record<string, unknown>)
  if (persist && !saveTimer) saveTimer = $.clock.after(400, () => void flushSave($))
}

async function flushSave($: Engine) {
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

const solutionFor = (d: Date) => ANSWERS[dailyIndex(d, ANSWERS.length)]

function parolaToday(s: Save, now: Date): ParolaGame {
  const day = dayKey(now)
  return s.parola.game?.day === day ? s.parola.game : { day, guesses: [] }
}

function finishParola(p: Save['parola'], game: ParolaGame, won: boolean): Save['parola'] {
  if (p.lastDay === game.day) return p
  const [y, m, d] = game.day.split('-').map(Number)
  const yesterday = dayKey(new Date(y, m - 1, d - 1))
  const streak = won ? (p.lastDay === yesterday ? p.streak + 1 : 1) : 0
  const dist = [...p.dist]
  if (won) dist[game.guesses.length - 1]++
  return { ...p, played: p.played + 1, won: p.won + (won ? 1 : 0), streak, maxStreak: Math.max(p.maxStreak, streak), dist, lastDay: game.day }
}

async function guessWord($: Engine, text: string) {
  const s = await current($)
  const now = new Date()
  const res = parolaGuess(parolaToday(s, now), text, solutionFor(now))
  if (res.error) return say($, res.error)
  let parola = { ...s.parola, game: res.game }
  if (res.status !== 'playing') parola = finishParola(parola, res.game, res.status === 'won')
  await store($, { ...s, parola })
  await say($, '')
}

// --- Campo minato -----------------------------------------------------------------------

type CampoAct = Dir | 'open' | 'flag' | 'new'

function finishCampo(campo: Save['campo'], c: Campo): Save['campo'] {
  const st = campo.stats[c.level]
  const won = c.status === 'won'
  const bestMs = won && (st.bestMs === undefined || c.elapsed < st.bestMs) ? c.elapsed : st.bestMs
  return { ...campo, stats: { ...campo.stats, [c.level]: { played: st.played + 1, won: st.won + (won ? 1 : 0), bestMs } } }
}

async function campoAct($: Engine, act: CampoAct, level?: Level) {
  const s = await current($)
  const before = s.campo.game ?? newCampo(s.campo.level)
  const now = Date.now()
  let c: Campo
  if (act === 'new') c = newCampo(level ?? before.level)
  else if (act === 'open') c = campoReveal(before, before.cursor, Math.random, now)
  else if (act === 'flag') c = campoFlag(before, before.cursor)
  else c = campoMove(before, act)
  let campo: Save['campo'] = { ...s.campo, level: c.level, game: c }
  const ended = (c.status === 'won' || c.status === 'lost') && before.status !== c.status
  if (ended) campo = finishCampo(campo, c)
  // Cursor moves stay in session memory only: they are not game moves.
  await store($, { ...s, campo }, act !== 'up' && act !== 'down' && act !== 'left' && act !== 'right')
  syncClock($, c.status === 'playing')
  if (ended) await say($, c.status === 'won' ? `Campo libero in ${fmt(c.elapsed)}!` : 'Boom. Premi Nuova per riprovare.')
  else await say($, '')
}

// --- Raddoppia --------------------------------------------------------------------------

async function raddoppiaAct($: Engine, act: Dir | 'new') {
  const s = await current($)
  const before = s.raddoppia.game ?? newRaddoppia(Math.random)
  const g = act === 'new' ? newRaddoppia(Math.random) : raddoppiaMove(before, act, Math.random)
  if (g === before && act !== 'new') return
  const over = !canMove(g.grid)
  const r = s.raddoppia
  const raddoppia = {
    ...r, game: g, best: Math.max(r.best, g.score), maxTile: Math.max(r.maxTile, ...g.grid),
    played: r.played + (over ? 1 : 0),
  }
  await store($, { ...s, raddoppia })
  await say($, over ? `Nessuna mossa possibile. Punti: ${g.score}.` : '')
}

// --- Input routing ----------------------------------------------------------------------

const ARROWS: Record<string, Dir> = { up: 'up', down: 'down', left: 'left', right: 'right' }

async function onKey($: Engine, key: string) {
  const t = await read($, tab)
  const dir = ARROWS[key]
  if (t === 'campo') {
    if (dir) return campoAct($, dir)
    if (key === 'return' || key === ' ' || key === 'space') return campoAct($, 'open')
    if (key === 'f') return campoAct($, 'flag')
    if (key === 'n') return campoAct($, 'new')
  }
  if (t === 'raddoppia') {
    if (dir) return raddoppiaAct($, dir)
    if (key === 'n') return raddoppiaAct($, 'new')
  }
}

async function setTab($: Engine, next: string) {
  await update($, tab, () => next)
  await say($, '')
  const s = await current($)
  syncClock($, next === 'campo' && s.campo.game?.status === 'playing')
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
        <Text dimColor>tentativo {Math.min(game.guesses.length + 1, 6)} di 6 · serie {p.streak}</Text>
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

function arrowButtons($: Engine, ui: any, act: (d: Dir) => Promise<unknown>) {
  const { Button } = ui
  return [
    <Button key="up" label="↑" hotkey="w" onPress={() => void act('up')} />,
    <Button key="down" label="↓" hotkey="s" onPress={() => void act('down')} />,
    <Button key="left" label="←" hotkey="a" onPress={() => void act('left')} />,
    <Button key="right" label="→" hotkey="d" onPress={() => void act('right')} />,
  ]
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
      <Svg source={campoSvg(c)} alt={`Campo minato ${c.w} per ${c.h}, ${c.status === 'lost' ? 'partita persa' : c.status === 'won' ? 'partita vinta' : 'in corso'}`} width={316} />
      <Client key="keys-campo" module="./keys.tsx" props={{ hint: 'Clicca qui, poi frecce · invio scopre · f bandierina' }} />
      <Box flexDirection="row" gap={1}>
        <Button key="flag" label="Bandierina" hotkey="f" onPress={() => void campoAct($, 'flag')} />
      </Box>
      <Box flexDirection="row" gap={1}>
        {(['facile', 'medio', 'difficile'] as Level[]).map(l => (
          <Button key={`lvl-${l}`} label={`Nuova ${LEVEL_NAME[l].toLowerCase()}`} variant={l === c.level ? 'primary' : 'secondary'} onPress={() => void campoAct($, 'new', l)} />
        ))}
      </Box>
    </Box>
  )
}

function raddoppiaView($: Engine, ui: any, s: Save) {
  const { Box, Text, Svg, Button, Client } = ui
  const g = s.raddoppia.game ?? { grid: Array(16).fill(0), score: 0 }
  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="row" justifyContent="space-between">
        <Text bold>Raddoppia</Text>
        <Text dimColor>punti {g.score} · record {s.raddoppia.best}</Text>
      </Box>
      <Svg source={raddoppiaSvg(g.grid)} alt={`Griglia di Raddoppia, punti ${g.score}`} width={300} />
      <Client key="keys-raddoppia" module="./keys.tsx" props={{ hint: 'Clicca qui e usa le frecce' }} />
      <Box flexDirection="row" gap={1}>
        {arrowButtons($, ui, d => raddoppiaAct($, d))}
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
    await store($, await current($), false)
    if ((await current($)).raddoppia.game === undefined) await raddoppiaAct($, 'new')
    await $.ui.open({ id: PANE, title: 'gameclaude', focus: true })
    return { text: 'Pannello dei minigiochi aperto.' }
  })

  on('ui.message', async ($, e) => {
    const key = (e.data as { key?: string })?.key
    if (key) await onKey($, key)
    return { element: e.element }
  })

  on('ui.close', async ($, e, next) => {
    if ((e as { id?: string }).id === PANE) syncClock($, false)
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
