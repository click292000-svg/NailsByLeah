// Terms & Conditions and Privacy Policy, written from how the booking system actually works and Leyah's salon rules.
// Keep them in step with the code: if a rule changes (deposit, reschedule window, booking window), update the text,
// raise the version here and Legal:TermsVersion in backend/appsettings.json, so new sign-ups record the new version.
// A section's body is one paragraph or a list of paragraphs; `points` adds a bulleted list.
//
// Still to confirm with Leyah before going live (see the sections marked below):
// - Cancelled full payments: what happens to the amount paid above the ₱150 deposit.
// - Bookings cancelled by the salon: whether the client's payment is returned or moved to a new date.
// - The amount of the late-cancellation, no-show and late-payment fees, if they should be stated.
// - The salon's phone number (still a placeholder in content/salon.js).

const SALON = 'Nails by Leyah'
const EMAIL = 'nailsbyleyah.bookings@gmail.com'

export const termsAndConditions = {
  title: 'Terms & Conditions',
  version: '2.3',
  updated: 'November 6, 2026',
  sections: [
    {
      heading: '1. About these terms',
      body: [
        `These terms apply when you create an account and book an appointment with ${SALON}, a home-based nail salon at 201 Mabuhay Compound, Sauyo Road, Quezon City. By creating an account you agree to these terms and to our Privacy Policy. You agree to these terms again each time you pay for a booking.`,
        'We record which version of these terms you accepted and when, at sign-up and with each booking.',
      ],
    },
    {
      heading: '2. Your account',
      points: [
        'Give your real name, a working email address and a mobile number we can reach you on. You must confirm your email address with the code we send before you can sign in.',
        'Keep your password private. You are responsible for bookings made with your account.',
        'For your security, your account is locked for 15 minutes after 5 wrong password attempts, and you are signed out after 30 minutes without activity.',
        'A password reset link works once and expires after 15 minutes.',
        'To protect accounts from abuse, too many sign-in, sign-up, password reset or booking attempts in a short time are paused for a few minutes. The website tells you how long to wait.',
      ],
    },
    {
      heading: '3. Booking an appointment',
      points: [
        'We work by appointment only; we do not accept walk-ins.',
        'You can book up to 30 days ahead. Appointments start every 30 minutes from 11:00 AM and must end by closing time (usually 9:00 PM). Each appointment is followed by a 30-minute break, so the times you can choose depend on how long your service takes.',
        'You may add up to 3 design reference photos and a note for Leyah. Photos only guide the design; the final result can differ depending on your nails and the design.',
        'Please book only if you are sure you can come. Your time is reserved only for you.',
      ],
    },
    {
      heading: '4. Prices',
      points: [
        'Prices are in Philippine Pesos (₱) and are shown before you pay.',
        'Stone add-ons are charged per nail, up to 10 nails (5 per hand).',
        'The price shown when you book is the price you pay, even if the price list changes later.',
      ],
    },
    {
      heading: '5. Payment and the booking deposit',
      points: [
        'Every booking needs a ₱150 booking deposit, paid online through GCash or Maya when you book. You may choose to pay the deposit only, or pay the full price.',
        'The deposit counts toward your total; it is never charged on top. If you pay only the deposit, pay the balance by GCash right after your service. Late payment of the balance may incur a fee.',
        'Your booking stays "Pending" until Leyah checks your payment and confirms it. We email you when it is confirmed.',
        'The ₱150 booking deposit is non-refundable, including when you cancel or do not show up. It secures your slot and covers the time spent preparing for your appointment.',
      ],
    },
    {
      heading: '6. Rescheduling',
      points: [
        'You can move your appointment online to another available time up to 24 hours before it starts. Within 24 hours, online changes are no longer possible.',
        'Your payment moves with your booking.',
        'The salon may need to move an appointment (for example if Leyah is unavailable). We will tell you and agree on a new time with you.',
      ],
    },
    {
      heading: '7. Cancellations and no-shows',
      points: [
        'Please tell us at least 24 hours ahead if you need to cancel. You can cancel online from "My bookings" until your appointment starts.',
        'Late cancellations (less than 24 hours before) and no-shows may incur a fee, and the deposit is not refunded.',
        // TO CONFIRM with Leyah: what happens to a cancelled full payment above the deposit.
        'If you paid in full and cancel, the ₱150 deposit is still non-refundable. Message us about the rest of your payment.',
        // TO CONFIRM with Leyah: whether a salon cancellation returns the payment or moves it to a new date.
        'The salon may cancel a booking for reasons such as staff unavailability or an emergency. If this happens, we will tell you the reason and contact you about a new appointment or your payment.',
      ],
    },
    {
      heading: '8. On the day',
      points: [
        'Arrive on time. Late arrivals may get a shorter service or need to reschedule, so the next client is not kept waiting.',
        'Come with clean, bare nails (no polish, gel or acrylic), unless you booked a removal.',
        'Please come alone: no extra guests or kids, as space is limited.',
      ],
    },
    {
      heading: '9. 3-day repair',
      body: 'If your nails lift or chip, message us within 3 days after your appointment and we will repair them. This covers repairs only, not a new set or a refund.',
    },
    {
      heading: '10. Feedback',
      body: 'After your appointment you may rate your experience and leave a comment. Feedback is seen by the salon only. Please keep it respectful.',
    },
    {
      heading: '11. Changes to these terms',
      body: 'We may update these terms when our services or policies change. The new version applies to bookings made after it is published. The date and version number are shown at the top.',
    },
    {
      heading: '12. Contact',
      body: `Questions about these terms: email ${EMAIL} or message us on Facebook or Instagram.`,
    },
  ],
}

