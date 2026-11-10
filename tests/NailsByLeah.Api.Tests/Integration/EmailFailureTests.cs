using System.Net;
using Microsoft.Extensions.DependencyInjection;
using NailsByLeah.Api.Contracts;
using NailsByLeah.Api.Notifications;

namespace NailsByLeah.Api.Tests.Integration;

/// <summary>When Brevo is down or slow, clients still get normal answers and the API keeps running.</summary>
public sealed class EmailFailureTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    [Fact]
    public async Task Sign_up_succeeds_when_the_email_cannot_be_sent_and_resend_recovers_it()
    {
        var registration = factory.NewRegistration();
        var email = registration.Email.ToLowerInvariant();
        var client = factory.NewClient();
        factory.Notifications.FailNextEmail();

        await (await client.PostJsonAsync("/api/auth/register", registration)).ShouldHaveStatus(HttpStatusCode.Created);
        factory.Clock.Advance(TimeSpan.FromSeconds(61)); // another code can be asked for a minute after the first
        await (await client.PostJsonAsync("/api/auth/resend-verification", new EmailRequest(email))).ShouldHaveStatus(HttpStatusCode.OK);

        await (await client.PostJsonAsync("/api/auth/verify-email", new VerifyEmailRequest(email, factory.Notifications.VerificationCodeFor(email))))
            .ShouldHaveStatus(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Booking_succeeds_when_the_email_cannot_be_sent_and_the_salon_is_still_told()
    {
        var user = await factory.CreateClientAsync();
        factory.Notifications.FailNextEmail();

        var booked = await user.Client.BookAsync(TestHelpers.NewBooking(factory.NextSlot()));

        Assert.DoesNotContain(booked.Booking.Id, factory.Notifications.ConfirmedBookingIds);
        Assert.Contains(booked.Booking.Id, factory.Notifications.SalonNewBookingIds);
    }

    [Fact]
    public async Task A_reminder_that_times_out_is_retried_and_does_not_stop_the_others()
    {
        var user = await factory.CreateClientAsync();
        var admin = await factory.CreateAdminClientAsync();
        var first = await user.Client.BookAsync(TestHelpers.NewBooking((ApiFactory.StartDate, new TimeOnly(11, 0))));
        var second = await user.Client.BookAsync(TestHelpers.NewBooking((ApiFactory.StartDate, new TimeOnly(14, 0))));
        await admin.ConfirmAsync(first.Booking.Id);
        await admin.ConfirmAsync(second.Booking.Id);
        factory.Notifications.TimeOutNextReminder();

        Assert.Equal(1, await RunReminderJobAsync());
        Assert.Equal(1, await RunReminderJobAsync());

        Assert.Contains(first.Booking.Id, factory.Notifications.RemindedBookingIds);
        Assert.Contains(second.Booking.Id, factory.Notifications.RemindedBookingIds);
    }

    private async Task<int> RunReminderJobAsync()
    {
        await using var scope = factory.Services.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<IAppointmentReminderJob>().RunOnceAsync();
    }
}
