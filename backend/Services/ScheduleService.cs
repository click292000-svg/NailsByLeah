using Microsoft.Extensions.Options;
using NailsByLeah.Api.Configuration;
using NailsByLeah.Api.Contracts;
using NailsByLeah.Api.Data;
using NailsByLeah.Api.Domain;
using NailsByLeah.Api.Errors;
using NailsByLeah.Api.Infrastructure;
using NailsByLeah.Api.Validation;

namespace NailsByLeah.Api.Services;

/// <summary>Read side of the schedule, used by clients and by the booking service.</summary>
public interface ISlotAvailability
{
    /// <summary>Opening and closing time, shown on the website.</summary>
    Task<SalonHoursResponse> GetHoursAsync(CancellationToken ct = default);

    /// <summary>One day's start times. With a service, each time says whether that service fits there.</summary>
    Task<DaySlotsResponse> GetDayAsync(DateOnly date, int? serviceId, CancellationToken ct = default);

    /// <summary>
    /// Every rule for an appointment of <paramref name="durationMinutes"/> at this time, for a clear early answer.
    /// <paramref name="movingBookingId"/> is the booking being rescheduled, which must not clash with itself.
    /// </summary>
    Task EnsureBookableAsync(DateOnly date, TimeOnly startTime, int durationMinutes, int? movingBookingId, CancellationToken ct = default);

    /// <summary>
    /// The checks that depend on other bookings and blocked time, repeated after
    /// <see cref="IBookingRepository.LockDayAsync"/> inside the booking transaction so that the answer can't
    /// change before the booking is committed.
    /// </summary>
    Task EnsureFreeAsync(DateOnly date, TimeOnly startTime, int durationMinutes, int? movingBookingId, CancellationToken ct = default);
}

/// <summary>Administrator tools: days off, holidays, blocked periods (Ref 11.4) and the closing time.</summary>
public interface IScheduleManagement
{
    Task<IReadOnlyList<BlockedSlotResponse>> GetBlockedAsync(DateOnly from, DateOnly to, CancellationToken ct = default);
    Task<BlockedSlotResponse> BlockAsync(int adminId, BlockSlotRequest request, CancellationToken ct = default);
    Task UnblockAsync(int id, CancellationToken ct = default);
    Task<SalonHoursResponse> UpdateHoursAsync(int adminId, UpdateSalonHoursRequest request, CancellationToken ct = default);
}

