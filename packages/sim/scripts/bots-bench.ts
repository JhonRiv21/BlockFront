// npm run bots:bench -- --mode ctf --size 4 --difficulty veteran --matches 10
// Mixed teams: --blue veteran --red recruit (CTF and TDM). --seed picks the map (default 1).
import { parseArgs } from 'node:util'
import { percentile, runBenchMatch, type BenchSpec, type MatchReport } from '../src/bots/bench.ts'
import type { Difficulty, GameMode } from '../src/rules/modes.ts'

const { values } = parseArgs({
  options: {
    mode: { type: 'string', default: 'tdm' },
    size: { type: 'string', default: '4' },
    difficulty: { type: 'string', default: 'soldier' },
    blue: { type: 'string' },
    red: { type: 'string' },
    matches: { type: 'string', default: '5' },
    seed: { type: 'string', default: '1' },
    // First match variant, to split one series over several processes.
    offset: { type: 'string', default: '0' },
    json: { type: 'boolean', default: false },
  },
})

const modes = ['ctf', 'tdm', 'ffa']
const difficulties = ['recruit', 'soldier', 'veteran']
const mode = values.mode as GameMode
const blue = (values.blue ?? values.difficulty) as Difficulty
const red = (values.red ?? values.difficulty) as Difficulty
if (!modes.includes(mode) || !difficulties.includes(blue) || !difficulties.includes(red)) {
  console.error(`usage: --mode ${modes.join('|')} --difficulty ${difficulties.join('|')}`)
  process.exit(1)
}
const spec: BenchSpec = { mode, size: Number(values.size), blue, red, seed: Number(values.seed) }
const matches = Number(values.matches)
const offset = Number(values.offset)

const pct = (x: number) => `${(x * 100).toFixed(1)}%`
const reports: MatchReport[] = []
for (let i = 0; i < matches; i++) {
  const report = runBenchMatch(spec, offset + i, () => performance.now())
  reports.push(report)
  const sorted = [...report.stepMs].sort((a, b) => a - b)
  const avg = report.stepMs.reduce((a, b) => a + b, 0) / Math.max(1, report.stepMs.length)
  const worstStuck = Math.max(...report.stuck.map((s) => s.share))
  const accuracy = Object.entries(report.accuracy)
    .map(([d, a]) => `${d} ${pct(a.hits / Math.max(1, a.shots))}`)
    .join(' ')
  const winner = report.winner === 'player' ? `player ${report.winnerPlayer}` : report.winner
  if (!values.json)
    console.log(
      `#${offset + i + 1} ${report.seconds.toFixed(0)}s ${winner} by ${report.endedBy}` +
        ` score ${report.scoreBlue}-${report.scoreRed} captures ${report.captures}` +
        (report.firstCaptureSeconds !== null
          ? ` (first ${report.firstCaptureSeconds.toFixed(0)}s)`
          : '') +
        ` kills ${report.kills} | acc ${accuracy} | stuck max ${pct(worstStuck)}` +
        ` | step avg ${avg.toFixed(3)} ms p99 ${percentile(sorted, 0.99).toFixed(3)} ms`,
    )
}

const allSteps = reports.flatMap((r) => r.stepMs).sort((a, b) => a - b)
const shots: Record<string, { shots: number; hits: number }> = {}
for (const r of reports)
  for (const [d, a] of Object.entries(r.accuracy)) {
    const row = (shots[d] ??= { shots: 0, hits: 0 })
    row.shots += a.shots
    row.hits += a.hits
  }
const stuckShares = reports.flatMap((r) => r.stuck.map((s) => s.share))
const summary = {
  mode,
  size: spec.size,
  blue,
  red,
  matches,
  withCapture:
    reports.filter((r) => r.firstCaptureSeconds !== null && r.firstCaptureSeconds <= 600).length /
    matches,
  byScore: reports.filter((r) => r.endedBy === 'score').length / matches,
  blueWins: reports.filter((r) => r.winner === 'blue').length / matches,
  redWins: reports.filter((r) => r.winner === 'red').length / matches,
  avgSeconds: reports.reduce((a, r) => a + r.seconds, 0) / matches,
  avgKills: reports.reduce((a, r) => a + r.kills, 0) / matches,
  accuracy: Object.fromEntries(
    Object.entries(shots).map(([d, a]) => [d, a.hits / Math.max(1, a.shots)]),
  ),
  stuckMean: stuckShares.reduce((a, b) => a + b, 0) / Math.max(1, stuckShares.length),
  stuckMax: Math.max(...stuckShares),
  stepAvgMs: allSteps.reduce((a, b) => a + b, 0) / Math.max(1, allSteps.length),
  stepP99Ms: percentile(allSteps, 0.99),
  stepMaxMs: allSteps[allSteps.length - 1] ?? 0,
}
if (values.json) console.log(JSON.stringify(summary))
else {
  console.log(
    `\n${mode} ${spec.size} ${blue}${blue === red ? '' : ` vs ${red}`} × ${matches}: ` +
      (mode === 'ctf'
        ? `capture ${pct(summary.withCapture)}`
        : `by score ${pct(summary.byScore)}`) +
      ` | blue ${pct(summary.blueWins)} red ${pct(summary.redWins)}` +
      ` | ${summary.avgSeconds.toFixed(0)} s, ${summary.avgKills.toFixed(1)} kills` +
      ` | acc ${Object.entries(summary.accuracy)
        .map(([d, a]) => `${d} ${pct(a)}`)
        .join(' ')}` +
      ` | stuck mean ${pct(summary.stuckMean)} max ${pct(summary.stuckMax)}` +
      ` | step avg ${summary.stepAvgMs.toFixed(3)} p99 ${summary.stepP99Ms.toFixed(3)} max ${summary.stepMaxMs.toFixed(2)} ms`,
  )
}
