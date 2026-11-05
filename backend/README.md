# Nails by Leyah — Backend API

ASP.NET Core Web API (.NET 10, C#) with SQL Server and EF Core. Built for Visual Studio 2026.
The numbered requirements it implements are in [inputs/](inputs/README.md).

## Prerequisites

- .NET 10 SDK (included with Visual Studio 2026)
- SQL Server LocalDB (installed with Visual Studio's "Data storage and processing" workload) or any SQL Server
- `sqlcmd`, only for the backup scripts

## First-time setup

From the repository root:

```bash
dotnet tool restore
```

```bash
dotnet dev-certs https --trust
```

Create the first administrator account. These values are secrets, so they go in user secrets, never in `appsettings.json` (Ref 14.3):

```bash
cd backend
dotnet user-secrets set "AdminSeed:Username" "leah"
dotnet user-secrets set "AdminSeed:Email" "leah@example.com"
dotnet user-secrets set "AdminSeed:PhoneNumber" "09170000000"
dotnet user-secrets set "AdminSeed:Password" "<choose a password: 8+ characters, a letter and a number>"
```

## Run

In Visual Studio, open `NailsByLeah.slnx`, select the **https** profile and press F5. Or from the repository root:

```bash
dotnet run --project backend/NailsByLeah.Api.csproj --launch-profile https
```

- API: https://localhost:7199 (plain http://localhost:5075 redirects to HTTPS)
- OpenAPI document (Development only): https://localhost:7199/openapi/v1.json
- In Development the database is created and migrated automatically, and the price list is seeded.
- The React dev server (`frontend`, `npm run dev`) proxies `/api` to the HTTPS port.

### Development stand-ins

| Concern | Development | Before going live |
|---|---|---|
| Email | Logged to the console (look for `DEV EMAIL`), including verification codes and reset links. Only possible in Development | Set `Brevo:ApiKey` and `Email:FromAddress` (a sender verified in Brevo). Brevo's HTTPS API works on hosts that block SMTP ports. `Smtp:Host`, `Smtp:Username`, `Smtp:Password` (e.g. Gmail with an app password) also work where SMTP is allowed |
| Payments | `SimulatedPaymentGateway` approves every GCash/Maya charge without moving money | Implement `IPaymentGateway` for a real provider and register it in `Infrastructure/ServiceRegistration.cs` |

Outside Development the app refuses to start while either stand-in is still in use, or while `AllowedHosts` is not set to the site's real address.

## Test

```bash
dotnet test NailsByLeah.slnx
```

Integration tests create a temporary LocalDB database per test class and drop it afterwards. See [TESTING.md](TESTING.md).

## Configuration

All settings are in `appsettings.json`. Override any of them with user secrets or environment variables (for example `ConnectionStrings__Default`).

| Section | Purpose |
|---|---|
| `AllowedHosts` | Addresses the API answers to, separated by `;`. This computer's addresses by default; set the real address on the host (for example `AllowedHosts=nailsbyleyah.onrender.com`). Other addresses get 400 |
| `ConnectionStrings:Default` | SQL Server connection (LocalDB by default) |
| `Auth` | Lockout (5 attempts / 15 min), idle session timeout (30 min), reset link lifetime (15 min), bcrypt cost |
| `Booking` | Deposit (PHP 150), minimum notice for rescheduling (24 h) |
| `Schedule` | Time zone (Asia/Manila), the 11:00 AM opening time, the 30-minute start-time grid, the 30-minute break after every appointment, the booking window (30 days ahead), closed weekdays. The closing time (default 9:00 PM) is set by administrators on the Schedule page and stored in `salon_settings` |
| `Legal:TermsVersion` | Terms & Conditions version recorded at registration (currently 2.1; the text is in `frontend/src/content/legal.js`) |
| `Email` | Sender address and name shown on every email |
| `Brevo`, `Smtp` | Email delivery: Brevo's API when `Brevo:ApiKey` is set, otherwise SMTP when `Smtp:Host` is set, otherwise the console |
| `Notifications` | The 24-hour reminder job, and `SalonEmail`: where the salon's alerts go (new booking to confirm, client cancellation, client reschedule). Empty sends no alerts |
| `AdminSeed` | First administrator (user secrets only) |
| `RateLimits` | How many requests one visitor or client may make per time window (see [Security](#security)). `Enabled: false` only in tests |

## Project layout

Controller → Service → Repository (Ref 14.1):

| Folder | Contents |
|---|---|
| `Controllers/` | HTTP endpoints. Client-only, admin-only and public endpoints are separated by role. |
| `Services/` | Business logic: `AuthService`, `RegistrationService`, `PasswordResetService`, `BookingService`, `PaymentService`, `PriceService`, `ScheduleService`, admin reports |
| `Data/` | `AppDbContext`, entity configuration (constraints, indexes), repositories, unit of work, migrations |
| `Domain/` | Entities, the `Service` hierarchy (SoftGel, Removal, Stone) and the `IAuthenticatable` / `IPayable` / `ICancellable` interfaces |
| `Validation/` | Shared validation rules and request validators (Ref 14.2) |
| `Notifications/`, `Payments/` | Email and payment abstractions and their implementations |
| `Infrastructure/` | Dependency injection, authentication, startup tasks, clock, audit logger |
| `database/` | ERD, backup, scheduled backup and restore-test scripts |

## API overview

| Area | Endpoints |
|---|---|
| Public | `GET /api/services`, `POST /api/pricing/quote`, `GET /api/slots?date=`, `GET /api/lookups` |
| Account | `POST /api/auth/register`, `GET /api/auth/username-availability`, `POST /api/auth/verify-email`, `POST /api/auth/resend-verification`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/forgot-password`, `POST /api/auth/reset-password/validate`, `POST /api/auth/reset-password` |
| Client | `POST /api/bookings` (book and pay), `GET /api/bookings`, `GET /api/bookings/{id}`, `GET /api/bookings/{id}/receipt`, `POST /api/bookings/{id}/reschedule`, `POST /api/bookings/{id}/cancel` |
| Administrator | `GET /api/admin/dashboard`, `GET /api/admin/bookings`, `POST /api/admin/bookings/{id}/confirm`, `…/complete`, `…/reschedule`, `…/cancel`, `/api/admin/services`, `/api/admin/addons`, `/api/admin/blocked-slots`, `/api/admin/reports/daily`, `/api/admin/reports/monthly`, `/api/admin/activity-logs` |

Errors are returned as RFC 7807 ProblemDetails with a `code` field (for example `slot_unavailable`, `account_locked`, `token_expired`, `rate_limited`) and, for validation errors, an `errors` object keyed by camelCase field name.

## Security

### Rate limits

Set in `RateLimits` (`Infrastructure/RateLimiting.cs`). A refused request gets **429** with a `Retry-After` header and
"Too many attempts. Please wait up to N minutes and try again." The limiter reports its whole window, so that is the
longest anyone waits.

| Policy | Default | Counted per | Endpoints |
|---|---|---|---|
| Overall | 300 / minute | visitor (IP address) | every request |
| Login | 10 / 5 minutes | visitor | `POST /api/auth/login` |
| Email | 5 / 15 minutes, shared | visitor | register, resend verification, forgot password |
| Code | 10 / 15 minutes | visitor | verify email, reset link check, reset password |
| Booking | 10 / 10 minutes | client account | book, reschedule, cancel |
| Upload | 20 / 10 minutes | client account | design photos |
| Feedback | 5 / 10 minutes | client account | feedback |

Behind a hosting proxy the visitor's real address needs the forwarded-headers setting (go-live plan); until then every
visitor shares one allowance there.

### Not revealing who has an account

- "Forgot password" and "resend code" return the same answer for registered and unknown emails. Their emails are sent
  from a background queue (`Notifications/BackgroundNotifications.cs`) after the answer, so both cases are equally fast
  and a failed email is logged instead of becoming an error only real accounts would see.
- Login checks unknown usernames against a dummy hash with the same bcrypt cost, so they take as long as real ones.
- Sign-up must still say when an email or username is taken; the Email rate limit keeps that slow to abuse.

### Logs

Hosts keep logs, so they must not hold personal data:

- Log messages name bookings, images and pages by ID or path only; never emails, phone numbers, passwords or tokens.
- Password reset links put the token after `#` (`/reset-password#token=…`), which browsers never send to a server, and
  the page checks it with `POST /api/auth/reset-password/validate`. Old `?token=` links still work.
- Brevo error text has email addresses replaced with `[email]`.
- EF Core's own save-error log (`Microsoft.EntityFrameworkCore.Update`) is off: it can repeat a duplicate value such as
  an email. The API turns duplicates into 409 answers and logs unexpected errors itself.

## Database backups (Ref 13.7)

```bash
powershell -File backend/database/backup-database.ps1
```

```bash
powershell -File backend/database/test-restore.ps1
```

```bash
powershell -File backend/database/register-daily-backup.ps1 -At 02:00
```

The last command registers a daily Windows Scheduled Task. Backups go to `%USERPROFILE%\NailsByLeahBackups` and are kept for 14 days.

## Assumptions to confirm

1. **Stone add-ons are priced per nail**, up to 10 nails per add-on. Confirm against Kyla's official price list.
2. **Appointment times:** appointments start every 30 minutes from 11:00 AM and must finish by the closing time (default 9:00 PM, changed by administrators). Each booking lasts as long as its service (set per service on the admin Services page; the seeded lengths are estimates), and the next appointment can start 30 minutes after the previous one ends. Bookings for the same day are serialized with a per-day application lock (`sp_getapplock`) inside the booking transaction, then checked for overlaps. Bookable up to 30 days ahead.
3. **The deposit counts toward the total**, so the balance due at the salon is the total minus PHP 150.
4. **"Note for Leyah" options** are placeholders until the final list is confirmed. They are in `Domain/Enums.cs` and `Domain/Labels.cs`.
5. **Payments complete in one step.** Real GCash/Maya checkouts usually redirect the client and confirm by webhook, so the real gateway will need a pending → confirmed step.
