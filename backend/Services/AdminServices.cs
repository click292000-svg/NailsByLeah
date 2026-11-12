using NailsByLeah.Api.Contracts;
using NailsByLeah.Api.Data;
using NailsByLeah.Api.Domain;
using NailsByLeah.Api.Errors;
using NailsByLeah.Api.Infrastructure;

namespace NailsByLeah.Api.Services;

public interface IDashboardService
{
    Task<DashboardResponse> GetAsync(DateOnly? date = null, CancellationToken ct = default);
}

/// <summary>
/// The day's bookings, the next client, things that need Leyah's attention and the next 7 days (Ref 11.1).
/// Another day can be chosen; the attention list and money figures are always as of now.
/// </summary>
public sealed class DashboardService(
    IBookingRepository bookings,
    IPaymentRepository payments,
    ISalonClock clock) : IDashboardService
{
    private const int UpcomingDays = 7;
    private const int BalanceLookbackDays = 30;
    private const int MaxDaysAway = 366;
    private static readonly string[] AttentionOrder = ["CheckPayment", "ColorRequest", "RefundDue", "DatePassed", "BalanceNotRecorded"];

    public async Task<DashboardResponse> GetAsync(DateOnly? date = null, CancellationToken ct = default)
    {
        var today = clock.Today;
        var now = clock.LocalNow;
        var day = date ?? today;
        if (Math.Abs(day.DayNumber - today.DayNumber) > MaxDaysAway)
            throw new ValidationAppException("date", "Choose a date within a year of today.");

        var daysBookings = await bookings.GetForDateAsync(day, ct);
        var (fromUtc, toUtc) = SalonDay.UtcRange(clock, today, today);
        var nowTime = TimeOnly.FromDateTime(now);

        bool IsOver(Booking b) => b.BookingDate < today || (b.BookingDate == today && b.EndTime <= nowTime);

        // The next client: on today, the first appointment that hasn't ended (it may be under way); on a later day, the first one.
        var next = day < today ? null : daysBookings
            .Where(b => b.IsActive && (day > today || b.EndTime > nowTime))
            .OrderBy(b => b.StartTime)
            .FirstOrDefault();

        var attention = new List<DashboardAttentionItem>();
        foreach (var b in await bookings.GetAttentionCandidatesAsync(today, today.AddDays(-BalanceLookbackDays), ct))
        {
            var kind = b.RefundDue > 0 && b.RefundSentAt is null ? "RefundDue" : b.Status switch
            {
                BookingStatus.Pending or BookingStatus.Confirmed when IsOver(b) => "DatePassed",
                BookingStatus.Pending => "CheckPayment",
                BookingStatus.Completed when b.BalanceDue > 0 => "BalanceNotRecorded",
                _ => null,
            };
            if (kind is not null)
                attention.Add(new DashboardAttentionItem(kind, BookingMapper.ToResponse(b, includeClient: true)));
            // A shade the client asked for that Leyah hasn't checked yet, on an appointment still to come.
            if (b.ColorRequestStatus == ColorRequestStatus.Pending && b.IsActive && !IsOver(b))
                attention.Add(new DashboardAttentionItem("ColorRequest", BookingMapper.ToResponse(b, includeClient: true)));
        }
        // Most urgent first: a client who paid is waiting, then appointments left open, then money to note down.
        // OrderBy is stable, so each group keeps its date order.
        attention = attention.OrderBy(a => Array.IndexOf(AttentionOrder, a.Kind)).ToList();

        return new DashboardResponse(
            today,
            daysBookings.Count(b => b.Status != BookingStatus.Cancelled),
            daysBookings.Select(b => BookingMapper.ToResponse(b, includeClient: true)).ToList(),
            await bookings.CountByStatusAsync(BookingStatus.Pending, ct),
            await payments.SumSucceededAsync(fromUtc, toUtc, ct),
            await payments.SumSucceededAsync(null, null, ct),
            (await bookings.GetUpcomingAsync(day.AddDays(1), day.AddDays(UpcomingDays), ct))
                .Select(b => BookingMapper.ToResponse(b, includeClient: true)).ToList(),
            day,
            now,
            attention,
            next is null ? null : BookingMapper.ToResponse(next, includeClient: true));
    }
}

public interface IReportService
{
    Task<DailySalesReport> GetDailyAsync(DateOnly date, CancellationToken ct = default);
    Task<MonthlySalesReport> GetMonthlyAsync(int year, int month, CancellationToken ct = default);
}

