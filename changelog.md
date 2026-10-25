## Changelog for Beyond Money

This repo gets updated when i make changes to the personal version. This will keep getting updated as and when needed

### V3.0.1 (25/10/2026)
Catches the public version up with six months of changes to the personal version.

**New**
- Loans: lend money and track it by person. Record any payment and it settles their oldest loans first, settle everything at once, or pay one specific loan. Settled people stay listed so you can lend to them again.
- Net worth history: month-by-month chart, change vs last month, your highest month, insights and an allocation breakdown. Month-end values are saved so past months don't shift.
- Month Report: a full monthly breakdown, opened from the dashboard, that you can save as a PDF.
- Credit cards: partial / early payments, net due, credit left, utilization warnings, expense categories and labels.
- Assets: more types (security deposit, multi-lot stocks and funds) and optional live stock prices.
- Multiple currencies with a default, used across every total.

**3.0 redesign**
- A calmer look: solid rounded cards, new fonts (bundled, so they work offline), a new icon set, light and dark themes.
- Mobile: expandable transaction rows grouped by day, a profile menu on the avatar (theme, settings, sync, sign out), bottom-sheet dialogs.

**Reliability**
- Every page and every add / edit / delete works offline and syncs later; the whole app is cached on first visit.
- Double-tapping save no longer records a transaction twice.
- Many fixes: offline dashboard loading, recent transactions order, net-worth figures, and more.

**Setup**
- One database file (`supabase/schema/schema.sql`) that sets up a new project or upgrades an old one, and can be run again safely. It turns on Row Level Security for every table and applies the sign-in allowlist.
- The logo is now bundled with the app.
- New offline end-to-end test: `npm run test:offline`.
- Licensed under the PolyForm Noncommercial License 1.0.0 (free for non-commercial use, credit required).

### V2.1.5 (16/04/2026)
- First public Version released
- With the public version PWA install was fixed
- And starting from top of the page when switching was added
