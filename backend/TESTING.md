# Testing

Run everything from the repository root:

```bash
dotnet test NailsByLeah.slnx
```

Integration tests use SQL Server LocalDB. If a terminal run fails with "LocalDB instance startup: SQL Server process
failed to start", run them from Visual Studio's Test Explorer (**Test → Run All Tests**). Rate limits are off in the
shared test host; `RateLimitTests` switches them on with small numbers.

## Automated test coverage (backend doc 9)

| No. | Scenario | Test |
|---|---|---|
| 9.1.1 | Price calculations, Stone priced per nail | `Unit/PriceServiceTests` |
| 9.1.2 | Name length, phone digits, password rules | `Unit/ValidationRulesTests` |
| 9.1.3 | 76-character name rejected | `AuthTests.Registration_with_76_character_name_is_rejected` |
| 9.1.4 | Existing username rejected | `AuthTests.Registration_with_existing_username_returns_username_error` |
| 9.1.5 | Expired reset link rejected | `AuthTests.Expired_password_reset_link_is_rejected` |
| 9.1.6 | Payment without deposit acknowledgment rejected | `BookingTests.Booking_without_deposit_acknowledgment_is_rejected` |
| 9.1.7 | Two clients, same slot: only one succeeds | `BookingTests.Two_clients_booking_the_same_slot_at_the_same_time_only_one_succeeds` |
| 9.1.8 | Admin cancels without explanation | `BookingTests.Administrator_can_cancel_without_an_explanation` |
| 9.1.9 | `' OR 1=1 --` stored as plain text | `SecurityTests.Sql_injection_text_is_stored_as_plain_text` |
| 9.1.10 | `<script>alert(1)</script>` returned as text | `SecurityTests.Script_tags_in_names_are_returned_as_text_not_html` |
| 9.1.11 | Same payment twice, charged once | `BookingTests.Submitting_the_same_payment_twice_charges_once`, `…Simultaneous_double_click_on_pay_charges_once` |
| 9.1.12 | Five failed logins lock for 15 minutes | `AuthTests.Five_failed_logins_lock_the_account_for_15_minutes` |
| 9.2.1 | Sign Up → Book → Pay → Cancel → Admin views | `EndToEndTests` |

Also covered: rate limits (`RateLimitTests`), "forgot password" and "resend code" answering the same for registered and unknown emails and when an email can't be sent, reset links keeping the token out of server addresses, Brevo errors without client addresses, role-based access (8.7), 30-minute idle session timeout (8.4), single-use reset links, email verification, failed payment rollback (6.1), slot blocking (11.4), price snapshots (13.6), rescheduling window (10.6), dashboard, search, reports, activity log and the 24-hour reminder.

## Bug report list (Ref 15.6)

Record every issue found during testing or UAT. Severity: **High** blocks a core flow, loses data or is a security problem. **Medium** is a wrong result with a workaround. **Low** is cosmetic.

| ID | Date found | Found by | Area | Description / steps | Severity | Status | Fixed in |
|---|---|---|---|---|---|---|---|
| BUG-001 | | | | | High / Medium / Low | Open | |

## User Acceptance Testing (Ref 15.7)

To be completed with Kyla and Leyah before the final release.

| No. | Scenario | Kyla | Leyah | Notes |
|---|---|---|---|---|
| 1 | Register, verify email, log in | ☐ | ☐ | |
| 2 | Forgot password and reset | ☐ | ☐ | |
| 3 | Price list matches the official list (confirm Stone per nail) | ☐ | ☐ | |
| 4 | Book with add-ons; totals, deposit warning and receipt are correct | ☐ | ☐ | |
| 5 | Reschedule and cancel as a client | ☐ | ☐ | |
| 6 | Admin dashboard, search, confirm, complete, cancel | ☐ | ☐ | |
| 7 | Change a price and block a day off | ☐ | ☐ | |
| 8 | Daily and monthly sales reports | ☐ | ☐ | |
| 9 | Confirmation and reminder emails received | ☐ | ☐ | |

Sign-off: ____________________ (Kyla) ____________________ (Leyah) Date: __________
