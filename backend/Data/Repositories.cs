using Microsoft.EntityFrameworkCore;
using NailsByLeah.Api.Domain;
using NailsByLeah.Api.Errors;

namespace NailsByLeah.Api.Data;

// Repository abstractions (Dependency Inversion Principle, Ref 5.5). Services depend on these
// interfaces, never on AppDbContext. All queries go through EF Core, which always sends
// values as SQL parameters (SQL injection protection, Ref 1.1).
// Repositories only stage changes; IUnitOfWork commits them.

public interface IUserRepository
{
    Task<User?> GetByIdAsync(int id, CancellationToken ct = default);
    Task<User?> FindByUsernameOrEmailAsync(string usernameOrEmail, CancellationToken ct = default);
    Task<User?> FindByEmailAsync(string email, CancellationToken ct = default);
    Task<User?> FindByUsernameAsync(string username, CancellationToken ct = default);
    Task<bool> UsernameExistsAsync(string username, CancellationToken ct = default);
    Task<bool> EmailExistsAsync(string email, CancellationToken ct = default);
    Task<bool> PhoneNumberExistsAsync(string phoneNumber, CancellationToken ct = default);
    void Add(User user);
}

public interface IUserTokenRepository
{
    Task<UserToken?> FindByHashAsync(UserTokenPurpose purpose, string tokenHash, CancellationToken ct = default);
    Task<UserToken?> GetLatestUnconsumedAsync(int userId, UserTokenPurpose purpose, CancellationToken ct = default);
    Task<List<UserToken>> GetUnconsumedAsync(int userId, UserTokenPurpose purpose, CancellationToken ct = default);
    void Add(UserToken token);
}

public interface IServiceCatalogRepository
{
    Task<List<CatalogService>> GetServicesAsync(bool includeInactive, CancellationToken ct = default);
    Task<List<StoneAddOn>> GetAddOnsAsync(bool includeInactive, CancellationToken ct = default);
    Task<CatalogService?> FindServiceAsync(int id, CancellationToken ct = default);
    Task<StoneAddOn?> FindAddOnAsync(int id, CancellationToken ct = default);
    Task<List<StoneAddOn>> FindAddOnsAsync(IReadOnlyCollection<int> ids, CancellationToken ct = default);
    Task<bool> ServiceNameExistsAsync(string category, string name, int? exceptId, CancellationToken ct = default);
    Task<bool> AddOnNameExistsAsync(string name, int? exceptId, CancellationToken ct = default);
    void AddService(CatalogService service);
    void AddAddOn(StoneAddOn addOn);
}

/// <summary>The part of a booking the schedule needs.</summary>
public sealed record ScheduledAppointment(int BookingId, DateOnly Date, TimeOnly StartTime, int DurationMinutes);

public sealed record BookingSearchCriteria(DateOnly? Date, BookingStatus? Status, string? ClientName, int Page, int PageSize);

public interface IBookingRepository
{
    void Add(Booking booking);
    void AddCancellation(Cancellation cancellation);
    Task<Booking?> GetDetailsAsync(int id, CancellationToken ct = default);
    Task<List<Booking>> GetForClientAsync(int clientId, CancellationToken ct = default);
    Task<(List<Booking> Items, int TotalCount)> SearchAsync(BookingSearchCriteria criteria, CancellationToken ct = default);
    Task<List<Booking>> GetForDateAsync(DateOnly date, CancellationToken ct = default);
    Task<List<Booking>> GetInDateRangeAsync(DateOnly from, DateOnly to, CancellationToken ct = default);
    /// <summary>Start and length of every Pending or Confirmed booking on the date.</summary>
    Task<List<ScheduledAppointment>> GetActiveOnDateAsync(DateOnly date, CancellationToken ct = default);

    /// <summary>Pending or Confirmed bookings on or after the date.</summary>
    Task<List<ScheduledAppointment>> GetActiveFromDateAsync(DateOnly from, CancellationToken ct = default);
    Task<int> CountByStatusAsync(BookingStatus status, CancellationToken ct = default);
    Task<int> CountCreatedBetweenAsync(DateTime fromUtc, DateTime toUtc, CancellationToken ct = default);
    Task<List<Booking>> GetCancelledBetweenAsync(DateTime fromUtc, DateTime toUtc, CancellationToken ct = default);
    Task<List<Booking>> GetDueForReminderAsync(DateOnly fromDate, DateOnly toDate, CancellationToken ct = default);

