namespace NailsByLeah.Api.Domain;

// Small, role-specific interfaces (Interface Segregation Principle, Ref 5.4).
// Each consumer depends only on the operations it actually needs.

/// <summary>Records that are never physically deleted (Ref 13.5).</summary>
public interface ISoftDeletable
{
    bool IsDeleted { get; set; }
}

/// <summary>An account that can sign in. Used by the authentication service.</summary>
public interface IAuthenticatable
{
    int Id { get; }
    string PasswordHash { get; }
    bool EmailVerified { get; }
    string SecurityStamp { get; }
    DateTime? LockoutEndUtc { get; }

    bool IsLockedOut(DateTime utcNow);

    /// <summary>Counts a failed attempt. Returns true when this attempt locked the account.</summary>
    bool RegisterFailedLogin(DateTime utcNow, int maxAttempts, TimeSpan lockoutDuration);

    void RegisterSuccessfulLogin();
}

/// <summary>Something that can be paid for when it is booked. Used by the payment service.</summary>
public interface IPayable
{
    int Id { get; }
    int ClientId { get; }
    decimal DepositAmount { get; }
    decimal TotalPrice { get; }
    decimal AmountPaid { get; }
    BookingStatus Status { get; }

    /// <summary>What the client pays now for <paramref name="option"/>: the deposit, or the whole total (never less than the deposit).</summary>
    decimal AmountFor(PaymentOption option);

    /// <summary>
    /// Records a verified payment. The booking stays Pending: only an administrator confirms it, as a separate step.
    /// </summary>
    void RecordPayment(PaymentOption option, decimal amount);
}

/// <summary>Something that can be cancelled by a client or an administrator.</summary>
public interface ICancellable
{
    int Id { get; }
    BookingStatus Status { get; }
    bool CanBeCancelled { get; }

    /// <summary>fullRefund: the salon cancelled, so everything paid goes back, the deposit included.</summary>
    void MarkCancelled(DateTime utcNow, bool fullRefund);
}
