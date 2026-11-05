# Go-live plan: Supabase Postgres, email, hosting, payments (PayMongo, or HitPay as the fallback)

Saved 2026-11-03. Nothing below is implemented yet. It lists what must change so the four services work together.

## Target setup

```
Clients' browsers
      │  https://yourdomain
      ▼
Hosting: ONE .NET service (API + the React website served together)
      ├──► Supabase Postgres   (data, through the "session pooler")
      ├──► Supabase Storage    (clients' design photos)
      ├──► Brevo email API     (sent as the salon's Gmail address)
      └──◄► PayMongo or HitPay (GCash/Maya hosted checkout + payment webhook)
```

## What must change

1. **Database: SQL Server → Postgres (biggest job).**
   - ~25 check constraints in `backend/Data/EntityConfigurations.cs` use SQL Server syntax (`[col]`, `LEN`, `ISJSON`) → Postgres syntax (`"col"`, `char_length`, `jsonb`).
   - Filtered unique index on bookings (`HasFilter`) → Postgres syntax.
   - `sp_getapplock` in `backend/Data/Repositories.cs` → `pg_advisory_xact_lock`.
   - `SqlException` error numbers in `backend/Data/UnitOfWork.cs` → `PostgresException` codes (23505 unique, 40P01 deadlock).
   - `IsRowVersion()` → Postgres `xmin` concurrency token.
   - `UseSqlServer` → `UseNpgsql` (`backend/Infrastructure/ServiceRegistration.cs`).
   - Replace the 7 SQL Server migrations with one fresh Postgres migration (local data is test data only).
   - Tests (`tests/.../ApiFactory.cs`) use LocalDB → need a Postgres test database.
   - Backup scripts in `backend/database/` use `sqlcmd` → rewrite with `pg_dump`.
   - Connect with Supabase's **session pooler** (IPv4). The direct connection is IPv6-only on the free plan.

2. **Email: SMTP is blocked on cheap hosting.** ✅ **Done 2026-11-03.** `BrevoEmailSender` sends through Brevo's HTTPS API (free 300/day). Sender: `nailsbyleyah.bookings@gmail.com` (verified in Brevo). Verification and password-reset emails tested and delivered. Salon alerts (new booking, client cancellation, client reschedule) go to `Notifications:SalonEmail`, tested and delivered. On the host, set `Brevo__ApiKey`, `Email__FromAddress` and `Notifications__SalonEmail`. Later: add the salon's own domain in Brevo so emails stop landing in spam.

3. **Design photos.** ✅ Saved to a private Supabase Storage bucket when `Supabase__Url` and `Supabase__SecretKey` are set (`Infrastructure/SupabaseReferenceImageStore.cs`), and shrunk in the browser first. The free plan has 1 GB. Still to decide: how long to keep photos after the appointment. Create a separate `reference-images` bucket and key for the live project.

4. **Login sessions and HTTPS behind a proxy.**
   - ✅ Data Protection keys are in the database (`data_protection_keys`), so restarts don't log everyone out.
   - Add forwarded-headers handling so HTTPS redirect and secure cookies work behind the host's proxy.

5. **One address for website and API.** The session cookie is `SameSite=Strict` and there is no CORS → serve the React build from the .NET service (one deployment, one domain).

6. **PayMongo: different flow from today's one-step simulated charge.**
   - Create a Checkout Session → client pays on PayMongo's page (GCash/Maya) → webhook `checkout_session.payment.paid` confirms.
   - Needs an "awaiting payment" booking state that holds the slot ~15 minutes, a webhook endpoint that verifies PayMongo's signature, and a return page.
   - The webhook needs a public HTTPS address → after hosting.

## Readiness check (2026-11-05)

Status of how the parts fit together. Nothing here has run on Postgres, Render or a real payment provider yet.

**Ready to carry over unchanged:** rate limits, email queue, legal text, the website and its security rule, client data erasure, forwarded headers, and the tests (they only talk to the API).

**Database, beyond the list above:**
- **Case sensitivity (not obvious, and silent).** SQL Server compares text ignoring case here; Postgres does not. Usernames are stored as typed, so "Kyla" could not log in as "kyla", "Kyla" and "kyla" could both register, and the admin's client search would miss names. Fix with a case-insensitive collation or `citext` on username, plus `ILike` in search, with tests.
- Duplicate detection reads the index name from the SQL Server error text (`Data/UnitOfWork.cs`). On Postgres use `PostgresException.ConstraintName`; the exact names must survive, or duplicate bookings return an error instead of "slot taken".
- Dates are stored from `UtcNow`, which Npgsql requires. Run the full test suite to confirm nothing passes a non-UTC value.
- Add connection retries (a remote database drops connections), used through EF's execution strategy because the code opens its own transactions.
- Lock the tables from Supabase's public Data API (Row Level Security on, no policies, or the API off). Real data must not go in before this.
- Set `Database__ApplyMigrationsOnStartup` deliberately on the host; it is off outside Development, and sign-in fails until the migrations (login keys table) are applied.

