using System.Data.Common;
using System.Net;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using NailsByLeah.Api.Data;

namespace NailsByLeah.Api.Tests.Integration;

/// <summary>The addresses the host and the keep-awake ping check.</summary>
public sealed class HealthTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    [Fact]
    public async Task Both_checks_answer_ok_without_signing_in()
    {
        var client = factory.NewClient();

        await (await client.GetAsync("/api/health")).ShouldHaveStatus(HttpStatusCode.OK);
        var database = await client.GetAsync("/api/health/database");

        await database.ShouldHaveStatus(HttpStatusCode.OK);
        Assert.Contains("\"ok\"", await database.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task A_database_problem_shows_only_in_the_database_check_and_reveals_nothing()
    {
        var failure = new FailingDatabase();
        await using var host = factory.WithWebHostBuilder(builder => builder.ConfigureTestServices(services =>
            services.ConfigureDbContext<AppDbContext>(options => options.AddInterceptors(failure))));
        var client = host.CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost") });
        await (await client.GetAsync("/api/health/database")).ShouldHaveStatus(HttpStatusCode.OK); // starts healthy

        failure.Failing = true;
        var database = await client.GetAsync("/api/health/database");

        await database.ShouldHaveStatus(HttpStatusCode.ServiceUnavailable);
        var body = await database.Content.ReadAsStringAsync();
        Assert.Contains("unavailable", body);
        Assert.DoesNotContain(FailingDatabase.Secret, body);
        // The app itself is still running, so the host has no reason to restart it.
        await (await client.GetAsync("/api/health")).ShouldHaveStatus(HttpStatusCode.OK);
    }

    private sealed class FailingDatabase : DbCommandInterceptor
    {
        public const string Secret = "Server=secret-database-address";

        public bool Failing { get; set; }

        public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(
            DbCommand command, CommandEventData eventData, InterceptionResult<DbDataReader> result, CancellationToken cancellationToken = default) =>
            Failing ? throw new InvalidOperationException(Secret) : base.ReaderExecutingAsync(command, eventData, result, cancellationToken);
    }
}
