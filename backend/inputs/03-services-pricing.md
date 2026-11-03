# 3. Services and Pricing

## 3.1 Service Price List (Ref 4)

All prices are in Philippine Pesos (PHP) and stored centrally in the `services` / `addons` tables.

| No. | Category | Service / Item | Base Price (PHP) |
|---|---|---|---:|
| 1 | Booking Deposit | Fixed, non-refundable | ₱150 |
| 2 | Soft Gel | Plain | ₱300 |
| 3 | Soft Gel | With Design | ₱400 |
| 4 | Soft Gel | BIAB | ₱250 |
| 5 | Stone (Add-on) | French Tip | ₱15 |
| 6 | Stone (Add-on) | Chrome | ₱10 |
| 7 | Stone (Add-on) | Cat Eye Polish | ₱10 |
| 8 | Stone (Add-on) | Blooming Gel | ₱10 |
| 9 | Stone (Add-on) | Embossed Art | ₱15 |
| 10 | Removal | My Work | ₱100 |
| 11 | Removal | Not My Work | ₱150 |

**Pricing clarification:** Stone prices are assumed to be charged **per nail**. Confirm against Kyla's official price list before finalizing the calculation logic.

## 3.2 Pricing Rules

| No. | Ref | Requirement |
|---|---|---|
| 3.2.1 | 2.2 | Provide an endpoint returning every service and add-on with its base price. |
| 3.2.2 | 10.4 | `PriceService` computes the booking total from the selected service and add-ons (Stone × number of nails). The server total is authoritative. |
| 3.2.3 | 11.3 | Administrators can update service prices and add-ons through the API without code changes. |
| 3.2.4 | 13.6 | Store the price in effect at booking time on the booking, so old bookings keep their original prices after price changes. |
| 3.2.5 | 6.2 | Service prices must be non-negative (CHECK constraint). |
