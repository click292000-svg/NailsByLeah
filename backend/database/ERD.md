# Entity-Relationship Diagram (Ref 13.1)

The schema is created by the EF Core migration in `Data/Migrations`. Table and column names are snake_case.

```mermaid
erDiagram
    users ||--o{ bookings : "books (client_id)"
    users ||--o{ cancellations : "cancels (cancelled_by_user_id)"
    users ||--o{ audit_logs : "performs (user_id)"
    users ||--o{ blocked_slots : "blocks (created_by_user_id)"
    users ||--o{ user_tokens : "owns"
    services ||--o{ bookings : "booked as (service_id)"
    bookings ||--o{ booking_addons : "has"
    addons ||--o{ booking_addons : "selected as (add_on_id)"
    bookings ||--o{ payments : "paid by"
    bookings ||--o| cancellations : "cancelled by"

    users {
        int id PK
        nvarchar first_name "1-75 chars (CHECK)"
        nvarchar last_name "1-75 chars (CHECK)"
        nvarchar username UK
        nvarchar email UK
        nvarchar phone_number UK "digits only (CHECK)"
        nvarchar password_hash "bcrypt"
        nvarchar role "Client | Administrator"
        bit email_verified
        nvarchar terms_version
        datetime2 terms_accepted_at
        int failed_login_count
        datetime2 lockout_end_utc
        nvarchar security_stamp
        bit is_deleted
    }
    services {
        int id PK
        nvarchar category "SoftGel | Removal"
        nvarchar name
        decimal price "CHECK >= 0"
        bit is_active
        bit is_deleted
    }
    addons {
        int id PK
        nvarchar name UK
        decimal price "per nail, CHECK >= 0"
        bit is_active
        bit is_deleted
    }
    bookings {
        int id PK
        int client_id FK
        int service_id FK
        decimal service_price "price at booking time"
        decimal deposit_amount
        date booking_date "indexed"
        time start_time
        nvarchar note_for_leah
        nvarchar status "indexed"
        datetime2 reminder_sent_at
        bit is_deleted
        rowversion row_version
    }
    booking_addons {
        int id PK
        int booking_id FK
        int add_on_id FK
        int nail_count "1-10 (CHECK)"
        decimal line_price "price at booking time"
    }
    payments {
        int id PK
        int booking_id FK
        nvarchar method "GCash | Maya"
        decimal amount "CHECK > 0"
        nvarchar reference_number UK
        uniqueidentifier idempotency_key UK
        nvarchar status
        datetime2 paid_at
    }
    cancellations {
        int id PK
        int booking_id FK "UNIQUE"
        int cancelled_by_user_id FK
        nvarchar reason
        nvarchar explanation "optional"
        datetime2 cancelled_at
    }
    audit_logs {
        int id PK
        int user_id FK
        nvarchar action
        nvarchar entity_type
        nvarchar entity_id
        nvarchar details
        nvarchar ip_address
        datetime2 created_at
    }
    blocked_slots {
        int id PK
        date date
        time start_time "NULL = whole day"
        nvarchar reason
        int created_by_user_id FK
        bit is_deleted
    }
    user_tokens {
        int id PK
        int user_id FK
        nvarchar purpose "EmailVerification | PasswordReset"
        nvarchar token_hash UK "SHA-256"
        datetime2 expires_at
        datetime2 consumed_at
        int failed_attempts
    }
```

`blocked_slots` (Ref 11.4) and `user_tokens` (Ref 1.4, 9.1) are added to the eight required tables.

## How the schema meets the requirements

| Ref | Requirement | Where |
|---|---|---|
| 13.2 | 3NF | Every non-key column depends only on its table's key. Totals and balances are computed, not stored. The canceller's role comes from `users`, not a copy. |
| 13.3 | Indexes | `ux_users_username`, `ux_users_email`, `ix_bookings_booking_date_start_time`, `ix_bookings_status` |
| 13.4 | ON DELETE RESTRICT | Every foreign key is `ON DELETE NO ACTION`, which is how SQL Server implements RESTRICT. A booking with payments cannot be deleted. |
| 13.5 | Soft delete | `is_deleted` on `users`, `services`, `addons`, `bookings`, `blocked_slots`. Nothing is deleted by the application. |
| 13.6 | Price at booking time | `bookings.service_price`, `bookings.deposit_amount`, `booking_addons.line_price` |
| 6.2 | Consistency | PK/FK, UNIQUE (username, email, phone), NOT NULL, CHECK (name length, digits-only phone, non-negative prices) |
| 6.3 | Isolation | `ux_bookings_active_slot` (one Pending/Confirmed booking per slot) and the `UPDLOCK, HOLDLOCK` slot lock in `BookingRepository.LockSlotAsync` |
| 13.7 | Backups | `backup-database.ps1`, `register-daily-backup.ps1`, `test-restore.ps1` |
