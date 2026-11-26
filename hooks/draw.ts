/*
 * gameclaude — SVG drawing of the three boards (look "Morbido", mockups/svg.html?v=1).
 * Each SVG carries both palettes in a <style> block and picks the dark one with
 * `@media (prefers-color-scheme: dark)`: the mod cannot ask the app for its theme, but
 * the desktop app applies the media query inside the image (verified in the SVG probe).
 * Boards are drawn at a fixed internal size and scaled by the Svg element's width.
 */
import type { Mark } from './parola'
import { minesAround, type Campo } from './campo'

const LIGHT = `.bg{fill:#f3f1ea}.well{fill:#e8e5da}.tile{fill:#fff}.cover{fill:#d3cebe}.open{fill:#fbfaf6}
.hit{fill:#c2603e}.near{fill:#3f63a0}.miss{fill:#cfcbbd}.t{fill:#1f1e1d}.w{fill:#fff}.m{fill:#6f6d66}
.cur{fill:none;stroke:#1f1e1d;stroke-width:3}.typ{fill:#fff;stroke:#6f6d66;stroke-width:2}.mine{fill:#b8443a}
.n1{fill:#3f63a0}.n2{fill:#4f7f3f}.n3{fill:#b8443a}.n4{fill:#7a55a8}.n5{fill:#a8790f}.n6{fill:#2f7f79}.n7{fill:#1f1e1d}.n8{fill:#6f6d66}
.r1{fill:#efe6d6}.r2{fill:#ead6bb}.r3{fill:#e6c09c}.r4{fill:#e0a27a}.r5{fill:#d6825c}.r6{fill:#c2603e}.r7{fill:#a84a52}.r8{fill:#8a4470}.r9{fill:#6b4a8f}.r10{fill:#4d5aa6}.r11{fill:#2f6f9e}`
const DARK = `.bg{fill:#2d2d2a}.well{fill:#383733}.tile{fill:#46453f}.cover{fill:#55534c}.open{fill:#262624}
.hit{fill:#e0805e}.near{fill:#6f9bd6}.miss{fill:#4a4943}.t{fill:#f3f1ea}.m{fill:#a3a199}
.cur{stroke:#f3f1ea}.typ{fill:#46453f;stroke:#a3a199}.mine{fill:#e57565}
.n1{fill:#7d9ad0}.n2{fill:#86b26f}.n3{fill:#e57565}.n4{fill:#ad8fd6}.n5{fill:#d8ad45}.n6{fill:#6cb9b1}.n7{fill:#f3f1ea}.n8{fill:#a3a199}
.r1{fill:#4a4740}.r2{fill:#5c5446}.r3{fill:#7a5e45}.r4{fill:#9a5f40}.r5{fill:#b8603f}.r6{fill:#c94f45}.r7{fill:#a8456b}.r8{fill:#7e4c8f}.r9{fill:#5a57a6}.r10{fill:#3f6bb0}.r11{fill:#2f86a6}`
const STYLE = `<style>text{font-family:"Segoe UI",system-ui,sans-serif;font-weight:700;text-anchor:middle;dominant-baseline:central}${LIGHT}@media (prefers-color-scheme:dark){${DARK}}</style>`

function svg(w: number, h: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${STYLE}${body}</svg>`
}
const rect = (x: number, y: number, s: number, cls: string, r = 8) => `<rect x="${x}" y="${y}" width="${s}" height="${s}" rx="${r}" class="${cls}"/>`
const text = (x: number, y: number, s: number, t: string | number, cls: string, size: number) =>
  `<text x="${x + s / 2}" y="${y + s / 2}" font-size="${size}" class="${cls}">${t}</text>`

export function parolaSvg(rows: { word: string; marks: Mark[] }[]): string {
  const s = 46, g = 6
  let out = ''
  for (let r = 0; r < 6; r++) for (let c = 0; c < 5; c++) {
    const x = c * (s + g), y = r * (s + g), row = rows[r]
    if (row) out += rect(x, y, s, row.marks[c]) + text(x, y, s, row.word[c], row.marks[c] === 'miss' ? 't' : 'w', 22)
    else out += rect(x, y, s, 'well')
  }
  return svg(5 * s + 4 * g, 6 * s + 5 * g, out)
}

export function keyboardSvg(keys: Record<string, Mark>): string {
  const rows = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM']
  const k = 27, g = 4, w = 10 * k + 9 * g
  let out = ''
  rows.forEach((r, ri) => {
    const off = (w - (r.length * k + (r.length - 1) * g)) / 2
    ;[...r].forEach((ch, ci) => {
      const x = off + ci * (k + g), y = ri * (k + 8 + g), m = keys[ch]
      out += `<rect x="${x}" y="${y}" width="${k}" height="${k + 8}" rx="6" class="${m ?? 'tile'}"/>`
      out += `<text x="${x + k / 2}" y="${y + (k + 8) / 2}" font-size="13" class="${m === 'hit' || m === 'near' ? 'w' : m === 'miss' ? 'm' : 't'}">${ch}</text>`
    })
  })
  return svg(w, 3 * (k + 8) + 2 * g, out)
}

export function campoSvg(c: Campo): string {
  const s = 30, g = 3, showMines = c.status === 'lost'
  let out = ''
  for (let i = 0; i < c.w * c.h; i++) {
    const x = (i % c.w) * (s + g) + 2, y = Math.floor(i / c.w) * (s + g) + 2, ch = c.cells[i]
    if (showMines && c.mines.includes(i)) {
      out += rect(x, y, s, ch === 'o' ? 'mine' : 'cover', 6) + `<circle cx="${x + s / 2}" cy="${y + s / 2}" r="7" class="${ch === 'o' ? 'w' : 'mine'}"/>`
    } else if (ch === 'o') {
      const n = minesAround(c, i)
      out += rect(x, y, s, 'open', 6) + (n ? text(x, y, s, n, `n${n}`, 16) : '')
    } else {
      out += rect(x, y, s, 'cover', 6)
      if (ch === 'f') out += `<path d="M${x + 11} ${y + 7}v16M${x + 11} ${y + 7}l9 4-9 4z" class="mine" stroke="currentColor" stroke-width="0"/>`
    }
    if (i === c.cursor && c.status !== 'won' && c.status !== 'lost') out += `<rect x="${x - 2}" y="${y - 2}" width="${s + 4}" height="${s + 4}" rx="8" class="cur"/>`
  }
  return svg(c.w * (s + g) + 1, c.h * (s + g) + 1, out)
}

export function raddoppiaSvg(grid: number[]): string {
  const s = 66, g = 10, pad = 10, w = 4 * s + 3 * g + 2 * pad
  let out = `<rect width="${w}" height="${w}" rx="12" class="well"/>`
  grid.forEach((v, i) => {
    const x = pad + (i % 4) * (s + g), y = pad + Math.floor(i / 4) * (s + g)
    if (!v) return void (out += rect(x, y, s, 'bg'))
    const step = Math.min(11, Math.log2(v))
    out += rect(x, y, s, `r${step}`) + text(x, y, s, v, step >= 6 ? 'w' : 't', v >= 1000 ? 20 : v >= 100 ? 24 : 28)
  })
  return svg(w, w, out)
}