    /// <summary>
    /// Takes an exclusive lock on the whole date until the current transaction ends. Appointments of different
    /// lengths can clash without sharing a start time, so everything that adds or moves an appointment, or blocks
    /// time, on that date queues here and then checks for overlaps with what is committed (Isolation, Ref 6.3).
    /// Must be called inside a transaction.
    /// </summary>
    Task LockDayAsync(DateOnly date, CancellationToken ct = default);
}

public interface IPaymentRepository
{
    void Add(Payment payment);
    Task<Payment?> FindByIdempotencyKeyAsync(Guid key, CancellationToken ct = default);
    Task<Payment?> GetSucceededForBookingAsync(int bookingId, CancellationToken ct = default);
    Task<decimal> SumSucceededAsync(DateTime? fromUtc, DateTime? toUtc, CancellationToken ct = default);
    Task<List<Payment>> GetSucceededBetweenAsync(DateTime fromUtc, DateTime toUtc, CancellationToken ct = default);
}

public interface IBlockedSlotRepository
{
    void Add(BlockedSlot slot);
    Task<BlockedSlot?> FindAsync(int id, CancellationToken ct = default);
    Task<List<BlockedSlot>> GetForDateAsync(DateOnly date, CancellationToken ct = default);
    Task<List<BlockedSlot>> GetInRangeAsync(DateOnly from, DateOnly to, CancellationToken ct = default);
}

/// <summary>The single salon_settings row (closing time).</summary>
public interface ISalonSettingsRepository
{
    Task<SalonSettings> GetAsync(CancellationToken ct = default);
}

public interface IBookingDraftRepository
{
    Task<BookingDraft?> GetForClientAsync(int clientId, CancellationToken ct = default);
    void Add(BookingDraft draft);
    void Remove(BookingDraft draft);

    /// <summary>Deletes the client's draft straight away, inside the caller's transaction if there is one.</summary>
    Task DeleteForClientAsync(int clientId, CancellationToken ct = default);
}

public interface IFeedbackRepository
{
    void Add(Feedback feedback);
    Task<Feedback?> FindBySubmissionKeyAsync(Guid key, CancellationToken ct = default);
    Task<List<Feedback>> GetForClientAsync(int clientId, CancellationToken ct = default);
    Task<(List<Feedback> Items, int TotalCount)> GetPageAsync(int page, int pageSize, CancellationToken ct = default);

    /// <summary>Number of ratings per star value (1-5).</summary>
    Task<Dictionary<int, int>> CountByRatingAsync(CancellationToken ct = default);
}

public sealed record AuditLogCriteria(int? UserId, string? Action, DateTime? FromUtc, DateTime? ToUtc, int Page, int PageSize);

public interface IAuditLogRepository
{
    void Add(AuditLog entry);
    Task<(List<AuditLog> Items, int TotalCount)> SearchAsync(AuditLogCriteria criteria, CancellationToken ct = default);
}

internal sealed class UserRepository(AppDbContext db) : IUserRepository
{
    private IQueryable<User> Live => db.Users.Where(u => !u.IsDeleted);

    public Task<User?> GetByIdAsync(int id, CancellationToken ct) => Live.FirstOrDefaultAsync(u => u.Id == id, ct);

    public Task<User?> FindByUsernameOrEmailAsync(string usernameOrEmail, CancellationToken ct) =>
        Live.FirstOrDefaultAsync(u => u.Username == usernameOrEmail || u.Email == usernameOrEmail, ct);

    public Task<User?> FindByEmailAsync(string email, CancellationToken ct) => Live.FirstOrDefaultAsync(u => u.Email == email, ct);

    public Task<User?> FindByUsernameAsync(string username, CancellationToken ct) => Live.FirstOrDefaultAsync(u => u.Username == username, ct);

    // Uniqueness checks include soft-deleted rows because the UNIQUE indexes do too.
    public Task<bool> UsernameExistsAsync(string username, CancellationToken ct) => db.Users.AnyAsync(u => u.Username == username, ct);
    public Task<bool> EmailExistsAsync(string email, CancellationToken ct) => db.Users.AnyAsync(u => u.Email == email, ct);
    public Task<bool> PhoneNumberExistsAsync(string phoneNumber, CancellationToken ct) => db.Users.AnyAsync(u => u.PhoneNumber == phoneNumber, ct);

    public void Add(User user) => db.Users.Add(user);
}

internal sealed class UserTokenRepository(AppDbContext db) : IUserTokenRepository
{
    public Task<UserToken?> FindByHashAsync(UserTokenPurpose purpose, string tokenHash, CancellationToken ct) =>
        db.UserTokens.FirstOrDefaultAsync(t => t.Purpose == purpose && t.TokenHash == tokenHash, ct);

