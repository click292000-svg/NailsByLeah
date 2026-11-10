using Microsoft.Extensions.Options;
using NailsByLeah.Api.Configuration;
using NailsByLeah.Api.Contracts;
using NailsByLeah.Api.Data;
using NailsByLeah.Api.Domain;
using NailsByLeah.Api.Errors;
using NailsByLeah.Api.Infrastructure;
using NailsByLeah.Api.Notifications;
using NailsByLeah.Api.Validation;

namespace NailsByLeah.Api.Services;

/// <summary>Booking operations available to clients.</summary>
public interface IClientBookingService
{
    /// <summary>Creates, pays for and confirms a booking. <c>Created</c> is false when an earlier identical request is replayed.</summary>
    Task<(CreateBookingResponse Response, bool Created)> CreateAsync(int clientId, CreateBookingRequest request, CancellationToken ct = default);

    Task<IReadOnlyList<BookingResponse>> GetHistoryAsync(int clientId, CancellationToken ct = default);
    Task<BookingResponse> GetAsync(int clientId, int bookingId, CancellationToken ct = default);
    Task<ReceiptResponse> GetReceiptAsync(int clientId, int bookingId, CancellationToken ct = default);
    Task<BookingResponse> RescheduleAsync(int clientId, int bookingId, RescheduleRequest request, CancellationToken ct = default);
    Task<BookingResponse> CancelAsync(int clientId, int bookingId, ClientCancelRequest request, CancellationToken ct = default);
}

/// <summary>Booking operations available to administrators (Ref 11.2, 11.5).</summary>
public interface IAdminBookingService
{
    Task<PagedResponse<BookingResponse>> SearchAsync(BookingSearchQuery query, CancellationToken ct = default);

    /// <summary>The admin calendar: booking counts for each day of a month that has any.</summary>
    Task<IReadOnlyList<BookingCalendarDayResponse>> GetCalendarAsync(int year, int month, CancellationToken ct = default);
    Task<BookingResponse> GetAsync(int bookingId, CancellationToken ct = default);
    /// <summary>The administrator checks the payment and confirms the booking (a separate step from paying).</summary>
    Task<BookingResponse> ConfirmAsync(int adminId, int bookingId, CancellationToken ct = default);
    Task<BookingResponse> CompleteAsync(int bookingId, CompleteBookingRequest? request = null, CancellationToken ct = default);

    /// <summary>The balance of an already completed booking was paid later.</summary>
    Task<BookingResponse> RecordBalanceAsync(int bookingId, RecordBalanceRequest request, CancellationToken ct = default);

    /// <summary>The client did not come; only possible once the appointment time has arrived.</summary>
    Task<BookingResponse> MarkNoShowAsync(int bookingId, CancellationToken ct = default);
    Task<BookingResponse> RescheduleAsync(int bookingId, RescheduleRequest request, CancellationToken ct = default);
    Task<BookingResponse> CancelAsync(int adminId, int bookingId, AdminCancelRequest request, CancellationToken ct = default);
}

