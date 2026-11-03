import { useState } from 'react'

const style = (i) => ({ '--i': Math.min(i, 6) })

/** Nail rules from Leyah's reminder cards, plus "Before your appointment" and her note. */
export function RulesSection({ deposit }) {
  const rules = [
    ['Book with intention', 'Please book only if you are sure you can make it. Your slot is reserved especially for you.'],
    ['Deposit is required', `A non-refundable deposit of ${deposit} is required to secure your appointment.`],
    ['Be on time', 'Please arrive on time. Late arrivals may result in a shorter service or rescheduling.'],
    ['Cancellations', 'Kindly let us know at least 24 hours in advance if you need to cancel or reschedule.'],
    ['Cancellation fee', 'Late cancellations or no-shows will incur a fee. This protects the time reserved for you.'],
    ['3-day repair', 'We repair any lifting or chipping. Let us know within 3 days after your appointment.', 'Valid for repairs only.'],
    ['Payment policy', 'Send your GCash payment right after the service. Late payments will incur a fee.'],
  ]
  return (
    <section className="hm-rules hm-section" id="rules" tabIndex={-1} aria-labelledby="rules-title">
      <div className="hm-head">
        <h2 id="rules-title">Nail Rules</h2>
        <p className="hm-script">Beautiful nails, confident you.</p>
      </div>
      <ol className="hm-rule-grid">
        {rules.map(([title, text, fine], i) => (
          <li key={title} className="hm-rule hm-reveal" style={style(i)}>
            <span className="hm-rule-num" aria-hidden="true">{i + 1}</span>
            <div>
              <h3>{title}</h3>
              <p>{text}{fine && <span className="hm-fine">{fine}</span>}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="hm-notes">
        <div className="hm-note hm-reveal" style={style(0)}>
          <h3>Before your appointment</h3>
          <ul>
            <li><strong>Arrive on time</strong> so we can stay on schedule.</li>
            <li><strong>Come with clean, bare nails</strong>: no polish, gel or acrylic, unless you booked a removal.</li>
            <li><strong>No extra guests or kids</strong>: space is limited and it keeps things calm and focused.</li>
          </ul>
        </div>
        <div className="hm-note hm-reveal" style={style(1)}>
          <h3>A note from Leyah</h3>
          <p>I&apos;m still learning and growing as a nail tech, so I truly appreciate your patience and support. Thank you for trusting me on my journey!</p>
          <p className="hm-sign">— Nails by Leyah</p>
        </div>
      </div>
    </section>
  )
}

const Chevron = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 9l6 6 6-6" />
  </svg>
)

/** Frequently asked questions as an accordion; several answers can be open at once. */
export function FaqSection({ deposit, hours }) {
  const [open, setOpen] = useState(() => new Set())
  const toggle = (i) => setOpen((prev) => {
    const next = new Set(prev)
    if (next.has(i)) next.delete(i); else next.add(i)
    return next
  })
  const faq = [
    ['Is the reservation deposit refundable?', `No. The ${deposit} deposit is non-refundable because it secures your slot: once your booking is confirmed, that time is reserved only for you and can no longer be offered to other clients. It also covers the time spent preparing for your appointment.`],
    ['Do you accept walk-ins?', 'No. Nails by Leyah is home-based and works by appointment only, so please book your slot in advance.'],
    ['What are your opening hours?', `${hours}, by appointment only. Each appointment is followed by a 30-minute break, so the times you can book depend on how long your service takes.`],
    ['How much is the deposit?', `The deposit is ${deposit}. It secures your slot and is deducted from your total on the day.`],
    ['What is your cancellation policy?', 'Please let us know at least 24 hours in advance if you need to cancel or reschedule. Late cancellations and no-shows incur a fee, and the deposit is not refunded.'],
    ["What happens if I'm late for my appointment?", "Please arrive on time. Late arrivals may get a shorter service or need to reschedule, so the next client isn't kept waiting."],
    ['How should I prepare for my appointment?', 'Come with clean, bare nails: no polish, gel or acrylic, unless you booked a removal.'],
    ['Can I bring a friend or my kids?', 'Sorry, no extra guests or kids. Space is limited and it keeps things calm and focused for both of us.'],
    ['What if my nails lift or chip?', 'We offer a 3-day repair for lifting or chipping. Message us within 3 days after your appointment. This covers repairs only.'],
    ['How do I pay the balance?', 'Pay by GCash right after the service. Late payments incur a fee.'],
    ['Where are you located?', 'Nails by Leyah is home-based and works by appointment only. The address, opening hours and map are in "Visit us" below.'],
  ]
  const half = Math.ceil(faq.length / 2)
  return (
    <section className="hm-faq hm-section" id="faq" tabIndex={-1} aria-labelledby="faq-title">
      <div className="hm-head"><h2 id="faq-title">Frequently Asked Questions</h2></div>
      {/* Two independent columns (first half left, second half right), so opening an answer only
          pushes down the questions below it in the same column. Phones show one column in order. */}
      <div className="hm-faq-list">
        {[faq.slice(0, half), faq.slice(half)].map((column, c) => (
          <div key={c} className="hm-faq-col">
            {column.map(([q, a], j) => {
              const i = c * half + j
              return (
                <div key={q} className={open.has(i) ? 'hm-faq-item hm-reveal open' : 'hm-faq-item hm-reveal'} style={style(i)}>
                  <h3>
                    <button type="button" className="hm-faq-q" id={`faq-q${i}`} aria-expanded={open.has(i)} aria-controls={`faq-a${i}`} onClick={() => toggle(i)}>
                      <span>{q}</span><Chevron />
                    </button>
                  </h3>
                  <div className="hm-faq-a" id={`faq-a${i}`} role="region" aria-labelledby={`faq-q${i}`} inert={!open.has(i)}>
                    <div><p>{a}</p></div>
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </section>
  )
}
