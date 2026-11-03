using NailsByLeah.Api.Domain;

namespace NailsByLeah.Api.Contracts;

// Request and response shapes for the HTTP API. Responses are JSON, which the serializer
// escapes (< and > become < / >), so stored user text is never returned as HTML (Ref 1.1).

public sealed record MessageResponse(string Message);

public sealed record PagedResponse<T>(IReadOnlyList<T> Items, int Page, int PageSize, int TotalCount);

// ---- Authentication ----

public sealed record RegisterRequest(
    string FirstName,
    string LastName,
    string Username,
    string Email,
    string PhoneNumber,
    string Password,
    string ConfirmPassword,
    bool AcceptTerms);

public sealed record RegisterResponse(int UserId, string Message);

public sealed record UsernameAvailabilityResponse(string Username, bool Available, string Message);

public sealed record VerifyEmailRequest(string Email, string Code);

public sealed record EmailRequest(string Email);

public sealed record LoginRequest(string UsernameOrEmail, string Password);

/// <summary>The new password is entered once; the form has a show/hide toggle instead of a second field.</summary>
public sealed record ResetPasswordRequest(string Token, string NewPassword);

public sealed record UserProfileResponse(
    int Id, string FirstName, string LastName, string Username, string Email, string PhoneNumber, string Role);

// ---- Catalog and pricing ----

public sealed record ServiceItemResponse(
    int Id, string Category, string CategoryLabel, string Name, decimal Price, string PricingUnit, int MaxQuantity, bool IsActive,
    int? DurationMinutes = null); // minutes for main services; null for add-ons

public sealed record CatalogResponse(
    IReadOnlyList<ServiceItemResponse> Services,
    IReadOnlyList<ServiceItemResponse> AddOns,
    decimal DepositAmount,
    bool DepositRefundable,
    string Currency);

/// <summary>Hand is required when booking (Left or Right for up to 5 nails, Both for any number); price quotes ignore it.</summary>
public sealed record AddOnSelection(int AddOnId, int NailCount, NailHand? Hand = null);

public sealed record QuoteRequest(int ServiceId, IReadOnlyList<AddOnSelection>? AddOns);

public sealed record QuoteLineResponse(
    int ItemId, string Name, string Category, string PricingUnit, decimal UnitPrice, int Quantity, decimal LineTotal);

public sealed record PriceQuoteResponse(
    IReadOnlyList<QuoteLineResponse> Lines, decimal Total, decimal Deposit, decimal BalanceDue, string Currency);

public sealed record CreateServiceRequest(string Category, string Name, decimal Price, int DurationMinutes = CatalogService.DefaultDurationMinutes);

public sealed record CreateAddOnRequest(string Name, decimal Price);

/// <summary>Also used for add-ons, which have no duration. Leaving DurationMinutes out keeps the current one.</summary>
public sealed record UpdateServiceRequest(string Name, decimal Price, bool IsActive, int? DurationMinutes = null);

// ---- Schedule ----

public sealed record SlotResponse(TimeOnly StartTime, TimeOnly EndTime, string Status);

/// <summary>
/// Start times for one day. With a service, a time is Open only if that service fits before the closing time and
/// clear of other appointments and their gap; EndTime is then when the service would finish.
/// </summary>
public sealed record DaySlotsResponse(
    DateOnly Date, bool IsClosed, string? ClosedReason, IReadOnlyList<SlotResponse> Slots,
    TimeOnly OpeningTime, TimeOnly ClosingTime, int DurationMinutes, int BufferMinutes);

/// <summary>Opening hours shown on the website and the scheduling rules behind them.</summary>
public sealed record SalonHoursResponse(TimeOnly OpeningTime, TimeOnly ClosingTime, int SlotIntervalMinutes, int BufferMinutes);

public sealed record UpdateSalonHoursRequest(TimeOnly ClosingTime);

/// <summary>No StartTime blocks the whole day. Without an EndTime one start-time interval (30 minutes) is blocked.</summary>
public sealed record BlockSlotRequest(DateOnly Date, TimeOnly? StartTime, string? Reason, TimeOnly? EndTime = null);

public sealed record BlockedSlotResponse(
    int Id, DateOnly Date, TimeOnly? StartTime, bool IsWholeDay, string? Reason, DateTime CreatedAt, TimeOnly? EndTime = null);

public static class SlotStatuses
{
    public const string Open = "Open";
    public const string Booked = "Booked";
    /// <summary>Closed by the administrator: a break, day off, holiday or any other reason.</summary>
    public const string Closed = "Closed";
    public const string Past = "Past";

    /// <summary>Free, but the chosen service would run past closing or into another appointment, its gap or a blocked period.</summary>
    public const string TooShort = "TooShort";
}

// ---- Bookings and payments ----

public sealed record CreateBookingRequest(
    int ServiceId,
    IReadOnlyList<AddOnSelection>? AddOns,
    DateOnly BookingDate,
    TimeOnly StartTime,
    PaymentMethod PaymentMethod,
    bool DepositAcknowledged,
    Guid IdempotencyKey,
    IReadOnlyList<int>? ReferenceImageIds = null,
    string? Note = null, // typed note for Leyah, optional
    PaymentOption PaymentOption = PaymentOption.Deposit); // the amount is worked out by the server, never sent by the browser

public sealed record RescheduleRequest(DateOnly BookingDate, TimeOnly StartTime);

public sealed record ClientCancelRequest(ClientCancellationReason Reason);

