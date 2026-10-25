import { inDefault } from './money'

// The one place that decides how repayments settle loans. Every screen that
// shows an outstanding loan amount (Loans, Net Worth, Month Report, the
// transaction form's loan picker) goes through allocateLoans() so they can't
// disagree. See INV-64 in docs/INVARIANTS.md.
//
// Rules:
//   1. A repayment whose loan_id points at a known loan is applied to that
//      loan first ("pay this specific loan").
//   2. Every other repayment belongs to its borrower and is applied to that
//      borrower's loans oldest first, to whatever each still owes after step 1.
//      This is how one payment can clear several small loans and leave a part
//      payment on the next one.
//   3. A specific-loan payment larger than its loan spills into the borrower's
//      pool, so no money is lost. Anything left after every loan is paid is
//      the borrower's surplus (overpaid).
//
// The split is derived every time, never stored, so editing or deleting a
// payment re-settles the loans on its own.

const NO_NAME = '(no name)'
const EPS = 0.005

// Borrowers are matched by name, ignoring case and extra spaces, so "Alice"
// and " alice " are one person.
export function borrowerKey(name) {
  const k = String(name || '').trim().replace(/\s+/g, ' ').toLowerCase()
  return k || NO_NAME
}

function byOldest(a, b) {
  const d = String(a.date || '').localeCompare(String(b.date || ''))
  if (d) return d
  return String(a.created_at || '').localeCompare(String(b.created_at || ''))
}

/**
 * @param {Array} transactions  any mix of transactions; only 'lend' and
 *   'lend_repayment' rows are used
 * @param {Object} [opts]
 * @param {(tx) => number} [opts.value]  amount of a row in the reporting
 *   currency (default: inDefault)
 * @param {string} [opts.asOf]  'YYYY-MM': only rows dated in or before this
 *   month count (month-end history)
 * @returns {{ loans: Array, borrowers: Array, byKey: Map, totalOutstanding: number,
 *   totalLent: number, totalRepaid: number }}
 */
export function allocateLoans(transactions, opts = {}) {
  const value = opts.value || (tx => Number(inDefault(tx) || 0))
  const asOf = opts.asOf || null
  const inRange = tx => !asOf || (tx.date && String(tx.date).slice(0, 7) <= asOf)

  const lends = []
  const repayments = []
  for (const t of transactions || []) {
    if (!inRange(t)) continue
    if (t.type === 'lend') lends.push(t)
    else if (t.type === 'lend_repayment') repayments.push(t)
  }
  lends.sort(byOldest)

  const loanById = new Map()
  const byKey = new Map()

  function borrowerFor(key, name) {
    if (!byKey.has(key)) {
      byKey.set(key, {
        key,
        name: name || NO_NAME,
        lent: 0,
        repaid: 0,
        outstanding: 0,
        surplus: 0,
        loans: [],
        payments: [],
        lastActivity: '',
        pool: 0,
      })
    }
    return byKey.get(key)
  }

  for (const lend of lends) {
    const key = borrowerKey(lend.borrower_name)
    const b = borrowerFor(key, (lend.borrower_name || '').trim() || NO_NAME)
    const principal = value(lend)
    const loan = {
      id: lend.id,
      lend,
      borrower: b.name,
      key,
      date: lend.date,
      principal,
      repaid: 0,
      outstanding: principal,
      settled: false,
      partial: false,
    }
    loanById.set(lend.id, loan)
    b.loans.push(loan)
    b.lent += principal
    if (String(lend.date || '') > b.lastActivity) b.lastActivity = String(lend.date || '')
  }

  // Step 1: specific-loan payments. Overflow goes to the borrower's pool.
  for (const r of repayments) {
    const amt = value(r)
    const target = r.loan_id ? loanById.get(r.loan_id) : null
    const key = target ? target.key : borrowerKey(r.borrower_name)
    const b = target ? byKey.get(key) : borrowerFor(key, (r.borrower_name || '').trim() || NO_NAME)
    b.payments.push({ tx: r, amount: amt, loan: target || null })
    b.repaid += amt
    if (String(r.date || '') > b.lastActivity) b.lastActivity = String(r.date || '')

    if (target) {
      const applied = Math.min(amt, target.outstanding)
      target.repaid += applied
      target.outstanding -= applied
      b.pool += amt - applied
    } else {
      b.pool += amt
    }
  }

  // Step 2: pooled payments settle each borrower's loans oldest first.
  let totalOutstanding = 0
  let totalLent = 0
  let totalRepaid = 0
  for (const b of byKey.values()) {
    for (const loan of b.loans) {
      if (b.pool <= EPS) break
      if (loan.outstanding <= EPS) continue
      const applied = Math.min(b.pool, loan.outstanding)
      loan.repaid += applied
      loan.outstanding -= applied
      b.pool -= applied
    }
    for (const loan of b.loans) {
      if (loan.outstanding < EPS) loan.outstanding = 0
      loan.settled = loan.outstanding === 0
      loan.partial = !loan.settled && loan.repaid > EPS
      b.outstanding += loan.outstanding
    }
    b.surplus = b.pool > EPS ? b.pool : 0
    delete b.pool
    b.payments.sort((x, y) => byOldest(y.tx, x.tx))
    totalOutstanding += b.outstanding
    totalLent += b.lent
    totalRepaid += b.repaid
  }

  const borrowers = [...byKey.values()].sort((a, b) =>
    (b.outstanding - a.outstanding) || b.lastActivity.localeCompare(a.lastActivity)
  )
  const loans = [...loanById.values()]

  return { loans, borrowers, byKey, totalOutstanding, totalLent, totalRepaid }
}
