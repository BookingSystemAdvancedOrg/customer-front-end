#!/usr/bin/env node
// Brand lint: finds UI code that bypasses @booqy/brand.
//
//   node brand-lint.mjs [options] [path ...]
//
// Every path is scanned and reported per app (the path's last folder names
// it). Report-only by default: a count per rule and app, exit 0. Files that
// match a --block glob (or "block" in --config) are blocking: any finding in
// them is printed with file:line and the exit code is 1. OWNERSHIP.md lists
// the globs for new feature code; the default list is empty.
//
//   --block <glob>     blocking glob, relative to the scanned path (repeatable)
//   --config <file>    JSON { "paths": [...], "block": [...] }
//   --json             machine-readable result on stdout
//
// Rules: colour (hex, rgb(), hsl() literals), spacing (px/rem in padding,
// margin, gap, inset), radius (border-radius not from a token), duration
// (ms/s in transition and animation, duration: in TS), keyframes (@keyframes
// or element.animate outside the brand package), bar (bar-like markup or CSS
// not built from the Bar family), duplicate (a local copy of a catalogue
// component or effect). The brand package itself, tests, dependencies and
// build output are never scanned.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, extname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const EXTS = new Set(['.css', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.html', '.py'])
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', '.git', '.venv', '__pycache__', 'vendor', 'brand', 'partners', 'test', 'tests'])
const SKIP_FILE = /\.(test|spec)\.[jt]sx?$|\.d\.ts$|^vite\.config|^vitest\.config/

const CATALOGUE = [
  'Bar', 'BusyBar', 'Button', 'Card', 'Modal', 'Field', 'Select', 'Skeleton', 'SkelBlock', 'SkelLines', 'SkelCard', 'SkelPage',
  'Toast', 'Toaster', 'Notice', 'StatTile', 'Printing', 'Loading', 'CountUp', 'Num', 'Ring', 'BarChart', 'ColumnChart', 'HBarChart', 'BarLineChart',
]
const EFFECT_FILES = new Set(['press.ts', 'sound.ts', 'glide.ts', 'glassFilter.ts', 'theme.ts', 'busy.ts', 'countUp.ts', 'liquid.ts', 'useLiquidFill.ts'])
const BARLIKE = /(?:^|[\s"'`.{-])((?:[a-z0-9]+-)*(?:bar|progress|meter|tabs?|tablist|toolbar|navbar|topbar|sidebar|banner|toast|busy)(?:-[a-z0-9]+)*)(?=[\s"'`{:,.)\]]|$)/i

export const RULES = ['colour', 'spacing', 'radius', 'duration', 'keyframes', 'bar', 'duplicate']

/** Minimal glob: ** any folders, * within a name, ? one character. */
export function globToRegExp(glob) {
  let re = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '*' && glob[i + 1] === '*') {
      re += glob[i + 2] === '/' ? '(?:.*/)?' : '.*'
      i += glob[i + 2] === '/' ? 2 : 1
    } else if (c === '*') re += '[^/]*'
    else if (c === '?') re += '[^/]'
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${re}$`)
}

function stripNoise(line) {
  // data: URIs (inline SVG chevrons) and URLs are not colours a page chose
  return line.replace(/url\((['"]?)data:[^)]*\1\)/g, 'url()').replace(/https?:\/\/\S+/g, '')
}

/** Findings for one file's text: [{ rule, line, text }]. */
export function lintText(text, file) {
  const ext = extname(file)
  const name = basename(file)
  const findings = []
  const add = (rule, line, snippet) => findings.push({ rule, line, text: snippet.trim().slice(0, 140) })
  const isStyle = ext === '.css' || ext === '.html'
  const isCode = ['.ts', '.tsx', '.js', '.jsx', '.mjs'].includes(ext)
  const lines = text.split('\n')
  lines.forEach((raw, i) => {
    const n = i + 1
    const line = stripNoise(raw)
    if ((ext === '.py' ? /^\s*#/ : /^\s*(\/\/|\*|\/\*)/).test(line)) return
    if (/#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b(?![-\w])/i.test(line.replace(/href=["'][^"']*["']|&#x?[0-9a-f]+;/gi, ''))) add('colour', n, raw)
    else if (/\b(?:rgba?|hsla?)\(\s*\d/i.test(line)) add('colour', n, raw)
    if (isStyle) {
      if (/(?:^|[\s;{])(?:padding|margin|gap|row-gap|column-gap|inset)(?:-[a-z]+)?\s*:[^;]*\b\d*\.?\d+(?:px|rem)\b/.test(line) && !/:\s*var\(--[\w-]+\)\s*;?\s*$/.test(line)) add('spacing', n, raw)
      if (/border(?:-[a-z]+)*-radius\s*:[^;]*\b\d+(?:px|rem|%)/.test(line)) add('radius', n, raw)
      if (/(?:transition|animation)(?:-duration|-delay)?\s*:[^;]*\b\d*\.?\d+m?s\b/.test(line)) add('duration', n, raw)
      if (/@keyframes\s/.test(line)) add('keyframes', n, raw)
      if (/^\s*[^{}@/]*\.[\w-]+[^{]*\{?\s*$/.test(line) && /\.((?:[a-z0-9]+-)*(?:bar|progress|meter|tabs?|toolbar|navbar|topbar|sidebar|banner|toast|busy)(?:-[a-z0-9]+)*)\b/i.test(line) && !/\.bq-/.test(line)) add('bar', n, raw)
    }
    if (ext === '.html') {
      const cls = /class=["']([^"']*)["']/.exec(line)
      if (cls && !/\bbq-/.test(cls[1]) && BARLIKE.test(` ${cls[1]} `)) add('bar', n, raw)
    }
    if (isCode) {
      if (/\bduration\s*:\s*\d/.test(line) || /setTimeout\([^,]+,\s*\d{3,}\s*\)/.test(line) && /anim|fade|flash|pop/i.test(line)) add('duration', n, raw)
      if (/\.animate\(\s*[[{]/.test(line)) add('keyframes', n, raw)
      if (/<(progress|meter)\b/.test(line) || /role=["'{](?:progressbar|meter|tablist|toolbar)/.test(line)) add('bar', n, raw)
      else {
        const cls = /className=\{?["'`]([^"'`]*)["'`]/.exec(line)
        if (cls && !/\bbq-/.test(cls[1]) && BARLIKE.test(` ${cls[1]} `)) add('bar', n, raw)
      }
      const def = /(?:export\s+)?(?:function|const)\s+([A-Z][A-Za-z]+)\s*(?:[=(<]|:)/.exec(line)
      if (def && CATALOGUE.includes(def[1])) add('duplicate', n, raw)
    }
  })
  if (EFFECT_FILES.has(name)) findings.push({ rule: 'duplicate', line: 1, text: `effect module ${name} (use @booqy/brand)` })
  return findings
}

