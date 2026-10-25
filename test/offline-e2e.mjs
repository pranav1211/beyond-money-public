// Offline E2E smoke test (headless Chrome). Boots the built app, fakes a
// session, seeds IndexedDB, goes offline, drives the Transactions → Add → submit
// flow, and asserts the app navigates back AND queues the write. Guards the
// "offline writes must never regress" rule in CLAUDE.md / docs/OFFLINE.md.
//
// Run:  npm run build && npm run test:offline
// Needs a Chrome/Chromium binary (override with CHROME_BIN=/path/to/chrome).
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { readFileSync, existsSync } from 'node:fs'
import puppeteer from 'puppeteer-core'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PORT = 4188
const BASE = `http://localhost:${PORT}`
// Derive the Supabase project ref from .env so the fake session key matches.
const REF = (() => {
  try {
    const env = readFileSync(resolve(ROOT, '.env'), 'utf-8')
    const m = env.match(/VITE_SUPABASE_URL=\s*https?:\/\/([^.\s]+)/)
    return m ? m[1] : 'project'
  } catch { return 'project' }
})()
const CHROME = process.env.CHROME_BIN
  || [
    '/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium',
    `${process.env.ProgramFiles || ''}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env['ProgramFiles(x86)'] || ''}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env.LOCALAPPDATA || ''}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env.ProgramFiles || ''}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${process.env['ProgramFiles(x86)'] || ''}\\Microsoft\\Edge\\Application\\msedge.exe`,
  ].find(p => p && existsSync(p))
  || '/usr/bin/google-chrome-stable'

function log(...a) { console.log('[e2e]', ...a) }

async function waitForServer(url, tries = 80) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (r.status >= 200) return true } catch {}
    await new Promise(r => setTimeout(r, 250))
  }
  throw new Error('preview server never came up')
}

// Windows resolves `npx` to `npx.cmd` and has no POSIX process groups, so spawn
// the platform-correct binary and don't detach there.
const isWindows = process.platform === 'win32'
const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore', detached: !isWindows, shell: isWindows })
const cleanup = () => {
  if (!isWindows) { try { process.kill(-preview.pid, 'SIGKILL') } catch {} }
  try { preview.kill('SIGKILL') } catch {}
}
process.on('exit', cleanup)
process.on('SIGTERM', () => { cleanup(); process.exit(1) })

const errors = []
const consoleMsgs = []

