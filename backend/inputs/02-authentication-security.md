# 2. Authentication and Security

## 2.1 Registration and Login

| No. | Ref | Requirement |
|---|---|---|
| 2.1.1 | 1.1 | Validate First Name and Last Name server-side: letters, numbers, and special characters allowed; maximum 75 characters each. |
| 2.1.2 | 1.2 | Username must be unique. Return a clear validation error when it already exists. |
| 2.1.3 | 9.2 | Provide a username-availability endpoint for real-time checks during registration. |
| 2.1.4 | 1.3 | Phone Number must contain numeric digits only; reject or strip non-numeric characters server-side. |
| 2.1.5 | 1.6 | Reject registration unless Terms & Conditions are accepted. |
| 2.1.6 | 9.4 | Record the date and version of the Terms & Conditions accepted by each user. |
| 2.1.7 | 9.1 | Require email verification (code or confirmation link) before activating a new account. |

## 2.2 Password Recovery (Ref 1.4)

| No. | Requirement |
|---|---|
| 2.2.1 | Accept a registered email address and send a one-time reset link or verification code. |
| 2.2.2 | The link/code expires after **15 minutes**. |
| 2.2.3 | Once a new password is set, the previous link/code becomes invalid (single use). |

## 2.3 Security Controls

| No. | Ref | Requirement |
|---|---|---|
| 2.3.1 | 8.1 | Hash all passwords with bcrypt or Argon2. Never store plain-text passwords. |
| 2.3.2 | 8.2 | Enforce minimum password length of 8 characters with at least one letter and one number. |
| 2.3.3 | 8.3 | Lock an account for 15 minutes after five unsuccessful login attempts. |
| 2.3.4 | 8.4 | Expire sessions/tokens after 30 minutes of inactivity. |
| 2.3.5 | 8.5 | Require HTTPS for all connections (HTTPS redirection and HSTS). |
| 2.3.6 | 8.7 | Role-based authorization (Client, Administrator) on every endpoint: clients cannot call admin-only endpoints and administrators cannot call client-only endpoints. |
| 2.3.7 | 1.1 | Use parameterized queries only (e.g. Entity Framework Core) to prevent SQL injection. |
| 2.3.8 | 1.1 | Escape/encode output and never return user input as executable HTML to prevent XSS. |
