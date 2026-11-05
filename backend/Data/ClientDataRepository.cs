using Microsoft.EntityFrameworkCore;
using NailsByLeah.Api.Domain;

namespace NailsByLeah.Api.Data;

/// <summary>Everything stored about one client, tracked so it can be erased when they ask for their data to be deleted.</summary>
public interface IClientDataRepository
{
    Task<List<Booking>> GetBookingsAsync(int clientId, CancellationToken ct = default);
    Task<List<ReferenceImage>> GetReferenceImagesAsync(int clientId, CancellationToken ct = default);
    Task<List<Feedback>> GetFeedbackAsync(int clientId, CancellationToken ct = default);
    Task<List<AuditLog>> GetAuditLogsAsync(int clientId, CancellationToken ct = default);
    Task RemoveTokensAsync(int clientId, CancellationToken ct = default);
}

internal sealed class ClientDataRepository(AppDbContext db) : IClientDataRepository
{
    public Task<List<Booking>> GetBookingsAsync(int clientId, CancellationToken ct) =>
        db.Bookings.Include(b => b.Cancellation).Where(b => b.ClientId == clientId && !b.IsDeleted).ToListAsync(ct);

    public Task<List<ReferenceImage>> GetReferenceImagesAsync(int clientId, CancellationToken ct) =>
        db.ReferenceImages.Where(r => r.ClientId == clientId).ToListAsync(ct);

    public Task<List<Feedback>> GetFeedbackAsync(int clientId, CancellationToken ct) =>
        db.Feedback.Where(f => f.ClientId == clientId).ToListAsync(ct);

    public Task<List<AuditLog>> GetAuditLogsAsync(int clientId, CancellationToken ct) =>
        db.AuditLogs.Where(a => a.UserId == clientId).ToListAsync(ct);

    public async Task RemoveTokensAsync(int clientId, CancellationToken ct) =>
        db.UserTokens.RemoveRange(await db.UserTokens.Where(t => t.UserId == clientId).ToListAsync(ct));
}
