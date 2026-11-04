using System.Net;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using NailsByLeah.Api.Contracts;

namespace NailsByLeah.Api.Tests.Integration;

/// <summary>
/// Rate limits on sign-in, email-sending and booking endpoints. Each test runs the API with the limits switched on
/// and set very low, on the same test database, so a few requests are enough to reach them.
/// </summary>
public sealed class RateLimitTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private WebApplicationFactory<Program> Limited(params (string Key, string Value)[] settings) =>
        factory.WithWebHostBuilder(builder =>
        {
            builder.UseSetting("RateLimits:Enabled", "true");
            foreach (var (key, value) in settings)
                builder.UseSetting($"RateLimits:{key}", value);
        });

    private static HttpClient NewClient(WebApplicationFactory<Program> host) => host.CreateClient(new WebApplicationFactoryClientOptions
    {
        BaseAddress = new Uri("https://localhost"),
        HandleCookies = true,
        AllowAutoRedirect = false,
    });

    private static async Task ShouldBeRateLimited(HttpResponseMessage response)
    {
        await response.ShouldHaveStatus(HttpStatusCode.TooManyRequests);
        Assert.True(response.Headers.RetryAfter?.Delta > TimeSpan.Zero, "A refused request says when to try again.");
        var problem = await response.ReadProblemAsync();
        Assert.Equal("rate_limited", problem.ProblemCode());
        Assert.StartsWith("Too many attempts. Please wait", problem.GetProperty("detail").GetString());
    }

    [Fact]
    public async Task Login_is_refused_after_too_many_attempts_from_one_visitor()
    {
        await using var host = Limited(("Login:PermitLimit", "3"));
        var client = NewClient(host);

        for (var i = 0; i < 3; i++)
            await (await client.PostJsonAsync("/api/auth/login", new LoginRequest($"nobody{i}", "WrongPass123")))
                .ShouldHaveStatus(HttpStatusCode.Unauthorized);

        // Even the right password is refused until the window passes: the limit is on the visitor, not the account.
        await ShouldBeRateLimited(await client.PostJsonAsync("/api/auth/login",
            new LoginRequest(ApiFactory.AdminUsername, ApiFactory.AdminPassword)));
    }

    [Fact]
    public async Task Email_sending_endpoints_share_one_limit()
    {
        await using var host = Limited(("Email:PermitLimit", "2"));
        var client = NewClient(host);

        for (var i = 0; i < 2; i++)
            await (await client.PostJsonAsync("/api/auth/forgot-password", new EmailRequest($"someone{i}@test.local")))
                .ShouldHaveStatus(HttpStatusCode.OK);

        await ShouldBeRateLimited(await client.PostJsonAsync("/api/auth/forgot-password", new EmailRequest("someone@test.local")));
        // Sign-up also sends an email, so it is refused too: one visitor can't use up the daily email quota.
        await ShouldBeRateLimited(await client.PostJsonAsync("/api/auth/register", factory.NewRegistration()));
    }

    [Fact]
    public async Task Booking_limit_is_per_account()
    {
        var first = await factory.CreateClientAsync();
        var second = await factory.CreateClientAsync();
        await using var host = Limited(("Booking:PermitLimit", "2"));

        async Task<HttpClient> SignIn(TestUser user)
        {
            var client = NewClient(host);
            await (await client.PostJsonAsync("/api/auth/login", new LoginRequest(user.Username, ApiFactory.DefaultPassword)))
                .ShouldHaveStatus(HttpStatusCode.OK);
            return client;
        }

        var firstClient = await SignIn(first);
        var secondClient = await SignIn(second);
        var cancel = new { reason = "ChangeOfSchedule" };

        for (var i = 0; i < 2; i++)
            await (await firstClient.PostJsonAsync("/api/bookings/999999/cancel", cancel)).ShouldHaveStatus(HttpStatusCode.NotFound);
        await ShouldBeRateLimited(await firstClient.PostJsonAsync("/api/bookings/999999/cancel", cancel));

        // Another client on the same network still has their own allowance.
        await (await secondClient.PostJsonAsync("/api/bookings/999999/cancel", cancel)).ShouldHaveStatus(HttpStatusCode.NotFound);
    }
}
