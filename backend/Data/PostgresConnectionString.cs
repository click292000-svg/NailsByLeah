using Npgsql;

namespace NailsByLeah.Api.Data;

/// <summary>
/// Reads the database connection setting in either form Supabase shows: the .NET form
/// (<c>Host=…;Username=…;Password=…</c>) or the URI form (<c>postgresql://user:password@host:5432/postgres</c>).
/// Stray spaces and quotes around the value, easy to paste by accident, are ignored. Supabase only accepts encrypted
/// connections, so a URI without its own sslmode gets SSL Mode=Require.
/// </summary>
public static class PostgresConnectionString
{
    private static readonly HashSet<string> KnownSettings = new(StringComparer.OrdinalIgnoreCase)
    {
        "Host", "Server", "Port", "Database", "Username", "User Id", "User ID", "User", "Password", "SSL Mode", "SslMode",
        "Trust Server Certificate", "Pooling", "Timeout", "Command Timeout", "Include Error Detail", "Search Path",
        "Maximum Pool Size", "Minimum Pool Size", "Application Name", "Keepalive",
    };

    /// <summary>
    /// The setting names in the value, where they are names Npgsql uses; anything else shows as "?", because a stray
    /// piece of a password could otherwise appear here.
    /// </summary>
    private static IEnumerable<string> SettingNames(string text) =>
        text.Split(';', StringSplitOptions.RemoveEmptyEntries).Select(part =>
        {
            var eq = part.IndexOf('=');
            var name = eq < 0 ? "" : part[..eq].Trim();
            return KnownSettings.Contains(name) ? name : "?";
        });

    /// <summary>Npgsql's reason, without the setting name it quotes when it doesn't know one (that could be a password piece).</summary>
    private static string Reason(ArgumentException ex) =>
        ex.Message.Contains("not supported", StringComparison.OrdinalIgnoreCase) || ex.Message.Contains('\'')
            ? "it contains a setting name it doesn't know (shown as ? above)."
            : ex.Message;

    public static string Normalize(string value)
    {
        var text = value.Trim().Trim('"', '\'').Trim();

        // Supabase's .NET tab shows the string inside an appsettings.json example ("DefaultConnection": "Host=…"); if that
        // was copied too, keep only the part from Host= to its closing quote.
        var hostKey = text.IndexOf("Host=", StringComparison.OrdinalIgnoreCase);
        if (hostKey > 0)
        {
            text = text[hostKey..];
            var quote = text.IndexOfAny(['"', '\'']);
            if (quote >= 0)
                text = text[..quote];
            text = text.Trim().TrimEnd('}', ',').Trim();
        }

        if (!text.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase) &&
            !text.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase))
        {
            try
            {
                _ = new NpgsqlConnectionStringBuilder(text);
            }
            catch (ArgumentException ex)
            {
                // Never quotes any value (it may be just a password): only its shape, the setting names, and Npgsql's own
                // reason, which names a setting or a position, not a value.
                var shape = !text.Contains('=') && !text.Contains(';')
                    ? "it has no \"Key=value\" parts, so it may be only a password"
                    : $"setting names found: {string.Join(", ", SettingNames(text))}";
                throw new InvalidOperationException(
                    $"ConnectionStrings:Default can't be read ({text.Length} characters; {shape}). Npgsql says: {Reason(ex)} " +
                    "Set the whole connection string, starting with \"Host=\" (Supabase's .NET form) or \"postgresql://\".");
            }
            return text;
        }

        // Uri won't parse the postgresql scheme's user info reliably with every password, so split it by hand:
        // scheme://user:password@host:port/database?options. The password is everything between the first ':' of the
        // user info and the last '@', so an '@' or ':' inside it still works.
        var rest = text[(text.IndexOf("://", StringComparison.Ordinal) + 3)..];
        var at = rest.LastIndexOf('@');
        if (at < 0)
            throw new InvalidOperationException("The database address has no user name (expected postgresql://user:password@host/database).");
        var userInfo = rest[..at];
        var hostPart = rest[(at + 1)..];

        var colon = userInfo.IndexOf(':');
        var username = Uri.UnescapeDataString(colon < 0 ? userInfo : userInfo[..colon]);
        var password = colon < 0 ? null : Uri.UnescapeDataString(userInfo[(colon + 1)..]);

        var query = "";
        var question = hostPart.IndexOf('?');
        if (question >= 0)
        {
            query = hostPart[(question + 1)..];
            hostPart = hostPart[..question];
        }
        var slash = hostPart.IndexOf('/');
        var database = slash < 0 ? "postgres" : Uri.UnescapeDataString(hostPart[(slash + 1)..]);
        var hostAndPort = slash < 0 ? hostPart : hostPart[..slash];
        var portColon = hostAndPort.LastIndexOf(':');
        var host = portColon < 0 ? hostAndPort : hostAndPort[..portColon];
        var port = portColon < 0 ? 5432 : int.Parse(hostAndPort[(portColon + 1)..]);

        var builder = new NpgsqlConnectionStringBuilder
        {
            Host = host,
            Port = port,
            Database = string.IsNullOrEmpty(database) ? "postgres" : database,
            Username = username,
            Password = password,
            SslMode = SslMode.Require,
        };
        foreach (var pair in query.Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var eq = pair.IndexOf('=');
            if (eq > 0 && pair[..eq].Equals("sslmode", StringComparison.OrdinalIgnoreCase)
                && Enum.TryParse<SslMode>(pair[(eq + 1)..].Replace("-", ""), ignoreCase: true, out var mode))
                builder.SslMode = mode;
        }
        return builder.ConnectionString;
    }
}
