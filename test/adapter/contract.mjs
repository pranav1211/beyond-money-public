// The storage adapter contract, as runnable checks. Every rule in
// docs/ADAPTERS.md that can be tested from outside the adapter is here.
//
// Safe to run against a real backend: it only touches rows it creates (marked
// with TEST_MARK) and removes them at the end, and it uses tables whose rows
// have no foreign keys except user_id.

export const TEST_MARK = '__adapter_test__'

export function contractTests({ adapter, newId, userId, bulkRows }) {
  const mine = (rows) => rows.filter(r => String(r.name || '').startsWith(TEST_MARK))
  const created = []
  const label = (name) => {
    const row = { id: newId(), user_id: userId, name: `${TEST_MARK} ${name}`, color: '#123456' }
    created.push(row.id)
    return row
  }

  return {
    cleanup: async () => {
      for (const id of created) await adapter.remove('labels', id).catch(() => {})
    },
    tests: [
      ['has the required methods', async (t) => {
        for (const m of ['list', 'insert', 'update', 'remove', 'updateMany', 'upsert', 'replaceLinks']) {
          t.ok(typeof adapter[m] === 'function', `${m}() is a function`)
        }
      }],

      ['list() returns an array of plain rows', async (t) => {
        const rows = await adapter.list('labels')
        t.ok(Array.isArray(rows), 'returns an array')
        t.doesNotThrow(() => structuredClone(rows), 'rows survive structuredClone (IndexedDB-safe)')
      }],

      ['insert() keeps the client id and every field', async (t) => {
        const row = label('insert')
        const saved = await adapter.insert('labels', row)
        t.equal(saved?.id, row.id, 'returns the row with the same id')
        const found = (await adapter.list('labels')).find(r => r.id === row.id)
        t.ok(found, 'row is listed')
        t.equal(found?.name, row.name, 'name stored')
        t.equal(found?.color, row.color, 'color stored')
        t.equal(found?.user_id, row.user_id, 'user_id stored')
      }],

      ['insert() is idempotent by id (a retried insert is a no-op)', async (t) => {
        const row = label('idempotent')
        await adapter.insert('labels', row)
        let threw = null
        try { await adapter.insert('labels', { ...row, name: `${TEST_MARK} changed` }) } catch (e) { threw = e }
        t.ok(!threw, `second insert with the same id does not throw${threw ? ` (threw: ${threw.message})` : ''}`)
        const copies = (await adapter.list('labels')).filter(r => r.id === row.id)
        t.equal(copies.length, 1, 'exactly one row with that id')
        t.equal(copies[0]?.name, row.name, 'the first write is kept')
      }],

      ['update() patches only the given fields and returns the row', async (t) => {
        const row = label('update')
        await adapter.insert('labels', row)
        const saved = await adapter.update('labels', row.id, { color: '#abcdef' })
        t.equal(saved?.id, row.id, 'returns the updated row')
        t.equal(saved?.color, '#abcdef', 'returned row has the new value')
        const found = (await adapter.list('labels')).find(r => r.id === row.id)
        t.equal(found?.color, '#abcdef', 'new value stored')
        t.equal(found?.name, row.name, 'other fields untouched')
      }],

      ['update() of a missing id returns null and creates nothing', async (t) => {
        const id = newId()
        let result, threw = null
        try { result = await adapter.update('labels', id, { name: `${TEST_MARK} ghost` }) } catch (e) { threw = e }
        t.ok(!threw, 'does not throw')
        t.equal(result ?? null, null, 'returns null')
        t.ok(!(await adapter.list('labels')).some(r => r.id === id), 'no row created')
      }],

      ['remove() deletes, and removing a missing id is not an error', async (t) => {
        const row = label('remove')
        await adapter.insert('labels', row)
        await adapter.remove('labels', row.id)
        t.ok(!(await adapter.list('labels')).some(r => r.id === row.id), 'row is gone')
        let threw = null
        try { await adapter.remove('labels', row.id) } catch (e) { threw = e }
        t.ok(!threw, 'removing it again does not throw')
      }],

      ['updateMany() changes exactly the listed rows', async (t) => {
        const a = label('many-a')
        const b = label('many-b')
        const c = label('many-c')
        for (const r of [a, b, c]) await adapter.insert('labels', r)
        await adapter.updateMany('labels', [a.id, b.id], { color: '#00ff00' })
        const rows = await adapter.list('labels')
        const color = (id) => rows.find(r => r.id === id)?.color
        t.equal(color(a.id), '#00ff00', 'first listed row changed')
        t.equal(color(b.id), '#00ff00', 'second listed row changed')
        t.equal(color(c.id), '#123456', 'unlisted row untouched')
        let threw = null
        try { await adapter.updateMany('labels', [], { color: '#000000' }) } catch (e) { threw = e }
        t.ok(!threw, 'an empty id list is a no-op')
      }],

      ['upsert() matches on the conflict keys', async (t) => {
        const month = '1999-01' // far outside any real data
        const id = newId()
        const base = { id, user_id: userId, month, net_worth: 1, accounts: 1, assets: 0, loans: 0, credit_cards: 0, captured_at: new Date().toISOString() }
        try {
          const first = await adapter.upsert('networth_snapshots', base, ['user_id', 'month'])
          t.equal(first?.month, month, 'first upsert returns the row')
          const second = await adapter.upsert('networth_snapshots', { ...base, net_worth: 2 }, ['user_id', 'month'])
          t.equal(Number(second?.net_worth), 2, 'second upsert returns the new values')
          const rows = (await adapter.list('networth_snapshots')).filter(r => r.month === month && r.user_id === userId)
          t.equal(rows.length, 1, 'one row for that user and month')
          t.equal(Number(rows[0]?.net_worth), 2, 'row holds the latest values')
        } finally {
          await adapter.remove('networth_snapshots', id).catch(() => {})
        }
      }],

      ['replaceLinks() replaces one parent\'s links and nothing else', async (t) => {
        // Real parents, so a backend with foreign keys accepts the links.
        const [l1, l2, l3] = [label('link-1'), label('link-2'), label('link-3')]
        for (const l of [l1, l2, l3]) await adapter.insert('labels', l)
        const card = { id: newId(), user_id: userId, name: `${TEST_MARK} card` }
        const expense = (d) => ({ id: newId(), user_id: userId, credit_card_id: card.id, amount: 1, description: `${TEST_MARK} ${d}`, date: '1999-01-01' })
        const [pe, oe] = [expense('parent'), expense('other')]
        const parent = pe.id
        const other = oe.id
        const links = async (p) => (await adapter.list('cc_expense_labels')).filter(r => r.cc_expense_id === p).map(r => r.label_id).sort()
        try {
          await adapter.insert('credit_cards', card)
          await adapter.insert('cc_expenses', pe)
          await adapter.insert('cc_expenses', oe)
          await adapter.replaceLinks('cc_expense_labels', 'cc_expense_id', other, 'label_id', [l1.id])
          await adapter.replaceLinks('cc_expense_labels', 'cc_expense_id', parent, 'label_id', [l1.id, l2.id])
          t.deepEqual(await links(parent), [l1.id, l2.id].sort(), 'sets the links')
          await adapter.replaceLinks('cc_expense_labels', 'cc_expense_id', parent, 'label_id', [l2.id, l3.id])
          t.deepEqual(await links(parent), [l2.id, l3.id].sort(), 'replaces them (old ones removed)')
          await adapter.replaceLinks('cc_expense_labels', 'cc_expense_id', parent, 'label_id', [l2.id, l3.id])
          t.deepEqual(await links(parent), [l2.id, l3.id].sort(), 'repeating it changes nothing')
          await adapter.replaceLinks('cc_expense_labels', 'cc_expense_id', parent, 'label_id', [])
          t.deepEqual(await links(parent), [], 'an empty list clears them')
          t.deepEqual(await links(other), [l1.id], 'another parent\'s links are untouched')
        } finally {
          await adapter.replaceLinks('cc_expense_labels', 'cc_expense_id', parent, 'label_id', []).catch(() => {})
          await adapter.replaceLinks('cc_expense_labels', 'cc_expense_id', other, 'label_id', []).catch(() => {})
          await adapter.remove('cc_expenses', parent).catch(() => {})
          await adapter.remove('cc_expenses', other).catch(() => {})
          await adapter.remove('credit_cards', card.id).catch(() => {})
        }
      }],

      ['list() honours orderBy', async (t) => {
        const names = ['order-c', 'order-a', 'order-b']
        for (const n of names) {
          const r = label(n)
          await adapter.insert('labels', r)
        }
        const pick = (rows) => mine(rows).map(r => r.name).filter(n => n.includes('order-'))
        const asc = pick(await adapter.list('labels', { orderBy: [['name', 'asc']] }))
        t.deepEqual(asc, [...asc].sort(), 'ascending')
        const desc = pick(await adapter.list('labels', { orderBy: [['name', 'desc']] }))
        t.deepEqual(desc, [...desc].sort().reverse(), 'descending')
      }],

      ['returned rows are copies', async (t) => {
        const row = label('copy')
        await adapter.insert('labels', row)
        const listed = (await adapter.list('labels')).find(r => r.id === row.id)
        listed.name = 'mutated by caller'
        row.name = 'mutated input'
        const again = (await adapter.list('labels')).find(r => r.id === row.id)
        t.ok(again.name.startsWith(TEST_MARK), 'changing a returned or passed-in object does not change stored data')
      }],

      [`list() is complete past 1,000 rows (${bulkRows} rows)`, async (t) => {
        const batch = Array.from({ length: bulkRows }, (_, i) => label(`bulk-${String(i).padStart(5, '0')}`))
        for (let i = 0; i < batch.length; i += 50) {
          await Promise.all(batch.slice(i, i + 50).map(r => adapter.insert('labels', r)))
        }
        const ids = new Set((await adapter.list('labels')).map(r => r.id))
        const missing = batch.filter(r => !ids.has(r.id)).length
        t.equal(missing, 0, `every row is returned (missing ${missing})`)
      }],

      ['optional capabilities have the right shape', async (t) => {
        const auth = adapter.auth
        if (auth) {
          for (const m of ['getSession', 'onAuthStateChange', 'signInWithOAuth', 'signOut', 'setSession']) {
            t.ok(typeof auth[m] === 'function', `auth.${m}() is a function`)
          }
        } else t.note('no auth: the app uses its built-in local sign-in')
        if (adapter.rates) {
          for (const m of ['get', 'put', 'clear']) t.ok(typeof adapter.rates[m] === 'function', `rates.${m}() is a function`)
        } else t.note('no rates: the app fetches exchange rates itself and caches them on the device')
        if (adapter.quotes) {
          for (const m of ['fetch', 'getCached', 'putCached']) t.ok(typeof adapter.quotes[m] === 'function', `quotes.${m}() is a function`)
        } else t.note('no quotes: asset prices are entered by hand')
        if (adapter.health !== undefined) t.ok(typeof adapter.health === 'function', 'health() is a function')
        else t.note('no health: the "service degraded" banner never shows')
      }],

      ['rates round-trip (when supported)', async (t) => {
        if (!adapter.rates) return t.note('skipped: no rates capability')
        const code = 'XTS' // ISO 4217 code reserved for testing
        try {
          await adapter.rates.put([{ from_currency: 'USD', to_currency: code, rate: 1.5, fetched_at: new Date().toISOString() }])
          const rows = await adapter.rates.get([code])
          t.ok(rows.some(r => r.to_currency === code && Number(r.rate) === 1.5), 'get() returns what put() stored')
          await adapter.rates.clear([code])
          t.equal((await adapter.rates.get([code])).length, 0, 'clear() removes it')
        } finally {
          await adapter.rates.clear([code]).catch(() => {})
        }
      }],
    ],
  }
}
