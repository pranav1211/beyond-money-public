// Demo account roster — lets you keep several logged-in Supabase sessions and
// switch between them without re-authenticating. Purely a convenience for demos.
//
// SECURITY NOTE: this stashes each account's refresh/access token in
// localStorage (plaintext, same origin). Fine for a personal demo tool; do NOT
// treat this as a hardened multi-tenant feature. Tokens are captured from the
// live gotrue session, so they carry the same power as being logged in.

const KEY = 'bm_accounts'

export function getRoster() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY))
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function save(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)) } catch { /* quota / disabled — ignore */ }
}

// Upsert an account from a live supabase session. Keeps the freshest tokens.
export function upsertAccount(session) {
  if (!session?.user?.id || !session.access_token || !session.refresh_token) return
  const u = session.user
  const entry = {
    id: u.id,
    email: u.email || '',
    label: u.user_metadata?.full_name || u.email?.split('@')[0] || u.email || 'Account',
    avatar: u.user_metadata?.avatar_url || null,
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  }
  const list = getRoster()
  const i = list.findIndex(a => a.id === entry.id)
  if (i === -1) list.push(entry)
  else list[i] = { ...list[i], ...entry }
  save(list)
}

export function removeAccount(id) {
  save(getRoster().filter(a => a.id !== id))
}
