<p align="center">
  <h1 align="center">gameclaude</h1>
  <p align="center"><b>Three quick games while Claude thinks</b></p>
  <p align="center">A Claude Code plugin that adds a /game side pane with Parola, Campo minato and Raddoppia, redrawn only when you move.</p>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/Claude-D97757?style=for-the-badge&logo=anthropic&logoColor=white" />
  <img src="https://img.shields.io/badge/license-MIT-green?style=for-the-badge" />
</p>

## What it is

gameclaude is a mod (a Claude Code plugin with a hooks module) for Claude Code and the Claude desktop app. The `/game` slash command opens a side pane with three turn-based mini-games. The game text is in Italian.

Nothing animates on its own, so it costs essentially nothing while you wait:

- The board is drawn as SVG and redrawn only when you make a move.
- The only timer is the seconds counter in Campo minato. It runs only during a game with the pane open and pauses when the pane is closed.
- The plugin registers only the `/game` command at startup, has no external dependencies, and uses no network.

<!-- Screenshots: none yet. Add images here once available. -->

## Games

Tabs at the top switch game (hotkeys `1`, `2`, `3`). Light and dark theme follow the app. When the pane is minimized to a widget, it shows one line with the game's state.

| Game | What it is |
|---|---|
| **Parola** | Guess the 5-letter Italian word in 6 tries. |
| **Campo minato** | Minesweeper with three levels. |
| **Raddoppia** | 2048-style sliding tiles on a 4×4 grid. |

### Parola

- One word of the day, taken from a frozen list of 768 words written for this project. It changes at local midnight and is the same for everyone.
- Green: right letter, right place. Yellow: the letter is elsewhere in the word.
- Any 5 letters are accepted as a guess.
- Type in the text field and press Enter. The drawn keyboard shows the letters already tried.
- Stats: played, won, current streak, best streak.

### Campo minato

| Level | Board | Mines |
|---|---|---|
| Facile | 9×9 | 10 |
| Medio | 16×16 | 40 |
| Difficile | 16 wide × 30 tall | 99 |

- Keyboard only: click the "keyboard zone" line under the board once, then use the keys below.
- The first move is never a mine. The best time per level is saved.
- Level buttons start a new game. A Bandierina (flag) button is also available.

| Key | Action |
|---|---|
| Arrows | Move the cursor |
| Enter or Space | Open the cell |
| F | Place or remove a flag |
| Enter on an opened number with all its flags placed | Open the remaining neighbours (chording) |

### Raddoppia

- Click the keyboard zone, then slide the tiles with the arrows, W/A/S/D, or the on-screen arrow buttons.
- Press `N` or click "Nuova partita" to start over.
- Best score and highest tile are saved.

## Install

At the prompt of a terminal Claude Code session:

```text
/plugin install gameclaude --marketplace FreddyZeta1847/gameclaude
```

Answer `y` to add the marketplace, then pick a scope (user scope is recommended).

From a shell:

```bash
claude plugin install gameclaude --marketplace FreddyZeta1847/gameclaude
```

In the Claude desktop app, where `/plugin` does not run: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `FreddyZeta1847/gameclaude`, then **Add plugin**.

## Usage

Type `/game`.

## Saving

Games in progress and stats are saved automatically after each move (written about 0.4 s later). The data lives in the plugin's own store file in the Claude Code config folder. Nothing leaves your computer.

## Development

```bash
claude plugin test .                 # 14 tests on the game logic (hooks/games.test.ts)
claude plugin validate .             # checks the manifest and module
claude --plugin-dir <folder>         # loads a local copy
```

### Structure

| Path | Role |
|---|---|
| `.claude-plugin/plugin.json`, `marketplace.json` | Plugin manifest and marketplace entry |
| `hooks/register.tsx` | Pane, input, saving |
| `hooks/parola.ts`, `campo.ts`, `raddoppia.ts` | Pure game logic |
| `hooks/draw.ts` | SVG boards |
| `hooks/keys.tsx` | Keyboard zone |
| `hooks/save.ts` | Saved data, with a data version |
| `hooks/words.ts` | Word list. The order is frozen: only append. |
| `types/index.d.ts` | State contract |
| `hooks/games.test.ts` | Tests |

## Notes

"Parola" and "Raddoppia" are original names. The mechanics are inspired by well-known games; there is no affiliation.

## License

[MIT](LICENSE), copyright FreddyZeta1847. Repository: https://github.com/FreddyZeta1847/gameclaude