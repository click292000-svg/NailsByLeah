# 3. Booking and Payment Flow

Service selection, booking summary, deposit acknowledgment, and payment screens.

| No. | Ref | Requirement |
|---|---|---|
| 3.1 | 10.4 | Automatically recalculate and update the total price whenever the client selects or removes add-ons. |
| 3.2 | 4 | Stone add-ons are priced per nail (pending confirmation against Kyla's official price list). The UI must let the client set the number of nails for each Stone add-on. |
| 3.3 | 10.2 | Show a booking summary page before payment with the selected service, add-ons, computed total price, and the required ₱150 booking deposit. |
| 3.4 | 2.3 | Before payment, display the warning **"The booking deposit is non-refundable."** The Pay button stays disabled until the client checks **"I understand"**, following Dear Doll. |
| 3.5 | 12.1 | Let the client choose a payment method: GCash or Maya. |
| 3.6 | 12.4 | Prevent duplicate payments: disable the Pay button and show a loading state as soon as it is clicked, until the backend responds. |
| 3.7 | 12.5 | Display a payment receipt after a successful transaction, including the payment reference number. |
| 3.8 | 12.3 | Show the booking as **Pending** until the backend confirms the deposit, then **Confirmed**. |