/// <summary>Daily and monthly sales reports (Ref 11.6).</summary>
public sealed class ReportService(IBookingRepository bookings, IPaymentRepository payments, ISalonClock clock) : IReportService
{
    public async Task<DailySalesReport> GetDailyAsync(DateOnly date, CancellationToken ct = default) =>
        (await BuildAsync(date, date, ct)).Single();

    public async Task<MonthlySalesReport> GetMonthlyAsync(int year, int month, CancellationToken ct = default)
    {
        if (year is < 2000 or > 2100 || month is < 1 or > 12)
            throw new ValidationAppException("month", "Enter a valid year and month.");

        var first = new DateOnly(year, month, 1);
        var days = await BuildAsync(first, first.AddMonths(1).AddDays(-1), ct);
        return new MonthlySalesReport(
            year, month,
            days.Sum(d => d.BookingsMade),
            days.Sum(d => d.BookingsCompleted),
            days.Sum(d => d.BookingsCancelled),
            days.Sum(d => d.BookingsNoShow),
            days.Sum(d => d.DepositsCollected),
            days.Sum(d => d.BalancesReceived),
            days.Sum(d => d.BalancesUnpaid),
            days.Sum(d => d.CompletedServicesValue),
            days);
    }

    /// <summary>
    /// "Made" and "cancelled" count by the day it happened; deposits and balances by the day they were paid;
    /// completed services, no-shows and unpaid balances by appointment date. All days are salon-local.
    /// </summary>
    private async Task<List<DailySalesReport>> BuildAsync(DateOnly from, DateOnly to, CancellationToken ct)
    {
        var (fromUtc, toUtc) = SalonDay.UtcRange(clock, from, to);
        var appointments = await bookings.GetInDateRangeAsync(from, to, ct);
        var paid = await payments.GetSucceededBetweenAsync(fromUtc, toUtc, ct);
        var cancelled = await bookings.GetCancelledBetweenAsync(fromUtc, toUtc, ct);

        var reports = new List<DailySalesReport>();
        for (var day = from; day <= to; day = day.AddDays(1))
        {
            var (dayFrom, dayTo) = SalonDay.UtcRange(clock, day, day);
            var completed = appointments.Where(b => b.BookingDate == day && b.Status == BookingStatus.Completed).ToList();
            reports.Add(new DailySalesReport(
                day,
                await bookings.CountCreatedBetweenAsync(dayFrom, dayTo, ct),
                completed.Count,
                cancelled.Count(b => b.Cancellation!.CancelledAt >= dayFrom && b.Cancellation.CancelledAt < dayTo),
                appointments.Count(b => b.BookingDate == day && b.Status == BookingStatus.NoShow),
                paid.Where(p => p.PaidAt >= dayFrom && p.PaidAt < dayTo).Sum(p => p.Amount),
                await bookings.SumBalancesReceivedAsync(dayFrom, dayTo, ct),
                completed.Sum(b => b.BalanceDue),
                completed.Sum(b => b.TotalPrice)));
        }
        return reports;
    }
}

public interface IActivityLogService
{
    Task<PagedResponse<ActivityLogResponse>> SearchAsync(ActivityLogQuery query, CancellationToken ct = default);
}

/// <summary>Read access to the activity log (Ref 11.7).</summary>
public sealed class ActivityLogService(IAuditLogRepository logs) : IActivityLogService
{
    public async Task<PagedResponse<ActivityLogResponse>> SearchAsync(ActivityLogQuery query, CancellationToken ct = default)
    {
        var page = Math.Max(1, query.Page);
        var pageSize = Math.Clamp(query.PageSize, 1, 200);
        var (items, total) = await logs.SearchAsync(
            new AuditLogCriteria(query.UserId, query.Action, query.FromUtc, query.ToUtc, page, pageSize), ct);

        return new PagedResponse<ActivityLogResponse>(
            items.Select(a => new ActivityLogResponse(
                a.Id, a.UserId, a.User?.Username, a.Action, a.EntityType, a.EntityId, a.Details, a.IpAddress, a.CreatedAt)).ToList(),
            page, pageSize, total);
    }
}

internal static class SalonDay
{
    /// <summary>UTC instants covering salon-local days <paramref name="from"/> through <paramref name="to"/>.</summary>
    public static (DateTime FromUtc, DateTime ToUtc) UtcRange(ISalonClock clock, DateOnly from, DateOnly to) =>
        (clock.ToUtc(from.ToDateTime(TimeOnly.MinValue)), clock.ToUtc(to.AddDays(1).ToDateTime(TimeOnly.MinValue)));
}
