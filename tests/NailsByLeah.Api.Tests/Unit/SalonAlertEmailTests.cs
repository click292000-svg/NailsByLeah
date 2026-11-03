using Microsoft.Extensions.Options;
using NailsByLeah.Api.Configuration;
using NailsByLeah.Api.Domain;
using NailsByLeah.Api.Notifications;

namespace NailsByLeah.Api.Tests.Unit;

/// <summary>What the salon's alert emails say, and that no alert is sent without a salon address.</summary>
public sealed class SalonAlertEmailTests
{
    [Fact]
    public async Task New_booking_alert_goes_to_the_salon_with_what_Leyah_needs_to_confirm()
    {
        var sent = new CapturingEmailSender();

        await Service(sent, salonEmail: "salon@example.test").SendSalonNewBookingAsync(SampleBooking(), SamplePayment());

        var mail = Assert.Single(sent.Mails);
        Assert.Equal("salon@example.test", mail.To);
        Assert.Contains("Kyla Santos", mail.Subject);
        Assert.Contains("Nov 12", mail.Subject);
        Assert.Contains("Soft Gel - With Design", mail.Body);
        Assert.Contains("French Tip (both hands, 2 nails)", mail.Body);
        Assert.Contains("GC-20261103-abc", mail.Body);
        Assert.Contains("Please bring nude polish", mail.Body);
        Assert.Contains("https://nails.example.test/admin/bookings?date=2026-11-12&status=Pending", mail.Body);
    }

    [Fact]
    public async Task Without_a_salon_address_no_alert_is_sent()
    {
        var sent = new CapturingEmailSender();
        var notifications = Service(sent, salonEmail: null);

        await notifications.SendSalonNewBookingAsync(SampleBooking(), SamplePayment());
        await notifications.SendSalonCancellationAsync(SampleBooking(), "Emergency");
        await notifications.SendSalonRescheduleAsync(SampleBooking(), new DateOnly(2026, 11, 10), new TimeOnly(11, 0));

        Assert.Empty(sent.Mails);
    }

    private static EmailNotificationService Service(IEmailSender sender, string? salonEmail) => new(
        sender,
        Options.Create(new AuthOptions()),
        Options.Create(new NotificationOptions { SalonEmail = salonEmail }),
        Options.Create(new FrontendOptions { BaseUrl = "https://nails.example.test/" }));

    private static Booking SampleBooking() => new()
    {
        Id = 7,
        Client = new User { FirstName = "Kyla", LastName = "Santos", Username = "kyla", Email = "kyla@example.test", PhoneNumber = "09171234567" },
        Service = new SoftGelService { Name = "With Design", Price = 400m },
        ServicePrice = 400m,
        DepositAmount = 150m,
        AmountPaid = 150m,
        BookingDate = new DateOnly(2026, 11, 12),
        StartTime = new TimeOnly(14, 0),
        DurationMinutes = 90,
        Note = "Please bring nude polish",
        AddOns = [new BookingAddOn { AddOn = new StoneAddOn { Name = "French Tip", Price = 15m }, NailCount = 2, Hand = NailHand.Both, LinePrice = 30m }],
    };

    private static Payment SamplePayment() => new()
    {
        Method = PaymentMethod.GCash,
        Option = PaymentOption.Deposit,
        Amount = 150m,
        ReferenceNumber = "GC-20261103-abc",
    };

    private sealed record Mail(string To, string Subject, string Body);

    private sealed class CapturingEmailSender : IEmailSender
    {
        public List<Mail> Mails { get; } = [];

        public Task SendAsync(string toAddress, string toName, string subject, string textBody, CancellationToken ct = default)
        {
            Mails.Add(new Mail(toAddress, subject, textBody));
            return Task.CompletedTask;
        }
    }
}
