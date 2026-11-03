# NailsByLeah

Nail salon booking and management system.

- `backend/` — C# ASP.NET Core Web API (.NET 10) with SQL Server. Setup, configuration and API reference: [backend/README.md](backend/README.md)
- `tests/` — backend unit and integration tests ([backend/TESTING.md](backend/TESTING.md))
- `frontend/` — React (Vite). [frontend/README.md](frontend/README.md)

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
