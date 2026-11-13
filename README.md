# NailsByLeah

Nail salon booking and management system.

- `backend/` — C# ASP.NET Core Web API (.NET 10) with PostgreSQL (Supabase). Setup, configuration and API reference: [backend/README.md](backend/README.md)
- `tests/` — backend unit and integration tests ([backend/TESTING.md](backend/TESTING.md))
- `frontend/` — React (Vite). [frontend/README.md](frontend/README.md)
- `docs/` — the plan for going live (Supabase Postgres, hosting, PayMongo): [docs/GO-LIVE-PLAN.md](docs/GO-LIVE-PLAN.md)

## Run (frontend connected to the backend)

First-time setup (development certificate, local tools, administrator account) is in [backend/README.md](backend/README.md).

1. Backend (https://localhost:7199):

   ```bash
   dotnet run --project backend/NailsByLeah.Api.csproj --launch-profile https
   ```

2. Frontend (http://localhost:5173), in a second terminal:

   ```bash
   cd frontend
   npm run dev
   ```

Open http://localhost:5173. The Vite dev server proxies `/api/*` to the backend, so the app and the API
share one origin and the login cookie works without CORS.

## Test

```bash
dotnet test NailsByLeah.slnx
```

```bash
cd frontend
npm test
```

The backend tests run against the Postgres test database in user secrets (`ConnectionStrings:Tests`, or else
`ConnectionStrings:Default`). Each test class gets its own temporary schema there, dropped when it finishes.

## Security at a glance

- Passwords hashed with bcrypt; accounts lock for 15 minutes after 5 wrong passwords; sessions end after 30 idle minutes.
- Rate limits on sign-in, sign-up, password reset, code checks, bookings, uploads and feedback (`RateLimits` in `backend/appsettings.json`).
- "Forgot password" and "resend code" answer identically, and equally fast, for registered and unknown emails.
- Logs hold no client emails, phone numbers, passwords or reset links; reset links carry the token after `#`, which never reaches a server.
- Leyah can erase a client's personal data on request (**Client data** in the admin menu); sales records stay correct.
- Details: [backend/README.md](backend/README.md#security).
