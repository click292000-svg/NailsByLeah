using System.Net;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using NailsByLeah.Api.Infrastructure;

namespace NailsByLeah.Api.Tests.Integration;

/// <summary>The API serves the built website: pages, files, caching and each one's security rule.</summary>
public sealed class WebsiteHostingTests(ApiFactory factory) : IClassFixture<ApiFactory>, IDisposable
{
    private const string PageText = "<!doctype html><title>Nails by Leyah</title>";
    private readonly string _site = Directory.CreateTempSubdirectory("nbl-test-site-").FullName;

    private HttpClient NewSiteClient()
    {
        Directory.CreateDirectory(Path.Combine(_site, "assets"));
        File.WriteAllText(Path.Combine(_site, "index.html"), PageText);
        File.WriteAllText(Path.Combine(_site, "assets", "index-abc123.js"), "console.log('site')");
        var host = factory.WithWebHostBuilder(builder => builder.ConfigureTestServices(services =>
            services.PostConfigure<StaticFileOptions>(options => options.FileProvider = new PhysicalFileProvider(_site))));
        return host.CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost"), AllowAutoRedirect = false });
    }

    public void Dispose() => Directory.Delete(_site, recursive: true);

    private static string SecurityRule(HttpResponseMessage response) => response.Headers.GetValues("Content-Security-Policy").Single();

    [Theory]
    [InlineData("/")]
    [InlineData("/book")]
    [InlineData("/admin/bookings")]
    public async Task Every_page_address_returns_the_website_without_signing_in(string address)
    {
        var response = await NewSiteClient().GetAsync(address);

        await response.ShouldHaveStatus(HttpStatusCode.OK);
        Assert.Equal(PageText, await response.Content.ReadAsStringAsync());
        Assert.Equal(WebsiteHosting.WebsiteContentSecurityPolicy, SecurityRule(response));
        Assert.True(response.Headers.CacheControl?.NoCache, "Browsers must always ask for the latest index.html.");
    }

    [Fact]
    public async Task Built_files_are_served_and_cached_for_a_long_time()
    {
        var response = await NewSiteClient().GetAsync("/assets/index-abc123.js");

        await response.ShouldHaveStatus(HttpStatusCode.OK);
        Assert.Equal(TimeSpan.FromDays(365), response.Headers.CacheControl?.MaxAge);
    }

    [Fact]
    public async Task A_missing_file_is_404_not_the_website()
    {
        var response = await NewSiteClient().GetAsync("/assets/old-build.js");

        await response.ShouldHaveStatus(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task An_unknown_API_address_is_404_not_the_website()
    {
        var response = await NewSiteClient().GetAsync("/api/does-not-exist");

        await response.ShouldHaveStatus(HttpStatusCode.NotFound);
        Assert.DoesNotContain("Nails by Leyah", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task API_answers_keep_the_strict_security_rule()
    {
        var response = await NewSiteClient().GetAsync("/api/health");

        await response.ShouldHaveStatus(HttpStatusCode.OK);
        Assert.Equal(WebsiteHosting.ApiContentSecurityPolicy, SecurityRule(response));
    }

    [Fact]
    public async Task Admin_data_still_needs_signing_in()
    {
        var response = await NewSiteClient().GetAsync("/api/admin/dashboard");

        await response.ShouldHaveStatus(HttpStatusCode.Unauthorized);
    }
}
