# 8. Database Design and ACID

## 8.1 Schema Design

| No. | Ref | Requirement |
|---|---|---|
| 8.1.1 | 13.1 | Create an ERD with the tables: `users`, `services`, `addons`, `bookings`, `booking_addons`, `payments`, `cancellations`, `audit_logs`. |
| 8.1.2 | 13.2 | Normalize all tables up to Third Normal Form (3NF). |
| 8.1.3 | 13.3 | Create indexes on `username`, `email`, `booking_date`, and `status`. |
| 8.1.4 | 13.4 | Apply `ON DELETE RESTRICT` so bookings with payment records cannot be deleted. |
| 8.1.5 | 13.5 | Use soft deletion (`is_deleted`) instead of permanently removing records. |
| 8.1.6 | 13.6 | Store the service price at booking time on the booking / booking add-on rows. |

## 8.2 ACID Properties

| No. | Ref | Property | Requirement |
|---|---|---|---|
| 8.2.1 | 6.1 | Atomicity | Booking creation, deposit payment, and time-slot reservation are one transaction; any failure rolls back everything. |
| 8.2.2 | 6.2 | Consistency | Primary and foreign keys; UNIQUE on username, email, and phone number; NOT NULL on required fields; CHECK for name length ≤ 75 and non-negative prices; centralized pricing in `services`. |
| 8.2.3 | 6.3 | Isolation | Row-level locking prevents two clients from reserving the same slot at the same time. |
| 8.2.4 | 6.4 | Durability | Committed bookings and payments are stored permanently and protected by regular backups; cancellations are stored with their reasons. |

## 8.3 Backups

| No. | Ref | Requirement |
|---|---|---|
| 8.3.1 | 13.7 | Configure automatic daily database backups. |
| 8.3.2 | 13.7 | Perform restore testing to verify backed-up data can be recovered. |