**Hosting:**
- The test deployment depends on Postgres: there is no database to run against on Render until then.
- Render must get `Frontend__BaseUrl`, `AllowedHosts`, `ForwardedHeaders__Enabled`, `Brevo__ApiKey`, `Email__FromAddress`, `Notifications__SalonEmail`, the connection string and `AdminSeed__*`, plus the port the Dockerfile listens on.
- Check on the live site: `ForwardLimit` (see backend README), Render's health check against `AllowedHosts`, and the `Asia/Manila` time zone in the Docker image.
- A sleeping free service delays webhooks. PayMongo retries failed deliveries; confirm the same for HitPay, and keep the keep-awake ping.

## Payments: keep PayMongo and HitPay swappable

Both use the same shape, so one design covers both, with the provider chosen by a setting (`Payments:Provider`):
create a hosted checkout → redirect the client → the provider calls a webhook signed with HMAC → the booking is marked paid.

| | PayMongo | HitPay |
|---|---|---|
| Create | Checkout Session | `POST /v1/payment-requests`, returns a checkout URL |
| Webhook event | `checkout_session.payment.paid` | `payment_request.completed` (endpoint registered in the dashboard) |
| Signature | `Paymongo-Signature`, timestamp + signature, per-endpoint secret | `Hitpay-Signature`, HMAC-SHA256 of the raw JSON body with the endpoint's salt |
| Test mode | Separate test endpoint and signature | Sandbox |

To confirm when signing up: fees, approval needs and the current API version for each provider, and that GCash and Maya are both enabled on the account.

What must change, whichever provider wins. **Today's `IPaymentGateway.ChargeAsync` can't do this:** it expects an instant yes or no inside the booking transaction.
1. Gateway interface: `CreateCheckoutAsync` (returns the checkout URL and provider reference) and `ParseWebhook` (verifies the signature against the raw body, returns who paid and how much). A fake gateway implements it for tests.
2. New booking state `AwaitingPayment`: holds the slot (the unique slot index must include it), and is released after about 15 minutes by a background job. Pending still means "paid, waiting for Leyah".
3. Booking creation commits the booking first, then calls the provider outside the transaction and the day lock.
4. Webhook endpoint: anonymous, signature required, safe to receive twice, checks the amount against the stored price, and handles a payment arriving after the hold expired.
5. Website: redirect to checkout, a return page that shows "confirming payment" until the webhook lands, and cancel handling. Remove the GCash/Maya choice if the hosted page offers it.
6. Refunds stay manual in the provider's dashboard until Leyah answers the refund questions in `frontend/src/content/legal.js`.

## Free-plan limits
- **Supabase free:** pauses after 1 week of inactivity; no automatic backups (take your own).
- **Render free:** sleeps when idle → slow first visit; 24-hour reminder emails won't run on time.
- Use free plans for testing; move hosting to the cheapest paid plan before real clients book.

## Order
1. Port the database code to Postgres; test against a Supabase dev project.
2. Email API, photos in Supabase Storage, persisted login keys, forwarded headers, serve the website from the API.
3. Deploy a test version; set the host's settings (database, email key, storage key, website address `Frontend__BaseUrl`, `AllowedHosts`, `ForwardedHeaders__Enabled=true`, `Supabase__Url`, `Supabase__SecretKey`, admin account). The app refuses to start without them. After deploying, check the visitor address in the Activity log (backend README, Security): Render doesn't document `X-Forwarded-For`, so `ForwardLimit` must be confirmed on the live site.
4. Build the provider-neutral payment flow against a fake gateway, then connect PayMongo in test mode. If PayMongo doesn't approve the business, connect HitPay instead: only the gateway class and settings differ.
5. Go live: live keys (after business verification), domain, add the domain in Brevo.

Apply for business verification early: it takes the longest. If PayMongo stalls, apply to HitPay in parallel.

## Sources
- [Render: free services block SMTP](https://render.com/changelog/free-web-services-will-no-longer-allow-outbound-traffic-to-smtp-ports)
- [Railway: outbound SMTP on the Hobby plan](https://station.railway.com/questions/outbound-smtp-blocked-on-my-deployment-732c27ed)
- [Supabase: connecting to Postgres](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Supabase: free project pausing](https://supabase.com/docs/guides/platform/free-project-pausing)
- [Supabase pricing](https://supabase.com/pricing)
- [PayMongo Hosted Checkout](https://developers.paymongo.com/docs/payment-channels-hosted-checkout)
- [PayMongo Checkout API](https://developers.paymongo.com/docs/checkout-api)
- [PayMongo webhooks](https://developers.paymongo.com/docs/webhooks)
- [PayMongo Hosted Checkout quick start](https://developers.paymongo.com/docs/payment-channels-hosted-checkout-quick-start)
- [HitPay payment integration](https://docs.hitpayapp.com/docs/payment-integration)
- [HitPay events and webhooks](https://docs.hitpayapp.com/apis/guide/events)
