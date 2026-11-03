# 4. Bookings and Scheduling

## 4.1 Booking Lifecycle

| No. | Ref | Requirement |
|---|---|---|
| 4.1.1 | 10.1 | Provide an endpoint listing appointment time slots with their availability (open, booked, blocked). |
| 4.1.2 | 2.4 | Store the "Note for Leah" as one of a fixed set of predefined options. |
| 4.1.3 | 10.3 | Track booking status: **Pending, Confirmed, Completed, Cancelled**, and expose a client booking-history endpoint. |
| 4.1.4 | 12.3 | A booking becomes **Confirmed** only after the deposit payment is successfully received. |
| 4.1.5 | 10.6 | Allow rescheduling only if requested at least 24 hours before the appointment. |
| 4.1.6 | 11.2 | Administrator actions: Confirm, Reschedule, Complete, Cancel. |
| 4.1.7 | 11.4 | Administrators can block specific dates or time slots; blocked slots cannot be booked. |
| 4.1.8 | 11.5 | Search and filter bookings by date, status, or client name. |

## 4.2 Cancellations

| No. | Ref | Requirement |
|---|---|---|
| 4.2.1 | 2.5 | Client cancellation requires one reason: Change of schedule, Emergency, Booked by mistake, Found another provider, Others. |
| 4.2.2 | 3.1 | Administrator cancellation requires one reason: Staff unavailable, Schedule conflict, Emergency, Client did not respond, Others. |
| 4.2.3 | 3.2 | Administrator explanation is optional and must not be required. |
| 4.2.4 | 6.4 | Record every cancellation with its reason in the `cancellations` table. |

## 4.3 Double-Booking Prevention

| No. | Ref | Requirement |
|---|---|---|
| 4.3.1 | 6.3 | Use row-level locking so that two clients cannot reserve the same time slot at the same time. Only one attempt succeeds. |
| 4.3.2 | 6.1 | Booking creation, deposit payment, and time-slot reservation run in a **single database transaction**; any failure rolls back everything. |
