// Plain first and BIAB last, as on Leyah's price list; anything else (Soft Gel Extension, services added later) between them.
const SET_ORDER = { plain: 0, biab: 2 }
const setOrder = (service) => SET_ORDER[service.name.trim().toLowerCase()] ?? 1

/**
 * The Soft Gel sets in price-list order, each with its "with design" version when it has one:
 * [{ base: Plain, design: With Design }, { base: Soft Gel Extension, design: null }, { base: BIAB, design: BIAB with Design }].
 */
export function softGelSets(services) {
  const softGel = services.filter((s) => s.category === 'SoftGel')
  const isDesign = (s) => s.designOptionOfId && softGel.some((b) => b.id === s.designOptionOfId)
  return softGel
    .filter((s) => !isDesign(s))
    .sort((a, b) => setOrder(a) - setOrder(b))
    .map((base) => ({ base, design: softGel.find((s) => s.designOptionOfId === base.id) ?? null }))
}

/** "Plain with design": how a design version is named to clients. */
export const withDesignName = (base) => `${base.name} with design`
