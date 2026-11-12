using System.Net;
using NailsByLeah.Api.Contracts;
using NailsByLeah.Api.Domain;

namespace NailsByLeah.Api.Tests.Integration;

/// <summary>
/// The admin features of 2026-11-12: Leyah books for a client or walk-in, marks shades out of stock, changes the booking
/// rules, keeps private client notes and replies to feedback.
/// </summary>
public sealed class AdminFeatureTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private const int Plain = 1;

    [Fact]
    public async Task Leyah_books_a_walk_in_confirmed_with_the_cash_deposit_recorded()
    {
        var admin = await factory.CreateAdminClientAsync();
        var (date, time) = factory.NextSlot();

        var response = await admin.PostJsonAsync("/api/admin/bookings", new AdminCreateBookingRequest(
            Plain, date, time, GuestName: "Ana Santos", GuestPhone: "09171112222", NailColor: TestHelpers.Color,
            Paid: "Deposit", PaymentMethod: PaymentMethod.Cash));

        await response.ShouldHaveStatus(HttpStatusCode.Created);
        var booking = await response.ReadAsync<BookingResponse>();
        Assert.Equal("Confirmed", booking.Status);
        Assert.Equal("Ana Santos", booking.GuestName);
        Assert.Equal("09171112222", booking.GuestPhone);
        Assert.True(booking.CreatedByAdmin);
        Assert.Equal(booking.DepositAmount, booking.Payment!.AmountPaid);
        Assert.Equal("Cash", booking.Payment.Method);
        Assert.True(booking.Payment.Verified);

        // The walk-in can be found by name in Find bookings.
        var found = await admin.GetAsync<PagedResponse<BookingResponse>>("/api/admin/bookings?clientName=Ana%20Santos");
        Assert.Contains(found.Items, b => b.Id == booking.Id);
    }

    [Fact]
    public async Task Leyah_books_for_a_client_with_an_account_and_nothing_paid_yet()
    {
        var user = await factory.CreateClientAsync();
        var admin = await factory.CreateAdminClientAsync();
        var (date, time) = factory.NextSlot();

        var response = await admin.PostJsonAsync("/api/admin/bookings", new AdminCreateBookingRequest(Plain, date, time, ClientId: user.Id));

        await response.ShouldHaveStatus(HttpStatusCode.Created);
        var booking = await response.ReadAsync<BookingResponse>();
        Assert.Equal("Confirmed", booking.Status);
        Assert.Null(booking.GuestName);
        Assert.Equal(user.Id, booking.Client!.Id);
        Assert.Equal(0m, booking.Payment!.AmountPaid);
        Assert.Contains(await user.Client.GetAsync<List<BookingResponse>>("/api/bookings"), b => b.Id == booking.Id);
    }

    [Fact]
    public async Task A_walk_in_needs_a_name_and_a_taken_time_is_refused()
    {
        var admin = await factory.CreateAdminClientAsync();
        var slot = factory.NextSlot();

        var noName = await admin.PostJsonAsync("/api/admin/bookings", new AdminCreateBookingRequest(Plain, slot.Date, slot.Time));
        await noName.ShouldHaveStatus(HttpStatusCode.BadRequest);

        var user = await factory.CreateClientAsync();
        await user.Client.BookAsync(TestHelpers.NewBooking(slot));
        var taken = await admin.PostJsonAsync("/api/admin/bookings", new AdminCreateBookingRequest(Plain, slot.Date, slot.Time, GuestName: "Bea"));
        await taken.ShouldHaveStatus(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task A_shade_out_of_stock_cannot_be_booked_until_it_is_back()
    {
        const string shade = "#30";
        var admin = await factory.CreateAdminClientAsync();
        var marked = await admin.PutJsonAsync("/api/admin/booking-rules/colors", new ColorStockRequest(shade, InStock: false));
        await marked.ShouldHaveStatus(HttpStatusCode.OK);
        Assert.Contains(shade, (await factory.NewClient().GetAsync<CatalogResponse>("/api/services")).OutOfStockColors!);

        var user = await factory.CreateClientAsync();
        var refused = await user.Client.PostJsonAsync("/api/bookings", TestHelpers.NewBooking(factory.NextSlot()) with { NailColor = shade });
        await refused.ShouldHaveStatus(HttpStatusCode.BadRequest);

        await (await admin.PutJsonAsync("/api/admin/booking-rules/colors", new ColorStockRequest(shade, InStock: true))).ShouldHaveStatus(HttpStatusCode.OK);
        await user.Client.BookAsync(TestHelpers.NewBooking(factory.NextSlot()) with { NailColor = shade });
    }

    [Fact]
    public async Task Leyah_changes_the_deposit_and_new_bookings_use_it()
    {
        var admin = await factory.CreateAdminClientAsync();
        var original = await admin.GetAsync<BookingRulesResponse>("/api/admin/booking-rules");
        try
        {
            var saved = await admin.PutJsonAsync("/api/admin/booking-rules",
                new UpdateBookingRulesRequest(200m, original.RescheduleMinimumHours, original.RescheduleLimit, original.MaxDaysAhead));
            await saved.ShouldHaveStatus(HttpStatusCode.OK);

            Assert.Equal(200m, (await factory.NewClient().GetAsync<CatalogResponse>("/api/services")).DepositAmount);
            var user = await factory.CreateClientAsync();
            var booked = await user.Client.BookAsync(TestHelpers.NewBooking(factory.NextSlot()));
            Assert.Equal(200m, booked.Booking.DepositAmount);

            var invalid = await admin.PutJsonAsync("/api/admin/booking-rules", new UpdateBookingRulesRequest(-1m, 24, 2, 30));
            await invalid.ShouldHaveStatus(HttpStatusCode.BadRequest);
        }
        finally
        {
            await admin.PutJsonAsync("/api/admin/booking-rules", new UpdateBookingRulesRequest(
                original.DepositAmount, original.RescheduleMinimumHours, original.RescheduleLimit, original.MaxDaysAhead));
        }
    }

    [Fact]
    public async Task A_private_note_shows_on_the_client_and_their_bookings_for_Leyah_only()
    {
        var user = await factory.CreateClientAsync();
        var booked = await user.Client.BookAsync(TestHelpers.NewBooking(factory.NextSlot()));
        var admin = await factory.CreateAdminClientAsync();

        var saved = await admin.PutJsonAsync($"/api/admin/clients/{user.Id}/note", new UpdateClientNoteRequest("Prefers short almond"));
        await saved.ShouldHaveStatus(HttpStatusCode.OK);
        Assert.Equal("Prefers short almond", (await saved.ReadAsync<ClientDataResponse>()).AdminNote);

        var forLeyah = await admin.GetAsync<BookingResponse>($"/api/admin/bookings/{booked.Booking.Id}");
        Assert.Equal("Prefers short almond", forLeyah.Client!.AdminNote);
        var forClient = await user.Client.GetAsync<BookingResponse>($"/api/bookings/{booked.Booking.Id}");
        Assert.Null(forClient.Client); // clients never see the client summary, so never the note
    }

    [Fact]
    public async Task Leyah_replies_to_feedback_and_the_client_sees_it()
    {
        var user = await factory.CreateClientAsync();
        var sent = await user.Client.PostJsonAsync("/api/feedback", new SubmitFeedbackRequest(5, "Lovely set!", Guid.NewGuid()));
        var feedbackId = (await sent.ReadAsync<FeedbackResponse>()).Id;
        var admin = await factory.CreateAdminClientAsync();

        var replied = await admin.PutJsonAsync($"/api/admin/feedback/{feedbackId}/reply", new FeedbackReplyRequest("Thank you, see you soon!"));

        await replied.ShouldHaveStatus(HttpStatusCode.OK);
        var mine = await user.Client.GetAsync<List<FeedbackResponse>>("/api/feedback");
        Assert.Equal("Thank you, see you soon!", mine.Single(f => f.Id == feedbackId).Reply);
    }
}
