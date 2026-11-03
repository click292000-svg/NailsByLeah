using System.Net;
using NailsByLeah.Api.Contracts;
using NailsByLeah.Api.Domain;

namespace NailsByLeah.Api.Tests.Integration;

/// <summary>The salon hears about new bookings and about clients' own cancellations and reschedules.</summary>
public sealed class SalonAlertTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    [Fact]
    public async Task A_new_paid_booking_alerts_the_salon()
    {
        var user = await factory.CreateClientAsync();

        var booked = await user.Client.BookAsync(TestHelpers.NewBooking(factory.NextSlot()));

        Assert.Contains(booked.Booking.Id, factory.Notifications.SalonNewBookingIds);
    }

    [Fact]
    public async Task A_client_cancellation_alerts_the_salon_with_the_reason_but_the_salons_own_does_not()
    {
        var user = await factory.CreateClientAsync();
        var byClient = await user.Client.BookAsync(TestHelpers.NewBooking(factory.NextSlot()));
        var bySalon = await user.Client.BookAsync(TestHelpers.NewBooking(factory.NextSlot()));
        var admin = await factory.CreateAdminClientAsync();

        await (await user.Client.PostJsonAsync($"/api/bookings/{byClient.Booking.Id}/cancel",
            new ClientCancelRequest(ClientCancellationReason.ChangeOfSchedule))).ShouldHaveStatus(HttpStatusCode.OK);
        await (await admin.PostJsonAsync($"/api/admin/bookings/{bySalon.Booking.Id}/cancel",
            new AdminCancelRequest(AdminCancellationReason.ScheduleConflict, null))).ShouldHaveStatus(HttpStatusCode.OK);

        Assert.Equal("Change of schedule", factory.Notifications.SalonCancellationReasons[byClient.Booking.Id]);
        Assert.False(factory.Notifications.SalonCancellationReasons.ContainsKey(bySalon.Booking.Id));
    }

    [Fact]
    public async Task A_client_reschedule_alerts_the_salon_with_the_old_time()
    {
        var user = await factory.CreateClientAsync();
        var from = factory.NextSlot();
        var booked = await user.Client.BookAsync(TestHelpers.NewBooking(from));
        var to = factory.NextSlot();

        await (await user.Client.PostJsonAsync($"/api/bookings/{booked.Booking.Id}/reschedule",
            new RescheduleRequest(to.Date, to.Time))).ShouldHaveStatus(HttpStatusCode.OK);

        Assert.Equal((from.Date, from.Time), factory.Notifications.SalonReschedules[booked.Booking.Id]);
    }
}
