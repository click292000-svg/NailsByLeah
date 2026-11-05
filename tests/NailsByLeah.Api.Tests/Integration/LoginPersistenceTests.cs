using System.Net;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using NailsByLeah.Api.Contracts;

namespace NailsByLeah.Api.Tests.Integration;

/// <summary>The keys behind login cookies live in the database, so hosts that wipe their disk don't sign everyone out.</summary>
public sealed class LoginPersistenceTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    [Fact]
    public async Task Login_keys_are_saved_in_the_database()
    {
        await factory.CreateClientAsync();

        Assert.True(factory.WithDb(db => db.DataProtectionKeys.Any()));
    }

    [Fact]
    public async Task A_sign_in_still_works_after_the_app_restarts()
    {
        var user = await factory.CreateClientAsync();
        var signIn = await factory.NewClient().PostJsonAsync("/api/auth/login", new LoginRequest(user.Username, ApiFactory.DefaultPassword));
        await signIn.ShouldHaveStatus(HttpStatusCode.OK);
        var cookie = signIn.Headers.GetValues("Set-Cookie").Single(c => c.StartsWith("nailsbyleah.session=", StringComparison.Ordinal)).Split(';')[0];

        // A second running copy of the app shares only the database with the first, like the app after a restart.
        await using var restarted = factory.WithWebHostBuilder(_ => { });
        var client = restarted.CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost"), HandleCookies = false });
        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/auth/me");
        request.Headers.Add("Cookie", cookie);

        await (await client.SendAsync(request)).ShouldHaveStatus(HttpStatusCode.OK);
    }
}
