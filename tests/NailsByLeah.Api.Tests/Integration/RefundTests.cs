using System.Net;
using NailsByLeah.Api.Contracts;
using NailsByLeah.Api.Domain;

namespace NailsByLeah.Api.Tests.Integration;

/// <summary>
/// What goes back after a cancellation or no-show: the ₱150 deposit is kept (it is also the late-cancellation and
/// no-show fee), anything paid above it is refunded, and when the salon cancels everything is refunded. Leyah sends the
/// money herself and records it. This class has its own database because the no-show test moves the clock forward.
/// </summary>
public sealed class RefundTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private const int Plain = 1; // ₱300

    private DateOnly Today => DateOnly.FromDateTime(factory.Clock.GetUtcNow().AddHours(8).DateTime);

    private async Task<BookingResponse> Book(int daysAhead, PaymentOption option, HttpClient? client = null)
    {
        client ??= (await factory.CreateClientAsync()).Client;
        var booked = await client.BookAsync(
            TestHelpers.NewBooking((Today.AddDays(daysAhead), new TimeOnly(11, 0)), Plain) with { PaymentOption = option });
        return booked.Booking;
    }

    [Fact]
    public async Task A_client_who_paid_in_full_and_cancels_gets_back_everything_above_the_deposit()
    {
        var user = await factory.CreateClientAsync();
        var booking = await Book(6, PaymentOption.Full, user.Client);

        var response = await user.Client.PostJsonAsync($"/api/bookings/{booking.Id}/cancel", new ClientCancelRequest(ClientCancellationReason.Emergency));
        await response.ShouldHaveStatus(HttpStatusCode.OK);
        var cancelled = await response.ReadAsync<BookingResponse>();

        Assert.Equal(300m, cancelled.Payment!.AmountPaid);
        Assert.Equal(150m, cancelled.Payment.RefundDue);
        Assert.Null(cancelled.Payment.RefundSentAt);
    }

    [Fact]
    public async Task A_client_who_paid_only_the_deposit_and_cancels_gets_nothing_back()
    {
        var user = await factory.CreateClientAsync();
        var booking = await Book(7, PaymentOption.Deposit, user.Client);

        var cancelled = await (await user.Client.PostJsonAsync($"/api/bookings/{booking.Id}/cancel",
            new ClientCancelRequest(ClientCancellationReason.ChangeOfSchedule))).ReadAsync<BookingResponse>();

        Assert.Equal(0m, cancelled.Payment!.RefundDue);
    }

    [Fact]
    public async Task When_the_salon_cancels_everything_is_refunded_and_Leyah_records_it_once()
    {
        var booking = await Book(8, PaymentOption.Deposit);
        var admin = await factory.CreateAdminClientAsync();

        var cancelled = await (await admin.PostJsonAsync($"/api/admin/bookings/{booking.Id}/cancel",
            new AdminCancelRequest(AdminCancellationReason.StaffUnavailable, null))).ReadAsync<BookingResponse>();
        Assert.Equal(150m, cancelled.Payment!.RefundDue); // the deposit too

        var dashboard = await admin.GetAsync<DashboardResponse>("/api/admin/dashboard");
        Assert.Contains(dashboard.Attention, a => a.Kind == "RefundDue" && a.Booking.Id == booking.Id);

        var sent = await admin.PostJsonAsync($"/api/admin/bookings/{booking.Id}/refund", new RecordRefundRequest("GC-REFUND-1"));
        await sent.ShouldHaveStatus(HttpStatusCode.OK);
        var refunded = await sent.ReadAsync<BookingResponse>();
        Assert.NotNull(refunded.Payment!.RefundSentAt);
        Assert.Equal("GC-REFUND-1", refunded.Payment.RefundReference);
        Assert.True(factory.WithDb(db => db.AuditLogs.Any(a => a.Action == "RefundSent" && a.EntityId == booking.Id.ToString())));

        var again = await admin.PostJsonAsync($"/api/admin/bookings/{booking.Id}/refund", new RecordRefundRequest(null));
        await again.ShouldHaveStatus(HttpStatusCode.Conflict);
        Assert.DoesNotContain((await admin.GetAsync<DashboardResponse>("/api/admin/dashboard")).Attention, a => a.Booking.Id == booking.Id);
    }

    [Fact]
    public async Task A_client_who_stopped_answering_keeps_the_usual_rule_and_clients_cannot_record_refunds()
    {
        var user = await factory.CreateClientAsync();
        var booking = await Book(9, PaymentOption.Full, user.Client);
        var admin = await factory.CreateAdminClientAsync();

        var cancelled = await (await admin.PostJsonAsync($"/api/admin/bookings/{booking.Id}/cancel",
            new AdminCancelRequest(AdminCancellationReason.ClientDidNotRespond, null))).ReadAsync<BookingResponse>();
        Assert.Equal(150m, cancelled.Payment!.RefundDue); // ₱300 paid, the deposit kept

        await (await user.Client.PostJsonAsync($"/api/admin/bookings/{booking.Id}/refund", new RecordRefundRequest(null)))
            .ShouldHaveStatus(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task A_no_show_who_paid_in_full_gets_back_everything_above_the_deposit()
    {
        var booking = await Book(1, PaymentOption.Full);
        var admin = await factory.CreateAdminClientAsync();
        await admin.ConfirmAsync(booking.Id);

        factory.Clock.Advance(TimeSpan.FromDays(2));
        admin = await factory.CreateAdminClientAsync(); // days later, the earlier sign-in has expired
        var marked = await (await admin.PostAsync($"/api/admin/bookings/{booking.Id}/no-show", null)).ReadAsync<BookingResponse>();

        Assert.Equal("NoShow", marked.Status);
        Assert.Equal(150m, marked.Payment!.RefundDue);
    }
}
