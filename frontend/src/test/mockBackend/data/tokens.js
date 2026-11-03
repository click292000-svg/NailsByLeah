// MOCK: email verification codes and password reset links (table: user_tokens).
// Two ready-made reset links let you test the error messages (Ref 1.11):
//   /reset-password?token=expired-demo-token   → "expired"
//   /reset-password?token=used-demo-token      → "invalid or already used"
// The mock stores tokens as-is; the real backend stores only a SHA-256 hash.

import { minutesFromNow } from '../../../lib/dates'

export const userTokens = [
  { id: 1, userId: 2, purpose: 'PasswordReset', token: 'expired-demo-token', expiresAt: minutesFromNow(-45),
    consumedAt: null, failedAttempts: 0, createdAt: minutesFromNow(-60) },
  { id: 2, userId: 2, purpose: 'PasswordReset', token: 'used-demo-token', expiresAt: minutesFromNow(10),
    consumedAt: minutesFromNow(-2), failedAttempts: 0, createdAt: minutesFromNow(-5) },
  { id: 3, userId: 5, purpose: 'EmailVerification', token: '482913', expiresAt: minutesFromNow(60 * 20),
    consumedAt: null, failedAttempts: 0, createdAt: minutesFromNow(-240) },
]
