using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.HttpsPolicy;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using NailsByLeah.Api.Contracts;

namespace NailsByLeah.Api.Tests.Integration;

/// <summary>
/// Behind the host's proxy: each visitor gets their own rate limit, and faking X-Forwarded-For doesn't get around it.
/// The login limit is 1 here, so a second try from the same visitor is refused (429).
/// </summary>
public sealed class ProxyHeadersTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private const string Edge = "104.22.17.40"; // what the proxy in front adds after the visitor's address

    private WebApplicationFactory<Program> Host(bool proxyEnabled) => factory.WithWebHostBuilder(builder =>
    {
        builder.UseSetting("RateLimits:Enabled", "true");
        builder.UseSetting("RateLimits:Login:PermitLimit", "1");
        builder.UseSetting("ForwardedHeaders:Enabled", proxyEnabled ? "true" : "false");
        builder.ConfigureTestServices(services => services.PostConfigure<HttpsRedirectionOptions>(options => options.HttpsPort = 443));
    });

    private static HttpClient NewClient(WebApplicationFactory<Program> host, string baseAddress = "https://localhost") =>
        host.CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri(baseAddress), AllowAutoRedirect = false });

    private static async Task<HttpStatusCode> LoginFrom(HttpClient client, string forwardedFor)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/auth/login")
        {
            Content = JsonContent.Create(new LoginRequest("nobody", "WrongPass123")),
        };
        request.Headers.TryAddWithoutValidation("X-Forwarded-For", forwardedFor);
        return (await client.SendAsync(request)).StatusCode;
    }

    [Fact]
    public async Task Each_visitor_behind_the_proxy_has_their_own_limit()
    {
        await using var host = Host(proxyEnabled: true);
        var client = NewClient(host);

        Assert.Equal(HttpStatusCode.Unauthorized, await LoginFrom(client, $"1.1.1.1, {Edge}"));
        Assert.Equal(HttpStatusCode.TooManyRequests, await LoginFrom(client, $"1.1.1.1, {Edge}"));
        Assert.Equal(HttpStatusCode.Unauthorized, await LoginFrom(client, $"2.2.2.2, {Edge}"));
    }

    [Fact]
    public async Task Faking_an_address_does_not_get_around_the_limit()
    {
        await using var host = Host(proxyEnabled: true);
        var client = NewClient(host);

        Assert.Equal(HttpStatusCode.Unauthorized, await LoginFrom(client, $"1.1.1.1, {Edge}"));
        // The visitor sends "9.9.9.9" themselves; the proxy adds their real address and its own after it.
        Assert.Equal(HttpStatusCode.TooManyRequests, await LoginFrom(client, $"9.9.9.9, 1.1.1.1, {Edge}"));
        Assert.Equal(HttpStatusCode.TooManyRequests, await LoginFrom(client, $"8.8.8.8, 9.9.9.9, 1.1.1.1, {Edge}"));
    }

    [Fact]
    public async Task The_headers_are_ignored_when_there_is_no_proxy()
    {
        await using var host = Host(proxyEnabled: false);
        var client = NewClient(host);

        Assert.Equal(HttpStatusCode.Unauthorized, await LoginFrom(client, $"1.1.1.1, {Edge}"));
        Assert.Equal(HttpStatusCode.TooManyRequests, await LoginFrom(client, $"2.2.2.2, {Edge}"));
    }

    [Fact]
    public async Task A_request_that_was_https_at_the_proxy_is_not_redirected_again()
    {
        await using var host = Host(proxyEnabled: true);
        var client = NewClient(host, "http://localhost");

        // Plain HTTP that really is plain HTTP still goes to https.
        await (await client.GetAsync("/api/health")).ShouldHaveStatus(HttpStatusCode.TemporaryRedirect);

        using var fromProxy = new HttpRequestMessage(HttpMethod.Get, "/api/health");
        fromProxy.Headers.TryAddWithoutValidation("X-Forwarded-For", $"1.1.1.1, {Edge}");
        fromProxy.Headers.TryAddWithoutValidation("X-Forwarded-Proto", "https");
        await (await client.SendAsync(fromProxy)).ShouldHaveStatus(HttpStatusCode.OK);
    }
}