export const privacyPolicy = {
  title: 'Privacy Policy',
  version: '2.2',
  updated: 'November 5, 2026',
  sections: [
    {
      heading: '1. Who we are',
      body: `${SALON} is a home-based nail salon in Quezon City run by Leyah. We are responsible for the personal information you give us through this website. We follow the Data Privacy Act of 2012 (Republic Act No. 10173).`,
    },
    {
      heading: '2. What we collect',
      points: [
        'Account details: first and last name, username, email address, mobile number, and your password (stored only in a scrambled, one-way form we cannot read).',
        'Booking details: the service and add-ons you choose, the date and time, your note for Leyah, the design reference photos you upload, and any changes or cancellations with the reason you give.',
        'Payment records: the amount, whether you paid the deposit or in full, GCash or Maya, the payment reference number and when it was paid. We never see or store your GCash or Maya PIN, password or card details.',
        'Feedback: your star rating and comment.',
        'Security records: when you agreed to our terms, failed sign-in attempts, and a log of important actions on your account with the internet (IP) address they came from.',
      ],
    },
    {
      heading: '3. Why we use it',
      points: [
        'To create and protect your account, and confirm your email address.',
        'To manage your appointments: reserve your time, prepare your design, confirm your booking, and let you reschedule or cancel.',
        'To send you emails about your account and bookings: verification codes, password reset links, booking received, booking confirmed, and a reminder about 24 hours before your appointment. We do not send marketing emails.',
        'To keep accurate payment and sales records.',
        'To keep the website secure and investigate misuse.',
      ],
      body: 'We use your information because it is needed to provide the service you asked for, and with the consent you give when you sign up. We do not sell your information or use it for advertising.',
    },
    {
      heading: '4. Who can see it',
      points: [
        'Leyah (the salon administrator) can see your account details, bookings, payments, photos and feedback to serve you.',
        'Your design photos can be seen only by you and the salon.',
        'Trusted service providers process information for us only to run the website: our web and database hosting providers, our email delivery provider (Brevo), and GCash or Maya and their payment processor for payments.',
        'We may share information when the law requires it.',
      ],
    },
    {
      heading: '5. How we protect it',
      points: [
        'The website uses a secure connection (HTTPS).',
        'Passwords are stored only as one-way hashes.',
        'Only the salon administrator can see other clients\' bookings. Each client sees only their own.',
        'Accounts are locked after repeated wrong passwords, and inactive sessions sign out after 30 minutes.',
        'Repeated sign-in, sign-up and password reset attempts are limited, so no one can guess passwords or flood your inbox.',
        'The "forgot password" and "resend code" pages answer the same way whether or not an email is registered, so no one can use them to find out who our clients are.',
        'Password reset links work once and expire after 15 minutes. The secret part of the link is never sent to or stored in our server records.',
        'Our technical logs do not contain your email address, phone number, password or reset links.',
        'Uploaded photos are checked to be real images and are not public.',
      ],
    },
    {
      heading: '6. Cookies and browser storage',
      body: 'We use one essential cookie to keep you signed in. Your browser also remembers, for the current visit only, that you have seen the opening animation. We do not use advertising or tracking cookies. The map on our home page is provided by Google Maps, which may collect information under Google\'s own privacy policy.',
    },
    {
      heading: '7. How long we keep it',
      body: 'We keep your account and booking history while your account is active, so you can see past bookings and we can keep accurate records. Payment and sales records may be kept longer where needed for business and tax records. When information is no longer needed, we delete it or make it anonymous.',
    },
    {
      heading: '8. Deleting your information',
      body: [
        'You can ask us to delete your information by contacting us. Please complete or cancel any open booking first. We remove your name, username, email address, mobile number, design photos, notes, feedback comments and security records, and you can no longer sign in. This cannot be undone.',
        'We keep your bookings, payment amounts and reference numbers, and star ratings, with no name attached, because they are needed for accurate sales and tax records. Emails already sent to you or to the salon may remain in those inboxes until they are deleted.',
      ],
    },
    {
      heading: '9. Your rights',
      body: 'Under the Data Privacy Act of 2012 you have the right to be informed, to access your information, to correct it, to object to its use, to ask us to delete or block it, to receive a copy of it, and to complain to the National Privacy Commission (privacy.gov.ph). To make a request, contact us. We may need to confirm your identity first.',
    },
    {
      heading: '10. Changes to this policy',
      body: 'We may update this policy. The date and version number at the top show when it last changed. If the change is important, we will tell you by email or on the website.',
    },
    {
      heading: '11. Contact',
      body: `For privacy questions or requests, email ${EMAIL}.`,
    },
  ],
}
