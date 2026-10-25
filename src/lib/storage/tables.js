// Facts about the data model that every adapter and the app share.
// docs/ADAPTERS.md documents the full table list and columns.

// Primary-key columns per table. Everything not listed uses ['id'].
const PRIMARY_KEYS = {
  transaction_labels: ['transaction_id', 'label_id'],
  cc_expense_labels: ['cc_expense_id', 'label_id'],
  stock_price_cache: ['symbol'],
}

export function primaryKeyOf(table) {
  return PRIMARY_KEYS[table] || ['id']
}

// Label links: parent table → link table and its two columns. Rows in the app
// carry their links as `[linkTable]: [{ label_id }]` (the same shape Supabase's
// embedded selects used to return).
export const LABEL_LINKS = {
  transactions: { linkTable: 'transaction_labels', parentCol: 'transaction_id', childCol: 'label_id' },
  cc_expenses: { linkTable: 'cc_expense_labels', parentCol: 'cc_expense_id', childCol: 'label_id' },
}