    public Task<UserToken?> GetLatestUnconsumedAsync(int userId, UserTokenPurpose purpose, CancellationToken ct) =>
        db.UserTokens
            .Where(t => t.UserId == userId && t.Purpose == purpose && t.ConsumedAt == null)
            .OrderByDescending(t => t.CreatedAt).ThenByDescending(t => t.Id)
            .FirstOrDefaultAsync(ct);

    public Task<List<UserToken>> GetUnconsumedAsync(int userId, UserTokenPurpose purpose, CancellationToken ct) =>
        db.UserTokens.Where(t => t.UserId == userId && t.Purpose == purpose && t.ConsumedAt == null).ToListAsync(ct);

    public void Add(UserToken token) => db.UserTokens.Add(token);
}

internal sealed class ServiceCatalogRepository(AppDbContext db) : IServiceCatalogRepository
{
    public Task<List<CatalogService>> GetServicesAsync(bool includeInactive, CancellationToken ct) =>
        db.Services.Where(s => !s.IsDeleted && (includeInactive || s.IsActive)).OrderBy(s => s.Id).ToListAsync(ct);

    public Task<List<StoneAddOn>> GetAddOnsAsync(bool includeInactive, CancellationToken ct) =>
        db.AddOns.Where(a => !a.IsDeleted && (includeInactive || a.IsActive)).OrderBy(a => a.Id).ToListAsync(ct);

    public Task<CatalogService?> FindServiceAsync(int id, CancellationToken ct) =>
        db.Services.FirstOrDefaultAsync(s => s.Id == id && !s.IsDeleted, ct);

    public Task<StoneAddOn?> FindAddOnAsync(int id, CancellationToken ct) =>
        db.AddOns.FirstOrDefaultAsync(a => a.Id == id && !a.IsDeleted, ct);

    public Task<List<StoneAddOn>> FindAddOnsAsync(IReadOnlyCollection<int> ids, CancellationToken ct) =>
        db.AddOns.Where(a => ids.Contains(a.Id) && !a.IsDeleted).ToListAsync(ct);

    public Task<bool> ServiceNameExistsAsync(string category, string name, int? exceptId, CancellationToken ct) =>
        db.Services.AnyAsync(s => EF.Property<string>(s, "category") == category && s.Name == name && s.Id != exceptId, ct);

    public Task<bool> AddOnNameExistsAsync(string name, int? exceptId, CancellationToken ct) =>
        db.AddOns.AnyAsync(a => a.Name == name && a.Id != exceptId, ct);

    public void AddService(CatalogService service) => db.Services.Add(service);
    public void AddAddOn(StoneAddOn addOn) => db.AddOns.Add(addOn);
}

internal sealed class BookingRepository(AppDbContext db) : IBookingRepository
{
    private IQueryable<Booking> Live => db.Bookings.Where(b => !b.IsDeleted);

    private IQueryable<Booking> WithDetails => Live
        .Include(b => b.Client)
        .Include(b => b.Service)
        .Include(b => b.AddOns).ThenInclude(a => a.AddOn)
        .Include(b => b.Cancellation).ThenInclude(c => c!.CancelledBy)
        .Include(b => b.ConfirmedBy)
        .Include(b => b.Payments)
        .Include(b => b.ReferenceImages.Where(r => !r.IsDeleted).OrderBy(r => r.Id))
        .AsSplitQuery();

    private IQueryable<Booking> Active => Live.Where(b => b.Status == BookingStatus.Pending || b.Status == BookingStatus.Confirmed);

    public void Add(Booking booking) => db.Bookings.Add(booking);
    public void AddCancellation(Cancellation cancellation) => db.Cancellations.Add(cancellation);

    public Task<Booking?> GetDetailsAsync(int id, CancellationToken ct) => WithDetails.FirstOrDefaultAsync(b => b.Id == id, ct);

    public Task<List<Booking>> GetForClientAsync(int clientId, CancellationToken ct) =>
        WithDetails.Where(b => b.ClientId == clientId)
            .OrderByDescending(b => b.BookingDate).ThenByDescending(b => b.StartTime)
            .ToListAsync(ct);

    public async Task<(List<Booking> Items, int TotalCount)> SearchAsync(BookingSearchCriteria c, CancellationToken ct)
    {
        var query = WithDetails;
        if (c.Date is { } date)
            query = query.Where(b => b.BookingDate == date);
        if (c.Status is { } status)
            query = query.Where(b => b.Status == status);
        if (!string.IsNullOrWhiteSpace(c.ClientName))
        {
            var name = c.ClientName.Trim();
            query = query.Where(b =>
                b.Client.FirstName.Contains(name) || b.Client.LastName.Contains(name) ||
                (b.Client.FirstName + " " + b.Client.LastName).Contains(name) || b.Client.Username.Contains(name));
        }

        var total = await query.CountAsync(ct);
        var items = await query
            .OrderByDescending(b => b.BookingDate).ThenBy(b => b.StartTime)
            .Skip((c.Page - 1) * c.PageSize).Take(c.PageSize)
            .ToListAsync(ct);
        return (items, total);
    }

