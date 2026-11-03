using NailsByLeah.Api.Errors;

namespace NailsByLeah.Api.Domain;

public class Booking : IPayable, ICancellable, ISoftDeletable
{
    public int Id { get; set; }

    public int ClientId { get; set; }
    public User Client { get; set; } = null!;

    public int ServiceId { get; set; }
    public CatalogService Service { get; set; } = null!;

    /// <summary>Price of the main service when the booking was made (Ref 13.6).</summary>
    public decimal ServicePrice { get; set; }

    /// <summary>Deposit charged for this booking. Non-refundable.</summary>
    public decimal DepositAmount { get; set; }

    public DateOnly BookingDate { get; set; }
    public TimeOnly StartTime { get; set; }

    /// <summary>Length of the service when the booking was made, so later duration changes don't move existing appointments.</summary>
    public int DurationMinutes { get; set; }

    /// <summary>Scheduled completion. The 30-minute gap before the next appointment starts here.</summary>
    public TimeOnly EndTime => StartTime.AddMinutes(DurationMinutes);

    /// <summary>What the client typed for Leyah (optional).</summary>
    public string? Note { get; set; }

    /// <summary>The note to show in emails and lists.</summary>
    public string NoteText => Note ?? Labels.NoNote;

    public BookingStatus Status { get; set; } = BookingStatus.Pending;

    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public DateTime? ReminderSentAt { get; set; }
    public bool IsDeleted { get; set; }

    /// <summary>Optimistic concurrency token.</summary>
    public byte[] RowVersion { get; set; } = [];

    public List<BookingAddOn> AddOns { get; set; } = [];
    public List<Payment> Payments { get; set; } = [];
    public Cancellation? Cancellation { get; set; }

    /// <summary>Photos of the design the client wants (optional).</summary>
    public List<ReferenceImage> ReferenceImages { get; set; } = [];

    /// <summary>Whether the client paid the deposit or the whole total when booking.</summary>
    public PaymentOption PaymentOption { get; set; } = PaymentOption.Deposit;

    /// <summary>Verified amount paid online. The deposit is part of it; prices are those stored when the booking was made.</summary>
    public decimal AmountPaid { get; set; }

    /// <summary>When and by whom the administrator confirmed the booking after checking its payment.</summary>
    public DateTime? ConfirmedAt { get; set; }
    public int? ConfirmedByUserId { get; set; }
    public User? ConfirmedBy { get; set; }

    public decimal TotalPrice => ServicePrice + AddOns.Sum(a => a.LinePrice);

    /// <summary>Amount still to be paid at the salon: nothing after a full payment.</summary>
    public decimal BalanceDue => Math.Max(0, TotalPrice - AmountPaid);

    public DateTime StartsAtLocal => BookingDate.ToDateTime(StartTime);

    public bool IsActive => Status is BookingStatus.Pending or BookingStatus.Confirmed;

    public bool CanBeCancelled => IsActive;

    // A full payment is the total, and never less than the non-refundable deposit it includes.
    public decimal AmountFor(PaymentOption option) => option == PaymentOption.Full ? Math.Max(TotalPrice, DepositAmount) : DepositAmount;

    public void RecordPayment(PaymentOption option, decimal amount)
    {
        if (Status != BookingStatus.Pending)
            throw new ConflictException($"A {Status} booking cannot take a new payment.", "invalid_status");
        if (AmountPaid > 0)
            throw new ConflictException("This booking has already been paid.", "already_paid");
        PaymentOption = option;
        AmountPaid = amount;
    }

    /// <summary>The administrator has checked the payment and accepts the appointment.</summary>
    public void Confirm(int adminId, DateTime utcNow)
    {
        if (Status != BookingStatus.Pending)
            throw new ConflictException($"A {Status} booking cannot be confirmed.", "invalid_status");
        Status = BookingStatus.Confirmed;
        ConfirmedAt = utcNow;
        ConfirmedByUserId = adminId;
        UpdatedAt = utcNow;
    }

    public void MarkCancelled(DateTime utcNow)
    {
        if (!CanBeCancelled)
            throw new ConflictException($"A {Status} booking cannot be cancelled.", "invalid_status");
        Status = BookingStatus.Cancelled;
        UpdatedAt = utcNow;
    }

    public void MarkCompleted(DateTime utcNow)
    {
        if (Status != BookingStatus.Confirmed)
            throw new ConflictException("Only confirmed bookings can be completed.", "invalid_status");
        Status = BookingStatus.Completed;
        UpdatedAt = utcNow;
    }

    public void MoveTo(DateOnly date, TimeOnly startTime, DateTime utcNow)
    {
        if (!IsActive)
            throw new ConflictException($"A {Status} booking cannot be rescheduled.", "invalid_status");
        BookingDate = date;
        StartTime = startTime;
        ReminderSentAt = null;
        UpdatedAt = utcNow;
    }
}

public class BookingAddOn
{
    public int Id { get; set; }
    public int BookingId { get; set; }
    public Booking Booking { get; set; } = null!;

    public int AddOnId { get; set; }
    public StoneAddOn AddOn { get; set; } = null!;

    public int NailCount { get; set; }

    /// <summary>The hand the add-on goes on. Bookings made before hands were asked for are stored as Both.</summary>
    public NailHand Hand { get; set; } = NailHand.Both;

    /// <summary>Amount charged for this add-on line when the booking was made (Ref 13.6).</summary>
    public decimal LinePrice { get; set; }
}

/// <summary>
/// A booking a client started but has not paid for yet, so they can continue later (on any device). It is never an
/// appointment: it holds no time slot, and it is deleted when the booking is made. The selections are kept as the
/// client's own JSON and are checked again in full when the booking is submitted.
/// </summary>
public class BookingDraft
{
    public int Id { get; set; }
    public int ClientId { get; set; }
    public User Client { get; set; } = null!;
    public string Data { get; set; } = "{}";
    public DateTime UpdatedAt { get; set; }
}

/// <summary>A client's star rating of the salon, with an optional comment.</summary>
public class Feedback
{
    public const int MinRating = 1;
    public const int MaxRating = 5;

    public int Id { get; set; }
    public int ClientId { get; set; }
    public User Client { get; set; } = null!;
    public int Rating { get; set; }
    public string? Comment { get; set; }

    /// <summary>Sent by the browser with each submission, so a double click is saved once.</summary>
    public Guid SubmissionKey { get; set; }

    public DateTime CreatedAt { get; set; }
}
