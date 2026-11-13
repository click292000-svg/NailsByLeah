using System.Net;
using NailsByLeah.Api.Contracts;
using NailsByLeah.Api.Domain;

namespace NailsByLeah.Api.Tests.Integration;

/// <summary>
/// Booking rules added on 2026-11-10: the Terms version, nail colours, no add-ons with Plain, the "Others"
/// cancellation reason, editing a blocked time, the client directory and the client's own profile.
/// </summary>
public sealed class BookingRulesTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private const int Plain = 1;
    private const int WithDesign = 8; // Soft Gel Extension with Design
    private const int RemovalMyWork = 4;
    private const int Chrome = 2;

    // ---- Terms ----

    [Fact]
    public async Task A_booking_needs_the_current_Terms_version_and_records_when_it_was_agreed_to()
    {
        var user = await factory.CreateClientAsync();

        var missing = await user.Client.PostJsonAsync("/api/bookings", TestHelpers.NewBooking(factory.NextSlot()) with { TermsVersion = null });
        await missing.ShouldHaveStatus(HttpStatusCode.BadRequest);
        Assert.NotEmpty((await missing.ReadProblemAsync()).ErrorsFor("termsVersion"));

        var outdated = await user.Client.PostJsonAsync("/api/bookings", TestHelpers.NewBooking(factory.NextSlot()) with { TermsVersion = "1.0" });
        await outdated.ShouldHaveStatus(HttpStatusCode.Conflict);
        Assert.Equal("terms_outdated", (await outdated.ReadProblemAsync()).ProblemCode());

        var booked = await user.Client.BookAsync(TestHelpers.NewBooking(factory.NextSlot()));
        Assert.Equal(TestHelpers.TermsVersion, booked.Booking.TermsVersion);
        Assert.Equal(factory.Clock.GetUtcNow().UtcDateTime, booked.Booking.TermsAcceptedAt);
    }

    // ---- Colours ----

    [Fact]
    public async Task The_colour_comes_from_the_salons_list_and_is_saved_with_the_booking()
    {
        var catalog = await factory.NewClient().GetAsync<CatalogResponse>("/api/services");
        Assert.Contains(TestHelpers.Color, catalog.NailColors!);
        Assert.Equal(TestHelpers.TermsVersion, catalog.TermsVersion);

        var user = await factory.CreateClientAsync();
        var none = await user.Client.PostJsonAsync("/api/bookings", TestHelpers.NewBooking(factory.NextSlot(), Plain) with { NailColor = null });
        await none.ShouldHaveStatus(HttpStatusCode.BadRequest);
        Assert.NotEmpty((await none.ReadProblemAsync()).ErrorsFor("nailColor"));

        var unknown = await user.Client.PostJsonAsync("/api/bookings", TestHelpers.NewBooking(factory.NextSlot(), Plain) with { NailColor = "Glitter Gold" });
        await unknown.ShouldHaveStatus(HttpStatusCode.BadRequest);

        var booked = await user.Client.BookAsync(TestHelpers.NewBooking(factory.NextSlot(), Plain) with { NailColor = "not sure yet (decide at the salon)" });
        Assert.Equal("Not sure yet (decide at the salon)", booked.Booking.NailColor);

        var shade = await user.Client.BookAsync(TestHelpers.NewBooking(factory.NextSlot(), Plain) with { NailColor = "#58" });
        Assert.Equal("#58", shade.Booking.NailColor);
    }

    [Fact]
    public async Task A_removal_on_its_own_has_no_colour()
    {
        var user = await factory.CreateClientAsync();
        var booked = await user.Client.BookAsync(TestHelpers.NewBooking(factory.NextSlot(), RemovalMyWork));
        Assert.Null(booked.Booking.NailColor);
    }

    // ---- Add-ons ----

    [Fact]
    public async Task Plain_takes_no_add_ons_even_when_the_request_sends_them()
    {
        var user = await factory.CreateClientAsync();

        var response = await user.Client.PostJsonAsync("/api/bookings",
            TestHelpers.NewBooking(factory.NextSlot(), Plain, addOns: new AddOnSelection(Chrome, 2, NailHand.Both)));

        await response.ShouldHaveStatus(HttpStatusCode.BadRequest);
        Assert.Contains("Plain", Assert.Single((await response.ReadProblemAsync()).ErrorsFor("addOns")));

        // With a removal added, Plain still takes none.
        var withRemoval = await user.Client.PostJsonAsync("/api/bookings",
            TestHelpers.NewBooking(factory.NextSlot(), Plain, addOns: new AddOnSelection(Chrome, 2, NailHand.Both)) with { RemovalServiceId = RemovalMyWork });
        await withRemoval.ShouldHaveStatus(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task The_administrator_decides_which_services_take_add_ons()
    {
        var admin = await factory.CreateAdminClientAsync();
        var created = await admin.PostJsonAsync("/api/admin/services",
            new CreateServiceRequest("SoftGel", $"Short {Guid.NewGuid():N}"[..20], 350m, 120, AllowsAddOns: false));
        await created.ShouldHaveStatus(HttpStatusCode.Created);
        var service = await created.ReadAsync<ServiceItemResponse>();
        Assert.False(service.AllowsAddOns);

        var updated = await admin.PutJsonAsync($"/api/admin/services/{service.Id}", new UpdateServiceRequest(service.Name, 350m, true, AllowsAddOns: true));
        Assert.True((await updated.ReadAsync<ServiceItemResponse>()).AllowsAddOns);
    }

    [Fact]
    public async Task With_design_always_costs_its_set_price_plus_100_and_takes_its_set_time_plus_an_hour()
    {
        var admin = await factory.CreateAdminClientAsync();
        // Soft Gel Extension is ₱399 and 2 hours, so its design version stays ₱499 and 3 hours whatever is typed in for it.
        var updated = await admin.PutJsonAsync("/api/admin/services/8", new UpdateServiceRequest("Soft Gel Extension with Design", 999m, true, 30));
        await updated.ShouldHaveStatus(HttpStatusCode.OK);
        var design = await updated.ReadAsync<ServiceItemResponse>();
        Assert.Equal(499m, design.Price);
        Assert.Equal(180, design.DurationMinutes);
    }

    [Fact]
    public void A_design_version_follows_its_set()
    {
        var set = new SoftGelService { Name = "BIAB", Price = 280m, DurationMinutes = 150 };
        var design = new SoftGelService { Name = "BIAB with Design", Price = 1m, DurationMinutes = 15 };
        design.FollowSet(set);
        Assert.Equal(380m, design.Price);
        Assert.Equal(210, design.DurationMinutes);
    }

    // ---- Cancelling with "Others" ----

    [Fact]
    public async Task Others_needs_the_clients_own_reason_which_the_administrator_sees()
    {
        var user = await factory.CreateClientAsync();
        var booked = await user.Client.BookAsync(TestHelpers.NewBooking(factory.NextSlot()));
        var url = $"/api/bookings/{booked.Booking.Id}/cancel";

        var empty = await user.Client.PostJsonAsync(url, new ClientCancelRequest(ClientCancellationReason.Others, "   "));
        await empty.ShouldHaveStatus(HttpStatusCode.BadRequest);
        Assert.NotEmpty((await empty.ReadProblemAsync()).ErrorsFor("explanation"));

        await (await user.Client.PostJsonAsync(url, new ClientCancelRequest(ClientCancellationReason.Others, " My flight was moved "))).ShouldHaveStatus(HttpStatusCode.OK);

        var admin = await factory.CreateAdminClientAsync();
        var seen = await admin.GetAsync<BookingResponse>($"/api/admin/bookings/{booked.Booking.Id}");
        Assert.Equal("Others", seen.Cancellation!.Reason);
        Assert.Equal("My flight was moved", seen.Cancellation.Explanation);
    }

    [Fact]
    public async Task A_listed_reason_keeps_no_explanation()
    {
        var user = await factory.CreateClientAsync();
        var booked = await user.Client.BookAsync(TestHelpers.NewBooking(factory.NextSlot()));

        var response = await user.Client.PostJsonAsync($"/api/bookings/{booked.Booking.Id}/cancel",
            new ClientCancelRequest(ClientCancellationReason.Emergency, "ignored"));

        await response.ShouldHaveStatus(HttpStatusCode.OK);
        Assert.Null((await response.ReadAsync<BookingResponse>()).Cancellation!.Explanation);
    }

    // ---- Blocked times ----

    [Fact]
    public async Task A_blocked_time_can_be_changed_and_clients_see_the_new_one()
    {
        var admin = await factory.CreateAdminClientAsync();
        var date = ApiFactory.StartDate.AddDays(20);
        var created = await (await admin.PostJsonAsync("/api/admin/blocked-slots",
            new BlockSlotRequest(date, new TimeOnly(11, 0), "Errand", new TimeOnly(12, 0)))).ReadAsync<BlockedSlotResponse>();

        var moved = await admin.PutJsonAsync($"/api/admin/blocked-slots/{created.Id}",
            new BlockSlotRequest(date, new TimeOnly(15, 0), "Dentist", new TimeOnly(16, 0)));
        await moved.ShouldHaveStatus(HttpStatusCode.OK);
        var saved = await moved.ReadAsync<BlockedSlotResponse>();
        Assert.Equal((created.Id, new TimeOnly(15, 0), "Dentist"), (saved.Id, saved.StartTime!.Value, saved.Reason));

        var day = await factory.NewClient().GetAsync<DaySlotsResponse>($"/api/slots?date={date:yyyy-MM-dd}");
        Assert.Equal(SlotStatuses.Open, day.Slots.Single(s => s.StartTime == new TimeOnly(11, 0)).Status);
        Assert.Equal(SlotStatuses.Closed, day.Slots.Single(s => s.StartTime == new TimeOnly(15, 30)).Status);
        Assert.True(factory.WithDb(db => db.AuditLogs.Any(a => a.Action == "SlotBlockChanged" && a.EntityId == created.Id.ToString())));
    }

    [Fact]
    public async Task A_blocked_time_cannot_be_moved_onto_a_booking_or_another_block()
    {
        var admin = await factory.CreateAdminClientAsync();
        var date = ApiFactory.StartDate.AddDays(21);
        var user = await factory.CreateClientAsync();
        await user.Client.BookAsync(TestHelpers.NewBooking((date, new TimeOnly(18, 0)), Plain));
        await admin.PostJsonAsync("/api/admin/blocked-slots", new BlockSlotRequest(date, new TimeOnly(15, 0), null, new TimeOnly(16, 0)));
        var block = await (await admin.PostJsonAsync("/api/admin/blocked-slots",
            new BlockSlotRequest(date, new TimeOnly(11, 0), null, new TimeOnly(12, 0)))).ReadAsync<BlockedSlotResponse>();

        var ontoBooking = await admin.PutJsonAsync($"/api/admin/blocked-slots/{block.Id}", new BlockSlotRequest(date, new TimeOnly(18, 30), null, new TimeOnly(19, 0)));
        Assert.Equal("has_active_bookings", (await ontoBooking.ReadProblemAsync()).ProblemCode());
        var ontoBlock = await admin.PutJsonAsync($"/api/admin/blocked-slots/{block.Id}", new BlockSlotRequest(date, new TimeOnly(15, 30), null, new TimeOnly(16, 30)));
        Assert.Equal("already_blocked", (await ontoBlock.ReadProblemAsync()).ProblemCode());

        // Moving it within its own time is fine: it doesn't clash with itself.
        await (await admin.PutJsonAsync($"/api/admin/blocked-slots/{block.Id}", new BlockSlotRequest(date, new TimeOnly(11, 0), null, new TimeOnly(12, 30))))
            .ShouldHaveStatus(HttpStatusCode.OK);
    }

    // ---- Admin booking calendar and filters ----

    [Fact]
    public async Task The_calendar_counts_bookings_per_day_and_the_list_filters_by_service()
    {
        var user = await factory.CreateClientAsync();
        var date = ApiFactory.StartDate.AddDays(25);
        var plain = await user.Client.BookAsync(TestHelpers.NewBooking((date, new TimeOnly(11, 0)), Plain));
        var design = await user.Client.BookAsync(TestHelpers.NewBooking((date, new TimeOnly(14, 0)), WithDesign) with { RemovalServiceId = RemovalMyWork });
        await user.Client.PostJsonAsync($"/api/bookings/{plain.Booking.Id}/cancel", new ClientCancelRequest(ClientCancellationReason.Emergency));
        var admin = await factory.CreateAdminClientAsync();

        var month = await admin.GetAsync<List<BookingCalendarDayResponse>>($"/api/admin/bookings/calendar?year={date.Year}&month={date.Month}");
        var day = Assert.Single(month, d => d.Date == date);
        Assert.Equal((2, 1), (day.Count, day.ActiveCount));
        await (await admin.GetAsync($"/api/admin/bookings/calendar?year={date.Year}&month=13")).ShouldHaveStatus(HttpStatusCode.BadRequest);
        await (await user.Client.GetAsync($"/api/admin/bookings/calendar?year={date.Year}&month={date.Month}")).ShouldHaveStatus(HttpStatusCode.Forbidden);

        // The removal counts as a service of the booking it was added to.
        var byRemoval = await admin.GetAsync<PagedResponse<BookingResponse>>($"/api/admin/bookings?date={date:yyyy-MM-dd}&serviceId={RemovalMyWork}");
        Assert.Equal(design.Booking.Id, Assert.Single(byRemoval.Items).Id);
        var byReference = await admin.GetAsync<PagedResponse<BookingResponse>>($"/api/admin/bookings?clientName={design.Receipt.ReferenceNumber}");
        Assert.Equal(design.Booking.Id, Assert.Single(byReference.Items).Id);
    }

    // ---- Client directory ----

    [Fact]
    public async Task The_administrator_lists_clients_A_to_Z_and_can_search_them()
    {
        var tag = Guid.NewGuid().ToString("N")[..6];
        var zed = await factory.CreateClientAsync(factory.NewRegistration(username: $"zz{tag}"));
        var amy = await factory.CreateClientAsync(factory.NewRegistration(username: $"aa{tag}"));
        var admin = await factory.CreateAdminClientAsync();

        var found = await (await admin.PostJsonAsync("/api/admin/clients/search", new ClientSearchRequest(tag))).ReadAsync<PagedResponse<ClientListItemResponse>>();
        Assert.Equal([amy.Username, zed.Username], found.Items.Select(c => c.Username).ToArray());

        var all = await (await admin.PostJsonAsync("/api/admin/clients/search", new ClientSearchRequest(null, 1, 100))).ReadAsync<PagedResponse<ClientListItemResponse>>();
        Assert.Equal(all.Items.Select(c => c.Username).Order(StringComparer.OrdinalIgnoreCase).ToArray(), all.Items.Select(c => c.Username).ToArray());
        Assert.DoesNotContain(all.Items, c => c.Username == ApiFactory.AdminUsername);

        var paged = await (await admin.PostJsonAsync("/api/admin/clients/search", new ClientSearchRequest(tag, 2, 1))).ReadAsync<PagedResponse<ClientListItemResponse>>();
        Assert.Equal((2, zed.Username), (paged.TotalCount, Assert.Single(paged.Items).Username));

        var details = await admin.GetAsync<ClientDataResponse>($"/api/admin/clients/{amy.Id}");
        Assert.Equal(amy.Email, details.Email);

        await (await amy.Client.PostJsonAsync("/api/admin/clients/search", new ClientSearchRequest(null))).ShouldHaveStatus(HttpStatusCode.Forbidden);
    }

    // ---- Profile ----

    [Fact]
    public async Task A_client_updates_their_own_name_and_phone_which_is_stored_as_09()
    {
        var user = await factory.CreateClientAsync();
        var phone = $"+63918{factory.NextUserNumber():D7}";

        var response = await user.Client.PutJsonAsync("/api/auth/me", new UpdateProfileRequest(" Kyla ", "Reyes", phone));

        await response.ShouldHaveStatus(HttpStatusCode.OK);
        var profile = await user.Client.GetAsync<UserProfileResponse>("/api/auth/me");
        Assert.Equal(("Kyla", "Reyes", "0" + phone[3..]), (profile.FirstName, profile.LastName, profile.PhoneNumber));
        Assert.Equal(user.Username, profile.Username); // not editable
    }

    [Fact]
    public async Task A_profile_update_is_checked_like_sign_up()
    {
        var user = await factory.CreateClientAsync();
        var other = await factory.CreateClientAsync();
        var otherPhone = (await other.Client.GetAsync<UserProfileResponse>("/api/auth/me")).PhoneNumber;

        var bad = await user.Client.PutJsonAsync("/api/auth/me", new UpdateProfileRequest("Kyla", "Reyes", "12345"));
        await bad.ShouldHaveStatus(HttpStatusCode.BadRequest);
        Assert.NotEmpty((await bad.ReadProblemAsync()).ErrorsFor("phoneNumber"));

        var taken = await user.Client.PutJsonAsync("/api/auth/me", new UpdateProfileRequest("Kyla", "Reyes", otherPhone));
        await taken.ShouldHaveStatus(HttpStatusCode.BadRequest);

        await (await factory.NewClient().PutJsonAsync("/api/auth/me", new UpdateProfileRequest("Kyla", "Reyes", "09170000001")))
            .ShouldHaveStatus(HttpStatusCode.Unauthorized);
    }
}
