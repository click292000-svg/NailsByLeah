using NailsByLeah.Api.Data;
using Npgsql;

namespace NailsByLeah.Api.Tests.Unit;

/// <summary>The database setting works in either form Supabase shows, even pasted with stray quotes or spaces.</summary>
public sealed class PostgresConnectionStringTests
{
    [Fact]
    public void The_URI_form_becomes_a_connection_string_with_SSL()
    {
        var result = new NpgsqlConnectionStringBuilder(PostgresConnectionString.Normalize(
            "postgresql://postgres.abcd1234:Pa%40ss:w0rd@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres"));

        Assert.Equal("aws-0-ap-southeast-1.pooler.supabase.com", result.Host);
        Assert.Equal(5432, result.Port);
        Assert.Equal("postgres", result.Database);
        Assert.Equal("postgres.abcd1234", result.Username);
        Assert.Equal("Pa@ss:w0rd", result.Password);
        Assert.Equal(SslMode.Require, result.SslMode);
    }

    [Fact]
    public void A_bare_password_is_refused_without_showing_any_of_it()
    {
        var error = Assert.Throws<InvalidOperationException>(() => PostgresConnectionString.Normalize("SecretPass2026"));

        Assert.DoesNotContain("Secret", error.Message);
        Assert.Contains("may be only a password", error.Message);
    }

    [Fact]
    public void The_NET_form_is_used_as_it_is_without_stray_quotes_and_spaces()
    {
        var plain = "Host=db.example;Port=5432;Database=postgres;Username=postgres;Password=secret;SSL Mode=Require";

        Assert.Equal(plain, PostgresConnectionString.Normalize($"  '{plain}' "));
        Assert.Equal(plain, PostgresConnectionString.Normalize($"\"{plain}\""));
    }

    [Fact]
    public void The_string_is_found_inside_Supabase_s_appsettings_example()
    {
        var plain = "Host=db.example;Port=5432;Database=postgres;Username=postgres;Password=secret;SSL Mode=Require";

        Assert.Equal(plain, PostgresConnectionString.Normalize($"\"DefaultConnection\": \"{plain}\""));
        Assert.Equal(plain, PostgresConnectionString.Normalize($"{{ \"ConnectionStrings\": {{ \"DefaultConnection\": \"{plain}\" }} }}"));
    }
}
