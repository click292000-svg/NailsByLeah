using System.Net;
using Microsoft.Extensions.DependencyInjection;
using NailsByLeah.Api.Contracts;
using NailsByLeah.Api.Domain;
using NailsByLeah.Api.Notifications;

namespace NailsByLeah.Api.Tests.Integration;

/// <summary>Booking, payment, cancellation and scheduling rules (backend docs 3–7, tests 9.1.6–9.1.8, 9.1.11).</summary>
public sealed class BookingTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    // Seeded price list ids.
    private const int SoftGelPlain = 1;
    private const int SoftGelWithDesign = 8; // Soft Gel Extension with Design, ₱499
    private const int FrenchTip = 1;
    private const int Chrome = 2;

    [Fact] // Ref 2.2, 4
    public async Task Price_list_matches_the_approved_prices()
    {
        var catalog = await factory.NewClient().GetAsync<CatalogResponse>("/api/services");

        Assert.Equal(150m, catalog.DepositAmount);
        Assert.False(catalog.DepositRefundable);
        // Other tests in this class may add services, so only the seeded rows (ids 1-5) are compared.
        Assert.Equal(
            ["Plain:300", "BIAB:250", "My Work:100", "Not My Work:150"], // Plain's "With Design" (id 2) is retired
            catalog.Services.Where(s => s.Id <= 5).Select(s => $"{s.Name}:{s.Price:0}"));
        Assert.Equal(
            ["French Tip:15", "Chrome:10", "Cat Eye Polish:10", "Blooming Gel:10", "Embossed Art:15"],
            catalog.AddOns.Where(a => a.Id <= 5).Select(a => $"{a.Name}:{a.Price:0}"));
        Assert.All(catalog.AddOns, a => Assert.Equal("per nail", a.PricingUnit));
    }

    [Fact] // Ref 10.2, 10.4, 12.3, 12.5
    public async Task Booking_computes_total_stays_pending_after_payment_and_returns_a_receipt()
    {
        var user = await factory.CreateClientAsync();

        var result = await user.Client.BookAsync(TestHelpers.NewBooking(factory.NextSlot(), SoftGelWithDesign, addOns:
            [new AddOnSelection(FrenchTip, 10, NailHand.Both), new AddOnSelection(Chrome, 2, NailHand.Right)]));

        Assert.Equal("Pending", result.Booking.Status); // paid, but only the administrator confirms
        Assert.Equal(499m, result.Booking.ServicePrice);
        Assert.Equal(669m, result.Booking.TotalPrice); // 499 + 15x10 + 10x2
        Assert.Equal(150m, result.Booking.DepositAmount);
        Assert.Equal(519m, result.Booking.BalanceDue);
        Assert.Equal(150m, result.Receipt.Amount);
        Assert.Equal("GCash", result.Receipt.Method);
        Assert.False(result.Receipt.Refundable);
        Assert.False(string.IsNullOrWhiteSpace(result.Receipt.ReferenceNumber));
        Assert.Contains(result.Booking.Id, factory.Notifications.ConfirmedBookingIds);

        var receipt = await user.Client.GetAsync<ReceiptResponse>($"/api/bookings/{result.Booking.Id}/receipt");
        Assert.Equal(result.Receipt.ReferenceNumber, receipt.ReferenceNumber);
        Assert.False(receipt.Verified); // paid, not yet checked by the salon: no PDF receipt yet
        Assert.Equal(3, receipt.Lines!.Count); // the service and the two Stone add-ons
        Assert.Equal(669m, receipt.Lines.Sum(l => l.Amount));
        Assert.False(string.IsNullOrWhiteSpace(receipt.ClientName));

        var admin = await factory.CreateAdminClientAsync();
        await admin.ConfirmAsync(result.Booking.Id);
        var verified = await user.Client.GetAsync<ReceiptResponse>($"/api/bookings/{result.Booking.Id}/receipt");
        Assert.True(verified.Verified);
        Assert.NotNull(verified.VerifiedAt);
        Assert.Equal(150m, verified.AmountPaid);
        Assert.Equal(verified.ReferenceNumber, (await admin.GetAsync<ReceiptResponse>($"/api/admin/bookings/{result.Booking.Id}/receipt")).ReferenceNumber);

        // Another client cannot see it.
        var other = await factory.CreateClientAsync();
        await (await other.Client.GetAsync($"/api/bookings/{result.Booking.Id}/receipt")).ShouldHaveStatus(HttpStatusCode.NotFound);
    }

    [Fact] // Ref 10.4
    public async Task Booking_total_includes_add_ons_and_the_balance_after_the_deposit()
    {
        var user = await factory.CreateClientAsync();

        var booked = await user.Client.BookAsync(TestHelpers.NewBooking(factory.NextSlot(), SoftGelWithDesign, addOns: new AddOnSelection(FrenchTip, 3, NailHand.Right)));

        Assert.Equal(544m, booked.Booking.TotalPrice); // Soft Gel Extension with Design 499 + French Tip 15 x 3
        Assert.Equal(394m, booked.Booking.BalanceDue);
    }

    [Fact] // 9.1.6
    public async Task Booking_without_deposit_acknowledgment_is_rejected()
    {
        var user = await factory.CreateClientAsync();
        var request = TestHelpers.NewBooking(factory.NextSlot(), depositAcknowledged: false);

        var response = await user.Client.PostJsonAsync("/api/bookings", request);

        await response.ShouldHaveStatus(HttpStatusCode.BadRequest);
        Assert.Contains("You must acknowledge that the booking deposit is non-refundable.",
            (await response.ReadProblemAsync()).ErrorsFor("depositAcknowledged"));
        Assert.Equal(0, factory.Gateway.ChargeCount(request.IdempotencyKey));
    }

    [Fact]
    public async Task Booking_records_that_the_client_accepted_the_policy_and_which_terms_version()
    {
        var user = await factory.CreateClientAsync();

        var booked = await user.Client.BookAsync(TestHelpers.NewBooking(factory.NextSlot(), SoftGelPlain));

        var details = factory.WithDb(db => db.AuditLogs
            .Single(a => a.Action == "BookingCreated" && a.EntityId == booked.Booking.Id.ToString()).Details);
        Assert.Contains($"Booking policy and Terms v{TestHelpers.TermsVersion} accepted", details);
    }

    [Fact] // 9.1.7
    public async Task Two_clients_booking_the_same_slot_at_the_same_time_only_one_succeeds()
    {
        var first = await factory.CreateClientAsync();
        var second = await factory.CreateClientAsync();
        var slot = factory.NextSlot();

        var responses = await Task.WhenAll(
            first.Client.PostJsonAsync("/api/bookings", TestHelpers.NewBooking(slot)),
            second.Client.PostJsonAsync("/api/bookings", TestHelpers.NewBooking(slot)));

        Assert.Single(responses, r => r.StatusCode == HttpStatusCode.Created);
        var loser = Assert.Single(responses, r => r.StatusCode == HttpStatusCode.Conflict);
        Assert.Equal("slot_unavailable", (await loser.ReadProblemAsync()).ProblemCode());
        Assert.Equal(1, factory.WithDb(db => db.Bookings.Count(b => b.BookingDate == slot.Date && b.StartTime == slot.Time)));
    }

    [Fact] // 9.1.11
    public async Task Submitting_the_same_payment_twice_charges_once()
    {
        var user = await factory.CreateClientAsync();
        var request = TestHelpers.NewBooking(factory.NextSlot());

        var first = await user.Client.PostJsonAsync("/api/bookings", request);
        var second = await user.Client.PostJsonAsync("/api/bookings", request);

        await first.ShouldHaveStatus(HttpStatusCode.Created);
        await second.ShouldHaveStatus(HttpStatusCode.OK);
        var a = await first.ReadAsync<CreateBookingResponse>();
        var b = await second.ReadAsync<CreateBookingResponse>();
        Assert.Equal(a.Booking.Id, b.Booking.Id);
        Assert.Equal(a.Receipt.ReferenceNumber, b.Receipt.ReferenceNumber);
        Assert.Equal(1, factory.Gateway.ChargeCount(request.IdempotencyKey));
        Assert.Equal(1, factory.WithDb(db => db.Payments.Count(p => p.IdempotencyKey == request.IdempotencyKey)));
    }

    [Fact] // 9.1.11, concurrent double click
    public async Task Simultaneous_double_click_on_pay_charges_once()
    {
        var user = await factory.CreateClientAsync();
        var request = TestHelpers.NewBooking(factory.NextSlot());

        var responses = await Task.WhenAll(
            user.Client.PostJsonAsync("/api/bookings", request),
            user.Client.PostJsonAsync("/api/bookings", request));

        Assert.All(responses, r => Assert.True(r.IsSuccessStatusCode, $"Unexpected {(int)r.StatusCode}"));
        Assert.Equal(1, factory.Gateway.ChargeCount(request.IdempotencyKey));
        Assert.Equal(1, factory.WithDb(db => db.Payments.Count(p => p.IdempotencyKey == request.IdempotencyKey)));
    }

    [Fact] // Ref 6.1
    public async Task Failed_payment_leaves_no_booking_and_keeps_the_slot_open()
    {
        var user = await factory.CreateClientAsync();
        var slot = factory.NextSlot();
        factory.Gateway.FailNextCharge();

        var response = await user.Client.PostJsonAsync("/api/bookings", TestHelpers.NewBooking(slot));

        await response.ShouldHaveStatus(HttpStatusCode.PaymentRequired);
        Assert.Equal(0, factory.WithDb(db => db.Bookings.Count(b => b.ClientId == user.Id)));
        var day = await user.Client.GetAsync<DaySlotsResponse>($"/api/slots?date={slot.Date:yyyy-MM-dd}");
        Assert.Equal(SlotStatuses.Open, day.Slots.Single(s => s.StartTime == slot.Time).Status);
    }

    [Fact] // Ref 10.1
    public async Task Booked_slots_are_reported_as_booked()
    {
        var user = await factory.CreateClientAsync();
        var slot = factory.NextSlot();
        await user.Client.BookAsync(TestHelpers.NewBooking(slot));

        var day = await factory.NewClient().GetAsync<DaySlotsResponse>($"/api/slots?date={slot.Date:yyyy-MM-dd}");

        Assert.Equal(SlotStatuses.Booked, day.Slots.Single(s => s.StartTime == slot.Time).Status);
    }

    [Fact] // 9.1.8
    public async Task Administrator_can_cancel_without_an_explanation()
    {
        var user = await factory.CreateClientAsync();
        var booking = await user.Client.BookAsync(TestHelpers.NewBooking(factory.NextSlot()));
        var admin = await factory.CreateAdminClientAsync();

        var response = await admin.PostJsonAsync($"/api/admin/bookings/{booking.Booking.Id}/cancel",
            new AdminCancelRequest(AdminCancellationReason.ScheduleConflict, null));

        await response.ShouldHaveStatus(HttpStatusCode.OK);
        var cancelled = await response.ReadAsync<BookingResponse>();
        Assert.Equal("Cancelled", cancelled.Status);
        Assert.Equal("Schedule conflict", cancelled.Cancellation!.ReasonLabel);
        Assert.Null(cancelled.Cancellation.Explanation);
        Assert.Equal("Administrator", cancelled.Cancellation.CancelledByRole);
    }

    [Fact] // Ref 2.5, 6.4
    public async Task Client_cancellation_records_the_reason_and_frees_the_slot()
    {
        var user = await factory.CreateClientAsync();
        var slot = factory.NextSlot();
        var booking = await user.Client.BookAsync(TestHelpers.NewBooking(slot));

        var response = await user.Client.PostJsonAsync($"/api/bookings/{booking.Booking.Id}/cancel",
            new ClientCancelRequest(ClientCancellationReason.FoundAnotherProvider));

        await response.ShouldHaveStatus(HttpStatusCode.OK);
        var stored = factory.WithDb(db => db.Cancellations.Single(c => c.BookingId == booking.Booking.Id));
        Assert.Equal(nameof(ClientCancellationReason.FoundAnotherProvider), stored.Reason);
        var day = await user.Client.GetAsync<DaySlotsResponse>($"/api/slots?date={slot.Date:yyyy-MM-dd}");
        Assert.Equal(SlotStatuses.Open, day.Slots.Single(s => s.StartTime == slot.Time).Status);

        var history = await user.Client.GetAsync<List<BookingResponse>>("/api/bookings");
        Assert.Equal("Cancelled", history.Single(b => b.Id == booking.Booking.Id).Status);
    }

    [Fact] // Ref 10.6
    public async Task Clients_can_reschedule_only_24_hours_or_more_ahead()
    {
        var user = await factory.CreateClientAsync();

        var later = await user.Client.BookAsync(TestHelpers.NewBooking(factory.NextSlot()));
        var target = factory.NextSlot();
        var moved = await user.Client.PostJsonAsync($"/api/bookings/{later.Booking.Id}/reschedule", new RescheduleRequest(target.Date, target.Time));
        await moved.ShouldHaveStatus(HttpStatusCode.OK);
        Assert.Equal(target.Date, (await moved.ReadAsync<BookingResponse>()).BookingDate);

        // Today 16:00 is 8 hours away.
        var soon = await user.Client.BookAsync(TestHelpers.NewBooking((ApiFactory.StartDate, new TimeOnly(16, 0))));
        var refused = await user.Client.PostJsonAsync($"/api/bookings/{soon.Booking.Id}/reschedule",
            new RescheduleRequest(factory.NextSlot().Date, new TimeOnly(11, 0)));
        await refused.ShouldHaveStatus(HttpStatusCode.Conflict);
        Assert.Equal("reschedule_window_passed", (await refused.ReadProblemAsync()).ProblemCode());
    }

    [Fact] // Ref 11.2
    public async Task Administrator_can_complete_todays_booking_but_not_a_future_one()
    {
        var user = await factory.CreateClientAsync();
        var today = await user.Client.BookAsync(TestHelpers.NewBooking((ApiFactory.StartDate, new TimeOnly(13, 30))));
        var future = await user.Client.BookAsync(TestHelpers.NewBooking(factory.NextSlot()));
        var admin = await factory.CreateAdminClientAsync();
        await admin.ConfirmAsync(today.Booking.Id);
        await admin.ConfirmAsync(future.Booking.Id);

        var completed = await admin.PostAsync($"/api/admin/bookings/{today.Booking.Id}/complete", null);
        await completed.ShouldHaveStatus(HttpStatusCode.OK);
        Assert.Equal("Completed", (await completed.ReadAsync<BookingResponse>()).Status);

        await (await admin.PostAsync($"/api/admin/bookings/{future.Booking.Id}/complete", null)).ShouldHaveStatus(HttpStatusCode.Conflict);
    }

    [Fact] // Ref 11.4
    public async Task Blocked_dates_cannot_be_booked()
    {
        var admin = await factory.CreateAdminClientAsync();
        var slot = factory.NextSlot();
        var block = await admin.PostJsonAsync("/api/admin/blocked-slots", new BlockSlotRequest(slot.Date, null, "Holiday"));
        await block.ShouldHaveStatus(HttpStatusCode.Created);
        // Skip the rest of that day so other tests never pick it.
        for (var i = 1; i < ApiFactory.SlotTimes.Length; i++)
            factory.NextSlot();

        var user = await factory.CreateClientAsync();
        var response = await user.Client.PostJsonAsync("/api/bookings", TestHelpers.NewBooking(slot));
        await response.ShouldHaveStatus(HttpStatusCode.Conflict);

        var day = await user.Client.GetAsync<DaySlotsResponse>($"/api/slots?date={slot.Date:yyyy-MM-dd}");
        Assert.True(day.IsClosed);
        Assert.All(day.Slots, s => Assert.Equal(SlotStatuses.Closed, s.Status));
    }

    [Fact] // Ref 11.3, 13.6
    public async Task Changing_a_price_does_not_change_existing_bookings()
    {
        var admin = await factory.CreateAdminClientAsync();
        var created = await admin.PostJsonAsync("/api/admin/services", new CreateServiceRequest("SoftGel", $"Promo {Guid.NewGuid():N}"[..20], 500m));
        await created.ShouldHaveStatus(HttpStatusCode.Created);
        var service = await created.ReadAsync<ServiceItemResponse>();

        var user = await factory.CreateClientAsync();
        var booking = await user.Client.BookAsync(TestHelpers.NewBooking(factory.NextSlot(), service.Id));

        await (await admin.PutJsonAsync($"/api/admin/services/{service.Id}", new UpdateServiceRequest(service.Name, 650m, true)))
            .ShouldHaveStatus(HttpStatusCode.OK);

        var after = await user.Client.GetAsync<BookingResponse>($"/api/bookings/{booking.Booking.Id}");
        Assert.Equal(500m, after.ServicePrice);
        var next = await user.Client.BookAsync(TestHelpers.NewBooking(factory.NextSlot(), service.Id));
        Assert.Equal(650m, next.Booking.TotalPrice);
    }

    [Fact] // Ref 11.1, 11.5, 11.6, 11.7
    public async Task Admin_dashboard_search_reports_and_activity_log_reflect_bookings()
    {
        var user = await factory.CreateClientAsync(factory.NewRegistration(firstName: "Searchable"));
        var booking = await user.Client.BookAsync(TestHelpers.NewBooking(factory.NextSlot()));
        var admin = await factory.CreateAdminClientAsync();

        var dashboard = await admin.GetAsync<DashboardResponse>("/api/admin/dashboard");
        Assert.True(dashboard.TotalDepositsCollected >= 150m);
        Assert.True(dashboard.DepositsCollectedToday >= 150m);

        var search = await admin.GetAsync<PagedResponse<BookingResponse>>("/api/admin/bookings?clientName=Searchable");
        var found = Assert.Single(search.Items);
        Assert.Equal(booking.Booking.Id, found.Id);
        Assert.Equal("Searchable", found.Client!.FirstName);

        var daily = await admin.GetAsync<DailySalesReport>($"/api/admin/reports/daily?date={ApiFactory.StartDate:yyyy-MM-dd}");
        Assert.True(daily.DepositsCollected >= 150m);
        Assert.True(daily.BookingsMade >= 1);
        var monthly = await admin.GetAsync<MonthlySalesReport>("/api/admin/reports/monthly?year=2026&month=11");
        Assert.Equal(30, monthly.Days.Count);

        var logs = await admin.GetAsync<PagedResponse<ActivityLogResponse>>("/api/admin/activity-logs?action=BookingCreated&pageSize=200");
        var entry = Assert.Single(logs.Items, l => l.EntityId == booking.Booking.Id.ToString());
        Assert.Equal(user.Username, entry.Username);
    }

    [Fact] // Ref 10.5
    public async Task Reminder_is_sent_once_for_appointments_within_24_hours()
    {
        var user = await factory.CreateClientAsync();
        var soon = await user.Client.BookAsync(TestHelpers.NewBooking((ApiFactory.StartDate, new TimeOnly(11, 0))));
        var later = await user.Client.BookAsync(TestHelpers.NewBooking(factory.NextSlot()));
        var admin = await factory.CreateAdminClientAsync();
        await admin.ConfirmAsync(soon.Booking.Id);
        await admin.ConfirmAsync(later.Booking.Id);

        await RunReminderJobAsync();
        await RunReminderJobAsync();

        Assert.Single(factory.Notifications.RemindedBookingIds, id => id == soon.Booking.Id);
        Assert.DoesNotContain(later.Booking.Id, factory.Notifications.RemindedBookingIds);
    }

    private async Task RunReminderJobAsync()
    {
        await using var scope = factory.Services.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<IAppointmentReminderJob>().RunOnceAsync();
    }
}
