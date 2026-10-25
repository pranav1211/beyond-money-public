// The app's side of the contract: what the sync queue sends an adapter after
// an offline session, replayed through the same executeOp() the app uses.
// Runs against the memory adapter (it tests app logic, not the adapter).
//
// Sync delivery is at-least-once: if a write reaches the backend but the reply
// is lost, the queue retries it. So every scenario is also replayed with each
// op sent twice, and must end in exactly the same state.

export function replayTests({ executeOp, createAdapter, newId }) {
  const uid = newId()

  // An offline session that builds on itself: rows created offline are
  // referenced, edited and deleted before anything syncs (INV-68).
  function offlineSession() {
    const account = newId(), card = newId(), food = newId(), l1 = newId(), l2 = newId()
    const tx = newId(), tx2 = newId(), exp = newId(), exp2 = newId()
    const ops = [
      { table: 'labels', action: 'insert', payload: { id: l1, user_id: uid, name: 'Trip' } },
      { table: 'labels', action: 'insert', payload: { id: l2, user_id: uid, name: 'Work' } },
      { table: 'categories', action: 'insert', payload: { id: food, user_id: uid, name: 'Food', type: 'expense' } },
      { table: 'accounts', action: 'insert', payload: { id: account, user_id: uid, name: 'Wallet', type: 'cash', current_balance: 1000 } },
      { table: 'credit_cards', action: 'insert', payload: { id: card, user_id: uid, name: 'Card', credit_limit: 5000 } },
      { table: 'transactions', action: 'insert', payload: { id: tx, user_id: uid, type: 'expense', amount: 100, account_id: account, category_id: food, date: '2026-10-01' }, _labels: [l1] },
      { table: 'accounts', action: 'update', recordId: account, payload: { current_balance: 900 } },
      { table: 'transactions', action: 'update', recordId: tx, payload: { amount: 150 }, _labels: [l2] },
      { table: 'accounts', action: 'update', recordId: account, payload: { current_balance: 850 } },
      { table: 'transactions', action: 'insert', payload: { id: tx2, user_id: uid, type: 'expense', amount: 20, account_id: account, date: '2026-10-02' }, _labels: [l1, l2] },
      { table: 'transactions', action: 'delete', recordId: tx2 },
      { table: 'cc_expenses', action: 'insert', payload: { id: exp, user_id: uid, credit_card_id: card, amount: 300, description: 'Shoes', date: '2026-10-03' }, _labels: [l1] },
      { table: 'cc_expenses', action: 'insert', payload: { id: exp2, user_id: uid, credit_card_id: card, amount: 40, description: 'Coffee', date: '2026-10-03' } },
      { table: 'cc_expenses', action: 'update', recordId: exp2, payload: { amount: 45 }, _labels: undefined },
      { table: 'cc_expenses', action: 'set_links', recordId: exp2, _labels: [l2] },
      { table: 'cc_expenses', action: 'update_batch', payload: { ids: [exp, exp2], update: { is_paid: true, paid_date: '2026-10-05' } } },
      { table: 'cc_expenses', action: 'delete', recordId: exp },
      { table: 'networth_snapshots', action: 'upsert', payload: { id: newId(), user_id: uid, month: '2026-10', net_worth: 1 }, conflictKeys: ['user_id', 'month'] },
      { table: 'networth_snapshots', action: 'upsert', payload: { id: newId(), user_id: uid, month: '2026-10', net_worth: 2 }, conflictKeys: ['user_id', 'month'] },
    ]
    return { ops, ids: { account, card, food, l1, l2, tx, tx2, exp, exp2 } }
  }

  async function snapshot(adapter) {
    const out = {}
    for (const t of ['labels', 'categories', 'accounts', 'credit_cards', 'transactions', 'transaction_labels', 'cc_expenses', 'cc_expense_labels', 'networth_snapshots']) {
      out[t] = (await adapter.list(t)).map(r => { const { id, ...rest } = r; return t === 'networth_snapshots' ? rest : r })
    }
    return out
  }

  function checkFinalState(t, s, ids) {
    const byId = (rows, id) => rows.find(r => r.id === id)
    const links = (rows, col, id) => rows.filter(r => r[col] === id).map(r => r.label_id).sort()

    t.equal(byId(s.accounts, ids.account)?.current_balance, 850, 'account created offline has its latest balance')
    t.equal(byId(s.transactions, ids.tx)?.account_id, ids.account, 'transaction points at the account created offline')
    t.equal(byId(s.transactions, ids.tx)?.amount, 150, 'edit made before sync applied')
    t.deepEqual(links(s.transaction_labels, 'transaction_id', ids.tx), [ids.l2], 'transaction label edit made offline synced')
    t.ok(!byId(s.transactions, ids.tx2), 'transaction created and deleted offline is gone')
    t.deepEqual(links(s.transaction_labels, 'transaction_id', ids.tx2), [], 'its label links are gone too (no cascade on transaction_labels)')
    t.equal(byId(s.cc_expenses, ids.exp2)?.credit_card_id, ids.card, 'expense points at the card created offline')
    t.equal(byId(s.cc_expenses, ids.exp2)?.amount, 45, 'expense edit applied')
    t.deepEqual(links(s.cc_expense_labels, 'cc_expense_id', ids.exp2), [ids.l2], 'update without labels kept them; set_links replaced them')
    t.equal(byId(s.cc_expenses, ids.exp2)?.is_paid, true, 'update_batch archived the card expenses')
    t.ok(!byId(s.cc_expenses, ids.exp), 'expense deleted offline is gone')
    t.deepEqual(links(s.cc_expense_labels, 'cc_expense_id', ids.exp), [], 'and its label links')
    t.equal(s.networth_snapshots.length, 1, 'two snapshot upserts for one month leave one row')
    t.equal(s.networth_snapshots[0]?.net_worth, 2, 'holding the latest value')
  }

  return [
    ['offline session replays to the right state', async (t) => {
      const adapter = createAdapter()
      const { ops, ids } = offlineSession()
      for (const op of ops) await executeOp(adapter, structuredClone(op))
      checkFinalState(t, await snapshot(adapter), ids)
    }],

    ['every op sent twice ends in the same state (at-least-once delivery)', async (t) => {
      const once = createAdapter()
      const twice = createAdapter()
      const { ops, ids } = offlineSession()
      for (const op of ops) await executeOp(once, structuredClone(op))
      for (const op of ops) {
        await executeOp(twice, structuredClone(op))
        await executeOp(twice, structuredClone(op))
      }
      const s = await snapshot(twice)
      checkFinalState(t, s, ids)
      t.deepEqual(s, await snapshot(once), 'identical to sending each op once')
    }],

    ['insert without an id (queued by an older version) gets one', async (t) => {
      const adapter = createAdapter()
      await executeOp(adapter, { table: 'labels', action: 'insert', payload: { user_id: uid, name: 'Old' } })
      const rows = await adapter.list('labels')
      t.equal(rows.length, 1, 'row inserted')
      t.ok(typeof rows[0]?.id === 'string' && rows[0].id.length > 0, 'with an id')
    }],

    ['ops aimed at pre-3.1 temp_ ids are dropped, not retried forever', async (t) => {
      const calls = []
      const base = createAdapter()
      const spy = new Proxy(base, { get: (o, k) => typeof o[k] === 'function' ? (...a) => { calls.push(k); return o[k](...a) } : o[k] })
      for (const action of ['update', 'delete', 'set_links']) {
        let threw = null
        try { await executeOp(spy, { table: 'transactions', action, recordId: 'temp_abc123', payload: { amount: 1 }, _labels: [] }) } catch (e) { threw = e }
        t.ok(!threw, `${action} on a temp_ id resolves`)
      }
      await executeOp(spy, { table: 'cc_expenses', action: 'update_batch', payload: { ids: ['temp_x'], update: { is_paid: true } } })
      t.deepEqual(calls, [], 'the adapter is never called for them')
    }],

    ['an unknown action throws (so the queue marks it failed)', async (t) => {
      let threw = null
      try { await executeOp(createAdapter(), { table: 'labels', action: 'explode' }) } catch (e) { threw = e }
      t.ok(threw && /Unknown sync action/.test(threw.message), 'throws "Unknown sync action"')
    }],
  ]
}
