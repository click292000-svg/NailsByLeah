using System.Net;
using NailsByLeah.Api.Contracts;

namespace NailsByLeah.Api.Tests.Integration;

/// <summary>SQL injection, XSS and role-based access control (tests 9.1.9, 9.1.10, Ref 8.7).</summary>
public sealed class SecurityTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private const string SqlInjection = "' OR 1=1 --";
    private const string ScriptTag = "<script>alert(1)</script>";

    [Fact] // AllowedHosts: a request for an address that isn't this site is refused.
    public async Task Request_for_another_address_is_refused()
    {
        var client = factory.NewClient();
        using var forged = new HttpRequestMessage(HttpMethod.Get, "/api/health");
        forged.Headers.Host = "evil.example";

        await (await client.SendAsync(forged)).ShouldHaveStatus(HttpStatusCode.BadRequest);
        await (await client.GetAsync("/api/health")).ShouldHaveStatus(HttpStatusCode.OK);
    }

    [Fact] // 9.1.9
    public async Task Sql_injection_text_is_stored_as_plain_text()
    {
        var usersBefore = factory.WithDb(db => db.Users.Count());
        var user = await factory.CreateClientAsync(factory.NewRegistration(firstName: SqlInjection, username: SqlInjection));

        var stored = factory.WithDb(db => db.Users.Single(u => u.Id == user.Id));
        Assert.Equal(SqlInjection, stored.FirstName);
        Assert.Equal(SqlInjection, stored.Username);
        Assert.Equal(usersBefore + 1, factory.WithDb(db => db.Users.Count()));

        // The same text cannot be used to log in as someone else.
        var bypass = await factory.NewClient().PostJsonAsync("/api/auth/login", new LoginRequest("x' OR 1=1 --", "anything1"));
        await bypass.ShouldHaveStatus(HttpStatusCode.Unauthorized);
    }

    [Fact] // 9.1.10
    public async Task Script_tags_in_names_are_returned_as_text_not_html()
    {
        var user = await factory.CreateClientAsync(factory.NewRegistration(firstName: ScriptTag));

        var response = await user.Client.GetAsync("/api/auth/me");
        var raw = await response.Content.ReadAsStringAsync();
        var profile = await response.ReadAsync<UserProfileResponse>();

        Assert.Equal(ScriptTag, profile.FirstName);
        Assert.DoesNotContain("<script>", raw);
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);
        Assert.Equal("nosniff", response.Headers.GetValues("X-Content-Type-Options").Single());
    }

    [Fact] // Ref 8.7
    public async Task Clients_cannot_use_administrator_endpoints()
    {
        var client = (await factory.CreateClientAsync()).Client;

        await (await client.GetAsync("/api/admin/dashboard")).ShouldHaveStatus(HttpStatusCode.Forbidden);
        await (await client.GetAsync("/api/admin/bookings")).ShouldHaveStatus(HttpStatusCode.Forbidden);
        await (await client.PutJsonAsync("/api/admin/services/1", new UpdateServiceRequest("Plain", 1m, true)))
            .ShouldHaveStatus(HttpStatusCode.Forbidden);
    }

    [Fact] // Ref 8.7
    public async Task Administrators_cannot_use_client_endpoints()
    {
        var admin = await factory.CreateAdminClientAsync();

        await (await admin.GetAsync("/api/bookings")).ShouldHaveStatus(HttpStatusCode.Forbidden);
        await (await admin.PostJsonAsync("/api/bookings", TestHelpers.NewBooking(factory.NextSlot())))
            .ShouldHaveStatus(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Anonymous_users_can_only_reach_public_endpoints()
    {
        var anonymous = factory.NewClient();

        await (await anonymous.GetAsync("/api/bookings")).ShouldHaveStatus(HttpStatusCode.Unauthorized);
        await (await anonymous.GetAsync("/api/admin/dashboard")).ShouldHaveStatus(HttpStatusCode.Unauthorized);
        await (await anonymous.GetAsync("/api/services")).ShouldHaveStatus(HttpStatusCode.OK);
        await (await anonymous.GetAsync("/api/lookups")).ShouldHaveStatus(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Clients_cannot_see_each_others_bookings()
    {
        var owner = await factory.CreateClientAsync();
        var other = await factory.CreateClientAsync();
        var booking = await owner.Client.BookAsync(TestHelpers.NewBooking(factory.NextSlot()));

        await (await other.Client.GetAsync($"/api/bookings/{booking.Booking.Id}")).ShouldHaveStatus(HttpStatusCode.NotFound);
        await (await other.Client.PostJsonAsync($"/api/bookings/{booking.Booking.Id}/cancel",
            new ClientCancelRequest(Domain.ClientCancellationReason.Emergency))).ShouldHaveStatus(HttpStatusCode.NotFound);
    }
}
