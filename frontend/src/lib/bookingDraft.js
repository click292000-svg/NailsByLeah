// A booking in progress is saved to the client's account (GET/PUT/DELETE /api/booking-draft) as it changes,
// so a client can go back a step, leave the booking page, or come back later on another device and pick up
// where they left off. A draft is never an appointment: it holds no time slot, and everything in it is checked
// again (service, current prices, time still free) when the client pays. Uploaded design photos are stored on
// the server; the draft only keeps their ids.

import { api } from '../api'

// 3: three steps (photos with the colour, the note with the date and time), colours per nail and colour requests.
const VERSION = 3

/** The signed-in client's saved draft, or null. Drafts from an older version of the page are ignored. */
export async function loadBookingDraft() {
  const saved = await api.bookingDraft.get().catch(() => null)
  const draft = saved?.data
  return draft && draft.version === VERSION ? { ...draft, savedAt: saved.updatedAt } : null
}

export const saveBookingDraft = (values) => api.bookingDraft.save({ ...values, version: VERSION })

export const clearBookingDraft = () => api.bookingDraft.remove().catch(() => {})

/** Whether a draft has anything worth resuming. */
export const draftHasProgress = (draft) =>
  Boolean(draft && (draft.serviceId || draft.removalId || draft.date || draft.referenceImages?.length || draft.colorImages?.length || Object.keys(draft.nails ?? {}).length))