public sealed record AdminCancelRequest(AdminCancellationReason Reason, string? Explanation);

public sealed record ClientSummaryResponse(int Id, string FirstName, string LastName, string Username, string Email, string PhoneNumber);

public sealed record BookingAddOnResponse(int AddOnId, string Name, int NailCount, decimal LinePrice, string Hand, string HandLabel);

public sealed record CancellationResponse(
    string Reason, string ReasonLabel, string? Explanation, string CancelledByRole, DateTime CancelledAt);

public sealed record BookingResponse(
    int Id,
    string Status,
    DateOnly BookingDate,
    TimeOnly StartTime,
    TimeOnly EndTime,
    int ServiceId,
    string ServiceName,
    string ServiceCategory,
    decimal ServicePrice,
    IReadOnlyList<BookingAddOnResponse> AddOns,
    decimal TotalPrice,
    decimal DepositAmount,
    decimal BalanceDue,
    DateTime CreatedAt,
    CancellationResponse? Cancellation,
    ClientSummaryResponse? Client,
    IReadOnlyList<ReferenceImageResponse> ReferenceImages,
    int DurationMinutes,
    string? Note = null, // what the client typed for Leyah; null when there is no note
    BookingPaymentResponse? Payment = null);

/// <summary>
/// How the booking was paid. AmountPaid includes the deposit; BalanceDue on the booking is what is left for the salon.
/// Verified means an administrator checked the payment when confirming the booking.
/// </summary>
public sealed record BookingPaymentResponse(
    string Option, string OptionLabel, decimal AmountPaid, string? ReferenceNumber, string? Method, DateTime? PaidAt,
    bool Verified, DateTime? ConfirmedAt, string? ConfirmedBy);

/// <summary>An uploaded design photo. The file is at GET /api/reference-images/{id}.</summary>
public sealed record ReferenceImageResponse(int Id, string ContentType, long SizeBytes, DateTime CreatedAt);

public sealed record ReceiptResponse(
    int PaymentId,
    int BookingId,
    string ReferenceNumber,
    string Method,
    decimal Amount,
    string Currency,
    DateTime PaidAt,
    string Status,
    bool Refundable,
    string ServiceName,
    DateOnly BookingDate,
    TimeOnly StartTime,
    string PaymentOption = "Deposit",
    string PaymentOptionLabel = "Booking deposit",
    decimal TotalAmount = 0,
    decimal BalanceDue = 0,
    string BookingStatus = "Pending");

public sealed record CreateBookingResponse(BookingResponse Booking, ReceiptResponse Receipt);

public sealed class BookingSearchQuery
{
    public DateOnly? Date { get; set; }
    public BookingStatus? Status { get; set; }
    public string? ClientName { get; set; }
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 20;
}

// ---- Booking drafts ----

/// <summary>The booking a client started, as the booking page saved it (service, add-ons, time, note, photo ids).</summary>
public sealed record BookingDraftResponse(System.Text.Json.JsonElement Data, DateTime UpdatedAt, string Status = "Draft");

public sealed record SaveBookingDraftRequest(System.Text.Json.JsonElement Data);

// ---- Customer feedback ----

/// <summary>Comment is optional. Resending the same SubmissionKey returns the first result instead of saving twice.</summary>
public sealed record SubmitFeedbackRequest(int Rating, string? Comment, Guid SubmissionKey);

public sealed record FeedbackResponse(int Id, int Rating, string? Comment, DateTime CreatedAt, ClientSummaryResponse? Client);

public sealed record FeedbackListResponse(
    IReadOnlyList<FeedbackResponse> Items, int Page, int PageSize, int TotalCount, decimal AverageRating,
    IReadOnlyDictionary<int, int> CountsByRating);

// ---- Administration ----

public sealed record DashboardResponse(
    DateOnly Today,
    int TodaysBookingCount,
    IReadOnlyList<BookingResponse> TodaysBookings,
    int PendingBookingCount,
    decimal DepositsCollectedToday,
    decimal TotalDepositsCollected);

public sealed record DailySalesReport(
    DateOnly Date,
    int BookingsMade,
    int BookingsCompleted,
    int BookingsCancelled,
    decimal DepositsCollected,
    decimal CompletedServicesValue);

public sealed record MonthlySalesReport(
    int Year,
    int Month,
    int BookingsMade,
    int BookingsCompleted,
    int BookingsCancelled,
    decimal DepositsCollected,
    decimal CompletedServicesValue,
    IReadOnlyList<DailySalesReport> Days);

public sealed record ActivityLogResponse(
    int Id, int? UserId, string? Username, string Action, string? EntityType, string? EntityId,
    string? Details, string? IpAddress, DateTime CreatedAt);

public sealed class ActivityLogQuery
{
    public int? UserId { get; set; }
    public string? Action { get; set; }
    public DateTime? FromUtc { get; set; }
    public DateTime? ToUtc { get; set; }
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 50;
}

// ---- Lookups for dropdowns ----

public sealed record LookupItem(string Value, string Label);

public sealed record LookupsResponse(
    IReadOnlyList<string> NoteSuggestions, // one-tap additions to the typed note for Leyah
    IReadOnlyList<LookupItem> ClientCancellationReasons,
    IReadOnlyList<LookupItem> AdminCancellationReasons,
    IReadOnlyList<LookupItem> PaymentMethods,
    IReadOnlyList<LookupItem> BookingStatuses,
    string TermsVersion);