    public Task<List<Booking>> GetForDateAsync(DateOnly date, CancellationToken ct) =>
        WithDetails.Where(b => b.BookingDate == date).OrderBy(b => b.StartTime).ToListAsync(ct);

    public Task<List<Booking>> GetInDateRangeAsync(DateOnly from, DateOnly to, CancellationToken ct) =>
        WithDetails.Where(b => b.BookingDate >= from && b.BookingDate <= to).ToListAsync(ct);

    public Task<List<ScheduledAppointment>> GetActiveOnDateAsync(DateOnly date, CancellationToken ct) =>
        Active.Where(b => b.BookingDate == date)
            .Select(b => new ScheduledAppointment(b.Id, b.BookingDate, b.StartTime, b.DurationMinutes)).ToListAsync(ct);

    public Task<List<ScheduledAppointment>> GetActiveFromDateAsync(DateOnly from, CancellationToken ct) =>
        Active.Where(b => b.BookingDate >= from)
            .Select(b => new ScheduledAppointment(b.Id, b.BookingDate, b.StartTime, b.DurationMinutes)).ToListAsync(ct);

    public Task<int> CountByStatusAsync(BookingStatus status, CancellationToken ct) => Live.CountAsync(b => b.Status == status, ct);

    public Task<int> CountCreatedBetweenAsync(DateTime fromUtc, DateTime toUtc, CancellationToken ct) =>
        Live.CountAsync(b => b.CreatedAt >= fromUtc && b.CreatedAt < toUtc, ct);

    public Task<List<Booking>> GetCancelledBetweenAsync(DateTime fromUtc, DateTime toUtc, CancellationToken ct) =>
        Live.Include(b => b.Cancellation)
            .Where(b => b.Cancellation != null && b.Cancellation.CancelledAt >= fromUtc && b.Cancellation.CancelledAt < toUtc)
            .ToListAsync(ct);

    public Task<List<Booking>> GetDueForReminderAsync(DateOnly fromDate, DateOnly toDate, CancellationToken ct) =>
        WithDetails.Where(b => b.Status == BookingStatus.Confirmed && b.ReminderSentAt == null &&
                               b.BookingDate >= fromDate && b.BookingDate <= toDate)
            .ToListAsync(ct);

    public async Task LockDayAsync(DateOnly date, CancellationToken ct)
    {
        // An application lock named after the date, owned by the transaction: released on commit or rollback.
        // Interpolated values become SQL parameters; this is not string concatenation.
        var resource = $"nbl-booking-day:{date:yyyy-MM-dd}";
        var result = await db.Database.SqlQuery<int>($"""
            DECLARE @result int;
            EXEC @result = sp_getapplock @Resource = {resource}, @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 15000;
            SELECT @result AS [Value];
            """).ToListAsync(ct);

        // 0 = granted, 1 = granted after waiting; negative = timed out, deadlock or error.
        if (result.Count != 1 || result[0] < 0)
            throw new ConflictException("The system is busy with another request for the same day. Please try again.", "concurrency_conflict");
    }
}

internal sealed class PaymentRepository(AppDbContext db) : IPaymentRepository
{
    public void Add(Payment payment) => db.Payments.Add(payment);

    public Task<Payment?> FindByIdempotencyKeyAsync(Guid key, CancellationToken ct) =>
        db.Payments.Include(p => p.Booking).FirstOrDefaultAsync(p => p.IdempotencyKey == key, ct);

    public Task<Payment?> GetSucceededForBookingAsync(int bookingId, CancellationToken ct) =>
        db.Payments.Where(p => p.BookingId == bookingId && p.Status == PaymentStatus.Succeeded)
            .OrderBy(p => p.PaidAt).FirstOrDefaultAsync(ct);

    public async Task<decimal> SumSucceededAsync(DateTime? fromUtc, DateTime? toUtc, CancellationToken ct) =>
        await db.Payments
            .Where(p => p.Status == PaymentStatus.Succeeded && (fromUtc == null || p.PaidAt >= fromUtc) && (toUtc == null || p.PaidAt < toUtc))
            .SumAsync(p => (decimal?)p.Amount, ct) ?? 0m;

