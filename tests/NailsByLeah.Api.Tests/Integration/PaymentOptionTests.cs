using System.Net;
using NailsByLeah.Api.Contracts;
using NailsByLeah.Api.Domain;

namespace NailsByLeah.Api.Tests.Integration;

/// <summary>Paying the ₱150 deposit or the full amount, and administrator confirmation as a separate step.</summary>
public sealed class PaymentOptionTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private const int WithDesign = 8; // Soft Gel Extension with Design, ₱499
    private const int RemovalMyWork = 4; // ₱100, less than the deposit
    private const int Chrome = 2; // ₱10 per nail

    private CreateBookingRequest Booking(int serviceId, PaymentOption option, bool acknowledged = true, Guid? key = null, params AddOnSelection[] addOns) =>
        TestHelpers.NewBooking(factory.NextSlot(), serviceId, key, acknowledged, addOns) with { PaymentOption = option };

    [Fact] // 1, 5
    public async Task Paying_the_deposit_charges_150_and_leaves_the_rest_for_the_salon()
    {
        var user = await factory.CreateClientAsync();
        var request = Booking(WithDesign, PaymentOption.Deposit, addOns: new AddOnSelection(Chrome, 2, NailHand.Right));

        var result = await user.Client.BookAsync(request);

        Assert.Equal(150m, factory.Gateway.AmountsByKey[request.IdempotencyKey]);
        Assert.Equal(519m, result.Booking.TotalPrice);
        Assert.Equal(150m, result.Booking.Payment!.AmountPaid);
        Assert.Equal(369m, result.Booking.BalanceDue);
        Assert.Equal("Booking deposit", result.Receipt.PaymentOptionLabel);
        Assert.Equal(150m, result.Receipt.Amount);
        Assert.Equal(369m, result.Receipt.BalanceDue);
    }

    [Fact] // 2, 3, 4, 5
    public async Task Paying_in_full_charges_the_service_and_add_ons_once_with_the_deposit_included()
    {
        var user = await factory.CreateClientAsync();
        var request = Booking(WithDesign, PaymentOption.Full, addOns: new AddOnSelection(Chrome, 2, NailHand.Right));

        var result = await user.Client.BookAsync(request);

        Assert.Equal(1, factory.Gateway.ChargeCount(request.IdempotencyKey));
        Assert.Equal(519m, factory.Gateway.AmountsByKey[request.IdempotencyKey]); // 499 + 10 x 2, not 519 + 150
        Assert.Equal("Full", result.Booking.Payment!.Option);
        Assert.Equal(519m, result.Booking.Payment.AmountPaid);
        Assert.Equal(0m, result.Booking.BalanceDue);
        Assert.Equal(0m, result.Receipt.BalanceDue);
        Assert.Equal(519m, result.Receipt.TotalAmount);
        var payment = factory.WithDb(db => db.Payments.Single(p => p.BookingId == result.Booking.Id));
        Assert.Equal((PaymentOption.Full, 519m, 519m, 0m, user.Id), (payment.Option, payment.Amount, payment.TotalAmount, payment.BalanceAfter, payment.ClientId));
    }

    [Fact]
    public async Task A_full_payment_is_never_less_than_the_non_refundable_deposit()
    {
        var user = await factory.CreateClientAsync();
        var request = Booking(RemovalMyWork, PaymentOption.Full);

        var result = await user.Client.BookAsync(request);

        Assert.Equal(150m, factory.Gateway.AmountsByKey[request.IdempotencyKey]);
        Assert.Equal(0m, result.Booking.BalanceDue);
    }

    [Theory] // 6
    [InlineData(PaymentOption.Deposit)]
    [InlineData(PaymentOption.Full)]
    public async Task Nothing_is_charged_until_the_non_refundable_deposit_is_acknowledged(PaymentOption option)
    {
        var user = await factory.CreateClientAsync();
        var request = Booking(WithDesign, option, acknowledged: false);

        var response = await user.Client.PostJsonAsync("/api/bookings", request);

        await response.ShouldHaveStatus(HttpStatusCode.BadRequest);
        Assert.Equal(0, factory.Gateway.ChargeCount(request.IdempotencyKey));
    }

    [Fact] // 7
    public async Task A_failed_full_payment_leaves_no_booking_and_no_payment()
    {
        var user = await factory.CreateClientAsync();
        factory.Gateway.FailNextCharge();

        var response = await user.Client.PostJsonAsync("/api/bookings", Booking(WithDesign, PaymentOption.Full));

        await response.ShouldHaveStatus(HttpStatusCode.PaymentRequired);
        Assert.Equal(0, factory.WithDb(db => db.Bookings.Count(b => b.ClientId == user.Id)));
        Assert.Equal(0, factory.WithDb(db => db.Payments.Count(p => p.ClientId == user.Id)));
    }

    [Fact] // 8
    public async Task Repeated_pay_clicks_charge_the_full_amount_once()
    {
        var user = await factory.CreateClientAsync();
        var request = Booking(WithDesign, PaymentOption.Full);

        var responses = await Task.WhenAll(Enumerable.Range(0, 3).Select(_ => user.Client.PostJsonAsync("/api/bookings", request)));

        Assert.All(responses, r => Assert.True(r.IsSuccessStatusCode));
        Assert.Equal(1, factory.Gateway.ChargeCount(request.IdempotencyKey));
        Assert.Equal(1, factory.WithDb(db => db.Payments.Count(p => p.ClientId == user.Id)));
    }

    [Fact] // 9, 10
    public async Task Payment_does_not_confirm_the_booking_the_administrator_does()
    {
        var user = await factory.CreateClientAsync();
        var booked = await user.Client.BookAsync(Booking(WithDesign, PaymentOption.Full));
        Assert.Equal("Pending", booked.Booking.Status);
        Assert.False(booked.Booking.Payment!.Verified);
        Assert.Equal("Pending", booked.Receipt.BookingStatus);

        // Clients can't confirm their own bookings.
        await (await user.Client.PostAsync($"/api/admin/bookings/{booked.Booking.Id}/confirm", null)).ShouldHaveStatus(HttpStatusCode.Forbidden);

        var admin = await factory.CreateAdminClientAsync();
        var seen = await admin.GetAsync<BookingResponse>($"/api/admin/bookings/{booked.Booking.Id}");
        Assert.Equal(("Full payment", 499m), (seen.Payment!.OptionLabel, seen.Payment.AmountPaid));
        Assert.NotNull(seen.Payment.ReferenceNumber);

        var confirmed = await admin.ConfirmAsync(booked.Booking.Id);

        Assert.Equal("Confirmed", confirmed.Status);
        Assert.True(confirmed.Payment!.Verified);
        Assert.NotNull(confirmed.Payment.ConfirmedAt);
        Assert.False(string.IsNullOrWhiteSpace(confirmed.Payment.ConfirmedBy));
        Assert.Contains(booked.Booking.Id, factory.Notifications.ApprovedBookingIds);
        var adminId = factory.WithDb(db => db.Users.Single(u => u.Username == ApiFactory.AdminUsername).Id);
        Assert.Equal(adminId, factory.WithDb(db => db.Bookings.Single(b => b.Id == booked.Booking.Id).ConfirmedByUserId));

        var again = await admin.PostAsync($"/api/admin/bookings/{booked.Booking.Id}/confirm", null);
        await again.ShouldHaveStatus(HttpStatusCode.Conflict);
    }
}
