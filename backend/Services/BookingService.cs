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
    /// <summary>Any booking's payment receipt, for the salon's own records.</summary>
    Task<ReceiptResponse> GetReceiptAsync(int bookingId, CancellationToken ct = default);
    /// <summary>The administrator checks the payment and confirms the booking (a separate step from paying).</summary>
    Task<BookingResponse> ConfirmAsync(int adminId, int bookingId, CancellationToken ct = default);
    Task<BookingResponse> CompleteAsync(int bookingId, CompleteBookingRequest? request = null, CancellationToken ct = default);

    /// <summary>The balance of an already completed booking was paid later.</summary>
    Task<BookingResponse> RecordBalanceAsync(int bookingId, RecordBalanceRequest request, CancellationToken ct = default);

    /// <summary>Leyah sent back what a cancelled or no-show booking was owed.</summary>
    Task<BookingResponse> RecordRefundAsync(int bookingId, RecordRefundRequest request, CancellationToken ct = default);

    /// <summary>Leyah says whether she has the shade a client asked for.</summary>
    Task<BookingResponse> DecideColorRequestAsync(int bookingId, ColorRequestDecision decision, CancellationToken ct = default);

    /// <summary>The client did not come; only possible once the appointment time has arrived.</summary>
    Task<BookingResponse> MarkNoShowAsync(int bookingId, CancellationToken ct = default);
    Task<BookingResponse> RescheduleAsync(int bookingId, RescheduleRequest request, CancellationToken ct = default);
    Task<BookingResponse> CancelAsync(int adminId, int bookingId, AdminCancelRequest request, CancellationToken ct = default);

    /// <summary>
    /// Leyah books an appointment herself, for a client with an account or a walk-in without one. It is confirmed
    /// straight away, and whatever was already paid (cash, GCash or Maya) is recorded as received and checked.
    /// </summary>
    Task<BookingResponse> CreateByAdminAsync(int adminId, AdminCreateBookingRequest request, CancellationToken ct = default);
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
    IOptions<LegalOptions> legalOptions,
    ISalonProfileService salonProfile,
    IBookingRulesService bookingRules,
    IUserRepository users) : IClientBookingService, IAdminBookingService
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
        var rules = await bookingRules.GetAsync(ct);
        var colorRequest = ResolveColorRequest(selection.Service, request.ColorRequest, request.ColorRequestImageId);
        var perNailColors = ResolvePerNailColors(selection.Service, request.PerNailColors, rules);
        // A colour request, or a colour on every nail, stands in for the one main colour.
        var everyNail = request.PerNailColors is { Left: { } l, Right: { } r } && l.Count(c => !string.IsNullOrWhiteSpace(c)) == StoneAddOn.MaxNailsPerHand
                        && r.Count(c => !string.IsNullOrWhiteSpace(c)) == StoneAddOn.MaxNailsPerHand;
        var nailColor = ResolveColor(selection.Service, request.NailColor, colorRequest is not null || (perNailColors is not null && everyNail), rules);
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
                    PerNailColors = perNailColors,
                    ColorRequest = colorRequest,
                    ColorRequestStatus = colorRequest is null ? null : ColorRequestStatus.Pending,
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
                if (colorRequest is not null && request.ColorRequestImageId is { } colorImageId)
                    await referenceImages.AttachColorReferenceAsync(clientId, booking, colorImageId, tx);

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
        return (new CreateBookingResponse(Map(details, includeClient: false, rules.RescheduleLimit), BookingMapper.ToReceipt(outcome.Payment, details)), true);
    }

    public async Task<IReadOnlyList<BookingResponse>> GetHistoryAsync(int clientId, CancellationToken ct = default)
    {
        var limit = (await bookingRules.GetAsync(ct)).RescheduleLimit;
        return (await bookings.GetForClientAsync(clientId, ct)).Select(b => Map(b, includeClient: false, limit)).ToList();
    }

    public async Task<BookingResponse> GetAsync(int clientId, int bookingId, CancellationToken ct = default) =>
        Map(await GetOwnedAsync(clientId, bookingId, ct), includeClient: false, (await bookingRules.GetAsync(ct)).RescheduleLimit);

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
        var rules = await bookingRules.GetAsync(ct);
        if (booking.RescheduleCount >= rules.RescheduleLimit)
            throw new ConflictException(
                rules.RescheduleLimit == 0
                    ? "Appointments can't be rescheduled online. Please message Leyah if you need to move it."
                    : $"This appointment has already been rescheduled {rules.RescheduleLimit} {(rules.RescheduleLimit == 1 ? "time" : "times")}. Please message Leyah if you need to move it again.",
                "reschedule_limit_reached");
        var minimumHours = rules.RescheduleMinimumHours;
        if ((booking.StartsAtLocal - clock.LocalNow).TotalHours < minimumHours)
            throw new ConflictException(
                $"Appointments can only be rescheduled at least {minimumHours} hours before the scheduled time.", "reschedule_window_passed");

        var (fromDate, fromTime) = (booking.BookingDate, booking.StartTime);
        var moved = await MoveAsync(booking, request, ct, countForClient: true);
        if (await salonProfile.WantsAlertAsync(SalonAlert.Reschedule, ct))
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
        await CancelCoreAsync(booking, clientId, request.Reason.ToString(), explanation, fullRefund: false, ct);
        var cancelled = await ReloadAsync(booking.Id, ct);
        var reasonLabel = Labels.ForCancellationReason(request.Reason.ToString()) + (explanation is null ? "" : $": {explanation}");
        if (await salonProfile.WantsAlertAsync(SalonAlert.Cancellation, ct))
            await background.EnqueueAsync((n, stop) => n.SendSalonCancellationAsync(cancelled, reasonLabel, stop), $"cancellation alert for booking {booking.Id}");
        return Map(cancelled, includeClient: false);
    }

    /// <summary>
    /// The colour must be one on the salon's list; a removal on its own has none. With a colour request the client
    /// describes a shade that isn't listed, so no listed colour is needed.
    /// </summary>
    private string? ResolveColor(CatalogService service, string? requested, bool hasColorRequest, BookingRules? rules)
    {
        var color = string.IsNullOrWhiteSpace(requested) ? null : InputNormalizer.Text(requested);
        if (!service.NeedsColor())
            return null;
        var colors = bookingOptions.Value.NailColors;
        if (colors.Length == 0)
            return color; // no list configured: nothing to choose from, so nothing is required
        if (color is null)
            return hasColorRequest ? null : throw new ValidationAppException("nailColor", "Choose a nail colour.");
        var listed = MatchListed(color) ?? throw new ValidationAppException("nailColor", "Choose one of the listed colours.");
        return InStock(listed, rules, "nailColor");
    }

    /// <summary>Clients can't pick a shade Leyah has run out of; she can (rules is null for her own bookings).</summary>
    private static string InStock(string listed, BookingRules? rules, string field) =>
        rules is not null && rules.IsOutOfStock(listed)
            ? throw new ValidationAppException(field, $"{listed} is out of stock at the moment. Please choose another shade.", "color_out_of_stock")
            : listed;

    private string? MatchListed(string color) =>
        bookingOptions.Value.NailColors.FirstOrDefault(c => string.Equals(c, color, StringComparison.OrdinalIgnoreCase));

    /// <summary>"Can't find your colour?": a photo needs a description, and only a new set has a colour.</summary>
    private static string? ResolveColorRequest(CatalogService service, string? description, int? imageId)
    {
        var text = string.IsNullOrWhiteSpace(description) ? null : InputNormalizer.Text(description);
        if (text is null && imageId is not null)
            throw new ValidationAppException("colorRequest", "Describe the colour you're looking for.");
        return service.NeedsColor() ? text : null;
    }

    /// <summary>Each nail's colour, from the chart only; stored as JSON with five places per hand, thumb first.</summary>
    private string? ResolvePerNailColors(CatalogService service, NailColorsRequest? requested, BookingRules rules)
    {
        if (requested is null || !service.NeedsColor())
            return null;
        string?[] Hand(IReadOnlyList<string?>? nails, string field)
        {
            var result = new string?[StoneAddOn.MaxNailsPerHand];
            for (var i = 0; i < Math.Min(result.Length, nails?.Count ?? 0); i++)
            {
                var color = string.IsNullOrWhiteSpace(nails![i]) ? null : InputNormalizer.Text(nails[i]!);
                if (color is null)
                    continue;
                result[i] = InStock((MatchListed(color) is { } listed && listed.StartsWith('#') ? listed : null)
                            ?? throw new ValidationAppException(field, "Choose each nail's colour from the colour chart."), rules, field);
            }
            return result;
        }
        var left = Hand(requested.Left, "perNailColors.left");
        var right = Hand(requested.Right, "perNailColors.right");
        if (left.All(c => c is null) && right.All(c => c is null))
            return null;
        return PerNailColorsJson.Write(left, right);
    }

    // ---- Administrator operations ----

    public async Task<BookingResponse> CreateByAdminAsync(int adminId, AdminCreateBookingRequest request, CancellationToken ct = default)
    {
        // Who it is for: a client with an account, or a walk-in typed in by name (the booking then sits on Leyah's account).
        var guestName = string.IsNullOrWhiteSpace(request.GuestName) ? null : InputNormalizer.Text(request.GuestName);
        var guestPhone = string.IsNullOrWhiteSpace(request.GuestPhone) ? null : request.GuestPhone.Trim();
        int clientId;
        if (request.ClientId is { } id)
        {
            var client = await users.GetByIdAsync(id, ct);
            if (client is not { Role: UserRole.Client, IsDeleted: false })
                throw new ValidationAppException("clientId", "Choose a client from the list.");
            clientId = client.Id;
            guestName = null;
            guestPhone = null;
        }
        else
        {
            if (guestName is null)
                throw new ValidationAppException("guestName", "Choose a client, or type the walk-in client's name.");
            if (guestName.Length > InputLimits.GuestNameMaxLength)
                throw new ValidationAppException("guestName", $"The name must be {InputLimits.GuestNameMaxLength} characters or fewer.");
            if (guestPhone is not null && (guestPhone.Length != InputLimits.PhoneDigits || !guestPhone.All(char.IsAsciiDigit)))
                throw new ValidationAppException("guestPhone", "Not a valid phone number.");
            clientId = adminId;
        }

        PaymentOption? paidOption = request.Paid switch
        {
            "None" or null or "" => null,
            "Deposit" => PaymentOption.Deposit,
            "Full" => PaymentOption.Full,
            _ => throw new ValidationAppException("paid", "Choose what was paid: nothing yet, the deposit or the full amount."),
        };
        var reference = CleanBalanceReference(request.PaymentReference);

        var selection = await prices.ResolveSelectionAsync(request.ServiceId, request.AddOns, request.RemovalServiceId, ct);
        // Leyah may leave the colour for the salon, and may use a shade she has just run out of.
        var nailColor = string.IsNullOrWhiteSpace(request.NailColor) ? null : ResolveColor(selection.Service, request.NailColor, hasColorRequest: true, rules: null);
        var quote = prices.Calculate(selection);
        var duration = selection.DurationMinutes;
        await slots.EnsureBookableAsync(request.BookingDate, request.StartTime, duration, movingBookingId: null, ct);

        Booking created;
        try
        {
            created = await unitOfWork.ExecuteInTransactionAsync(async tx =>
            {
                await bookings.LockDayAsync(request.BookingDate, tx);
                await slots.EnsureFreeAsync(request.BookingDate, request.StartTime, duration, movingBookingId: null, tx);

                var now = clock.UtcNow;
                var booking = new Booking
                {
                    ClientId = clientId,
                    GuestName = guestName,
                    GuestPhone = guestPhone,
                    CreatedByAdmin = true,
                    ServiceId = selection.Service.Id,
                    ServicePrice = selection.Service.CalculatePrice(1),
                    RemovalServiceId = selection.Removal?.Id,
                    RemovalPrice = selection.Removal?.CalculatePrice(1) ?? 0,
                    NailColor = nailColor,
                    DepositAmount = quote.Deposit,
                    BookingDate = request.BookingDate,
                    StartTime = request.StartTime,
                    DurationMinutes = duration,
                    Note = string.IsNullOrWhiteSpace(request.Note) ? null : InputNormalizer.Text(request.Note),
                    Status = BookingStatus.Pending,
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
                await unitOfWork.SaveChangesAsync(tx); // assigns the id

                if (paidOption is { } option)
                {
                    var amount = booking.AmountFor(option);
                    payments.Add(new Payment
                    {
                        BookingId = booking.Id,
                        ClientId = clientId,
                        Method = request.PaymentMethod,
                        Option = option,
                        Amount = amount,
                        TotalAmount = booking.TotalPrice,
                        BalanceAfter = Math.Max(0, booking.TotalPrice - amount),
                        // Cash has no provider reference; the booking number keeps the receipt readable.
                        ReferenceNumber = reference ?? $"{request.PaymentMethod.ToString().ToUpperInvariant()}-{booking.Id}",
                        IdempotencyKey = Guid.NewGuid(),
                        Status = PaymentStatus.Succeeded,
                        PaidAt = now,
                        CreatedAt = now,
                        VerifiedAt = now,
                        VerifiedByUserId = adminId,
                    });
                    booking.RecordPayment(option, amount);
                }
                booking.Confirm(adminId, now);
                audit.Record(AuditActions.BookingCreatedByAdmin, nameof(Booking), booking.Id,
                    $"{selection.Service.Name}{(selection.Removal is { } r ? $" + removal ({r.Name})" : "")} on {Describe(booking.BookingDate, booking.StartTime)} for "
                    + (guestName is null ? $"client #{clientId}" : $"walk-in {guestName}")
                    + (paidOption is { } o ? $", {Labels.For(o).ToLowerInvariant()} PHP {booking.AmountPaid:0.00} by {request.PaymentMethod}" : ", nothing paid yet"));
                await unitOfWork.SaveChangesAsync(tx);
                return booking;
            }, ct);
        }
        catch (UniqueConstraintViolationException ex) when (ex.IndexName == IndexNames.BookingsActiveSlot)
        {
            throw new ConflictException(SlotTakenMessage, "slot_unavailable");
        }

        var details = await ReloadAsync(created.Id, ct);
        // A client with an account hears about it like any confirmed booking; a walk-in has no email to send to.
        if (guestName is null)
            await background.EnqueueAsync((n, stop) => n.SendBookingApprovedAsync(details, stop), $"confirmed email for booking {details.Id}");
        return Map(details, includeClient: true);
    }

    public async Task<PagedResponse<BookingResponse>> SearchAsync(BookingSearchQuery query, CancellationToken ct = default)
    {
        var page = Math.Max(1, query.Page);
        var pageSize = Math.Clamp(query.PageSize, 1, 100);
        var (items, total) = await bookings.SearchAsync(
            new BookingSearchCriteria(query.Date, query.Status, query.ClientName, page, pageSize, query.ServiceId, query.Open), ct);
        return new PagedResponse<BookingResponse>(items.Select(b => Map(b, includeClient: true)).ToList(), page, pageSize, total);
    }

    public async Task<BookingResponse> GetAsync(int bookingId, CancellationToken ct = default) =>
        Map(await ReloadAsync(bookingId, ct), includeClient: true);

    async Task<ReceiptResponse> IAdminBookingService.GetReceiptAsync(int bookingId, CancellationToken ct)
    {
        var booking = await ReloadAsync(bookingId, ct);
        var payment = await paymentService.GetDepositAsync(booking.Id, ct)
                      ?? throw new NotFoundException("No payment has been recorded for this booking.");
        return BookingMapper.ToReceipt(payment, booking);
    }

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

    public async Task<BookingResponse> RecordRefundAsync(int bookingId, RecordRefundRequest request, CancellationToken ct = default)
    {
        var reference = CleanBalanceReference(request.RefundReference, "refundReference");
        var booking = await ReloadAsync(bookingId, ct);
        var amount = booking.RecordRefund(reference, clock.UtcNow);
        audit.Record(AuditActions.RefundSent, nameof(Booking), booking.Id,
            $"PHP {amount:0.00}{(reference is null ? "" : $" (reference {reference})")}");
        await unitOfWork.SaveChangesAsync(ct);
        return Map(booking, includeClient: true);
    }

    public async Task<BookingResponse> DecideColorRequestAsync(int bookingId, ColorRequestDecision decision, CancellationToken ct = default)
    {
        var booking = await ReloadAsync(bookingId, ct);
        booking.DecideColorRequest(decision.Available, clock.UtcNow);
        audit.Record(AuditActions.ColorRequestDecided, nameof(Booking), booking.Id,
            $"'{booking.ColorRequest}': {(decision.Available ? "available" : "not available")}");
        await unitOfWork.SaveChangesAsync(ct);
        return Map(booking, includeClient: true);
    }

    public async Task<BookingResponse> MarkNoShowAsync(int bookingId, CancellationToken ct = default)
    {
        var booking = await ReloadAsync(bookingId, ct);
        booking.MarkNoShow(clock.LocalNow, clock.UtcNow);
        audit.Record(AuditActions.BookingNoShow, nameof(Booking), booking.Id,
            $"Deposit of PHP {Math.Min(booking.AmountPaid, booking.DepositAmount):0.00} kept" +
            (booking.RefundDue > 0 ? $"; refund due PHP {booking.RefundDue:0.00}" : ""));
        await unitOfWork.SaveChangesAsync(ct);
        return Map(booking, includeClient: true);
    }

    private void RecordBalance(Booking booking, string? reference, DateTime utcNow)
    {
        var amount = booking.RecordBalance(reference, utcNow);
        audit.Record(AuditActions.BalanceReceived, nameof(Booking), booking.Id,
            $"PHP {amount:0.00}{(reference is null ? "" : $" (reference {reference})")}");
    }

    private static string? CleanBalanceReference(string? reference, string field = "balanceReference")
    {
        if (string.IsNullOrWhiteSpace(reference))
            return null;
        var cleaned = InputNormalizer.Text(reference);
        if (cleaned.Length > InputLimits.BalanceReferenceMaxLength)
            throw new ValidationAppException(field, $"The reference must be {InputLimits.BalanceReferenceMaxLength} characters or fewer.");
        return cleaned;
    }

    public async Task<BookingResponse> RescheduleAsync(int bookingId, RescheduleRequest request, CancellationToken ct = default) =>
        await MoveAsync(await ReloadAsync(bookingId, ct), request, ct, includeClient: true);

    public async Task<BookingResponse> CancelAsync(int adminId, int bookingId, AdminCancelRequest request, CancellationToken ct = default)
    {
        var booking = await ReloadAsync(bookingId, ct);
        // The salon cancelling is not the client's doing, so everything comes back; a client who stopped answering keeps the
        // usual rule (the deposit is kept).
        var fullRefund = request.Reason != AdminCancellationReason.ClientDidNotRespond;
        await CancelCoreAsync(booking, adminId, request.Reason.ToString(), request.Explanation, fullRefund, ct);
        return Map(await ReloadAsync(bookingId, ct), includeClient: true);
    }

    // ---- Shared ----

    private async Task CancelCoreAsync(Booking booking, int cancelledByUserId, string reason, string? explanation, bool fullRefund, CancellationToken ct)
    {
        if (!booking.CanBeCancelled)
            throw new ConflictException($"A {booking.Status} booking cannot be cancelled.", "invalid_status");

        var now = clock.UtcNow;
        booking.MarkCancelled(now, fullRefund);
        bookings.AddCancellation(new Cancellation
        {
            BookingId = booking.Id,
            CancelledByUserId = cancelledByUserId,
            Reason = reason,
            Explanation = string.IsNullOrWhiteSpace(explanation) ? null : InputNormalizer.Text(explanation),
            CancelledAt = now,
        });
        audit.Record(AuditActions.BookingCancelled, nameof(Booking), booking.Id,
            $"Reason: {Labels.ForCancellationReason(reason)}. " +
            (booking.RefundDue > 0 ? $"Refund due: PHP {booking.RefundDue:0.00}." : "Nothing to refund (the deposit is kept)."));
        await unitOfWork.SaveChangesAsync(ct);
    }

    private async Task<BookingResponse> MoveAsync(Booking booking, RescheduleRequest request, CancellationToken ct, bool includeClient = false, bool countForClient = false)
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
                if (countForClient)
                    booking.RescheduleCount++;
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
        if (await salonProfile.WantsAlertAsync(SalonAlert.NewBooking))
            await background.EnqueueAsync((n, stop) => n.SendSalonNewBookingAsync(booking, payment, stop), $"new booking alert for booking {booking.Id}");
    }

    private static BookingResponse Map(Booking booking, bool includeClient, int rescheduleLimit = Booking.ClientRescheduleLimit) =>
        BookingMapper.ToResponse(booking, includeClient, rescheduleLimit);

    private static string Describe(DateOnly date, TimeOnly time) => $"{date:yyyy-MM-dd} {time:HH\\:mm}";

    private sealed record CreateOutcome(Payment Payment, Booking? NewBooking);
}

