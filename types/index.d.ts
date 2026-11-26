/*
 * gameclaude — state contract: the open tab, the saved data (mirrored to $.store on
 * every move; its real shape is `Save` in hooks/save.ts, kept loose here so the
 * contract stays types-only), a short message line and the Campo minato clock tick.
 */
declare module 'claude-code' {
  interface PluginState {
    gameclaude: {
      tab: Shaped<string>
      data: Shaped<Record<string, unknown> | null>
      msg: Shaped<string>
      tick: Shaped<number>
    }
  }
}