try {
  await waitForServer(BASE)
  log('preview up at', BASE)

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    protocolTimeout: 60000,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  })
  const page = await browser.newPage()

  page.on('console', m => { consoleMsgs.push(`${m.type()}: ${m.text()}`) })
  page.on('pageerror', e => { errors.push(`pageerror: ${e.message}`) })
  page.on('requestfailed', r => {
    const u = r.url()
    if (u.includes('/assets/') || u.endsWith('.js') || u.endsWith('.css'))
      errors.push(`requestfailed: ${u.split('/').pop()} :: ${r.failure()?.errorText}`)
  })

  // 1) First online load — registers SW, creates IndexedDB, precaches chunks.
  await page.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 30000 })
  await page.evaluate(async () => { if (navigator.serviceWorker) await navigator.serviceWorker.ready })
  await new Promise(r => setTimeout(r, 4000))
  log('first load done, SW ready')

  // 2) Inject a fake-but-valid session + seed IndexedDB.
  await page.evaluate(async (ref) => {
    const future = Math.floor(Date.now() / 1000) + 365 * 24 * 3600
    const user = { id: '00000000-0000-0000-0000-000000000001', email: 'test@test.com', aud: 'authenticated', role: 'authenticated', user_metadata: {}, app_metadata: {} }
    const session = { access_token: 'fake.jwt.token', token_type: 'bearer', expires_in: 3600, expires_at: future, refresh_token: 'fake-refresh', user }
    localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify(session))
    localStorage.setItem('bm_cached_session', JSON.stringify({ session, user }))
    localStorage.setItem('defaultCurrency', 'INR')
    const db = await new Promise((res, rej) => { const req = indexedDB.open('beyond-money'); req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error) })
    const put = (store, items) => new Promise((res, rej) => { const tx = db.transaction(store, 'readwrite'); items.forEach(i => tx.objectStore(store).put(i)); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error) })
    await put('accounts', [{ id: 'acc1', name: 'Cash Wallet', currency: 'INR', current_balance: 1000, is_active: true, user_id: user.id }])
    await put('categories', [{ id: 'cat1', name: 'Food', type: 'expense', color: '#ffffff', user_id: user.id }])
    await put('currencies', [{ id: 'cur1', code: 'INR', symbol: '₹', name: 'Indian Rupee', is_default: true, user_id: user.id }])
    db.close()
  }, REF)
  log('session + IDB seeded')

  // 3) Reload online so the app boots logged-in with the seeded data.
  await page.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 30000 })
  await new Promise(r => setTimeout(r, 1500))
  log('booted at', page.url())

  // 4) GO OFFLINE.
  await page.setOfflineMode(true)
  const onlineFlag = await page.evaluate(() => navigator.onLine)
  log('offline set, navigator.onLine =', onlineFlag)

  // 5) Navigate to Add Transaction (served by SW shell + cached chunk).
  await page.goto(BASE + '/transactions/add', { waitUntil: 'domcontentloaded', timeout: 30000 })
  const formOk = await page.waitForSelector('form.tx-form', { timeout: 15000 }).then(() => true).catch(() => false)
  if (!formOk) errors.push('FORM_NOT_RENDERED: tx-form never appeared offline')
  await new Promise(r => setTimeout(r, 800))
  const urlOnAdd = page.url()
  log('on add page:', urlOnAdd, 'formRendered:', formOk)

  let filled = { ok: false }
  if (formOk) {
    filled = await page.evaluate(() => {
      const setNative = (el, val) => {
        const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, val)
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
      }
      const amount = document.querySelector('.amount-wrap input[type=number]')
      if (!amount) return { ok: false, why: 'no amount input' }
      setNative(amount, '100')
      const selects = [...document.querySelectorAll('form.tx-form select')]
      if (selects[0]) setNative(selects[0], 'acc1')
      if (selects[1]) setNative(selects[1], 'cat1')
      return { ok: true, selects: selects.length, accVal: selects[0]?.value, catVal: selects[1]?.value, amtVal: amount.value }
    })
  }
  log('form filled:', JSON.stringify(filled))

  const beforeSubmitErrs = errors.length
  if (formOk) {
    await page.click('form.tx-form button[type=submit]').catch(e => errors.push('CLICK_FAILED: ' + e.message))
    await new Promise(r => setTimeout(r, 2500))
  }

  const finalUrl = page.url()
  const navigated = /\/transactions\/?$/.test(new URL(finalUrl).pathname)

  const state = await page.evaluate(async () => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('beyond-money'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    const getAll = (store) => new Promise((res) => { const r = db.transaction(store, 'readonly').objectStore(store).getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => res([]) })
    const txs = await getAll('transactions'); const queue = await getAll('syncQueue'); db.close()
    return { txCount: txs.length, txDescs: txs.map(t => `${t.type}:${t.amount}:${String(t.id).slice(0, 6)}`), queueCount: queue.length, queueOps: queue.map(q => `${q.action}:${q.table}`) }
  }).catch(e => ({ err: e.message }))

  console.log('\n================ RESULT ================')
  console.log('navigator.onLine during test:', onlineFlag)
  console.log('form rendered offline       :', formOk)
  console.log('URL on add page  :', new URL(urlOnAdd).pathname)
  console.log('URL after submit :', new URL(finalUrl).pathname)
  console.log('NAVIGATED BACK?  :', navigated ? 'YES - works' : 'NO - BUG REPRODUCED')
  console.log('tx persisted IDB :', JSON.stringify(state))
  console.log('errors during submit:', JSON.stringify(errors.slice(beforeSubmitErrs)))
  console.log('ALL errors       :', JSON.stringify(errors, null, 1))
  console.log('recent console   :', JSON.stringify(consoleMsgs.slice(-30), null, 1))

  // Assertions: offline add must render the form, navigate back, and queue the op.
  const pass = formOk && navigated && (state.queueCount || 0) >= 1 && (state.txCount || 0) >= 1
  console.log(pass ? 'TEST PASS ✅' : 'TEST FAIL ❌')
  console.log('================ END ===================\n')
  if (!pass) process.exitCode = 1

  await browser.close()
} catch (e) {
  console.log('\n================ RESULT ================')
  console.error('[e2e] FATAL', e && e.stack || e)
  console.error('errors:', JSON.stringify(errors))
  console.error('console tail:', JSON.stringify(consoleMsgs.slice(-30)))
  console.log('================ END ===================\n')
  process.exitCode = 1
} finally {
  cleanup()
}
