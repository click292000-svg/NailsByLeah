using System.Data;
using Microsoft.EntityFrameworkCore;
using NailsByLeah.Api.Errors;
using Npgsql;

namespace NailsByLeah.Api.Data;

/// <summary>Commits the changes collected by the repositories, optionally inside one database transaction.</summary>
public interface IUnitOfWork
{
    Task SaveChangesAsync(CancellationToken ct = default);

    /// <summary>
    /// Runs <paramref name="work"/> and saves inside a single transaction. If anything throws, every
    /// change is rolled back and nothing is persisted (Atomicity, Ref 6.1).
    /// </summary>
    Task<T> ExecuteInTransactionAsync<T>(Func<CancellationToken, Task<T>> work, CancellationToken ct = default);

    /// <summary>Drops pending, unsaved changes (used after a rolled-back transaction).</summary>
    void DiscardChanges();
}

public sealed class EfUnitOfWork(AppDbContext db) : IUnitOfWork
{
    private const string BusyMessage = "The system is busy with another request for the same time. Please try again.";

    public async Task SaveChangesAsync(CancellationToken ct = default)
    {
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException pg)
        {
            throw Translate(ex, pg);
        }
    }

    public async Task<T> ExecuteInTransactionAsync<T>(Func<CancellationToken, Task<T>> work, CancellationToken ct = default)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted, ct);
        try
        {
            var result = await work(ct);
            await SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);
            return result;
        }
        catch (PostgresException pg) when (IsBusy(pg.SqlState))
        {
            await transaction.RollbackAsync(CancellationToken.None);
            DiscardChanges();
            throw new ConflictException(BusyMessage, "concurrency_conflict");
        }
        catch
        {
            await transaction.RollbackAsync(CancellationToken.None);
            DiscardChanges();
            throw;
        }
    }

    public void DiscardChanges() => db.ChangeTracker.Clear();

    /// <summary>Deadlock, serialization failure, or a lock that wasn't granted in time: worth trying again.</summary>
    private static bool IsBusy(string sqlState) =>
        sqlState is PostgresErrorCodes.DeadlockDetected or PostgresErrorCodes.SerializationFailure or PostgresErrorCodes.LockNotAvailable;

    // Postgres names the violated index itself, so duplicates map to the same index names as before (IndexNames).
    private static Exception Translate(DbUpdateException ex, PostgresException pg) => pg.SqlState switch
    {
        PostgresErrorCodes.UniqueViolation => new UniqueConstraintViolationException(pg.ConstraintName, ex),
        _ when IsBusy(pg.SqlState) => new ConflictException(BusyMessage, "concurrency_conflict"),
        _ => ex,
    };
}
