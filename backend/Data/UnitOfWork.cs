using System.Data;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using NailsByLeah.Api.Errors;

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
    private const int SqlUniqueIndexViolation = 2601;
    private const int SqlUniqueConstraintViolation = 2627;
    private const int SqlDeadlockVictim = 1205;

    public async Task SaveChangesAsync(CancellationToken ct = default)
    {
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex) when (ex.InnerException is SqlException sql)
        {
            throw Translate(ex, sql);
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
        catch (SqlException sql) when (sql.Number == SqlDeadlockVictim)
        {
            await transaction.RollbackAsync(CancellationToken.None);
            DiscardChanges();
            throw new ConflictException("The system is busy with another request for the same time. Please try again.", "concurrency_conflict");
        }
        catch
        {
            await transaction.RollbackAsync(CancellationToken.None);
            DiscardChanges();
            throw;
        }
    }

    public void DiscardChanges() => db.ChangeTracker.Clear();

    private static Exception Translate(DbUpdateException ex, SqlException sql) => sql.Number switch
    {
        SqlUniqueIndexViolation or SqlUniqueConstraintViolation => new UniqueConstraintViolationException(FindIndexName(sql.Message), ex),
        SqlDeadlockVictim => new ConflictException("The system is busy with another request for the same time. Please try again.", "concurrency_conflict"),
        _ => ex,
    };

    private static string? FindIndexName(string message)
    {
        // SQL Server message: "... with unique index 'ux_users_username'. ..."
        var start = message.IndexOf("'ux_", StringComparison.Ordinal);
        if (start < 0)
            return null;
        var end = message.IndexOf('\'', start + 1);
        return end < 0 ? null : message[(start + 1)..end];
    }
}
