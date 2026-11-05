using System.Security.Cryptography;
using NailsByLeah.Api.Domain;

namespace NailsByLeah.Api.Payments;

public sealed record PaymentCharge(decimal Amount, PaymentMethod Method, Guid IdempotencyKey, string Description);

public sealed record PaymentChargeResult(bool Succeeded, string? ReferenceNumber, string? FailureReason)
{
    public static PaymentChargeResult Success(string referenceNumber) => new(true, referenceNumber, null);
    public static PaymentChargeResult Failure(string reason) => new(false, null, reason);
}

/// <summary>
/// Abstraction over GCash / Maya providers (Ref 12.1). This one-step charge suits only the simulated gateway: PayMongo
/// and HitPay both redirect the client to a hosted page and confirm later by webhook, so connecting either one changes
/// this interface and the booking flow (docs/GO-LIVE-PLAN.md, "Payments").
/// </summary>
public interface IPaymentGateway
{
    Task<PaymentChargeResult> ChargeAsync(PaymentCharge charge, CancellationToken ct = default);
}

/// <summary>
/// Development stand-in that approves every charge and issues a reference number.
/// It does not move real money. Replace it with a real GCash/Maya integration before going live.
/// </summary>
public sealed class SimulatedPaymentGateway(TimeProvider time, ILogger<SimulatedPaymentGateway> logger) : IPaymentGateway
{
    public Task<PaymentChargeResult> ChargeAsync(PaymentCharge charge, CancellationToken ct = default)
    {
        var prefix = charge.Method == PaymentMethod.GCash ? "GC" : "MY";
        var reference = $"{prefix}-{time.GetUtcNow():yyyyMMdd}-{RandomNumberGenerator.GetHexString(10)}";
        logger.LogInformation("Simulated {Method} charge of PHP {Amount} approved: {Reference} ({Description})",
            charge.Method, charge.Amount, reference, charge.Description);
        return Task.FromResult(PaymentChargeResult.Success(reference));
    }
}
