using System.Net;
using Microsoft.EntityFrameworkCore;
using NailsByLeah.Api.Contracts;
using NailsByLeah.Api.Domain;

namespace NailsByLeah.Api.Tests.Integration;

/// <summary>Erasing a client's personal data on request: what goes, what stays, and who may do it.</summary>
public sealed class ClientDataTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private static Task<HttpResponseMessage> Erase(HttpClient admin, int clientId) =>
        admin.PostAsync($"/api/admin/clients/{clientId}/delete-data", null);

    /// <summary>A client with one completed booking that has a note, so there is something to erase and something to keep.</summary>
    private async Task<(TestUser User, HttpClient Admin, int BookingId)> ClientWithFinishedBookingAsync()
    {
        var user = await factory.CreateClientAsync();
        var admin = await factory.CreateAdminClientAsync();
        var (date, time) = factory.NextSlot();
        var booked = await user.Client.BookAsync(TestHelpers.NewBooking((date, time), 1) with { Note = "Short almond please" });
        var cancelled = await admin.PostJsonAsync($"/api/admin/bookings/{booked.Booking.Id}/cancel",
            new { reason = "StaffUnavailable", explanation = "Told the client by phone" });
        await cancelled.ShouldHaveStatus(HttpStatusCode.OK);
        return (user, admin, booked.Booking.Id);
    }

    [Fact]
    public async Task Find_shows_what_the_salon_holds_about_the_client()
    {
        var (user, admin, _) = await ClientWithFinishedBookingAsync();

        var response = await admin.PostJsonAsync("/api/admin/clients/find", new EmailRequest(user.Email));

        await response.ShouldHaveStatus(HttpStatusCode.OK);
        var found = await response.ReadAsync<ClientDataResponse>();
        Assert.Equal((user.Id, user.Email, 1, 0), (found.Id, found.Email, found.BookingCount, found.ActiveBookingCount));
    }

    [Fact]
    public async Task Find_does_not_return_administrators_or_unknown_emails()
    {
        var admin = await factory.CreateAdminClientAsync();

        await (await admin.PostJsonAsync("/api/admin/clients/find", new EmailRequest("admin@test.local"))).ShouldHaveStatus(HttpStatusCode.NotFound);
        await (await admin.PostJsonAsync("/api/admin/clients/find", new EmailRequest("nobody@test.local"))).ShouldHaveStatus(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Erasing_removes_personal_data_and_keeps_the_booking_and_payment()
    {
        var (user, admin, bookingId) = await ClientWithFinishedBookingAsync();
        var paymentBefore = factory.WithDb(db => db.Payments.Single(p => p.BookingId == bookingId).Amount);

        await (await Erase(admin, user.Id)).ShouldHaveStatus(HttpStatusCode.NoContent);

        var stored = factory.WithDb(db => db.Users.Single(u => u.Id == user.Id));
        Assert.True(stored.IsDeleted);
        Assert.Equal(("Deleted", "Client"), (stored.FirstName, stored.LastName));
        Assert.DoesNotContain(user.Username, stored.Username);
        Assert.NotEqual(user.Email, stored.Email);
        Assert.StartsWith("00", stored.PhoneNumber);

        var booking = factory.WithDb(db => db.Bookings.Include(b => b.Cancellation).Single(b => b.Id == bookingId));
        Assert.Null(booking.Note);
        Assert.Null(booking.Cancellation!.Explanation);
        Assert.Equal(paymentBefore, factory.WithDb(db => db.Payments.Single(p => p.BookingId == bookingId).Amount));

        Assert.False(factory.WithDb(db => db.UserTokens.Any(t => t.UserId == user.Id)));
        Assert.False(factory.WithDb(db => db.AuditLogs.Any(a => a.UserId == user.Id && (a.IpAddress != null || a.Details != null))));
        Assert.True(factory.WithDb(db => db.AuditLogs.Any(a => a.Action == "ClientDataDeleted" && a.EntityId == user.Id.ToString())));
    }

    [Fact]
    public async Task Erased_client_is_signed_out_and_cannot_sign_in_again()
    {
        var (user, admin, _) = await ClientWithFinishedBookingAsync();

        await (await Erase(admin, user.Id)).ShouldHaveStatus(HttpStatusCode.NoContent);

        await (await user.Client.GetAsync("/api/auth/me")).ShouldHaveStatus(HttpStatusCode.Unauthorized);
        await (await factory.NewClient().PostJsonAsync("/api/auth/login", new LoginRequest(user.Username, ApiFactory.DefaultPassword)))
            .ShouldHaveStatus(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task The_same_email_can_sign_up_again_after_erasing()
    {
        var (user, admin, _) = await ClientWithFinishedBookingAsync();
        await (await Erase(admin, user.Id)).ShouldHaveStatus(HttpStatusCode.NoContent);

        var again = factory.NewRegistration() with { Email = user.Email };

        await (await factory.NewClient().PostJsonAsync("/api/auth/register", again)).ShouldHaveStatus(HttpStatusCode.Created);
    }

    [Fact]
    public async Task Erasing_is_refused_while_a_booking_is_open()
    {
        var user = await factory.CreateClientAsync();
        var admin = await factory.CreateAdminClientAsync();
        await user.Client.BookAsync(TestHelpers.NewBooking(factory.NextSlot(), 1));

        var response = await Erase(admin, user.Id);

        await response.ShouldHaveStatus(HttpStatusCode.Conflict);
        Assert.Equal("client_has_active_bookings", (await response.ReadProblemAsync()).ProblemCode());
        Assert.False(factory.WithDb(db => db.Users.Single(u => u.Id == user.Id).IsDeleted));
    }

    [Fact]
    public async Task Clients_cannot_find_or_erase_anyone()
    {
        var user = await factory.CreateClientAsync();

        await (await user.Client.PostJsonAsync("/api/admin/clients/find", new EmailRequest(user.Email))).ShouldHaveStatus(HttpStatusCode.Forbidden);
        await (await Erase(user.Client, user.Id)).ShouldHaveStatus(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Administrator_accounts_cannot_be_erased()
    {
        var admin = await factory.CreateAdminClientAsync();
        var adminId = factory.WithDb(db => db.Users.Single(u => u.Role == UserRole.Administrator).Id);

        await (await Erase(admin, adminId)).ShouldHaveStatus(HttpStatusCode.NotFound);
    }
}
