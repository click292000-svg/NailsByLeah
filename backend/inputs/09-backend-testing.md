# 9. Backend Testing

## 9.1 Unit and Security Tests

| No. | Ref | Test Scenario | Expected Result |
|---|---|---|---|
| 9.1.1 | 15.1 | Unit-test service price calculations (base service + add-ons, Stone per nail). | Totals match the price list. |
| 9.1.2 | 15.1 | Unit-test input validation rules (name length, phone digits, password rules). | Invalid input is rejected. |
| 9.1.3 | 7 | Submit a 76-character name to the registration API. | The request is rejected. |
| 9.1.4 | 7 | Register with an existing username. | A username validation error is returned. |
| 9.1.5 | 7 | Use an expired password reset link/code. | The reset is rejected. |
| 9.1.6 | 7 | Send a payment request without the deposit acknowledgment. | The payment is rejected. |
| 9.1.7 | 7 | Two clients reserve the same slot simultaneously. | Only one booking succeeds. |
| 9.1.8 | 7 | Administrator cancels a booking without an explanation. | The cancellation is permitted. |
| 9.1.9 | 15.2 | Send `' OR 1=1 --` in the name and username fields. | Stored as plain text; no SQL injection. |
| 9.1.10 | 15.3 | Send `<script>alert(1)</script>` in the name fields. | Stored and returned as plain text; no script execution. |
| 9.1.11 | 12.4 | Submit the same payment twice. | Only one charge and one payment record. |
| 9.1.12 | 8.3 | Fail login five times. | Account locked for 15 minutes. |

## 9.2 Integration and Acceptance

| No. | Ref | Requirement |
|---|---|---|
| 9.2.1 | 15.4 | End-to-end: Sign Up → Book → Pay → Cancel → Administrator views the updated booking. |
| 9.2.2 | 15.6 | Maintain a bug report list classified by severity: High, Medium, Low. |
| 9.2.3 | 15.7 | User Acceptance Testing with Kyla and Leah before final release. |
