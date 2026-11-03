# 5. Payments

| No. | Ref | Requirement |
|---|---|---|
| 5.1 | 12.1 | Support GCash and Maya payment methods behind an `IPayable` / payment-gateway abstraction. |
| 5.2 | 2.3 | Reject payment requests that do not include the client's acknowledgment of the non-refundable deposit. |
| 5.3 | 4 | The booking deposit is a fixed, non-refundable ₱150. |
| 5.4 | 12.2 | Store a payment record for every transaction, including its payment reference number. |
| 5.5 | 12.4 | Prevent duplicate charges (e.g. idempotency key per booking payment) when Pay is clicked multiple times. |
| 5.6 | 12.3 | Set the booking to **Confirmed** only after the deposit payment succeeds. |
| 5.7 | 12.5 | Return receipt data (amount, method, reference number, date) after a successful payment. |
| 5.8 | 6.1 | Payment, booking creation, and slot reservation are committed together in one transaction or rolled back together. |
| 5.9 | 6.4 | Committed payment records are durable and included in regular backups. |
