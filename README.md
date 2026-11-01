# Nails by Leah — Frontend

React 19 + Vite + React Router. The numbered requirements are in [inputs/](inputs/README.md).

`npm run dev` talks to the **C# API** (`backend/`). `npm run dev:mock` runs on an **in-browser mock backend**
instead, with no API or database needed; everything mocked lives in [`src/mock/`](src/mock/README.md).

## Run with the real backend

1. Start the API first (see `backend/README.md`), from the repository root:

   ```bash
   dotnet run --project backend/NailsByLeah.Api.csproj --launch-profile https
   ```

2. Then the frontend:

   ```bash
   npm install
   ```

   ```bash
   npm run dev
   ```

Open http://localhost:5173. The Vite dev server forwards every `/api/...` request to https://localhost:7199,
so the browser only ever talks to one origin and the session cookie just works (no CORS setup needed).

- **Administrator login:** the account set with `dotnet user-secrets set "AdminSeed:…"` (see `backend/README.md`).
- **Emails in development:** verification codes and reset links are printed in the **API's console** (look for `DEV EMAIL`)
  until SMTP is configured.

## Run with mock data

```bash
npm run dev:mock
```

Demo accounts are listed on the Login page, and emails appear in the **Mock inbox** button, bottom right.

| Command | What it does |
|---|---|
| `npm run dev` | Development server connected to the C# API |
| `npm run dev:mock` | Development server with the in-browser mock backend |
| `npm test` | Runs all tests once (Vitest + Testing Library) |
| `npm run test:watch` | Tests in watch mode |
| `npm run build` | Production build into `dist/` |
| `npm run lint` | Lints with oxlint |

## Configuration (`.env`, `.env.local`)

| Variable | Default | Purpose |
|---|---|---|
| `VITE_USE_MOCK_API` | `false` | `true` uses the in-browser mock in `src/mock` (set by `npm run dev:mock`) |
| `VITE_API_BASE_URL` | `/api` | API base URL; the dev server proxies `/api` to https://localhost:7199 |
| `VITE_MOCK_LATENCY_MS` | `400` | Simulated network delay for the mock |
| `VITE_GOOGLE_MAPS_API_KEY` | (empty) | Optional Maps Embed key; without it the keyless embed is used |
| `VITE_SESSION_IDLE_MINUTES` | `30` | Automatic logout after inactivity |

Put keys in `.env.local` (git-ignored). See `.env.example`.

## Layout

| Folder | Contents |
|---|---|
| `src/pages/auth` | Login, registration, email verification, forgot/reset password |
| `src/pages/client` | Home (price list, map), booking wizard, my bookings |
| `src/pages/admin` | Dashboard, bookings, services, schedule, reports, activity log |
| `src/components` | Form fields (name counter, digits-only phone, protected password), dialogs, slot picker, payment panel, receipt |
| `src/auth` | Session context, 30-minute idle logout, role-based route guards |
| `src/api` | One `api` object for every endpoint; real (`http.js`) or mock transport |
| `src/validation/rules.js` | Every form rule in one place, with the same limits and messages as the backend |
| `src/mock` | Mock data and mock backend |
| `src/test` | Tests |

## Requirement coverage

| Doc | Where |
|---|---|
| 1. Login & registration | `pages/auth/*`, `components/FormFields.jsx` |
| 2. Client pages | `pages/client/HomePage.jsx`, `BookPage.jsx`, `MyBookingsPage.jsx`, `components/SlotPicker.jsx` |
| 3. Booking & payment | `pages/client/BookPage.jsx`, `components/PaymentPanel.jsx`, `components/Receipt.jsx` |
| 4. Admin pages | `pages/admin/*` |
| 5. Routing, session, security | `auth/*`, `main.jsx` (HTTPS redirect), `config.js`, `validation/rules.js` |
| 6. UX & responsive | `styles/app.css` (mobile-first; tables become cards under 760px), loading and error states on every page |
| 7. Testing | `src/test/*`: 7.1–7.11 are automated. 7.12 (Chrome, Firefox, phone) and 7.13 (UAT) are manual. |

## Placeholders to replace

- Salon address and map pin: `src/mock/data/salon.js`
- Terms & Conditions and Privacy Policy text: `src/mock/data/legal.js`
- "Note for Leah" options: `src/mock/data/lookups.js` and `backend/Domain/Labels.cs`
