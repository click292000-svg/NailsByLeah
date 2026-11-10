using System.Net;
using System.Net.Http.Headers;
using NailsByLeah.Api.Contracts;
using NailsByLeah.Api.Domain;

namespace NailsByLeah.Api.Tests.Integration;

/// <summary>
/// Leyah's profile: the salon details the website shows, her photo, the email alert switches, and changing a password or
/// signing out other devices. Its own database, because one test switches alerts off.
/// </summary>
public sealed class SalonProfileTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private static readonly byte[] Png = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0];

    private static UpdateSalonSettingsRequest Details(bool alerts = true) => new(
        "+639171234567", "Leyah D.", "facebook.com/nailsbyleyah", "https://www.instagram.com/nailsbyleyah/", "@nailsbyleyah",
        "Soft gel and BIAB, done with care.", alerts, alerts, alerts);

    [Fact]
    public async Task Salon_details_saved_by_Leyah_are_shown_to_everyone_and_cleaned_up()
    {
        var admin = await factory.CreateAdminClientAsync();

        var saved = await (await admin.PutJsonAsync("/api/admin/salon-settings", Details())).ReadAsync<SalonSettingsResponse>();
        var shown = await factory.NewClient().GetAsync<SalonProfileResponse>("/api/salon");

        Assert.Equal(saved.Profile, shown);
        Assert.Equal("09171234567", shown.Phone); // stored the usual way
        Assert.Equal("https://facebook.com/nailsbyleyah", shown.FacebookUrl); // https added
        Assert.Equal("@nailsbyleyah", shown.InstagramHandle);
        Assert.Equal("Leyah D.", shown.PaymentAccountName);
    }

    [Fact]
    public async Task Links_to_other_sites_and_bad_numbers_are_refused_and_clients_cannot_change_anything()
    {
        var admin = await factory.CreateAdminClientAsync();
        var bad = Details() with { FacebookUrl = "https://evil.example/facebook.com", Phone = "12345", InstagramHandle = "@bad handle!" };

        var response = await admin.PutJsonAsync("/api/admin/salon-settings", bad);
        await response.ShouldHaveStatus(HttpStatusCode.BadRequest);
        var problem = await response.ReadProblemAsync();
        Assert.NotEmpty(problem.ErrorsFor("facebookUrl"));
        Assert.NotEmpty(problem.ErrorsFor("phone"));
        Assert.NotEmpty(problem.ErrorsFor("instagramHandle"));

        var user = await factory.CreateClientAsync();
        await (await user.Client.PutJsonAsync("/api/admin/salon-settings", Details())).ShouldHaveStatus(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Leyahs_photo_is_uploaded_shown_and_removed()
    {
        var admin = await factory.CreateAdminClientAsync();
        var file = new ByteArrayContent(Png);
        file.Headers.ContentType = new MediaTypeHeaderValue("image/png");

        var uploaded = await (await admin.PostAsync("/api/admin/salon-settings/photo", new MultipartFormDataContent { { file, "file", "me.png" } }))
            .ReadAsync<SalonSettingsResponse>();
        Assert.StartsWith("/api/salon/photo?v=", uploaded.Profile.PhotoUrl);

        var photo = await factory.NewClient().GetAsync(uploaded.Profile.PhotoUrl);
        await photo.ShouldHaveStatus(HttpStatusCode.OK);
        Assert.Equal("image/png", photo.Content.Headers.ContentType?.MediaType);
        Assert.Equal(Png, await photo.Content.ReadAsByteArrayAsync());

        var removed = await (await admin.DeleteAsync("/api/admin/salon-settings/photo")).ReadAsync<SalonSettingsResponse>();
        Assert.Null(removed.Profile.PhotoUrl);
        await (await factory.NewClient().GetAsync("/api/salon/photo")).ShouldHaveStatus(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Switched_off_alerts_are_not_sent_and_switched_on_ones_are()
    {
        var admin = await factory.CreateAdminClientAsync();
        await (await admin.PutJsonAsync("/api/admin/salon-settings", Details(alerts: false))).ShouldHaveStatus(HttpStatusCode.OK);

        var user = await factory.CreateClientAsync();
        var quiet = await user.Client.BookAsync(TestHelpers.NewBooking(factory.NextSlot()));
        await user.Client.PostJsonAsync($"/api/bookings/{quiet.Booking.Id}/cancel", new ClientCancelRequest(ClientCancellationReason.ChangeOfSchedule));
        Assert.DoesNotContain(quiet.Booking.Id, factory.Notifications.SalonNewBookingIds);
        Assert.False(factory.Notifications.SalonCancellationReasons.ContainsKey(quiet.Booking.Id));
        Assert.Contains(quiet.Booking.Id, factory.Notifications.ConfirmedBookingIds); // the client's own email still goes

        await (await admin.PutJsonAsync("/api/admin/salon-settings", Details(alerts: true))).ShouldHaveStatus(HttpStatusCode.OK);
        var heard = await user.Client.BookAsync(TestHelpers.NewBooking(factory.NextSlot()));
        Assert.Contains(heard.Booking.Id, factory.Notifications.SalonNewBookingIds);
    }

    [Fact]
    public async Task Changing_the_password_needs_the_current_one_and_signs_out_other_devices_but_not_this_one()
    {
        var user = await factory.CreateClientAsync();
        var otherDevice = factory.NewClient();
        await (await otherDevice.PostJsonAsync("/api/auth/login", new LoginRequest(user.Username, ApiFactory.DefaultPassword))).ShouldHaveStatus(HttpStatusCode.OK);

        var wrong = await user.Client.PostJsonAsync("/api/auth/change-password", new ChangePasswordRequest("Nope12345", "Brand3New"));
        await wrong.ShouldHaveStatus(HttpStatusCode.BadRequest);
        Assert.NotEmpty((await wrong.ReadProblemAsync()).ErrorsFor("currentPassword"));
        var same = await user.Client.PostJsonAsync("/api/auth/change-password", new ChangePasswordRequest(ApiFactory.DefaultPassword, ApiFactory.DefaultPassword));
        await same.ShouldHaveStatus(HttpStatusCode.BadRequest);

        await (await user.Client.PostJsonAsync("/api/auth/change-password", new ChangePasswordRequest(ApiFactory.DefaultPassword, "Brand3New")))
            .ShouldHaveStatus(HttpStatusCode.OK);

        await (await user.Client.GetAsync("/api/auth/me")).ShouldHaveStatus(HttpStatusCode.OK); // still signed in here
        await (await otherDevice.GetAsync("/api/auth/me")).ShouldHaveStatus(HttpStatusCode.Unauthorized);
        await (await factory.NewClient().PostJsonAsync("/api/auth/login", new LoginRequest(user.Username, "Brand3New"))).ShouldHaveStatus(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Signing_out_other_devices_keeps_this_one_and_the_previous_sign_in_is_shown()
    {
        var user = await factory.CreateClientAsync();
        var otherDevice = factory.NewClient();
        await (await otherDevice.PostJsonAsync("/api/auth/login", new LoginRequest(user.Username, ApiFactory.DefaultPassword))).ShouldHaveStatus(HttpStatusCode.OK);

        var security = await otherDevice.GetAsync<AccountSecurityResponse>("/api/auth/security");
        Assert.NotNull(security.PreviousSignInAt); // the first sign-in, before this one

        await (await otherDevice.PostAsync("/api/auth/sign-out-other-devices", null)).ShouldHaveStatus(HttpStatusCode.OK);
        await (await otherDevice.GetAsync("/api/auth/me")).ShouldHaveStatus(HttpStatusCode.OK);
        await (await user.Client.GetAsync("/api/auth/me")).ShouldHaveStatus(HttpStatusCode.Unauthorized);
    }
}