/// <summary>
/// Appointment times. Appointments start on a 30-minute grid from the 11:00 AM opening time, must finish by
/// the closing time, and every appointment keeps the 30 minutes after its scheduled end free, so with a
/// 60-minute service at 11:00 the next appointment can start at 12:30.
/// </summary>
public sealed class ScheduleService(
    IBookingRepository bookings,
    IBlockedSlotRepository blockedSlots,
    IServiceCatalogRepository catalog,
    ISalonSettingsRepository settings,
    IUnitOfWork unitOfWork,
    IAuditLogger audit,
    ISalonClock clock,
    IOptions<ScheduleOptions> scheduleOptions) : ISlotAvailability, IScheduleManagement
{
    private const string ClashMessage =
        "This time overlaps another appointment or the 30-minute break after it. Please choose another time.";
    private const string BlockedMessage = "This time is not available. Please choose another one.";

    private readonly ScheduleOptions _options = scheduleOptions.Value;

    private int Interval => _options.SlotIntervalMinutes;
    private int Buffer => _options.BufferMinutes;
    private int Opening => DayPeriod.ToMinutes(_options.OpeningTime);

    public async Task<SalonHoursResponse> GetHoursAsync(CancellationToken ct = default) =>
        new(_options.OpeningTime, (await settings.GetAsync(ct)).ClosingTime, Interval, Buffer);

    public async Task<DaySlotsResponse> GetDayAsync(DateOnly date, int? serviceId, CancellationToken ct = default)
    {
        var duration = Interval;
        if (serviceId is { } id)
        {
            var service = await catalog.FindServiceAsync(id, ct);
            if (service is null || !service.IsAvailable)
                throw new ValidationAppException("serviceId", "The selected service is not available.");
            duration = service.DurationMinutes;
        }

        var closingTime = (await settings.GetAsync(ct)).ClosingTime;
        var closing = DayPeriod.ToMinutes(closingTime);
        var starts = StartTimes(closing);
        var blocks = await blockedSlots.GetForDateAsync(date, ct);
        DaySlotsResponse Day(bool closed, IEnumerable<SlotResponse> slots) => new(
            date, closed, closed ? "Closed" : null, slots.ToList(), _options.OpeningTime, closingTime, duration, Buffer);

        if (_options.ClosedDays.Contains(date.DayOfWeek) || blocks.Any(b => b.IsWholeDay))
            return Day(true, starts.Select(s => Slot(s, duration, SlotStatuses.Closed)));

        var blocked = blocks.Select(BlockedPeriod).ToList();
        var occupied = (await bookings.GetActiveOnDateAsync(date, ct))
            .Select(a => DayPeriod.Occupied(a.StartTime, a.DurationMinutes, Buffer)).ToList();
        var now = clock.LocalNow;
        var beyondWindow = date > clock.Today.AddDays(_options.MaxDaysAhead);

        return Day(false, starts.Select(start =>
        {
            var minute = DayPeriod.ToMinutes(start);
            var service = DayPeriod.From(start, duration);
            var status =
                date.ToDateTime(start) <= now ? SlotStatuses.Past
                : beyondWindow || blocked.Any(b => b.Contains(minute)) ? SlotStatuses.Closed
                : occupied.Any(o => o.Contains(minute)) ? SlotStatuses.Booked
                : service.End > closing || blocked.Any(b => b.Overlaps(service))
                  || occupied.Any(o => o.Overlaps(DayPeriod.Occupied(start, duration, Buffer))) ? SlotStatuses.TooShort
                : SlotStatuses.Open;
            return Slot(start, duration, status);
        }));
    }

    public async Task EnsureBookableAsync(DateOnly date, TimeOnly startTime, int durationMinutes, int? movingBookingId, CancellationToken ct = default)
    {
        var start = DayPeriod.ToMinutes(startTime);
        if (start < Opening)
            throw new ValidationAppException("startTime", $"Appointments can't start before the {Format(_options.OpeningTime)} opening time.");
        if ((start - Opening) % Interval != 0)
            throw new ValidationAppException("startTime", "Please choose one of the available appointment times.");
        if (date.ToDateTime(startTime) <= clock.LocalNow)
            throw new ValidationAppException("bookingDate", "Please choose a future date and time.");
        if (date > clock.Today.AddDays(_options.MaxDaysAhead))
            throw new ValidationAppException("bookingDate", $"Bookings can be made up to {_options.MaxDaysAhead} days in advance.");
        if (_options.ClosedDays.Contains(date.DayOfWeek))
            throw new ConflictException("The salon is closed on this day.", "slot_unavailable");

        await EnsureFreeAsync(date, startTime, durationMinutes, movingBookingId, ct);
    }

    public async Task EnsureFreeAsync(DateOnly date, TimeOnly startTime, int durationMinutes, int? movingBookingId, CancellationToken ct = default)
    {
        var closingTime = (await settings.GetAsync(ct)).ClosingTime;
        var service = DayPeriod.From(startTime, durationMinutes);
        if (service.End > DayPeriod.ToMinutes(closingTime))
            throw new ConflictException(
                $"This service takes {Duration(durationMinutes)}, so it would end after closing time ({Format(closingTime)}). Please choose an earlier time.",
                "slot_unavailable");

        var blocks = await blockedSlots.GetForDateAsync(date, ct);
        if (blocks.Any(b => b.IsWholeDay))
            throw new ConflictException("The salon is closed on this day.", "slot_unavailable");
        if (blocks.Any(b => BlockedPeriod(b).Overlaps(service)))
            throw new ConflictException(BlockedMessage, "slot_unavailable");

        var occupied = DayPeriod.Occupied(startTime, durationMinutes, Buffer);
        var others = await bookings.GetActiveOnDateAsync(date, ct);
        if (others.Any(a => a.BookingId != movingBookingId && DayPeriod.Occupied(a.StartTime, a.DurationMinutes, Buffer).Overlaps(occupied)))
            throw new ConflictException(ClashMessage, "slot_unavailable");
    }

    public async Task<IReadOnlyList<BlockedSlotResponse>> GetBlockedAsync(DateOnly from, DateOnly to, CancellationToken ct = default)
    {
        if (to < from)
            throw new ValidationAppException("to", "The end date must be on or after the start date.");
        return (await blockedSlots.GetInRangeAsync(from, to, ct)).Select(ToResponse).ToList();
    }

    public async Task<BlockedSlotResponse> BlockAsync(int adminId, BlockSlotRequest request, CancellationToken ct = default)
    {
        if (request.Date < clock.Today)
            throw new ValidationAppException("date", "Past dates cannot be blocked.");

        TimeOnly? endTime = null;
        if (request.StartTime is { } startTime)
        {
            var start = DayPeriod.ToMinutes(startTime);
            endTime = request.EndTime ?? startTime.AddMinutes(Interval);
            var end = DayPeriod.ToMinutes(endTime.Value);
            var closing = (await settings.GetAsync(ct)).ClosingTime;
            if (start < Opening || (start - Opening) % Interval != 0 || (end - Opening) % Interval != 0 || end <= start)
                throw new ValidationAppException("startTime", "Please choose one of the appointment times.");
            if (end > DayPeriod.ToMinutes(closing))
                throw new ValidationAppException("endTime", $"The blocked time must end by closing time ({Format(closing)}).");
        }

        var slot = new BlockedSlot
        {
            Date = request.Date,
            StartTime = request.StartTime,
            EndTime = endTime,
            Reason = string.IsNullOrWhiteSpace(request.Reason) ? null : InputNormalizer.Text(request.Reason),
            CreatedByUserId = adminId,
            CreatedAt = clock.UtcNow,
        };

        // Under the same day lock as bookings, so a booking can't slip into the period while it is being blocked.
        await unitOfWork.ExecuteInTransactionAsync(async tx =>
        {
            await bookings.LockDayAsync(request.Date, tx);

            var existing = await blockedSlots.GetForDateAsync(request.Date, tx);
            if (existing.Any(b => b.IsWholeDay || (!slot.IsWholeDay && BlockedPeriod(b).Overlaps(BlockedPeriod(slot)))))
                throw new ConflictException("This date or time is already blocked.", "already_blocked");

            var active = await bookings.GetActiveOnDateAsync(request.Date, tx);
            if (active.Any(a => slot.IsWholeDay || DayPeriod.From(a.StartTime, a.DurationMinutes).Overlaps(BlockedPeriod(slot))))
                throw new ConflictException(
                    "There are active bookings in this period. Reschedule or cancel them before blocking it.", "has_active_bookings");

            blockedSlots.Add(slot);
            await unitOfWork.SaveChangesAsync(tx); // assigns the id for the activity log
            audit.Record(AuditActions.SlotBlocked, nameof(BlockedSlot), slot.Id, Describe(slot));
            return slot.Id;
        }, ct);

        return ToResponse(slot);
    }

    public async Task UnblockAsync(int id, CancellationToken ct = default)
    {
        var slot = await blockedSlots.FindAsync(id, ct) ?? throw new NotFoundException("Blocked slot not found.");
        slot.IsDeleted = true;
        audit.Record(AuditActions.SlotUnblocked, nameof(BlockedSlot), slot.Id, Describe(slot));
        await unitOfWork.SaveChangesAsync(ct);
    }

    public async Task<SalonHoursResponse> UpdateHoursAsync(int adminId, UpdateSalonHoursRequest request, CancellationToken ct = default)
    {
        var closing = DayPeriod.ToMinutes(request.ClosingTime);
        var latest = 24 * 60 - Interval;
        if (closing < Opening + 60 || closing > latest || (closing - Opening) % Interval != 0)
            throw new ValidationAppException("closingTime",
                $"Choose a closing time between {Format(_options.OpeningTime.AddHours(1))} and {Format(TimeOnly.FromTimeSpan(TimeSpan.FromMinutes(latest)))}, on the hour or half hour.");

        // Appointments already booked are never cut short: they have to be moved first.
        var lateAppointments = (await bookings.GetActiveFromDateAsync(clock.Today, ct))
            .Count(a => DayPeriod.From(a.StartTime, a.DurationMinutes).End > closing);
        if (lateAppointments > 0)
            throw new ConflictException(
                $"{lateAppointments} booked appointment(s) end after {Format(request.ClosingTime)}. Reschedule or cancel them before closing earlier.",
                "has_active_bookings");

        var current = await settings.GetAsync(ct);
        var previous = current.ClosingTime;
        current.ClosingTime = request.ClosingTime;
        current.UpdatedAt = clock.UtcNow;
        current.UpdatedByUserId = adminId;
        audit.Record(AuditActions.SalonHoursChanged, nameof(SalonSettings), current.Id,
            $"Closing time {Format(previous)} -> {Format(request.ClosingTime)}");
        await unitOfWork.SaveChangesAsync(ct);
        return new SalonHoursResponse(_options.OpeningTime, current.ClosingTime, Interval, Buffer);
    }

    /// <summary>Every start time from opening up to (not including) the closing time.</summary>
    private List<TimeOnly> StartTimes(int closing)
    {
        var starts = new List<TimeOnly>();
        for (var minute = Opening; minute < closing; minute += Interval)
            starts.Add(TimeOnly.FromTimeSpan(TimeSpan.FromMinutes(minute)));
        return starts;
    }

    private static SlotResponse Slot(TimeOnly start, int duration, string status) => new(start, start.AddMinutes(duration), status);

    private DayPeriod BlockedPeriod(BlockedSlot b) =>
        b.IsWholeDay ? new DayPeriod(0, 24 * 60) : DayPeriod.Between(b.StartTime!.Value, b.EndTime ?? b.StartTime.Value.AddMinutes(Interval));

    private static string Format(TimeOnly time) => time.ToString("h:mm tt", System.Globalization.CultureInfo.InvariantCulture);

    private static string Duration(int minutes) => (minutes / 60, minutes % 60) switch
    {
        (0, var m) => $"{m} minutes",
        (var h, 0) => h == 1 ? "1 hour" : $"{h} hours",
        (var h, var m) => $"{h} h {m} min",
    };

    private static BlockedSlotResponse ToResponse(BlockedSlot s) =>
        new(s.Id, s.Date, s.StartTime, s.IsWholeDay, s.Reason, s.CreatedAt, s.EndTime);

    private static string Describe(BlockedSlot s) =>
        s.IsWholeDay ? $"{s.Date:yyyy-MM-dd} (whole day)" : $"{s.Date:yyyy-MM-dd} {s.StartTime:HH\\:mm}-{s.EndTime:HH\\:mm}";
}
