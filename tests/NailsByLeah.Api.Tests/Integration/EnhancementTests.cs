using System.Net;
using System.Text.Json;
using NailsByLeah.Api.Contracts;
using NailsByLeah.Api.Domain;

namespace NailsByLeah.Api.Tests.Integration;

/// <summary>Customer feedback, administrator-closed times, hands for Stone add-ons and booking drafts.</summary>
public sealed class EnhancementTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private const int Plain = 1;
    private const int WithDesign = 8; // Soft Gel Extension with Design
    private const int RemovalMyWork = 4;
    private const int Chrome = 2;

    // ---- Feedback ----

    [Fact]
    public async Task A_rating_can_be_submitted_without_a_comment_and_the_administrator_sees_it()
    {
        var user = await factory.CreateClientAsync();

        var response = await user.Client.PostJsonAsync("/api/feedback", new SubmitFeedbackRequest(5, null, Guid.NewGuid()));

        await response.ShouldHaveStatus(HttpStatusCode.Created);
        var saved = await response.ReadAsync<FeedbackResponse>();
        Assert.Equal(5, saved.Rating);
        Assert.Null(saved.Comment);

        var admin = await factory.CreateAdminClientAsync();
        var list = await admin.GetAsync<FeedbackListResponse>("/api/admin/feedback");
        var item = Assert.Single(list.Items, f => f.Id == saved.Id);
        Assert.Equal(user.Email, item.Client!.Email);
        Assert.True(list.CountsByRating[5] >= 1);
    }

    [Fact]
    public async Task Repeated_clicks_save_the_feedback_once()
    {
        var user = await factory.CreateClientAsync();
        var request = new SubmitFeedbackRequest(4, "Lovely chrome!", Guid.NewGuid());

        var responses = await Task.WhenAll(Enumerable.Range(0, 3).Select(_ => user.Client.PostJsonAsync("/api/feedback", request)));

        Assert.All(responses, r => Assert.True(r.IsSuccessStatusCode));
        Assert.Single(await user.Client.GetAsync<List<FeedbackResponse>>("/api/feedback"));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(6)]
    public async Task A_star_rating_from_1_to_5_is_required(int rating)
    {
        var user = await factory.CreateClientAsync();

        var response = await user.Client.PostJsonAsync("/api/feedback", new SubmitFeedbackRequest(rating, "Nice", Guid.NewGuid()));

        await response.ShouldHaveStatus(HttpStatusCode.BadRequest);
        Assert.NotEmpty((await response.ReadProblemAsync()).ErrorsFor("rating"));
    }

    [Fact]
    public async Task Only_administrators_can_read_all_feedback()
    {
        var user = await factory.CreateClientAsync();
        await (await user.Client.GetAsync("/api/admin/feedback")).ShouldHaveStatus(HttpStatusCode.Forbidden);
        await (await factory.NewClient().PostJsonAsync("/api/feedback", new SubmitFeedbackRequest(5, null, Guid.NewGuid())))
            .ShouldHaveStatus(HttpStatusCode.Unauthorized);
    }

    // ---- Open / Booked / Closed ----

    [Fact]
    public async Task A_time_the_administrator_closes_cannot_be_chosen_or_booked()
    {
        var date = ApiFactory.StartDate.AddDays(20);
        var admin = await factory.CreateAdminClientAsync();
        await (await admin.PostJsonAsync("/api/admin/blocked-slots", new BlockSlotRequest(date, new TimeOnly(14, 0), "Break")))
            .ShouldHaveStatus(HttpStatusCode.Created);

        var day = await factory.NewClient().GetAsync<DaySlotsResponse>($"/api/slots?date={date:yyyy-MM-dd}");
        Assert.Equal(SlotStatuses.Closed, day.Slots.Single(s => s.StartTime == new TimeOnly(14, 0)).Status);

        var user = await factory.CreateClientAsync();
        var response = await user.Client.PostJsonAsync("/api/bookings", TestHelpers.NewBooking((date, new TimeOnly(14, 0)), Plain));
        await response.ShouldHaveStatus(HttpStatusCode.Conflict);
        Assert.Equal("slot_unavailable", (await response.ReadProblemAsync()).ProblemCode());
    }

    [Fact]
    public async Task A_booked_time_shows_as_booked_and_cannot_be_closed_or_reopened_for_someone_else()
    {
        var date = ApiFactory.StartDate.AddDays(21);
        var user = await factory.CreateClientAsync();
        await user.Client.BookAsync(TestHelpers.NewBooking((date, new TimeOnly(15, 0)), Plain));

        var day = await factory.NewClient().GetAsync<DaySlotsResponse>($"/api/slots?date={date:yyyy-MM-dd}");
        Assert.Equal(SlotStatuses.Booked, day.Slots.Single(s => s.StartTime == new TimeOnly(15, 0)).Status);

        var admin = await factory.CreateAdminClientAsync();
        var close = await admin.PostJsonAsync("/api/admin/blocked-slots", new BlockSlotRequest(date, new TimeOnly(15, 0), null));
        await close.ShouldHaveStatus(HttpStatusCode.Conflict);
        Assert.Equal("has_active_bookings", (await close.ReadProblemAsync()).ProblemCode());

        var other = await factory.CreateClientAsync();
        await (await other.Client.PostJsonAsync("/api/bookings", TestHelpers.NewBooking((date, new TimeOnly(15, 0)), Plain)))
            .ShouldHaveStatus(HttpStatusCode.Conflict);
    }

    // ---- Hands for Stone add-ons ----

    [Fact]
    public async Task The_hand_chosen_for_an_add_on_is_kept_on_the_booking()
    {
        var user = await factory.CreateClientAsync();

        var result = await user.Client.BookAsync(TestHelpers.NewBooking(factory.NextSlot(), WithDesign,
            addOns: new AddOnSelection(Chrome, 2, NailHand.Right)));

        var line = Assert.Single(result.Booking.AddOns);
        Assert.Equal("Chrome", line.Name);
        Assert.Equal("Right", line.Hand);
        Assert.Equal("Right hand", line.HandLabel);
        Assert.Equal(20m, line.LinePrice); // add-on prices are unchanged

        var admin = await factory.CreateAdminClientAsync();
        var seen = await admin.GetAsync<BookingResponse>($"/api/admin/bookings/{result.Booking.Id}");
        Assert.Equal("Right hand", Assert.Single(seen.AddOns).HandLabel);
    }

    [Fact]
    public async Task A_hand_must_be_chosen_and_one_hand_has_at_most_five_nails()
    {
        var user = await factory.CreateClientAsync();

        var noHand = await user.Client.PostJsonAsync("/api/bookings",
            TestHelpers.NewBooking(factory.NextSlot(), WithDesign, addOns: new AddOnSelection(Chrome, 2)));
        var sixOnLeft = await user.Client.PostJsonAsync("/api/bookings",
            TestHelpers.NewBooking(factory.NextSlot(), WithDesign, addOns: new AddOnSelection(Chrome, 6, NailHand.Left)));

        await noHand.ShouldHaveStatus(HttpStatusCode.BadRequest);
        await sixOnLeft.ShouldHaveStatus(HttpStatusCode.BadRequest);
        await user.Client.BookAsync(TestHelpers.NewBooking(factory.NextSlot(), WithDesign, addOns: new AddOnSelection(Chrome, 6, NailHand.Both)));
    }

    [Fact]
    public async Task Stone_add_ons_cannot_be_added_to_a_removal_service()
    {
        var user = await factory.CreateClientAsync();

        var response = await user.Client.PostJsonAsync("/api/bookings",
            TestHelpers.NewBooking(factory.NextSlot(), RemovalMyWork, addOns: new AddOnSelection(Chrome, 1, NailHand.Right)));

        await response.ShouldHaveStatus(HttpStatusCode.BadRequest);
        Assert.Contains("removal", Assert.Single((await response.ReadProblemAsync()).ErrorsFor("addOns")));
    }

    // ---- Typed note for Leyah ----

    [Fact]
    public async Task A_typed_note_is_saved_and_shown_to_the_administrator()
    {
        var user = await factory.CreateClientAsync();
        var request = TestHelpers.NewBooking(factory.NextSlot(), Plain) with
        {
            Note = "  Short square nails please, I have a wedding on Saturday.  ", // trimmed when saved
        };

        var result = await user.Client.BookAsync(request);

        Assert.Equal("Short square nails please, I have a wedding on Saturday.", result.Booking.Note);
        var admin = await factory.CreateAdminClientAsync();
        var seen = await admin.GetAsync<BookingResponse>($"/api/admin/bookings/{result.Booking.Id}");
        Assert.Equal("Short square nails please, I have a wedding on Saturday.", seen.Note);
    }

    [Fact]
    public async Task The_note_is_optional_and_limited_to_300_characters()
    {
        var user = await factory.CreateClientAsync();

        var none = await user.Client.BookAsync(TestHelpers.NewBooking(factory.NextSlot(), Plain));
        var tooLong = await user.Client.PostJsonAsync("/api/bookings",
            TestHelpers.NewBooking(factory.NextSlot(), Plain) with { Note = new string('a', 301) });

        Assert.Null(none.Booking.Note);
        await tooLong.ShouldHaveStatus(HttpStatusCode.BadRequest);
        Assert.NotEmpty((await tooLong.ReadProblemAsync()).ErrorsFor("note"));
    }

    // ---- Booking drafts ----

    [Fact]
    public async Task A_draft_is_kept_for_its_own_client_and_holds_no_appointment()
    {
        var user = await factory.CreateClientAsync();
        var data = JsonSerializer.SerializeToElement(new
        {
            step = 1, serviceId = WithDesign, nails = new Dictionary<string, int> { ["2"] = 2 },
            hands = new Dictionary<string, string> { ["2"] = "Right" },
        });

        await (await user.Client.PutJsonAsync("/api/booking-draft", new SaveBookingDraftRequest(data))).ShouldHaveStatus(HttpStatusCode.OK);

        var draft = await user.Client.GetAsync<BookingDraftResponse>("/api/booking-draft");
        Assert.Equal("Draft", draft.Status);
        Assert.Equal("Right", draft.Data.GetProperty("hands").GetProperty("2").GetString());
        Assert.Empty(await user.Client.GetAsync<List<BookingResponse>>("/api/bookings")); // not a reservation

        var other = await factory.CreateClientAsync();
        await (await other.Client.GetAsync("/api/booking-draft")).ShouldHaveStatus(HttpStatusCode.NoContent);
        var admin = await factory.CreateAdminClientAsync();
        await (await admin.GetAsync("/api/booking-draft")).ShouldHaveStatus(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Booking_removes_the_draft_and_a_failed_check_keeps_it()
    {
        var user = await factory.CreateClientAsync();
        var data = JsonSerializer.SerializeToElement(new { step = 3, serviceId = Plain });
        await user.Client.PutJsonAsync("/api/booking-draft", new SaveBookingDraftRequest(data));

        var past = (ApiFactory.StartDate.AddDays(-1), new TimeOnly(11, 0));
        await (await user.Client.PostJsonAsync("/api/bookings", TestHelpers.NewBooking(past, Plain))).ShouldHaveStatus(HttpStatusCode.BadRequest);
        await (await user.Client.GetAsync("/api/booking-draft")).ShouldHaveStatus(HttpStatusCode.OK);

        await user.Client.BookAsync(TestHelpers.NewBooking(factory.NextSlot(), Plain));
        await (await user.Client.GetAsync("/api/booking-draft")).ShouldHaveStatus(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task A_draft_must_be_a_json_object_of_reasonable_size()
    {
        var user = await factory.CreateClientAsync();

        var notObject = await user.Client.PutJsonAsync("/api/booking-draft", new SaveBookingDraftRequest(JsonSerializer.SerializeToElement("text")));
        var tooBig = await user.Client.PutJsonAsync("/api/booking-draft",
            new SaveBookingDraftRequest(JsonSerializer.SerializeToElement(new { note = new string('x', 5000) })));

        await notObject.ShouldHaveStatus(HttpStatusCode.BadRequest);
        await tooBig.ShouldHaveStatus(HttpStatusCode.BadRequest);
    }
}
