# 7. Frontend Testing

| No. | Ref | Test Scenario | Expected Result |
|---|---|---|---|
| 7.1 | 7 | Type "abc#" into the Phone Number field. | The characters do not appear in the field. |
| 7.2 | 7 | Paste content into the Password field. | The paste is blocked. |
| 7.3 | 7 | Enter 76 characters into either name field. | The input is rejected (stops at 75; counter shows 75/75). |
| 7.4 | 7, 9.2 | Register using a username that already exists. | "Username is already taken" appears. |
| 7.5 | 7 | Open an expired password reset link. | An expired/invalid link message appears. |
| 7.6 | 7 | Click Pay without checking "I understand". | The Pay button is disabled; payment is blocked. |
| 7.7 | 12.4 | Click Pay several times quickly. | Only one payment request is sent. |
| 7.8 | 7 | Administrator cancels a booking without an explanation. | The cancellation is allowed. |
| 7.9 | 15.3 | Enter `<script>alert(1)</script>` into the name fields, then view the name anywhere it is displayed. | Text is shown literally; no script runs. |
| 7.10 | 8.7 | Log in as a client and open an admin URL directly (and the reverse). | Access is denied and the user is redirected. |
| 7.11 | 15.4 | End-to-end: Sign Up → Book → Pay → Cancel → Administrator views the updated booking. | Each step succeeds and the admin sees the cancelled booking with its reason. |
| 7.12 | 15.5 | Run the main flows in Chrome, Firefox, and on a mobile phone. | All pages work and display correctly. |
| 7.13 | 15.7 | User Acceptance Testing with Kyla and Leah. | Sign-off before final release. |
