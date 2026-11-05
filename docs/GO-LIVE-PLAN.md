# Go-live plan: Supabase Postgres, email, hosting, PayMongo

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
      └──◄► PayMongo           (GCash/Maya checkout + payment webhook)
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

3. **Design photos: stored on the server disk** (`backend/Infrastructure/ReferenceImageStore.cs`). Hosts wipe the disk on deploy/restart → move to Supabase Storage (private bucket).

4. **Login sessions and HTTPS behind a proxy.**
   - Persist ASP.NET Data Protection keys in the database, or everyone is logged out on each restart.
   - Add forwarded-headers handling so HTTPS redirect and secure cookies work behind the host's proxy.

5. **One address for website and API.** The session cookie is `SameSite=Strict` and there is no CORS → serve the React build from the .NET service (one deployment, one domain).

6. **PayMongo: different flow from today's one-step simulated charge.**
   - Create a Checkout Session → client pays on PayMongo's page (GCash/Maya) → webhook `checkout_session.payment.paid` confirms.
   - Needs an "awaiting payment" booking state that holds the slot ~15 minutes, a webhook endpoint that verifies PayMongo's signature, and a return page.
   - The webhook needs a public HTTPS address → after hosting.

## Free-plan limits
- **Supabase free:** pauses after 1 week of inactivity; no automatic backups (take your own).
- **Render free:** sleeps when idle → slow first visit; 24-hour reminder emails won't run on time.
- Use free plans for testing; move hosting to the cheapest paid plan before real clients book.

## Order
1. Port the database code to Postgres; test against a Supabase dev project.
2. Email API, photos in Supabase Storage, persisted login keys, forwarded headers, serve the website from the API.
3. Deploy a test version; set the host's settings (database, email key, storage key, website address `Frontend__BaseUrl`, `AllowedHosts`, admin account). The app refuses to start without a real `AllowedHosts` and `Frontend__BaseUrl`.
4. PayMongo in test mode; connect the webhook to the hosted address.
5. Go live: PayMongo live keys (after business verification), domain, add the domain in Brevo.

Apply for PayMongo business verification early: it takes the longest.

## Sources
- [Render: free services block SMTP](https://render.com/changelog/free-web-services-will-no-longer-allow-outbound-traffic-to-smtp-ports)
- [Railway: outbound SMTP on the Hobby plan](https://station.railway.com/questions/outbound-smtp-blocked-on-my-deployment-732c27ed)
- [Supabase: connecting to Postgres](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Supabase: free project pausing](https://supabase.com/docs/guides/platform/free-project-pausing)
- [Supabase pricing](https://supabase.com/pricing)
- [PayMongo Hosted Checkout](https://developers.paymongo.com/docs/payment-channels-hosted-checkout)
- [PayMongo Checkout API](https://developers.paymongo.com/docs/checkout-api)
- [PayMongo webhooks](https://developers.paymongo.com/docs/webhooks)
