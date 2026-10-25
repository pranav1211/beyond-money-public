// npm run test:adapter
//
// Checks a storage adapter against the contract in docs/ADAPTERS.md, then
// replays an offline session through the app's write path.
//
//   npm run test:adapter                         memory adapter (default)
//   ADAPTER=src/lib/storage/adapters/mine.js npm run test:adapter
//
// ADAPTER is a module whose default export returns the adapter (it may be
// async). To test against a real backend, point it at a small file that
// returns your adapter already signed in, and set TEST_USER_ID to that user's
// id so test rows pass your access rules. The contract only touches rows it
// creates and deletes them afterwards. BULK_ROWS sets the size of the
// "complete past 1,000 rows" check (default 1050).
//
// App modules are loaded through Vite, so they see the same import.meta.env
// (.env files) and import resolution as the app.
import { createServer } from 'vite'
import { isDeepStrictEqual } from 'node:util'
import { resolve, isAbsolute } from 'node:path'
import { existsSync } from 'node:fs'

const root = resolve(import.meta.dirname, '../..')
const server = await createServer({
  root,
  logLevel: 'error',
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null },
  optimizeDeps: { noDiscovery: true, entries: [] },
})
// '/src/x.js' is root-relative; anything else is a path from the repo root
// (or absolute), served through Vite's /@fs/ prefix.
const load = (p) => server.ssrLoadModule(p.startsWith('/') && !isAbsolute(p.slice(1)) && existsSync(resolve(root, p.slice(1)))
  ? p
  : `/@fs/${resolve(root, p).replace(/\\/g, '/')}`)

let failures = 0
let passes = 0

function makeT() {
  const t = {
    ok(cond, msg) {
      if (cond) { passes++; console.log(`    \x1b[32m✓\x1b[0m ${msg}`) } else { failures++; console.log(`    \x1b[31m✗ ${msg}\x1b[0m`) }
    },
    equal(a, b, msg) { t.ok(a === b, a === b ? msg : `${msg} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`) },
    deepEqual(a, b, msg) { const same = isDeepStrictEqual(a, b); t.ok(same, same ? msg : `${msg}\n        got  ${JSON.stringify(a)}\n        want ${JSON.stringify(b)}`) },
    doesNotThrow(fn, msg) { try { fn(); t.ok(true, msg) } catch (e) { t.ok(false, `${msg} (threw: ${e.message})`) } },
    note(msg) { console.log(`    \x1b[2m· ${msg}\x1b[0m`) },
  }
  return t
}

async function runAll(title, tests) {
  console.log(`\n${title}`)
  for (const [name, fn] of tests) {
    console.log(`  ${name}`)
    try { await fn(makeT()) } catch (e) { failures++; console.log(`    \x1b[31m✗ threw: ${e?.message || e}\x1b[0m`) }
  }
}

try {
  const { executeOp, drainOps } = await load('/src/lib/storage/ops.js')
  const { newId } = await load('/src/lib/storage/ids.js')
  const { default: createMemoryAdapter } = await load('/test/adapter/memory.js')
  const { contractTests } = await import('./contract.mjs')
  const { replayTests } = await import('./replay.mjs')

  const target = process.env.ADAPTER
  const factory = target ? (await load(target)).default : createMemoryAdapter
  if (typeof factory !== 'function') throw new Error(`${target} must default-export a function that returns the adapter`)
  const adapter = await factory()
  const userId = process.env.TEST_USER_ID || newId()
  const bulkRows = Number(process.env.BULK_ROWS || 1050)

  const contract = contractTests({ adapter, newId, userId, bulkRows })
  try {
    await runAll(`Adapter contract: ${adapter?.name || target || 'memory'}`, contract.tests)
  } finally {
    await contract.cleanup()
  }
  await runAll('App write path: offline session replay (memory adapter)', replayTests({ executeOp, drainOps, createAdapter: createMemoryAdapter, newId }))
} catch (e) {
  failures++
  console.error(`\n\x1b[31mCould not run: ${e?.stack || e}\x1b[0m`)
} finally {
  await server.close()
}

console.log(`\n${passes} passed, ${failures} failed`)
console.log(failures ? 'TEST FAIL ❌' : 'TEST PASS ✅')
process.exit(failures ? 1 : 0)
