/*
 * gameclaude — surface module: the one-row "keyboard zone" under Campo minato and
 * Raddoppia. After a click it receives keys on the drawing thread (surface.onKey) and
 * forwards each one to the hooks module with surface.post; the game itself lives in the
 * hooks module. Verified in the SVG probe: no key lost when typing fast.
 */
import type { ClientModule } from 'claude-code'

const Keys: ClientModule<{ hint: string }, boolean> = (props, surface) => {
  const { Text } = surface.elements
  if (surface.state === undefined) {
    surface.setState(true)
    surface.onKey(e => surface.post({ key: e.key }))
  }

  return <Text dimColor>⌨ {props.hint}</Text>
}

export default Keys