function walk(dir, out) {
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.') && entry !== '.') continue
    const p = join(dir, entry)
    const st = statSync(p)
    if (st.isDirectory()) {
      if (!SKIP_DIRS.has(entry)) walk(p, out)
    } else if (EXTS.has(extname(entry)) && !SKIP_FILE.test(entry)) out.push(p)
  }
  return out
}

/** Scans `paths`; returns per-app counts and the blocking findings. */
export function run({ paths, block = [] }) {
  const blockers = block.map(globToRegExp)
  const apps = []
  const blocking = []
  for (const p of paths) {
    const root = resolve(p)
    const counts = Object.fromEntries(RULES.map((r) => [r, 0]))
    let files = 0
    for (const file of walk(root, [])) {
      files++
      const rel = relative(root, file).split(sep).join('/')
      const findings = lintText(readFileSync(file, 'utf8'), file)
      for (const f of findings) counts[f.rule]++
      if (blockers.some((re) => re.test(rel))) for (const f of findings) blocking.push({ ...f, file: join(p, rel) })
    }
    apps.push({ app: relative(process.cwd(), root) || '.', path: p, files, counts, total: Object.values(counts).reduce((a, b) => a + b, 0) })
  }
  return { apps, blocking }
}

function parseArgs(argv) {
  const opts = { paths: [], block: [], json: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--block') opts.block.push(argv[++i])
    else if (a === '--config') {
      const cfg = JSON.parse(readFileSync(argv[++i], 'utf8'))
      opts.paths.push(...(cfg.paths ?? []))
      opts.block.push(...(cfg.block ?? []))
    } else if (a === '--json') opts.json = true
    else if (a === '--help' || a === '-h') opts.help = true
    else opts.paths.push(a)
  }
  if (!opts.paths.length) opts.paths.push('src')
  return opts
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.help) {
    console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\nimport ')[0].replace(/^#!.*\n/, '').replace(/^\/\/ ?/gm, ''))
    process.exit(0)
  }
  const result = run(opts)
  if (opts.json) console.log(JSON.stringify(result, null, 2))
  else {
    console.log(`brand-lint (report-only unless --block): ${RULES.join(', ')}`)
    for (const a of result.apps) {
      console.log(`  ${a.app.padEnd(36)} ${String(a.total).padStart(5)} findings in ${a.files} files  ${RULES.map((r) => `${r} ${a.counts[r]}`).join(' · ')}`)
    }
    if (opts.block.length) {
      console.log(`blocking globs: ${opts.block.join(', ')}`)
      for (const f of result.blocking) console.log(`  ${f.file}:${f.line}  [${f.rule}]  ${f.text}`)
      console.log(result.blocking.length ? `${result.blocking.length} blocking finding(s)` : 'no blocking findings')
    }
  }
  process.exit(result.blocking.length ? 1 : 0)
}