/// <summary>Creates and manages bookings (Single Responsibility: BookingService, Ref 5.1).</summary>
public sealed class BookingService(
    IBookingRepository bookings,
    IPaymentRepository payments,
    IPriceService prices,
    IPaymentService paymentService,
    ISlotAvailability slots,
    IBackgroundNotifications background,
    IReferenceImageAttacher referenceImages,
    IBookingDraftRepository drafts,
    IUnitOfWork unitOfWork,
    IAuditLogger audit,
    ISalonClock clock,
    IOptions<BookingOptions> bookingOptions,
    IOptions<LegalOptions> legalOptions) : IClientBookingService, IAdminBookingService
{
    private const string SlotTakenMessage = "This time slot has just been booked by someone else. Please choose another slot.";

    // ---- Client operations ----

    public async Task<(CreateBookingResponse Response, bool Created)> CreateAsync(
        int clientId, CreateBookingRequest request, CancellationToken ct = default)
    {
        // Enforced here as well as in the request validator, so no caller can skip it (Ref 2.3).
        if (!request.DepositAcknowledged)
            throw new ValidationAppException("depositAcknowledged", CreateBookingRequestValidator.DepositAcknowledgementMessage, "deposit_not_acknowledged");

        // A repeated Pay click after the first request finished returns the original result (Ref 12.4).
        if (await payments.FindByIdempotencyKeyAsync(request.IdempotencyKey, ct) is { } earlier)
            return (await BuildCreateResponseAsync(clientId, earlier, ct), false);

        // The client must have agreed to the Terms version in force now, not one shown before an update.
        if (request.TermsVersion != legalOptions.Value.TermsVersion)
            throw new ConflictException(
                "The booking policy and Terms & Conditions have been updated. Please read them again and agree before paying.", "terms_outdated");

        var selection = await prices.ResolveSelectionAsync(request.ServiceId, request.AddOns, request.RemovalServiceId, ct);
        var nailColor = ResolveColor(selection.Service, request.NailColor);
        var quote = prices.Calculate(selection);
        var duration = selection.DurationMinutes;
        try
        {
            await slots.EnsureBookableAsync(request.BookingDate, request.StartTime, duration, movingBookingId: null, ct);
        }
        catch (ConflictException)
        {
            // A duplicate click whose first request committed after the check above sees its own booking as
            // taking the slot; return the first result instead of "slot taken".
            if (await payments.FindByIdempotencyKeyAsync(request.IdempotencyKey, ct) is { } committed)
                return (await BuildCreateResponseAsync(clientId, committed, ct), false);
            throw;
        }

        CreateOutcome outcome;
        try
        {
            // Slot reservation, booking creation and deposit payment succeed or fail together (Ref 6.1).
            outcome = await unitOfWork.ExecuteInTransactionAsync(async tx =>
            {
                // Bookings for the same day queue here, so each one sees every appointment committed before it.
                await bookings.LockDayAsync(request.BookingDate, tx);

                // A duplicate click that arrived at the same time waited on the lock above; return the first result.
                if (await payments.FindByIdempotencyKeyAsync(request.IdempotencyKey, tx) is { } concurrent)
                    return new CreateOutcome(concurrent, null);

                await slots.EnsureFreeAsync(request.BookingDate, request.StartTime, duration, movingBookingId: null, tx);

                var now = clock.UtcNow;
                var booking = new Booking
                {
                    ClientId = clientId,
                    ServiceId = selection.Service.Id,
                    ServicePrice = selection.Service.CalculatePrice(1),
                    RemovalServiceId = selection.Removal?.Id,
                    RemovalPrice = selection.Removal?.CalculatePrice(1) ?? 0,
                    NailColor = nailColor,
                    TermsVersion = legalOptions.Value.TermsVersion,
                    DepositAmount = quote.Deposit,
                    BookingDate = request.BookingDate,
                    StartTime = request.StartTime,
                    DurationMinutes = duration,
                    Note = string.IsNullOrWhiteSpace(request.Note) ? null : InputNormalizer.Text(request.Note),
                    Status = BookingStatus.Pending,
                    TermsAcceptedAt = now,
                    CreatedAt = now,
                    UpdatedAt = now,
                    AddOns = selection.AddOns.Select(a => new BookingAddOn
                    {
                        AddOnId = a.AddOn.Id,
                        NailCount = a.NailCount,
                        Hand = a.Hand,
                        LinePrice = a.AddOn.CalculatePrice(a.NailCount),
                    }).ToList(),
                };
                bookings.Add(booking);
                await unitOfWork.SaveChangesAsync(tx); // assigns the id; still uncommitted

                // Design photos uploaded during the booking become part of it (rolled back with everything else).
                await referenceImages.AttachAsync(clientId, booking, request.ReferenceImageIds, tx);

                // The draft has become a real booking. Deleted in this transaction, so a failed payment keeps it.
                await drafts.DeleteForClientAsync(clientId, tx);

                var payment = await paymentService.CollectAsync(booking, request.PaymentOption, request.PaymentMethod, request.IdempotencyKey, tx);
                audit.Record(AuditActions.BookingCreated, nameof(Booking), booking.Id,
                    $"{selection.Service.Name}{(selection.Removal is { } r ? $" + removal ({r.Name})" : "")} on {Describe(booking.BookingDate, booking.StartTime)}, total PHP {booking.TotalPrice:0.00}. Booking policy and Terms v{legalOptions.Value.TermsVersion} accepted");
                return new CreateOutcome(payment, booking);
            }, ct);
        }
        catch (PaymentFailedException ex)
        {
            audit.Record(AuditActions.PaymentFailed, nameof(Booking), null,
                $"{request.PaymentMethod} deposit for {Describe(request.BookingDate, request.StartTime)}: {ex.Message}");
            await unitOfWork.SaveChangesAsync(ct);
            throw;
        }
        catch (UniqueConstraintViolationException ex) when (ex.IndexName == IndexNames.BookingsActiveSlot)
        {
            throw new ConflictException(SlotTakenMessage, "slot_unavailable");
        }
        catch (UniqueConstraintViolationException ex) when (ex.IndexName == IndexNames.PaymentsIdempotencyKey)
        {
            var winner = await payments.FindByIdempotencyKeyAsync(request.IdempotencyKey, ct);
            if (winner is null)
                throw;
            return (await BuildCreateResponseAsync(clientId, winner, ct), false);
        }

        if (outcome.NewBooking is null)
            return (await BuildCreateResponseAsync(clientId, outcome.Payment, ct), false);

        var details = await bookings.GetDetailsAsync(outcome.NewBooking.Id, ct) ?? outcome.NewBooking;
        await NotifyConfirmedAsync(details, outcome.Payment);
        return (new CreateBookingResponse(Map(details, includeClient: false), BookingMapper.ToReceipt(outcome.Payment, details)), true);
    }

    public async Task<IReadOnlyList<BookingResponse>> GetHistoryAsync(int clientId, CancellationToken ct = default) =>
        (await bookings.GetForClientAsync(clientId, ct)).Select(b => Map(b, includeClient: false)).ToList();

    public async Task<BookingResponse> GetAsync(int clientId, int bookingId, CancellationToken ct = default) =>
        Map(await GetOwnedAsync(clientId, bookingId, ct), includeClient: false);

    public async Task<ReceiptResponse> GetReceiptAsync(int clientId, int bookingId, CancellationToken ct = default)
    {
        var booking = await GetOwnedAsync(clientId, bookingId, ct);
        var payment = await paymentService.GetDepositAsync(booking.Id, ct)
                      ?? throw new NotFoundException("No payment has been recorded for this booking.");
        return BookingMapper.ToReceipt(payment, booking);
    }

    public async Task<BookingResponse> RescheduleAsync(int clientId, int bookingId, RescheduleRequest request, CancellationToken ct = default)
    {
        var booking = await GetOwnedAsync(clientId, bookingId, ct);
        var minimumHours = bookingOptions.Value.RescheduleMinimumHours;
        if ((booking.StartsAtLocal - clock.LocalNow).TotalHours < minimumHours)
            throw new ConflictException(
                $"Appointments can only be rescheduled at least {minimumHours} hours before the scheduled time.", "reschedule_window_passed");

        var (fromDate, fromTime) = (booking.BookingDate, booking.StartTime);
        var moved = await MoveAsync(booking, request, ct);
        await background.EnqueueAsync((n, stop) => n.SendSalonRescheduleAsync(booking, fromDate, fromTime, stop), $"reschedule alert for booking {booking.Id}");
        return moved;
    }

    public async Task<BookingResponse> CancelAsync(int clientId, int bookingId, ClientCancelRequest request, CancellationToken ct = default)
    {
        var booking = await GetOwnedAsync(clientId, bookingId, ct);
        if (booking.StartsAtLocal <= clock.LocalNow)
            throw new ConflictException("This appointment has already started or passed and can no longer be cancelled.", "invalid_status");

        // Only "Others" takes the client's own words; the listed reasons speak for themselves.
        var explanation = request.Reason == ClientCancellationReason.Others ? InputNormalizer.Text(request.Explanation) : null;
        if (request.Reason == ClientCancellationReason.Others && string.IsNullOrEmpty(explanation))
            throw new ValidationAppException("explanation", ClientCancelRequestValidator.ExplanationRequired);
        await CancelCoreAsync(booking, clientId, request.Reason.ToString(), explanation, ct);
        var cancelled = await ReloadAsync(booking.Id, ct);
        var reasonLabel = Labels.ForCancellationReason(request.Reason.ToString()) + (explanation is null ? "" : $": {explanation}");
        await background.EnqueueAsync((n, stop) => n.SendSalonCancellationAsync(cancelled, reasonLabel, stop), $"cancellation alert for booking {booking.Id}");
        return Map(cancelled, includeClient: false);
    }

    /// <summary>The colour must be one on the salon's list; a removal on its own has none.</summary>
    private string? ResolveColor(CatalogService service, string? requested)
    {
        var color = string.IsNullOrWhiteSpace(requested) ? null : InputNormalizer.Text(requested);
        if (!service.NeedsColor())
            return null;
        var colors = bookingOptions.Value.NailColors;
        if (colors.Length == 0)
            return color; // no list configured: nothing to choose from, so nothing is required
        if (color is null)
            throw new ValidationAppException("nailColor", "Choose a nail colour.");
        return colors.FirstOrDefault(c => string.Equals(c, color, StringComparison.OrdinalIgnoreCase))
               ?? throw new ValidationAppException("nailColor", "Choose one of the listed colours.");
    }

    // ---- Administrator operations ----

    public async Task<PagedResponse<BookingResponse>> SearchAsync(BookingSearchQuery query, CancellationToken ct = default)
    {
        var page = Math.Max(1, query.Page);
        var pageSize = Math.Clamp(query.PageSize, 1, 100);
        var (items, total) = await bookings.SearchAsync(
            new BookingSearchCriteria(query.Date, query.Status, query.ClientName, page, pageSize, query.ServiceId), ct);
        return new PagedResponse<BookingResponse>(items.Select(b => Map(b, includeClient: true)).ToList(), page, pageSize, total);
    }

    public async Task<BookingResponse> GetAsync(int bookingId, CancellationToken ct = default) =>
        Map(await ReloadAsync(bookingId, ct), includeClient: true);

    public async Task<IReadOnlyList<BookingCalendarDayResponse>> GetCalendarAsync(int year, int month, CancellationToken ct = default)
    {
        if (year is < 2000 or > 2100 || month is < 1 or > 12)
            throw new ValidationAppException("month", "Choose a valid month.");
        // Booking dates are stored as the salon's (Manila) calendar dates, so a month is just its first to last day.
        var first = new DateOnly(year, month, 1);
        return (await bookings.CountByDayAsync(first, first.AddMonths(1).AddDays(-1), ct))
            .Select(d => new BookingCalendarDayResponse(d.Date, d.Count, d.ActiveCount)).ToList();
    }

    public async Task<BookingResponse> ConfirmAsync(int adminId, int bookingId, CancellationToken ct = default)
    {
        var booking = await ReloadAsync(bookingId, ct);
        var payment = await paymentService.GetDepositAsync(booking.Id, ct)
                      ?? throw new ConflictException("No payment has been received for this booking yet.", "deposit_not_received");

        var now = clock.UtcNow;
        booking.Confirm(adminId, now);
        payment.VerifiedAt = now;
        payment.VerifiedByUserId = adminId;
        audit.Record(AuditActions.BookingConfirmed, nameof(Booking), booking.Id,
            $"{Labels.For(booking.PaymentOption)} PHP {booking.AmountPaid:0.00} verified (reference {payment.ReferenceNumber})");
        await unitOfWork.SaveChangesAsync(ct);

        var confirmed = await ReloadAsync(bookingId, ct);
        await background.EnqueueAsync((n, stop) => n.SendBookingApprovedAsync(confirmed, stop), $"confirmed email for booking {bookingId}");
        return Map(confirmed, includeClient: true);
    }

    public async Task<BookingResponse> CompleteAsync(int bookingId, CompleteBookingRequest? request = null, CancellationToken ct = default)
    {
        var reference = CleanBalanceReference(request?.BalanceReference);
        var booking = await ReloadAsync(bookingId, ct);
        if (booking.BookingDate > clock.Today)
            throw new ConflictException("A booking can only be completed on or after its appointment date.", "invalid_status");

        var now = clock.UtcNow;
        booking.MarkCompleted(now);
        audit.Record(AuditActions.BookingCompleted, nameof(Booking), booking.Id);
        if (request?.BalanceReceived == true && booking.BalanceDue > 0)
            RecordBalance(booking, reference, now);
        await unitOfWork.SaveChangesAsync(ct);
        return Map(booking, includeClient: true);
    }

    public async Task<BookingResponse> RecordBalanceAsync(int bookingId, RecordBalanceRequest request, CancellationToken ct = default)
    {
        var reference = CleanBalanceReference(request.BalanceReference);
        var booking = await ReloadAsync(bookingId, ct);
        RecordBalance(booking, reference, clock.UtcNow);
        await unitOfWork.SaveChangesAsync(ct);
        return Map(booking, includeClient: true);
    }

    public async Task<BookingResponse> MarkNoShowAsync(int bookingId, CancellationToken ct = default)
    {
        var booking = await ReloadAsync(bookingId, ct);
        booking.MarkNoShow(clock.LocalNow, clock.UtcNow);
        audit.Record(AuditActions.BookingNoShow, nameof(Booking), booking.Id, $"Deposit of PHP {booking.AmountPaid:0.00} kept");
        await unitOfWork.SaveChangesAsync(ct);
        return Map(booking, includeClient: true);
    }

    private void RecordBalance(Booking booking, string? reference, DateTime utcNow)
    {
        var amount = booking.RecordBalance(reference, utcNow);
        audit.Record(AuditActions.BalanceReceived, nameof(Booking), booking.Id,
            $"PHP {amount:0.00}{(reference is null ? "" : $" (reference {reference})")}");
    }

    private static string? CleanBalanceReference(string? reference)
    {
        if (string.IsNullOrWhiteSpace(reference))
            return null;
        var cleaned = InputNormalizer.Text(reference);
        if (cleaned.Length > InputLimits.BalanceReferenceMaxLength)
            throw new ValidationAppException("balanceReference", $"The reference must be {InputLimits.BalanceReferenceMaxLength} characters or fewer.");
        return cleaned;
    }

    public async Task<BookingResponse> RescheduleAsync(int bookingId, RescheduleRequest request, CancellationToken ct = default) =>
        await MoveAsync(await ReloadAsync(bookingId, ct), request, ct, includeClient: true);

    public async Task<BookingResponse> CancelAsync(int adminId, int bookingId, AdminCancelRequest request, CancellationToken ct = default)
    {
        var booking = await ReloadAsync(bookingId, ct);
        await CancelCoreAsync(booking, adminId, request.Reason.ToString(), request.Explanation, ct);
        return Map(await ReloadAsync(bookingId, ct), includeClient: true);
    }

    // ---- Shared ----

    private async Task CancelCoreAsync(ICancellable booking, int cancelledByUserId, string reason, string? explanation, CancellationToken ct)
    {
        if (!booking.CanBeCancelled)
            throw new ConflictException($"A {booking.Status} booking cannot be cancelled.", "invalid_status");

        var now = clock.UtcNow;
        booking.MarkCancelled(now);
        bookings.AddCancellation(new Cancellation
        {
            BookingId = booking.Id,
            CancelledByUserId = cancelledByUserId,
            Reason = reason,
            Explanation = string.IsNullOrWhiteSpace(explanation) ? null : InputNormalizer.Text(explanation),
            CancelledAt = now,
        });
        audit.Record(AuditActions.BookingCancelled, nameof(Booking), booking.Id,
            $"Reason: {Labels.ForCancellationReason(reason)}. The deposit is non-refundable.");
        await unitOfWork.SaveChangesAsync(ct);
    }

    private async Task<BookingResponse> MoveAsync(Booking booking, RescheduleRequest request, CancellationToken ct, bool includeClient = false)
    {
        if (!booking.IsActive)
            throw new ConflictException($"A {booking.Status} booking cannot be rescheduled.", "invalid_status");
        if (booking.BookingDate == request.BookingDate && booking.StartTime == request.StartTime)
            throw new ValidationAppException("startTime", "Choose a different date or time.");

        await slots.EnsureBookableAsync(request.BookingDate, request.StartTime, booking.DurationMinutes, booking.Id, ct);
        var from = Describe(booking.BookingDate, booking.StartTime);

        try
        {
            await unitOfWork.ExecuteInTransactionAsync(async tx =>
            {
                await bookings.LockDayAsync(request.BookingDate, tx);
                await slots.EnsureFreeAsync(request.BookingDate, request.StartTime, booking.DurationMinutes, booking.Id, tx);

                booking.MoveTo(request.BookingDate, request.StartTime, clock.UtcNow);
                audit.Record(AuditActions.BookingRescheduled, nameof(Booking), booking.Id,
                    $"{from} -> {Describe(request.BookingDate, request.StartTime)}");
                return booking.Id;
            }, ct);
        }
        catch (UniqueConstraintViolationException ex) when (ex.IndexName == IndexNames.BookingsActiveSlot)
        {
            throw new ConflictException(SlotTakenMessage, "slot_unavailable");
        }

        return Map(await ReloadAsync(booking.Id, ct), includeClient);
    }

    private async Task<Booking> GetOwnedAsync(int clientId, int bookingId, CancellationToken ct)
    {
        var booking = await bookings.GetDetailsAsync(bookingId, ct);
        // Other clients' bookings look exactly like missing ones.
        return booking is not null && booking.ClientId == clientId ? booking : throw new NotFoundException("Booking not found.");
    }

    private async Task<Booking> ReloadAsync(int bookingId, CancellationToken ct) =>
        await bookings.GetDetailsAsync(bookingId, ct) ?? throw new NotFoundException("Booking not found.");

    private async Task<CreateBookingResponse> BuildCreateResponseAsync(int clientId, Payment payment, CancellationToken ct)
    {
        var booking = await bookings.GetDetailsAsync(payment.BookingId, ct);
        if (booking is null || booking.ClientId != clientId)
            throw new ConflictException("This payment request key has already been used.", "idempotency_key_reused");
        return new CreateBookingResponse(Map(booking, includeClient: false), BookingMapper.ToReceipt(payment, booking));
    }

    /// <summary>The booking is already committed: emails go out after the answer, and a failed one is only logged.</summary>
    private async Task NotifyConfirmedAsync(Booking booking, Payment payment)
    {
        await background.EnqueueAsync((n, stop) => n.SendBookingConfirmationAsync(booking, payment, stop), $"confirmation for booking {booking.Id}");
        await background.EnqueueAsync((n, stop) => n.SendSalonNewBookingAsync(booking, payment, stop), $"new booking alert for booking {booking.Id}");
    }

    private static BookingResponse Map(Booking booking, bool includeClient) => BookingMapper.ToResponse(booking, includeClient);

    private static string Describe(DateOnly date, TimeOnly time) => $"{date:yyyy-MM-dd} {time:HH\\:mm}";

    private sealed record CreateOutcome(Payment Payment, Booking? NewBooking);
}

