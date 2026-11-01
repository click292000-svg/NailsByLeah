# Mock backend

`npm run dev:mock` runs the frontend against this **in-browser mock** of the C# API, so it works without
the API or a database. (`npm run dev` uses the real API.) Everything mocked lives in this folder, so it's
easy to track and later delete.

| File | What it holds | Backend table / source |
|---|---|---|
| `data/users.js` | Demo accounts (1 admin, 4 clients, 1 unverified) | `users` |
| `data/services.js` | Approved price list: Soft Gel, Removal, Stone add-ons | `services`, `addons` |
| `data/bookings.js` | Past, today's and upcoming bookings, add-on lines, payments, cancellations | `bookings`, `booking_addons`, `payments`, `cancellations` |
| `data/schedule.js` | Blocked day off and blocked slot | `blocked_slots` |
| `data/tokens.js` | Ready-made expired and used password reset links | `user_tokens` |
| `data/auditLogs.js` | Activity log entries | `audit_logs` |
| `data/lookups.js` | Dropdown options (notes, cancellation reasons, payment methods) | `GET /api/lookups` |
| `data/salon.js` | **Placeholder** address and map pin, opening hours, policies | backend `appsettings.json` |
| `data/legal.js` | **Placeholder** Terms & Conditions and Privacy Policy | — |
| `db.js` | In-memory database seeded from `data/`, saved to `localStorage` | — |
| `mockApi.js` | Every API endpoint, with the backend's rules and error codes | `backend/Controllers` |
| `MockInbox.jsx` | Floating panel showing the emails the backend would send, plus demo tools | SMTP |

## How it works

- `src/api/index.js` sends every request to `mockRequest()` (this folder) or `httpRequest()` (the real API).
  Both take the same paths and return the same JSON shapes, so pages don't know which one they use.
- Changes (new bookings, cancellations, price edits) persist in `localStorage` under `nailsbyleah.mockdb.v1`.
  Use **Mock inbox → Reset demo data** to start over.
- Emails (verification codes, reset links, confirmations) appear in the **Mock inbox** panel, bottom right.
- Seed dates are relative to the day the data was first loaded. Reset the demo data to bring them up to date.
- Demo logins are listed on the Login page. Passwords are kept in plain text here only; the real backend hashes them.

## Mock or real backend

- `npm run dev` — real C# API (start it first, see `backend/README.md`); the Vite dev server proxies `/api` to it.
- `npm run dev:mock` — this mock (`.env.mock` sets `VITE_USE_MOCK_API=true`).
- Tests always use the mock.

When the mock is no longer needed, delete this folder, `.env.mock`, the `dev:mock` script, and the `MockInbox`
import in `src/App.jsx`.
