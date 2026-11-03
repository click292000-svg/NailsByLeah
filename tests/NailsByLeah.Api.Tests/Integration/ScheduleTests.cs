using System.Net;
using NailsByLeah.Api.Contracts;

namespace NailsByLeah.Api.Tests.Integration;

/// <summary>Opening hours (11:00 AM to an administrator-set closing time), service durations and the 30-minute break.</summary>
public sealed class ScheduleTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    // Seeded durations: Plain 60, With Design 90.
    private const int Plain = 1;
    private const int WithDesign = 2;

    private static (DateOnly, TimeOnly) At(int daysAhead, int hour, int minute = 0) =>
        (ApiFactory.StartDate.AddDays(daysAhead), new TimeOnly(hour, minute));

    private static string SlotsUrl(int daysAhead, int? serviceId = null) =>
        $"/api/slots?date={ApiFactory.StartDate.AddDays(daysAhead):yyyy-MM-dd}" + (serviceId is { } id ? $"&serviceId={id}" : "");

    [Fact]
    public async Task Salon_opens_at_11_and_closes_at_9_by_default()
    {
        var hours = await factory.NewClient().GetAsync<SalonHoursResponse>("/api/salon-hours");

        Assert.Equal(new TimeOnly(11, 0), hours.OpeningTime);
        Assert.Equal(new TimeOnly(21, 0), hours.ClosingTime);
        Assert.Equal(30, hours.BufferMinutes);

        var day = await factory.NewClient().GetAsync<DaySlotsResponse>(SlotsUrl(3));
        Assert.Equal(new TimeOnly(11, 0), day.Slots[0].StartTime);
        Assert.Equal(new TimeOnly(20, 30), day.Slots[^1].StartTime);
    }

    [Fact]
    public async Task Appointments_cannot_start_before_11()
    {
        var user = await factory.CreateClientAsync();

        var response = await user.Client.PostJsonAsync("/api/bookings", TestHelpers.NewBooking(At(4, 10, 30)));

        await response.ShouldHaveStatus(HttpStatusCode.BadRequest);
        Assert.Contains("11:00 AM", Assert.Single((await response.ReadProblemAsync()).ErrorsFor("startTime")));
    }

    [Fact] // The scheduling example: 11:00 + 60 minutes = 12:00, + 30-minute break = next appointment at 12:30.
    public async Task Next_appointment_starts_30_minutes_after_the_previous_one_ends()
    {
        var first = await factory.CreateClientAsync();
        var booked = await first.Client.BookAsync(TestHelpers.NewBooking(At(5, 11), Plain));
        Assert.Equal(new TimeOnly(12, 0), booked.Booking.EndTime);
        Assert.Equal(60, booked.Booking.DurationMinutes);

        var day = await factory.NewClient().GetAsync<DaySlotsResponse>(SlotsUrl(5, Plain));
        string Status(int hour, int minute) => day.Slots.Single(s => s.StartTime == new TimeOnly(hour, minute)).Status;
        Assert.Equal(SlotStatuses.Booked, Status(11, 0));
        Assert.Equal(SlotStatuses.Booked, Status(12, 0)); // the break
        Assert.Equal(SlotStatuses.Open, Status(12, 30));

        var second = await factory.CreateClientAsync();
        var tooEarly = await second.Client.PostJsonAsync("/api/bookings", TestHelpers.NewBooking(At(5, 12), Plain));
        await tooEarly.ShouldHaveStatus(HttpStatusCode.Conflict);
        Assert.Equal("slot_unavailable", (await tooEarly.ReadProblemAsync()).ProblemCode());

        await second.Client.BookAsync(TestHelpers.NewBooking(At(5, 12, 30), Plain));
    }

    [Fact]
    public async Task A_longer_service_must_also_end_30_minutes_before_the_next_appointment()
    {
        var first = await factory.CreateClientAsync();
        await first.Client.BookAsync(TestHelpers.NewBooking(At(6, 14), Plain));

        // With Design (90 minutes) at 12:30 would end at 14:00, leaving no break before the 14:00 appointment.
        var day = await factory.NewClient().GetAsync<DaySlotsResponse>(SlotsUrl(6, WithDesign));
        var at1230 = day.Slots.Single(s => s.StartTime == new TimeOnly(12, 30));
        Assert.Equal(SlotStatuses.TooShort, at1230.Status);
        Assert.Equal(new TimeOnly(14, 0), at1230.EndTime);
        Assert.Equal(SlotStatuses.Open, day.Slots.Single(s => s.StartTime == new TimeOnly(12, 0)).Status);

        var second = await factory.CreateClientAsync();
        await (await second.Client.PostJsonAsync("/api/bookings", TestHelpers.NewBooking(At(6, 12, 30), WithDesign)))
            .ShouldHaveStatus(HttpStatusCode.Conflict);
        await second.Client.BookAsync(TestHelpers.NewBooking(At(6, 12), WithDesign));
    }

    [Fact]
    public async Task A_service_must_finish_by_closing_time()
    {
        var user = await factory.CreateClientAsync();

        var response = await user.Client.PostJsonAsync("/api/bookings", TestHelpers.NewBooking(At(7, 20), WithDesign));

        await response.ShouldHaveStatus(HttpStatusCode.Conflict);
        Assert.Contains("closing time", (await response.ReadProblemAsync()).GetProperty("detail").GetString());
        await user.Client.BookAsync(TestHelpers.NewBooking(At(7, 19, 30), WithDesign)); // ends 9:00 PM exactly
    }

    [Fact] // Double booking with different start times: 11:00 (until 12:30 with the break) and 11:30.
    public async Task Overlapping_bookings_made_at_the_same_moment_only_one_succeeds()
    {
        var first = await factory.CreateClientAsync();
        var second = await factory.CreateClientAsync();

        var responses = await Task.WhenAll(
            first.Client.PostJsonAsync("/api/bookings", TestHelpers.NewBooking(At(8, 11), Plain)),
            second.Client.PostJsonAsync("/api/bookings", TestHelpers.NewBooking(At(8, 11, 30), Plain)));

        Assert.Single(responses, r => r.StatusCode == HttpStatusCode.Created);
        var loser = Assert.Single(responses, r => r.StatusCode == HttpStatusCode.Conflict);
        Assert.Equal("slot_unavailable", (await loser.ReadProblemAsync()).ProblemCode());
        Assert.Equal(1, factory.WithDb(db => db.Bookings.Count(b => b.BookingDate == ApiFactory.StartDate.AddDays(8))));
    }

    [Fact]
    public async Task Blocked_periods_cannot_be_booked()
    {
        var admin = await factory.CreateAdminClientAsync();
        var date = ApiFactory.StartDate.AddDays(9);
        await (await admin.PostJsonAsync("/api/admin/blocked-slots",
            new BlockSlotRequest(date, new TimeOnly(15, 0), "Errand", new TimeOnly(17, 0)))).ShouldHaveStatus(HttpStatusCode.Created);

        var day = await factory.NewClient().GetAsync<DaySlotsResponse>(SlotsUrl(9, Plain));
        Assert.Equal(SlotStatuses.Closed, day.Slots.Single(s => s.StartTime == new TimeOnly(16, 30)).Status);
        Assert.Equal(SlotStatuses.TooShort, day.Slots.Single(s => s.StartTime == new TimeOnly(14, 30)).Status);

        var user = await factory.CreateClientAsync();
        await (await user.Client.PostJsonAsync("/api/bookings", TestHelpers.NewBooking((date, new TimeOnly(14, 30)), Plain)))
            .ShouldHaveStatus(HttpStatusCode.Conflict);
        await user.Client.BookAsync(TestHelpers.NewBooking((date, new TimeOnly(14, 0)), Plain)); // ends 3:00 PM
    }

    [Fact]
    public async Task Administrator_sets_the_closing_time_but_not_before_booked_appointments_end()
    {
        var user = await factory.CreateClientAsync();
        await user.Client.BookAsync(TestHelpers.NewBooking(At(10, 19), Plain)); // ends 8:00 PM
        var admin = await factory.CreateAdminClientAsync();

        var tooEarly = await admin.PutJsonAsync("/api/admin/salon-hours", new UpdateSalonHoursRequest(new TimeOnly(19, 30)));
        await tooEarly.ShouldHaveStatus(HttpStatusCode.Conflict);
        Assert.Equal("has_active_bookings", (await tooEarly.ReadProblemAsync()).ProblemCode());
        await (await admin.PutJsonAsync("/api/admin/salon-hours", new UpdateSalonHoursRequest(new TimeOnly(10, 0))))
            .ShouldHaveStatus(HttpStatusCode.BadRequest);
        await (await user.Client.PutJsonAsync("/api/admin/salon-hours", new UpdateSalonHoursRequest(new TimeOnly(22, 0))))
            .ShouldHaveStatus(HttpStatusCode.Forbidden);

        try
        {
            var updated = await admin.PutJsonAsync("/api/admin/salon-hours", new UpdateSalonHoursRequest(new TimeOnly(20, 0)));
            await updated.ShouldHaveStatus(HttpStatusCode.OK);
            var day = await factory.NewClient().GetAsync<DaySlotsResponse>(SlotsUrl(11, Plain));
            Assert.Equal(new TimeOnly(20, 0), day.ClosingTime);
            Assert.Equal(SlotStatuses.TooShort, day.Slots[^1].Status); // 7:30 PM + 60 minutes is past 8:00 PM
            await (await user.Client.PostJsonAsync("/api/bookings", TestHelpers.NewBooking(At(11, 19, 30), Plain)))
                .ShouldHaveStatus(HttpStatusCode.Conflict);
        }
        finally
        {
            await admin.PutJsonAsync("/api/admin/salon-hours", new UpdateSalonHoursRequest(new TimeOnly(21, 0)));
        }
    }

    [Fact]
    public async Task Service_durations_are_set_by_the_administrator()
    {
        var admin = await factory.CreateAdminClientAsync();
        var created = await admin.PostJsonAsync("/api/admin/services",
            new CreateServiceRequest("SoftGel", $"Long {Guid.NewGuid():N}"[..20], 600m, DurationMinutes: 120));
        await created.ShouldHaveStatus(HttpStatusCode.Created);
        var service = await created.ReadAsync<ServiceItemResponse>();
        Assert.Equal(120, service.DurationMinutes);

        var day = await factory.NewClient().GetAsync<DaySlotsResponse>(SlotsUrl(12, service.Id));
        Assert.Equal(new TimeOnly(13, 0), day.Slots[0].EndTime);

        var updated = await admin.PutJsonAsync($"/api/admin/services/{service.Id}",
            new UpdateServiceRequest(service.Name, 600m, true, DurationMinutes: 75));
        Assert.Equal(75, (await updated.ReadAsync<ServiceItemResponse>()).DurationMinutes);

        var invalid = await admin.PutJsonAsync($"/api/admin/services/{service.Id}", new UpdateServiceRequest(service.Name, 600m, true, 7));
        await invalid.ShouldHaveStatus(HttpStatusCode.BadRequest);
        Assert.NotEmpty((await invalid.ReadProblemAsync()).ErrorsFor("durationMinutes"));
    }
}
