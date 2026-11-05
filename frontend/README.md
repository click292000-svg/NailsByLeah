# Nails by Leyah — Frontend

React 19 + Vite + React Router. The numbered requirements are in [inputs/](inputs/README.md).

The website always talks to the **C# API** (`backend/`), so start the API first (in Visual Studio, https profile).

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
  until Brevo is configured (`Brevo:ApiKey`, see `backend/README.md`).
- **"Too many attempts":** the API limits repeated sign-ins, sign-ups, password resets and bookings. While testing, restart
  the API to clear the limits.

| Command | What it does |
|---|---|
| `npm run dev` | Development server connected to the C# API |
| `npm test` | Runs all tests once (Vitest + Testing Library) |
| `npm run test:watch` | Tests in watch mode |
| `npm run build` | Production build into `dist/` |
| `npm run lint` | Lints with oxlint |

## Configuration (`.env`, `.env.local`)

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_BASE_URL` | `/api` | API base URL; the dev server proxies `/api` to https://localhost:7199 |
| `VITE_GOOGLE_MAPS_API_KEY` | (empty) | Optional Maps Embed key; without it the keyless embed is used |
| `VITE_SESSION_IDLE_MINUTES` | `30` | Automatic logout after inactivity |

Put keys in `.env.local` (git-ignored). See `.env.example`.

## Layout

| Folder | Contents |
|---|---|
| `src/pages/auth` | Login, registration, email verification, forgot/reset password |
| `src/pages/client` | Home (price list, map), booking wizard, my bookings |
| `src/pages/admin` | Dashboard, bookings, services, schedule, reports, feedback, activity log, client data (delete on request) |
| `src/components` | Form fields (name counter, digits-only phone, protected password), dialogs, slot picker, payment panel, receipt |
| `src/auth` | Session context, 30-minute idle logout, role-based route guards |
| `src/api` | One `api` object for every endpoint, sent to the C# API (`http.js`) |
| `src/validation/rules.js` | Every form rule in one place, with the same limits and messages as the backend |
| `src/content` | Salon details (name, address, map, social links), opening rules and the Terms & Privacy text |
| `src/test` | Tests. They run against `src/test/mockBackend`, a test-only copy of the API rules, so `npm test` needs no server or database; it is not part of the website |

## Design system

All shared styles are in `src/styles/app.css`; the animated home page adds `src/styles/home.css`. Both use the
tokens at the top of `app.css`, so change a colour or size there rather than in individual rules.

| Token | Value | Used for |
|---|---|---|
| `--cream` | #FFF8F4 Cream White | Page background |
| `--blush` / `--rose-100` | #F0D5DC Blush Pink | Active nav, selected states, info banners |
| `--dusty-rose` / `--rose-500` | #C98497 Dusty Rose | Hover borders, focus ring, accents |
| `--burgundy` / `--rose-700` | #682C43 Burgundy | Headings, prices, hover on primary buttons |
| `--rose-600` | #8E3A57 | Primary buttons and links (between Dusty Rose and Burgundy, for readable white text) |
| `--ink` | #30252A Charcoal | Body text |
| `--control-h` / `--control-h-sm` | 40px / 32px | Height of inputs and buttons, so they line up in a row |

Conventions:

- **Forms:** related fields go in `.grid-2` (two columns from 760px, one column on phones). Admin lists (Services, Activity log) share a column template so their columns line up, with the add form in a dashed `.catalog-add` box.
- **Buttons:** `.btn-primary` for the main action, `.btn-secondary` for the alternative, `.btn-ghost` / `.btn-danger-ghost` for row actions. Full-width (`.btn-block`) only inside narrow cards such as login.
- **Tables:** `.data-table` turns into labelled cards below 760px (each cell needs `data-label`).
- **Motion:** buttons lift slightly on hover, dialogs fade and rise in, booking steps slide in. Everything respects `prefers-reduced-motion`.
- **Focus:** keyboard focus always shows the Dusty Rose ring (`--focus`), including on buttons with shadows.

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

- Salon phone number: `src/content/salon.js` (the address, map pin and opening hours are real; the website reads the hours from `GET /api/salon-hours`)
- "Note for Leyah" quick suggestions: `backend/Domain/Labels.cs` (the website reads them from `GET /api/lookups`)

## Terms & Privacy Policy

The text is in `src/content/legal.js` (version 2.2), written from how the system works and Leyah's salon rules. When a
rule changes, update the text and raise the version there and in `Legal:TermsVersion` (`backend/appsettings.json`), so
new sign-ups record the version they accepted. Still to confirm with Leyah (marked in the file): refunds of cancelled
full payments, bookings the salon cancels, and the amounts of the late-cancellation, no-show and late-payment fees.
Have both texts reviewed before going live.
