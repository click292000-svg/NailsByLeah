namespace NailsByLeah.Api.Domain;

public class Payment
{
    public int Id { get; set; }
    public int BookingId { get; set; }
    public Booking Booking { get; set; } = null!;

    /// <summary>The client who paid (also on the booking; kept here so the payment record stands on its own).</summary>
    public int ClientId { get; set; }

    public PaymentMethod Method { get; set; }

    /// <summary>Deposit only, or the full appointment amount.</summary>
    public PaymentOption Option { get; set; } = PaymentOption.Deposit;

    /// <summary>Amount charged.</summary>
    public decimal Amount { get; set; }

    /// <summary>The appointment total when this payment was made, and what was left to pay after it.</summary>
    public decimal TotalAmount { get; set; }
    public decimal BalanceAfter { get; set; }

    /// <summary>Set when an administrator checks the payment while confirming the booking.</summary>
    public DateTime? VerifiedAt { get; set; }
    public int? VerifiedByUserId { get; set; }

    /// <summary>Reference number returned by the payment provider (Ref 12.2).</summary>
    public string ReferenceNumber { get; set; } = "";

    /// <summary>Client-generated key that makes repeated Pay clicks safe (Ref 12.4).</summary>
    public Guid IdempotencyKey { get; set; }

    public PaymentStatus Status { get; set; }
    public DateTime PaidAt { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class Cancellation
{
    public int Id { get; set; }
    public int BookingId { get; set; }
    public Booking Booking { get; set; } = null!;

    public int CancelledByUserId { get; set; }
    public User CancelledBy { get; set; } = null!;

    /// <summary>Enum member name of a <see cref="ClientCancellationReason"/> or <see cref="AdminCancellationReason"/>.</summary>
    public string Reason { get; set; } = "";

    /// <summary>Optional administrator explanation (Ref 3.2).</summary>
    public string? Explanation { get; set; }

    public DateTime CancelledAt { get; set; }
}

public class AuditLog
{
    public int Id { get; set; }
    public int? UserId { get; set; }
    public User? User { get; set; }
    public string Action { get; set; } = "";
    public string? EntityType { get; set; }
    public string? EntityId { get; set; }
    public string? Details { get; set; }
    public string? IpAddress { get; set; }
    public DateTime CreatedAt { get; set; }
}

/// <summary>A blocked whole day (no <see cref="StartTime"/>) or a blocked period from StartTime to EndTime (Ref 11.4).</summary>
public class BlockedSlot : ISoftDeletable
{
    public int Id { get; set; }
    public DateOnly Date { get; set; }
    public TimeOnly? StartTime { get; set; }
    public TimeOnly? EndTime { get; set; }
    public string? Reason { get; set; }
    public int CreatedByUserId { get; set; }
    public User CreatedBy { get; set; } = null!;
    public DateTime CreatedAt { get; set; }
    public bool IsDeleted { get; set; }

    public bool IsWholeDay => StartTime is null;
}

/// <summary>Single-use email verification codes and password reset links. Only a SHA-256 hash is stored.</summary>
public class UserToken
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public User User { get; set; } = null!;
    public UserTokenPurpose Purpose { get; set; }
    public string TokenHash { get; set; } = "";
    public DateTime ExpiresAt { get; set; }
    public DateTime? ConsumedAt { get; set; }
    public int FailedAttempts { get; set; }
    public DateTime CreatedAt { get; set; }

    public bool IsExpired(DateTime utcNow) => ExpiresAt <= utcNow;
}
