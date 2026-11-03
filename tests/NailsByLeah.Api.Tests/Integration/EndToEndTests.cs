using System.Net;
using NailsByLeah.Api.Contracts;
using NailsByLeah.Api.Domain;

namespace NailsByLeah.Api.Tests.Integration;

/// <summary>Test 9.2.1: Sign Up → Book → Pay → Cancel → Administrator views the updated booking.</summary>
public sealed class EndToEndTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    [Fact]
    public async Task Sign_up_book_pay_cancel_then_administrator_sees_the_cancellation()
    {
        // Sign up and verify the email address.
        var browser = factory.NewClient();
        var signUp = new RegisterRequest("Kyla", "Tester", "kyla.e2e", "kyla.e2e@test.local", "09171112222",
            "KylaPass123", "KylaPass123", AcceptTerms: true);
        await (await browser.PostJsonAsync("/api/auth/register", signUp)).ShouldHaveStatus(HttpStatusCode.Created);
        await (await browser.PostJsonAsync("/api/auth/verify-email",
            new VerifyEmailRequest(signUp.Email, factory.Notifications.VerificationCodeFor(signUp.Email)))).ShouldHaveStatus(HttpStatusCode.OK);
        await (await browser.PostJsonAsync("/api/auth/login", new LoginRequest(signUp.Username, signUp.Password))).ShouldHaveStatus(HttpStatusCode.OK);

        // Choose an open slot, check the quote, then book and pay.
        var date = ApiFactory.StartDate.AddDays(3);
        var day = await browser.GetAsync<DaySlotsResponse>($"/api/slots?date={date:yyyy-MM-dd}");
        var slot = day.Slots.First(s => s.Status == SlotStatuses.Open);
        var quote = await (await browser.PostJsonAsync("/api/pricing/quote",
            new QuoteRequest(3, [new AddOnSelection(5, 2)]))).ReadAsync<PriceQuoteResponse>();
        Assert.Equal(280m, quote.Total); // BIAB 250 + Embossed Art 15 x 2

        var booked = await browser.BookAsync(new CreateBookingRequest(3, [new AddOnSelection(5, 2, NailHand.Right)], date, slot.StartTime,
            PaymentMethod.Maya, DepositAcknowledged: true, Guid.NewGuid(), Note: "I'll bring a reference photo"));
        Assert.Equal("Pending", booked.Booking.Status); // confirmed later by the administrator
        Assert.Equal(quote.Total, booked.Booking.TotalPrice);
        Assert.Equal("Maya", booked.Receipt.Method);

        // Cancel with a reason.
        var cancel = await browser.PostJsonAsync($"/api/bookings/{booked.Booking.Id}/cancel",
            new ClientCancelRequest(ClientCancellationReason.ChangeOfSchedule));
        await cancel.ShouldHaveStatus(HttpStatusCode.OK);

        // The administrator sees the updated booking.
        var admin = await factory.CreateAdminClientAsync();
        var seen = await admin.GetAsync<BookingResponse>($"/api/admin/bookings/{booked.Booking.Id}");
        Assert.Equal("Cancelled", seen.Status);
        Assert.Equal("Change of schedule", seen.Cancellation!.ReasonLabel);
        Assert.Equal("Client", seen.Cancellation.CancelledByRole);
        Assert.Equal("kyla.e2e", seen.Client!.Username);
        Assert.Equal("I'll bring a reference photo", seen.Note);

        var cancelledList = await admin.GetAsync<PagedResponse<BookingResponse>>($"/api/admin/bookings?status=Cancelled&date={date:yyyy-MM-dd}");
        Assert.Contains(cancelledList.Items, b => b.Id == booked.Booking.Id);
    }
}
