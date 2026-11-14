// The QA hooks (window.blockfront.qa, dev ops in the sim worker) must not reach production.
// Builds the client and fails if any marker string survives in dist.
import { execSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// Strings that only exist in the QA API module and the worker's dev ops (InputState's
// inject methods also serve the latch and stay in the build).
const MARKERS = [
  'qa.startMatch',
  'only seed 1 is supported',
  'Object.assign(renderer.debug',
  "kind:'teleport'",
  'kind: "teleport"',
  'case"setHp"',
  "case'setHp'",
]

execSync('npm run build -w @blockfront/client', { stdio: 'inherit' })
const dist = join('apps', 'client', 'dist', 'assets')
const files = readdirSync(dist).filter((f) => f.endsWith('.js'))
const leaks = []
for (const file of files) {
  const text = readFileSync(join(dist, file), 'utf8')
  for (const marker of MARKERS) if (text.includes(marker)) leaks.push(`${file}: ${marker}`)
}
if (leaks.length) {
  console.error('QA hooks leaked into the production build:\n' + leaks.join('\n'))
  process.exit(1)
}
console.log(`ok: no QA markers in ${files.length} production chunks`)
