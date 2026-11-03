# 5. Routing, Session, and Security

Client-side enforcement of access and session rules. The backend remains the final authority (see backend [2. Authentication and Security](../backend/02-authentication-security.md)).

| No. | Ref | Requirement |
|---|---|---|
| 5.1 | 8.7 | Role-based route guards: clients cannot open administrator-only routes, and administrators cannot open client-only routes. Redirect to an appropriate page when access is denied. |
| 5.2 | 8.4 | Automatically log the user out after 30 minutes of inactivity and return them to the login page with a message. |
| 5.3 | 8.5 | All API calls and page loads must use HTTPS in production. |
| 5.4 | 1.1 | Protect against Cross-Site Scripting (XSS): rely on React's output escaping and never inject user content as raw HTML. |
| 5.5 | 14.3 | Keep configuration (API base URL, Google Maps key) in environment files (`.env`), not hard-coded in source. |
| 5.6 | 14.2 | Centralize form validation rules (name length, phone digits, password rules) in one shared module used by all forms. |
