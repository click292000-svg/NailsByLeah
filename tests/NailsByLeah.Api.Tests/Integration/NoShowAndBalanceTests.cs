using System.Net;
using NailsByLeah.Api.Contracts;
using NailsByLeah.Api.Domain;

namespace NailsByLeah.Api.Tests.Integration;

/// <summary>
/// No-shows, recording the balance paid after a service, and the dashboard's upcoming list. This class has its own
/// database because the no-show test moves the clock forward; each test books a different time on the current day.
/// </summary>
public sealed class NoShowAndBalanceTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private const int Plain = 1; // ₱300, so ₱150 is left after the deposit

    private DateOnly Today => DateOnly.FromDateTime(factory.Clock.GetUtcNow().AddHours(8).DateTime);

    private async Task<(HttpClient Admin, BookingResponse Booking)> ConfirmedBookingToday(int hour, PaymentOption option = PaymentOption.Deposit)
    {
        var user = await factory.CreateClientAsync();
        var booked = await user.Client.BookAsync(TestHelpers.NewBooking((Today, new TimeOnly(hour, 0)), Plain) with { PaymentOption = option });
        var admin = await factory.CreateAdminClientAsync();
        await admin.ConfirmAsync(booked.Booking.Id);
        return (admin, booked.Booking);
    }

    private static string Url(int bookingId, string action) => $"/api/admin/bookings/{bookingId}/{action}";

    [Fact]
    public async Task No_show_is_only_possible_once_the_appointment_time_has_arrived()
    {
        var (admin, booking) = await ConfirmedBookingToday(19);

        await (await admin.PostAsync(Url(booking.Id, "no-show"), null)).ShouldHaveStatus(HttpStatusCode.Conflict);

        var date = Today;
        factory.Clock.Advance(TimeSpan.FromDays(1));
        admin = await factory.CreateAdminClientAsync(); // a day later, the earlier sign-in has expired
        var response = await admin.PostAsync(Url(booking.Id, "no-show"), null);
        await response.ShouldHaveStatus(HttpStatusCode.OK);
        var marked = await response.ReadAsync<BookingResponse>();

        Assert.Equal("NoShow", marked.Status);
        Assert.Null(marked.Cancellation);
        Assert.Equal(150m, marked.Payment!.AmountPaid); // the deposit is kept
        Assert.Equal(1, (await admin.GetAsync<DailySalesReport>($"/api/admin/reports/daily?date={date:yyyy-MM-dd}")).BookingsNoShow);
        Assert.True(factory.WithDb(db => db.AuditLogs.Any(a => a.Action == "BookingNoShow" && a.EntityId == booking.Id.ToString())));

        // It is finished: nothing else can happen to it.
        await (await admin.PostAsync(Url(booking.Id, "no-show"), null)).ShouldHaveStatus(HttpStatusCode.Conflict);
        await (await admin.PostAsync(Url(booking.Id, "complete"), null)).ShouldHaveStatus(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task Balance_can_be_recorded_when_completing_with_its_reference()
    {
        var (admin, booking) = await ConfirmedBookingToday(13);

        var response = await admin.PostJsonAsync(Url(booking.Id, "complete"), new CompleteBookingRequest(true, "  GC-777 "));
        await response.ShouldHaveStatus(HttpStatusCode.OK);
        var completed = await response.ReadAsync<BookingResponse>();

        Assert.Equal("Completed", completed.Status);
        Assert.Equal(0m, completed.BalanceDue);
        Assert.Equal(150m, completed.Payment!.BalanceReceived);
        Assert.Equal("GC-777", completed.Payment.BalanceReference);
        Assert.NotNull(completed.Payment.BalanceReceivedAt);
        Assert.Equal(150m, completed.Payment.AmountPaid); // online payments stay separate
        Assert.True((await admin.GetAsync<DailySalesReport>($"/api/admin/reports/daily?date={Today:yyyy-MM-dd}")).BalancesReceived >= 150m);
    }

    [Fact]
    public async Task Balance_can_be_recorded_later_and_only_once()
    {
        var (admin, booking) = await ConfirmedBookingToday(15);
        var date = Today;
        await (await admin.PostAsync(Url(booking.Id, "complete"), null)).ShouldHaveStatus(HttpStatusCode.OK);

        var before = await admin.GetAsync<BookingResponse>($"/api/admin/bookings/{booking.Id}");
        Assert.Equal(150m, before.BalanceDue);
        var unpaid = (await admin.GetAsync<DailySalesReport>($"/api/admin/reports/daily?date={date:yyyy-MM-dd}")).BalancesUnpaid;
        Assert.True(unpaid >= 150m);

        var response = await admin.PostJsonAsync(Url(booking.Id, "balance"), new RecordBalanceRequest(null));
        await response.ShouldHaveStatus(HttpStatusCode.OK);
        Assert.Equal(0m, (await response.ReadAsync<BookingResponse>()).BalanceDue);
        Assert.Equal(unpaid - 150m, (await admin.GetAsync<DailySalesReport>($"/api/admin/reports/daily?date={date:yyyy-MM-dd}")).BalancesUnpaid);

        var again = await admin.PostJsonAsync(Url(booking.Id, "balance"), new RecordBalanceRequest(null));
        await again.ShouldHaveStatus(HttpStatusCode.Conflict);
        Assert.Equal("no_balance_due", (await again.ReadProblemAsync()).ProblemCode());
    }

    [Fact]
    public async Task A_full_payment_has_no_balance_to_record()
    {
        var (admin, booking) = await ConfirmedBookingToday(17, PaymentOption.Full);

        var response = await admin.PostJsonAsync(Url(booking.Id, "complete"), new CompleteBookingRequest(true, null));
        await response.ShouldHaveStatus(HttpStatusCode.OK);
        Assert.Equal(0m, (await response.ReadAsync<BookingResponse>()).Payment!.BalanceReceived);

        await (await admin.PostJsonAsync(Url(booking.Id, "balance"), new RecordBalanceRequest(null))).ShouldHaveStatus(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task Balance_cannot_be_recorded_before_the_service_is_completed_or_with_a_long_reference()
    {
        var (admin, booking) = await ConfirmedBookingToday(11);

        await (await admin.PostJsonAsync(Url(booking.Id, "balance"), new RecordBalanceRequest(null))).ShouldHaveStatus(HttpStatusCode.Conflict);

        var tooLong = await admin.PostJsonAsync(Url(booking.Id, "complete"), new CompleteBookingRequest(true, new string('x', 51)));
        await tooLong.ShouldHaveStatus(HttpStatusCode.BadRequest);
        Assert.Equal("Confirmed", (await admin.GetAsync<BookingResponse>($"/api/admin/bookings/{booking.Id}")).Status);
    }

    [Fact]
    public async Task Clients_cannot_mark_no_shows_or_record_balances()
    {
        var user = await factory.CreateClientAsync();

        await (await user.Client.PostAsync(Url(1, "no-show"), null)).ShouldHaveStatus(HttpStatusCode.Forbidden);
        await (await user.Client.PostJsonAsync(Url(1, "balance"), new RecordBalanceRequest(null))).ShouldHaveStatus(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Dashboard_lists_active_bookings_in_the_next_seven_days_only()
    {
        var user = await factory.CreateClientAsync();
        var soon = await user.Client.BookAsync(TestHelpers.NewBooking((Today.AddDays(3), new TimeOnly(11, 0)), Plain));
        var later = await user.Client.BookAsync(TestHelpers.NewBooking((Today.AddDays(9), new TimeOnly(11, 0)), Plain));
        var admin = await factory.CreateAdminClientAsync();

        var upcoming = (await admin.GetAsync<DashboardResponse>("/api/admin/dashboard")).UpcomingBookings;

        Assert.Contains(upcoming, b => b.Id == soon.Booking.Id);
        Assert.DoesNotContain(upcoming, b => b.Id == later.Booking.Id);
        Assert.All(upcoming, b => Assert.True(b.Status is "Pending" or "Confirmed"));
    }
}
