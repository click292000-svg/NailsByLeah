// Who an appointment is for. Usually the account holder; for a walk-in Leyah booked herself, the name she typed
// (the booking then sits on her own account, so the account's name would be hers).

/** Whether Leyah booked this for someone without an account. */
export const isWalkIn = (b) => Boolean(b?.guestName)

/** "Ana Santos": the walk-in's name, or the account holder's. */
export const bookingClientName = (b) =>
  b?.guestName ?? (b?.client ? `${b.client.firstName} ${b.client.lastName}` : 'Client')

/** The number to call about this appointment, if there is one. */
export const bookingClientPhone = (b) => (isWalkIn(b) ? b.guestPhone ?? null : b?.client?.phoneNumber ?? null)

/** "@monica", or "Walk-in" for someone without an account. */
export const bookingClientHandle = (b) => (isWalkIn(b) ? 'Booked by Leyah' : b?.client?.username ? `@${b.client.username}` : '')
