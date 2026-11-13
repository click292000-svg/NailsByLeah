using System.Net;
using NailsByLeah.Api.Contracts;
using NailsByLeah.Api.Domain;

namespace NailsByLeah.Api.Tests.Integration;

/// <summary>Leyah's revisions of 2026-11-12: the new services, colours per nail, colour requests and the reschedule limit.</summary>
public sealed class RevisionTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private const int Plain = 1;
    private const int SoftGelExtensionWithDesign = 8;
    private const int Biab = 3;
    private const int BiabWithDesign = 6;
    private const int SoftGelExtension = 7;

    [Fact]
    public async Task Price_list_has_the_design_options_soft_gel_extension_and_rhinestone()
    {
        var catalog = await factory.NewClient().GetAsync<CatalogResponse>("/api/services");

        var byId = catalog.Services.ToDictionary(s => s.Id);
        // Only Soft Gel Extension and BIAB take a design: Plain's "With Design" (id 2) is retired.
        Assert.False(byId.ContainsKey(2));
        Assert.DoesNotContain(catalog.Services, s => s.DesignOptionOfId == Plain);
        Assert.Equal(SoftGelExtension, byId[SoftGelExtensionWithDesign].DesignOptionOfId);
        Assert.Equal((499m, 180), (byId[SoftGelExtensionWithDesign].Price, byId[SoftGelExtensionWithDesign].DurationMinutes));
        Assert.Equal(Biab, byId[BiabWithDesign].DesignOptionOfId);
        Assert.Equal(350m, byId[BiabWithDesign].Price);
        Assert.Equal(399m, byId[SoftGelExtension].Price);
        Assert.Equal(120, byId[SoftGelExtension].DurationMinutes);
        Assert.Contains(catalog.AddOns, a => a.Name == "Rhinestone" && a.Price == 15m);
        Assert.All(catalog.AddOns, a => Assert.Equal("Nail design (add-on)", a.CategoryLabel));
    }

    [Fact]
    public async Task Each_nail_can_have_its_own_listed_colour()
    {
        var user = await factory.CreateClientAsync();
        var request = TestHelpers.NewBooking(factory.NextSlot(), Plain) with
        {
            PerNailColors = new NailColorsRequest(["#06", "#06", null, "#30", "#30"], ["#01"]),
        };

        var booked = await user.Client.BookAsync(request);

        Assert.Equal(["#06", "#06", null, "#30", "#30"], booked.Booking.PerNailColors!.Left!);
        Assert.Equal(["#01", null, null, null, null], booked.Booking.PerNailColors.Right!);
    }

    [Fact]
    public async Task A_nail_colour_must_come_from_the_chart()
    {
        var user = await factory.CreateClientAsync();
        var request = TestHelpers.NewBooking(factory.NextSlot(), Plain) with
        {
            PerNailColors = new NailColorsRequest(["Not sure yet (decide at the salon)"], null),
        };

        var response = await user.Client.PostJsonAsync("/api/bookings", request);

        await response.ShouldHaveStatus(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task A_colour_request_replaces_the_listed_colour_and_waits_for_Leyah()
    {
        var user = await factory.CreateClientAsync();
        var request = TestHelpers.NewBooking(factory.NextSlot(), Plain) with { NailColor = null, ColorRequest = "Dusty sage green" };

        var booked = await user.Client.BookAsync(request);

        Assert.Null(booked.Booking.NailColor);
        Assert.Equal("Dusty sage green", booked.Booking.ColorRequest);
        Assert.Equal("Pending", booked.Booking.ColorRequestStatus);

        var admin = await factory.CreateAdminClientAsync();
        var decided = await admin.PostJsonAsync($"/api/admin/bookings/{booked.Booking.Id}/color-request", new ColorRequestDecision(true));
        await decided.ShouldHaveStatus(HttpStatusCode.OK);
        Assert.Equal("Available", (await decided.ReadAsync<BookingResponse>()).ColorRequestStatus);
    }

    [Fact]
    public async Task Without_a_colour_or_a_request_the_booking_is_refused()
    {
        var user = await factory.CreateClientAsync();
        var request = TestHelpers.NewBooking(factory.NextSlot(), Plain) with { NailColor = null };

        var response = await user.Client.PostJsonAsync("/api/bookings", request);

        await response.ShouldHaveStatus(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Clients_can_reschedule_twice_and_Leyah_can_still_move_it()
    {
        var user = await factory.CreateClientAsync();
        var booked = await user.Client.BookAsync(TestHelpers.NewBooking(factory.NextSlot(), Plain));
        var url = $"/api/bookings/{booked.Booking.Id}/reschedule";

        for (var i = 1; i <= Booking.ClientRescheduleLimit; i++)
        {
            var target = factory.NextSlot();
            var moved = await user.Client.PostJsonAsync(url, new RescheduleRequest(target.Date, target.Time));
            await moved.ShouldHaveStatus(HttpStatusCode.OK);
            Assert.Equal(i, (await moved.ReadAsync<BookingResponse>()).RescheduleCount);
        }

        var third = factory.NextSlot();
        var refused = await user.Client.PostJsonAsync(url, new RescheduleRequest(third.Date, third.Time));
        await refused.ShouldHaveStatus(HttpStatusCode.Conflict);
        Assert.Equal("reschedule_limit_reached", (await refused.ReadProblemAsync()).ProblemCode());

        var admin = await factory.CreateAdminClientAsync();
        var byLeyah = await admin.PostJsonAsync($"/api/admin/bookings/{booked.Booking.Id}/reschedule", new RescheduleRequest(third.Date, third.Time));
        await byLeyah.ShouldHaveStatus(HttpStatusCode.OK);
    }
}
