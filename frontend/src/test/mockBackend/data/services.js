// MOCK: the approved price list (Ref 4). Same rows as the backend seed (backend/Data/PriceListSeed.cs).
// Table: services (main services) and addons (Stone add-ons, priced per nail).
// durationMinutes (main services only) decides which times can be booked; Leyah changes it on the admin Services page.

const seededAt = '2026-11-01T00:00:00.000Z'

export const services = [
  { id: 1, category: 'SoftGel', name: 'Plain', price: 300, durationMinutes: 120, allowsAddOns: false, isActive: true, isDeleted: false, createdAt: seededAt, updatedAt: seededAt },
  { id: 2, category: 'SoftGel', name: 'With Design', price: 400, durationMinutes: 180, designOptionOfId: 1, isActive: true, isDeleted: false, createdAt: seededAt, updatedAt: seededAt },
  { id: 3, category: 'SoftGel', name: 'BIAB', price: 250, durationMinutes: 180, isActive: true, isDeleted: false, createdAt: seededAt, updatedAt: seededAt },
  { id: 4, category: 'Removal', name: 'My Work', price: 100, durationMinutes: 60, isActive: true, isDeleted: false, createdAt: seededAt, updatedAt: seededAt },
  { id: 5, category: 'Removal', name: 'Not My Work', price: 150, durationMinutes: 60, isActive: true, isDeleted: false, createdAt: seededAt, updatedAt: seededAt },
  { id: 6, category: 'SoftGel', name: 'BIAB with Design', price: 350, durationMinutes: 180, designOptionOfId: 3, isActive: true, isDeleted: false, createdAt: seededAt, updatedAt: seededAt },
  { id: 7, category: 'SoftGel', name: 'Soft Gel Extension', price: 399, durationMinutes: 120, isActive: true, isDeleted: false, createdAt: seededAt, updatedAt: seededAt },
]

/** Stone add-ons: assumed to be charged per nail (to be confirmed against Kyla's official price list). */
export const addOns = [
  { id: 1, name: 'French Tip', price: 15, isActive: true, isDeleted: false, createdAt: seededAt, updatedAt: seededAt },
  { id: 2, name: 'Chrome', price: 10, isActive: true, isDeleted: false, createdAt: seededAt, updatedAt: seededAt },
  { id: 3, name: 'Cat Eye Polish', price: 10, isActive: true, isDeleted: false, createdAt: seededAt, updatedAt: seededAt },
  { id: 4, name: 'Blooming Gel', price: 10, isActive: true, isDeleted: false, createdAt: seededAt, updatedAt: seededAt },
  { id: 5, name: 'Embossed Art', price: 15, isActive: true, isDeleted: false, createdAt: seededAt, updatedAt: seededAt },
  { id: 6, name: 'Rhinestone', price: 15, isActive: true, isDeleted: false, createdAt: seededAt, updatedAt: seededAt },
]

export const categoryLabels = { SoftGel: 'Soft Gel', Removal: 'Removal', Stone: 'Nail design (add-on)' }