    public Task<List<Payment>> GetSucceededBetweenAsync(DateTime fromUtc, DateTime toUtc, CancellationToken ct) =>
        db.Payments.Where(p => p.Status == PaymentStatus.Succeeded && p.PaidAt >= fromUtc && p.PaidAt < toUtc).ToListAsync(ct);
}

internal sealed class BlockedSlotRepository(AppDbContext db) : IBlockedSlotRepository
{
    private IQueryable<BlockedSlot> Live => db.BlockedSlots.Where(s => !s.IsDeleted);

    public void Add(BlockedSlot slot) => db.BlockedSlots.Add(slot);
    public Task<BlockedSlot?> FindAsync(int id, CancellationToken ct) => Live.FirstOrDefaultAsync(s => s.Id == id, ct);
    public Task<List<BlockedSlot>> GetForDateAsync(DateOnly date, CancellationToken ct) => Live.Where(s => s.Date == date).ToListAsync(ct);

    public Task<List<BlockedSlot>> GetInRangeAsync(DateOnly from, DateOnly to, CancellationToken ct) =>
        Live.Where(s => s.Date >= from && s.Date <= to).OrderBy(s => s.Date).ThenBy(s => s.StartTime).ToListAsync(ct);
}

internal sealed class AuditLogRepository(AppDbContext db) : IAuditLogRepository
{
    public void Add(AuditLog entry) => db.AuditLogs.Add(entry);

    public async Task<(List<AuditLog> Items, int TotalCount)> SearchAsync(AuditLogCriteria c, CancellationToken ct)
    {
        var query = db.AuditLogs.Include(a => a.User).AsQueryable();
        if (c.UserId is { } userId)
            query = query.Where(a => a.UserId == userId);
        if (!string.IsNullOrWhiteSpace(c.Action))
            query = query.Where(a => a.Action == c.Action);
        if (c.FromUtc is { } from)
            query = query.Where(a => a.CreatedAt >= from);
        if (c.ToUtc is { } to)
            query = query.Where(a => a.CreatedAt < to);

        var total = await query.CountAsync(ct);
        var items = await query.OrderByDescending(a => a.CreatedAt).ThenByDescending(a => a.Id)
            .Skip((c.Page - 1) * c.PageSize).Take(c.PageSize).ToListAsync(ct);
        return (items, total);
    }
}

internal sealed class BookingDraftRepository(AppDbContext db) : IBookingDraftRepository
{
    public Task<BookingDraft?> GetForClientAsync(int clientId, CancellationToken ct) =>
        db.BookingDrafts.FirstOrDefaultAsync(d => d.ClientId == clientId, ct);

    public void Add(BookingDraft draft) => db.BookingDrafts.Add(draft);
    public void Remove(BookingDraft draft) => db.BookingDrafts.Remove(draft);

    public Task DeleteForClientAsync(int clientId, CancellationToken ct) =>
        db.BookingDrafts.Where(d => d.ClientId == clientId).ExecuteDeleteAsync(ct);
}

internal sealed class FeedbackRepository(AppDbContext db) : IFeedbackRepository
{
    public void Add(Feedback feedback) => db.Feedback.Add(feedback);

    public Task<Feedback?> FindBySubmissionKeyAsync(Guid key, CancellationToken ct) =>
        db.Feedback.FirstOrDefaultAsync(f => f.SubmissionKey == key, ct);

    public Task<List<Feedback>> GetForClientAsync(int clientId, CancellationToken ct) =>
        db.Feedback.Where(f => f.ClientId == clientId).OrderByDescending(f => f.CreatedAt).ThenByDescending(f => f.Id).ToListAsync(ct);

    public async Task<(List<Feedback> Items, int TotalCount)> GetPageAsync(int page, int pageSize, CancellationToken ct)
    {
        var total = await db.Feedback.CountAsync(ct);
        var items = await db.Feedback.Include(f => f.Client).OrderByDescending(f => f.CreatedAt).ThenByDescending(f => f.Id)
            .Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(ct);
        return (items, total);
    }

    public Task<Dictionary<int, int>> CountByRatingAsync(CancellationToken ct) =>
        db.Feedback.GroupBy(f => f.Rating).Select(g => new { Rating = g.Key, Count = g.Count() }).ToDictionaryAsync(g => g.Rating, g => g.Count, ct);
}

internal sealed class SalonSettingsRepository(AppDbContext db) : ISalonSettingsRepository
{
    public async Task<SalonSettings> GetAsync(CancellationToken ct) =>
        await db.SalonSettings.FirstOrDefaultAsync(s => s.Id == SalonSettings.SingletonId, ct)
        ?? throw new InvalidOperationException("The salon_settings row is missing. Apply the database migrations.");
}
