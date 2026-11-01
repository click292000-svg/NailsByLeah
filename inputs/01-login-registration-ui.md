# 1. Login and Registration UI

Registration, login, email verification, and password recovery screens.

| No. | Ref | Requirement |
|---|---|---|
| 1.1 | 1.1 | The First Name and Last Name fields must accept letters, numbers, and special characters, with a maximum length of 75 characters each (`maxLength={75}`). |
| 1.2 | 9.3 | Show a live character counter under the First Name and Last Name fields, e.g. **12/75**. |
| 1.3 | 1.2, 9.2 | Include a Username field. Check availability as the user types (debounced call to the backend) and show real-time messages such as **"Username is already taken."** |
| 1.4 | 1.3 | The Phone Number field must accept numeric digits only. Block letters and special characters on key press and automatically remove non-numeric characters from pasted content. |
| 1.5 | 1.5 | The Password and Confirm Password fields must disable copy, cut, and paste through keyboard shortcuts (Ctrl+C, Ctrl+X, Ctrl+V) and the right-click context menu. |
| 1.6 | 8.6 | Provide a Show/Hide Password eye icon on password fields to toggle visibility. |
| 1.7 | 8.2 | Show the password rules (minimum 8 characters, at least one letter and one number) and validate them live before submit. |
| 1.8 | 1.6 | Include a mandatory Terms & Conditions checkbox alongside the Privacy Policy. Both documents open in readable, scrollable windows. The Register button stays disabled until Terms & Conditions are accepted. |
| 1.9 | 9.1 | After registration, show an email verification page where the user enters the verification code or is told to use the confirmation link. |
| 1.10 | 1.4 | Forgot Password page: the user enters the registered email address to request a reset link or code. |
| 1.11 | 1.4 | Reset Password page: accepts the link/code and a new password. Show a clear message when the link or code is expired (15 minutes) or already used. |
| 1.12 | 8.3 | On the login page, show a clear message when the account is locked for 15 minutes after five failed attempts. |

**Security note (Ref 1.1):** Names may contain special characters. Render all user text through normal React output (auto-escaped). Never use `dangerouslySetInnerHTML` for user data.