public static class BookingMapper
{
    public static BookingResponse ToResponse(Booking b, bool includeClient) => new(
        b.Id,
        b.Status.ToString(),
        b.BookingDate,
        b.StartTime,
        b.EndTime,
        b.ServiceId,
        b.Service.Name,
        b.Service.Category,
        b.ServicePrice,
        b.AddOns.Select(a => new BookingAddOnResponse(a.AddOnId, a.AddOn.Name, a.NailCount, a.LinePrice, a.Hand.ToString(), Labels.For(a.Hand))).ToList(),
        b.TotalPrice,
        b.DepositAmount,
        b.BalanceDue,
        b.CreatedAt,
        b.Cancellation is { } c
            ? new CancellationResponse(c.Reason, Labels.ForCancellationReason(c.Reason), c.Explanation,
                c.CancelledBy?.Role.ToString() ?? "", c.CancelledAt)
            : null,
        includeClient
            ? new ClientSummaryResponse(b.Client.Id, b.Client.FirstName, b.Client.LastName, b.Client.Username, b.Client.Email, b.Client.PhoneNumber)
            : null,
        b.ReferenceImages.Where(r => !r.IsDeleted).OrderBy(r => r.Id).Select(ReferenceImageService.ToResponse).ToList(),
        b.DurationMinutes,
        b.Note,
        PaymentOf(b),
        b.RemovalServiceId,
        b.RemovalService?.Name,
        b.RemovalPrice,
        b.NailColor,
        b.TermsVersion,
        b.TermsAcceptedAt);

    // The first successful payment (bookings are paid once, when they are made).
    private static BookingPaymentResponse PaymentOf(Booking b)
    {
        var p = b.Payments.Where(x => x.Status == PaymentStatus.Succeeded).OrderBy(x => x.PaidAt).FirstOrDefault();
        return new BookingPaymentResponse(
            b.PaymentOption.ToString(), Labels.For(b.PaymentOption), b.AmountPaid, p?.ReferenceNumber, p?.Method.ToString(), p?.PaidAt,
            Verified: p?.VerifiedAt is not null, b.ConfirmedAt, b.ConfirmedBy is { } admin ? $"{admin.FirstName} {admin.LastName}" : null,
            b.BalanceReceived, b.BalanceReceivedAt, b.BalanceReference);
    }

    public static ReceiptResponse ToReceipt(Payment p, Booking b) => new(
        p.Id, b.Id, p.ReferenceNumber, p.Method.ToString(), p.Amount, "PHP", p.PaidAt, p.Status.ToString(),
        Refundable: false, b.ServiceDescription, b.BookingDate, b.StartTime,
        p.Option.ToString(), Labels.For(p.Option), b.TotalPrice, b.BalanceDue, b.Status.ToString());
}
