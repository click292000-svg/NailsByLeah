using Microsoft.EntityFrameworkCore;
using NailsByLeah.Api.Domain;

namespace NailsByLeah.Api.Data;

// Repository for nail design reference photos. Same rules as Repositories.cs:
// they only stage changes, IUnitOfWork commits them, and every query goes through EF Core parameters.

public interface IReferenceImageRepository
{
    void Add(ReferenceImage image);
    Task<ReferenceImage?> FindAsync(int id, CancellationToken ct = default);
    Task<List<ReferenceImage>> FindManyAsync(IReadOnlyCollection<int> ids, CancellationToken ct = default);

    /// <summary>Uploaded by the client but not attached to a booking yet (a booking in progress or a saved draft).</summary>
    Task<List<ReferenceImage>> GetPendingForClientAsync(int clientId, CancellationToken ct = default);
}

internal sealed class ReferenceImageRepository(AppDbContext db) : IReferenceImageRepository
{
    private IQueryable<ReferenceImage> Live => db.ReferenceImages.Where(r => !r.IsDeleted);

    public void Add(ReferenceImage image) => db.ReferenceImages.Add(image);

    public Task<ReferenceImage?> FindAsync(int id, CancellationToken ct) => Live.FirstOrDefaultAsync(r => r.Id == id, ct);

    public Task<List<ReferenceImage>> FindManyAsync(IReadOnlyCollection<int> ids, CancellationToken ct) =>
        Live.Where(r => ids.Contains(r.Id)).ToListAsync(ct);

    public Task<List<ReferenceImage>> GetPendingForClientAsync(int clientId, CancellationToken ct) =>
        Live.Where(r => r.ClientId == clientId && r.BookingId == null).OrderBy(r => r.Id).ToListAsync(ct);
}