public static class BookingMapper
{
    public static BookingResponse ToResponse(Booking b, bool includeClient, int rescheduleLimit = Booking.ClientRescheduleLimit) => new(
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
            ? new ClientSummaryResponse(b.Client.Id, b.Client.FirstName, b.Client.LastName, b.Client.Username, b.Client.Email, b.Client.PhoneNumber,
                ClientProfileService.AdminPhotoUrl(b.Client), b.GuestName is null ? b.Client.AdminNote : null)
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
        b.TermsAcceptedAt,
        PerNailColorsJson.Read(b.PerNailColors),
        b.ColorRequest,
        b.ColorRequestStatus?.ToString(),
        b.RescheduleCount,
        rescheduleLimit,
        b.GuestName,
        b.GuestPhone,
        b.CreatedByAdmin);

    // The first successful payment (bookings are paid once, when they are made).
    private static BookingPaymentResponse PaymentOf(Booking b)
    {
        var p = b.Payments.Where(x => x.Status == PaymentStatus.Succeeded).OrderBy(x => x.PaidAt).FirstOrDefault();
        return new BookingPaymentResponse(
            b.PaymentOption.ToString(), Labels.For(b.PaymentOption), b.AmountPaid, p?.ReferenceNumber, p?.Method.ToString(), p?.PaidAt,
            Verified: p?.VerifiedAt is not null, b.ConfirmedAt, b.ConfirmedBy is { } admin ? $"{admin.FirstName} {admin.LastName}" : null,
            b.BalanceReceived, b.BalanceReceivedAt, b.BalanceReference,
            b.RefundDue, b.RefundSentAt, b.RefundReference);
    }

