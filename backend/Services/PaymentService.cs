using NailsByLeah.Api.Data;
using NailsByLeah.Api.Domain;
using NailsByLeah.Api.Errors;
using NailsByLeah.Api.Infrastructure;
using NailsByLeah.Api.Payments;

namespace NailsByLeah.Api.Services;

public interface IPaymentService
{
    /// <summary>
    /// Charges the deposit or the full amount (worked out here from the stored booking prices, never taken from the
    /// browser) and records the payment. Must run inside the booking transaction so a failure leaves no booking, no
    /// payment and no reserved slot behind (Ref 6.1). The booking stays Pending until an administrator confirms it.
    /// </summary>
    Task<Payment> CollectAsync(IPayable payable, PaymentOption option, PaymentMethod method, Guid idempotencyKey, CancellationToken ct = default);

    Task<Payment?> GetDepositAsync(int bookingId, CancellationToken ct = default);
}

/// <summary>Processes and records booking payments (Ref 12).</summary>
public sealed class PaymentService(
    IPaymentGateway gateway,
    IPaymentRepository payments,
    IAuditLogger audit,
    ISalonClock clock) : IPaymentService
{
    public async Task<Payment> CollectAsync(IPayable payable, PaymentOption option, PaymentMethod method, Guid idempotencyKey, CancellationToken ct = default)
    {
        if (payable.Status != BookingStatus.Pending || payable.AmountPaid > 0)
            throw new ConflictException("The payment for this booking has already been handled.", "already_paid");

        var amount = payable.AmountFor(option);
        var what = option == PaymentOption.Full ? "full payment" : "deposit";
        var result = await gateway.ChargeAsync(new PaymentCharge(amount, method, idempotencyKey, $"Booking #{payable.Id} {what}"), ct);
        if (!result.Succeeded || string.IsNullOrWhiteSpace(result.ReferenceNumber))
            throw new PaymentFailedException(result.FailureReason ?? "The payment was not completed. You have not been charged.");

        var now = clock.UtcNow;
        var payment = new Payment
        {
            BookingId = payable.Id,
            ClientId = payable.ClientId,
            Method = method,
            Option = option,
            Amount = amount,
            TotalAmount = payable.TotalPrice,
            BalanceAfter = Math.Max(0, payable.TotalPrice - amount),
            ReferenceNumber = result.ReferenceNumber,
            IdempotencyKey = idempotencyKey,
            Status = PaymentStatus.Succeeded,
            PaidAt = now,
            CreatedAt = now,
        };
        payments.Add(payment);
        payable.RecordPayment(option, amount);

        audit.Record(AuditActions.PaymentSucceeded, nameof(Payment), payment.ReferenceNumber,
            $"{method} PHP {payment.Amount:0.00} {what} for booking #{payable.Id}");
        return payment;
    }

    public Task<Payment?> GetDepositAsync(int bookingId, CancellationToken ct = default) =>
        payments.GetSucceededForBookingAsync(bookingId, ct);
}
