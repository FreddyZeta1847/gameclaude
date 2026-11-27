/*
 * gameclaude — surface module: the one-row "keyboard zone" under Campo minato and
 * Raddoppia. After a click it receives keys on the drawing thread (surface.onKey) and
 * forwards each one to the hooks module with surface.post; the game itself lives in the
 * hooks module. For Campo minato it also shows the running clock, ticking here on the
 * drawing thread: a once-a-second redraw of the whole pane by the hooks module made the
 * zone lose the keyboard focus.
 */
import type { ClientModule } from 'claude-code'

type Clock = { elapsed: number; startedAt: number; running: boolean }
type Props = { hint: string; clock?: Clock }
// `latest` is refreshed on every call, so the timer reads the current props.
type State = { latest: Props; n: number }

function fmt(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000))
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`
}

const Keys: ClientModule<Props, State> = (props, surface) => {
  const { Text } = surface.elements
  if (surface.state === undefined) {
    const state: State = { latest: props, n: 0 }
    surface.setState(state)
    surface.onKey(e => surface.post({ key: e.key }))
    if (props.clock) {
      // Ticks only while this zone is mounted (Campo minato tab, pane open); redraws only while a game runs.
      surface.every(1000, () => {
        const s = surface.state
        if (s?.latest.clock?.running) surface.setState({ latest: s.latest, n: s.n + 1 })
      })
    }
  } else surface.state.latest = props
  const c = props.clock
  const time = c ? `⏱ ${fmt(c.running ? c.elapsed + (Date.now() - c.startedAt) : c.elapsed)} · ` : ''

  return <Text dimColor>{time}⌨ {props.hint}</Text>
}

export default Keys