    public static ReceiptResponse ToReceipt(Payment p, Booking b) => new(
        p.Id, b.Id, p.ReferenceNumber, p.Method.ToString(), p.Amount, "PHP", p.PaidAt, p.Status.ToString(),
        Refundable: false, b.ServiceDescription, b.BookingDate, b.StartTime,
        p.Option.ToString(), Labels.For(p.Option), b.TotalPrice, b.BalanceDue, b.Status.ToString(),
        ClientName: b.GuestName ?? (b.Client is { } c ? $"{c.FirstName} {c.LastName}" : null),
        Lines: ReceiptLines(b),
        Verified: p.VerifiedAt is not null,
        VerifiedAt: p.VerifiedAt,
        AmountPaid: b.AmountPaid,
        RefundDue: b.RefundDue,
        RefundSentAt: b.RefundSentAt,
        RefundReference: b.RefundReference);

    /// <summary>The removal first, as in the appointment, then the service and each Stone add-on.</summary>
    private static List<ReceiptLineResponse> ReceiptLines(Booking b)
    {
        var lines = new List<ReceiptLineResponse>();
        if (b.RemovalService is { } removal)
            lines.Add(new($"Removal ({removal.Name})", b.RemovalPrice));
        lines.Add(new(b.Service?.Name ?? "Service", b.ServicePrice));
        lines.AddRange(b.AddOns.Select(a => new ReceiptLineResponse(
            $"{a.AddOn?.Name ?? "Stone add-on"} ({Labels.For(a.Hand).ToLowerInvariant()}, {a.NailCount} {(a.NailCount == 1 ? "nail" : "nails")})", a.LinePrice)));
        return lines;
    }
}

/// <summary>The per-nail colours column: {"left":[5],"right":[5]}, a null for a nail with the main colour.</summary>
public static class PerNailColorsJson
{
    private sealed record Stored(string?[] Left, string?[] Right);

    private static readonly System.Text.Json.JsonSerializerOptions Options = new(System.Text.Json.JsonSerializerDefaults.Web);

    public static string Write(string?[] left, string?[] right) => System.Text.Json.JsonSerializer.Serialize(new Stored(left, right), Options);

    public static NailColorsRequest? Read(string? json)
    {
        if (string.IsNullOrEmpty(json))
            return null;
        var stored = System.Text.Json.JsonSerializer.Deserialize<Stored>(json, Options);
        return stored is null ? null : new NailColorsRequest(stored.Left, stored.Right);
    }
}
