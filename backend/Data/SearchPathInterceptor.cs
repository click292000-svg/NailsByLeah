using System.Data.Common;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace NailsByLeah.Api.Data;

/// <summary>
/// Points every database connection at one schema (Database:Schema). Only the tests use it: each test host gets its own
/// schema in the shared test database, so their tables never mix. The schema is set on each open rather than in the
/// connection string because Supabase's connection pooler doesn't pass a search path through.
/// </summary>
public sealed partial class SearchPathInterceptor : DbConnectionInterceptor
{
    private readonly string _sql;

    public SearchPathInterceptor(string schema)
    {
        // A plain lower-case name only, since it is written into the SQL (it comes from configuration, never from a user).
        if (!SafeName().IsMatch(schema))
            throw new ArgumentException($"'{schema}' is not a valid schema name.", nameof(schema));
        _sql = $"SET search_path TO {schema}, public";
    }

    public override void ConnectionOpened(DbConnection connection, ConnectionEndEventData eventData)
    {
        using var command = connection.CreateCommand();
        command.CommandText = _sql;
        command.ExecuteNonQuery();
    }

    public override async Task ConnectionOpenedAsync(DbConnection connection, ConnectionEndEventData eventData, CancellationToken cancellationToken = default)
    {
        await using var command = connection.CreateCommand();
        command.CommandText = _sql;
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    [GeneratedRegex("^[a-z_][a-z0-9_]{0,62}$")]
    private static partial Regex SafeName();
}
