// Client-side price calculation for instant feedback while choosing services (Ref 10.4).
// The backend recalculates on booking; its total is the one that is charged.

/**
 * @param {{id:number,name:string,category:string,price:number}} service main service
 * @param {{addOn:{id:number,name:string,price:number}, nailCount:number}[]} addOns Stone add-ons, priced per nail
 * @param {number} deposit booking deposit
 */
export function calculateQuote(service, addOns, deposit) {
  const lines = []
  if (service) {
    lines.push({ itemId: service.id, name: service.name, category: service.category, pricingUnit: 'per service',
      unitPrice: service.price, quantity: 1, lineTotal: service.price })
  }
  for (const { addOn, nailCount } of addOns) {
    lines.push({ itemId: addOn.id, name: addOn.name, category: 'Stone', pricingUnit: 'per nail',
      unitPrice: addOn.price, quantity: nailCount, lineTotal: round(addOn.price * nailCount) })
  }
  const total = round(lines.reduce((sum, line) => sum + line.lineTotal, 0))
  // Paying in full covers the total; it is never less than the non-refundable deposit it includes (same rule as the backend).
  return { lines, total, deposit, balanceDue: Math.max(0, round(total - deposit)), fullAmount: Math.max(total, deposit) }
}

const round = (value) => Math.round(value * 100) / 100
