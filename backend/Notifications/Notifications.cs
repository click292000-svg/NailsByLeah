using System.Net;
using System.Net.Http.Json;
using System.Net.Mail;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Options;
using NailsByLeah.Api.Configuration;
using NailsByLeah.Api.Data;
using NailsByLeah.Api.Domain;
using NailsByLeah.Api.Infrastructure;

namespace NailsByLeah.Api.Notifications;

/// <summary>Every message the system sends goes through this abstraction (Ref 5.5, 10.5).</summary>
public interface INotificationService
{
    Task SendEmailVerificationAsync(User user, string code, CancellationToken ct = default);
    Task SendPasswordResetAsync(User user, string resetLink, CancellationToken ct = default);
    /// <summary>Sent when the booking is made and paid: the payment is received, the booking awaits confirmation.</summary>
    Task SendBookingConfirmationAsync(Booking booking, Payment payment, CancellationToken ct = default);

    /// <summary>Sent when the administrator confirms the booking.</summary>
    Task SendBookingApprovedAsync(Booking booking, CancellationToken ct = default);
    Task SendAppointmentReminderAsync(Booking booking, CancellationToken ct = default);

    // Alerts to the salon (Notifications:SalonEmail), so Leyah hears about changes without opening the admin pages.

    /// <summary>A client booked and paid; the booking waits for the salon to confirm it.</summary>
    Task SendSalonNewBookingAsync(Booking booking, Payment payment, CancellationToken ct = default);

    /// <summary>A client cancelled their booking.</summary>
    Task SendSalonCancellationAsync(Booking booking, string reasonLabel, CancellationToken ct = default);

    /// <summary>A client moved their booking; <paramref name="fromDate"/> and <paramref name="fromTime"/> are the old slot.</summary>
    Task SendSalonRescheduleAsync(Booking booking, DateOnly fromDate, TimeOnly fromTime, CancellationToken ct = default);
}

/// <summary>Delivery channel. An SMS sender can be added later behind its own interface.</summary>
public interface IEmailSender
{
    Task SendAsync(string toAddress, string toName, string subject, string textBody, CancellationToken ct = default);
}

/// <summary>Builds plain-text emails. Plain text means user-entered names cannot inject HTML.</summary>
public sealed class EmailNotificationService(
    IEmailSender email,
    IOptions<AuthOptions> authOptions,
    IOptions<NotificationOptions> notificationOptions,
    IOptions<FrontendOptions> frontendOptions) : INotificationService
{
    private const string SalonName = "Nails by Leyah";

    public Task SendSalonNewBookingAsync(Booking booking, Payment payment, CancellationToken ct = default) =>
        ToSalon($"New booking to confirm: {booking.Client.FirstName} {booking.Client.LastName}, {booking.BookingDate:MMM d} at {booking.StartTime:h:mm tt}",
            $"""
            A client booked and paid. Please check the payment and confirm the booking.

            {AppointmentLines(booking)}
            Total: PHP {booking.TotalPrice:0.00}
            {Labels.For(payment.Option)} paid: PHP {payment.Amount:0.00} via {payment.Method} (reference {payment.ReferenceNumber})
            Balance due at the salon: PHP {booking.BalanceDue:0.00}
            Note for Leyah: {booking.NoteText}

            Confirm it here: {AdminLink(booking, pendingOnly: true)}
            """, ct);

    public Task SendSalonCancellationAsync(Booking booking, string reasonLabel, CancellationToken ct = default) =>
        ToSalon($"Booking cancelled: {booking.Client.FirstName} {booking.Client.LastName}, {booking.BookingDate:MMM d} at {booking.StartTime:h:mm tt}",
            $"""
            A client cancelled their booking. The time is free again for other clients.

            {AppointmentLines(booking)}
            Reason: {reasonLabel}
            Paid online: PHP {booking.AmountPaid:0.00} (the PHP {booking.DepositAmount:0.00} deposit is non-refundable)

            Bookings that day: {AdminLink(booking, pendingOnly: false)}
            """, ct);

    public Task SendSalonRescheduleAsync(Booking booking, DateOnly fromDate, TimeOnly fromTime, CancellationToken ct = default) =>
        ToSalon($"Booking moved: {booking.Client.FirstName} {booking.Client.LastName}, now {booking.BookingDate:MMM d} at {booking.StartTime:h:mm tt}",
            $"""
            A client moved their booking.

            Was: {fromDate:dddd, MMMM d, yyyy} at {fromTime:h\:mm tt}
            {AppointmentLines(booking)}

            Bookings that day: {AdminLink(booking, pendingOnly: false)}
            """, ct);

    /// <summary>Sends to the salon's address, or does nothing when none is configured.</summary>
    private Task ToSalon(string subject, string body, CancellationToken ct)
    {
        var to = notificationOptions.Value.SalonEmail;
        return string.IsNullOrWhiteSpace(to) ? Task.CompletedTask : email.SendAsync(to, SalonName, subject, body, ct);
    }

    private static string AppointmentLines(Booking booking)
    {
        var addOns = booking.AddOns.Count == 0 ? "None"
            : string.Join(", ", booking.AddOns.Select(a => $"{a.AddOn.Name} ({Labels.For(a.Hand).ToLowerInvariant()}, {a.NailCount} {(a.NailCount == 1 ? "nail" : "nails")})"));
        return $"""
            Client: {booking.Client.FirstName} {booking.Client.LastName} (@{booking.Client.Username})
            Contact: {booking.Client.Email}, {booking.Client.PhoneNumber}
            Service: {booking.Service.CategoryLabel} - {booking.Service.Name}
            Add-ons: {addOns}
            Date: {booking.BookingDate:dddd, MMMM d, yyyy}
            Time: {booking.StartTime:h\:mm tt} - {booking.EndTime:h\:mm tt}
            """;
    }

    private string AdminLink(Booking booking, bool pendingOnly) =>
        $"{frontendOptions.Value.BaseUrl.TrimEnd('/')}/admin/bookings?date={booking.BookingDate:yyyy-MM-dd}{(pendingOnly ? "&status=Pending" : "")}";

    public Task SendEmailVerificationAsync(User user, string code, CancellationToken ct = default) =>
        email.SendAsync(user.Email, FullName(user), "Verify your Nails by Leyah account",
            $"""
            Hi {user.FirstName},

            Your verification code is: {code}

            Enter this code on the verification page to activate your account.
            The code expires in {authOptions.Value.EmailVerificationCodeHours} hours.

            If you did not create an account, you can ignore this email.
            """, ct);

    public Task SendPasswordResetAsync(User user, string resetLink, CancellationToken ct = default) =>
        email.SendAsync(user.Email, FullName(user), "Reset your Nails by Leyah password",
            $"""
            Hi {user.FirstName},

            Use this link to choose a new password:
            {resetLink}

            The link can be used once and expires in {authOptions.Value.PasswordResetTokenMinutes} minutes.
            If you did not ask for a password reset, you can ignore this email.
            """, ct);

    public Task SendBookingConfirmationAsync(Booking booking, Payment payment, CancellationToken ct = default) =>
        email.SendAsync(booking.Client.Email, FullName(booking.Client), "We received your Nails by Leyah booking",
            $"""
            Hi {booking.Client.FirstName},

            We received your booking and payment. Leyah will check it and confirm your appointment; you will get another email when she does.

            Service: {booking.Service.CategoryLabel} - {booking.Service.Name}
            Date: {booking.BookingDate:dddd, MMMM d, yyyy}
            Time: {booking.StartTime:h\:mm tt} - {booking.EndTime:h\:mm tt}
            Total: PHP {booking.TotalPrice:0.00}
            {Labels.For(payment.Option)} paid: PHP {payment.Amount:0.00} via {payment.Method} (reference {payment.ReferenceNumber})
            Balance due at the salon: PHP {booking.BalanceDue:0.00}

            The booking deposit is non-refundable.
            """, ct);

    public Task SendBookingApprovedAsync(Booking booking, CancellationToken ct = default) =>
        email.SendAsync(booking.Client.Email, FullName(booking.Client), "Your Nails by Leyah booking is confirmed",
            $"""
            Hi {booking.Client.FirstName},

            Leyah has confirmed your appointment.

            Service: {booking.Service.CategoryLabel} - {booking.Service.Name}
            Date: {booking.BookingDate:dddd, MMMM d, yyyy}
            Time: {booking.StartTime:h\:mm tt} - {booking.EndTime:h\:mm tt}
            Paid online: PHP {booking.AmountPaid:0.00}
            Balance due at the salon: PHP {booking.BalanceDue:0.00}

            See you soon!
            """, ct);

    public Task SendAppointmentReminderAsync(Booking booking, CancellationToken ct = default) =>
        email.SendAsync(booking.Client.Email, FullName(booking.Client), "Reminder: your Nails by Leyah appointment",
            $"""
            Hi {booking.Client.FirstName},

            This is a reminder of your appointment:

            Service: {booking.Service.CategoryLabel} - {booking.Service.Name}
            Date: {booking.BookingDate:dddd, MMMM d, yyyy}
            Time: {booking.StartTime:h\:mm tt}
            Balance due at the salon: PHP {booking.BalanceDue:0.00}

            See you soon!
            """, ct);

    private static string FullName(User user) => $"{user.FirstName} {user.LastName}";
}

/// <summary>
/// Sends through Brevo's transactional email API over HTTPS, so it works on hosts that block SMTP ports.
/// A rejected email (bad key, unverified sender, daily limit) throws with Brevo's reason; the key is never logged.
/// </summary>
public sealed partial class BrevoEmailSender(HttpClient http, IOptions<BrevoOptions> brevo, IOptions<EmailOptions> email) : IEmailSender
{
    [GeneratedRegex(@"[^\s""'<>,;:]+@[^\s""'<>,;:]+\.[A-Za-z]{2,}")]
    private static partial Regex EmailAddressPattern();

    public async Task SendAsync(string toAddress, string toName, string subject, string textBody, CancellationToken ct = default)
    {
        var from = email.Value;
        using var request = new HttpRequestMessage(HttpMethod.Post, "smtp/email")
        {
            Content = JsonContent.Create(new
            {
                sender = new { name = from.FromName, email = from.FromAddress },
                to = new[] { new { email = toAddress, name = toName } },
                subject,
                textContent = textBody,
            }),
        };
        request.Headers.Add("api-key", brevo.Value.ApiKey);
        request.Headers.Accept.ParseAdd("application/json");

        using var response = await http.SendAsync(request, ct);
        if (!response.IsSuccessStatusCode)
        {
            // Brevo's reason can repeat the recipient's address; this message ends up in the logs, so addresses are hidden.
            var reason = EmailAddressPattern().Replace(await response.Content.ReadAsStringAsync(ct), "[email]");
            throw new InvalidOperationException(
                $"Brevo rejected the email \"{subject}\" ({(int)response.StatusCode} {response.ReasonPhrase}): {reason[..Math.Min(reason.Length, 500)]}");
        }
    }
}

public sealed class SmtpEmailSender(IOptions<SmtpOptions> options, IOptions<EmailOptions> email) : IEmailSender
{
    public async Task SendAsync(string toAddress, string toName, string subject, string textBody, CancellationToken ct = default)
    {
        var smtp = options.Value;
        var from = email.Value;
        using var message = new MailMessage(new MailAddress(from.FromAddress, from.FromName), new MailAddress(toAddress, toName))
        {
            Subject = subject,
            Body = textBody,
            IsBodyHtml = false,
        };
        using var client = new SmtpClient(smtp.Host, smtp.Port) { EnableSsl = smtp.EnableSsl };
        if (!string.IsNullOrEmpty(smtp.Username))
            client.Credentials = new NetworkCredential(smtp.Username, smtp.Password);
        await client.SendMailAsync(message, ct);
    }
}

/// <summary>Development-only sender that writes emails to the log instead of sending them.</summary>
public sealed class LoggingEmailSender(ILogger<LoggingEmailSender> logger) : IEmailSender
{
    public Task SendAsync(string toAddress, string toName, string subject, string textBody, CancellationToken ct = default)
    {
        logger.LogInformation("DEV EMAIL to {To} | {Subject}\n{Body}", toAddress, subject, textBody);
        return Task.CompletedTask;
    }
}

public interface IAppointmentReminderJob
{
    /// <summary>Sends reminders for confirmed appointments starting within the reminder window. Returns how many were sent.</summary>
    Task<int> RunOnceAsync(CancellationToken ct = default);
}

/// <summary>Sends the 24-hour appointment reminder (Ref 10.5).</summary>
public sealed class AppointmentReminderJob(
    IBookingRepository bookings,
    INotificationService notifications,
    IUnitOfWork unitOfWork,
    ISalonClock clock,
    IOptions<NotificationOptions> options,
    ILogger<AppointmentReminderJob> logger) : IAppointmentReminderJob
{
    public async Task<int> RunOnceAsync(CancellationToken ct = default)
    {
        var now = clock.LocalNow;
        var until = now.AddHours(options.Value.ReminderLeadHours);
        var due = (await bookings.GetDueForReminderAsync(DateOnly.FromDateTime(now), DateOnly.FromDateTime(until), ct))
            .Where(b => b.StartsAtLocal > now && b.StartsAtLocal <= until)
            .ToList();

        var sent = 0;
        foreach (var booking in due)
        {
            try
            {
                await notifications.SendAppointmentReminderAsync(booking, ct);
                booking.ReminderSentAt = clock.UtcNow;
                await unitOfWork.SaveChangesAsync(ct);
                sent++;
            }
            // An email timeout is also an OperationCanceledException; only a real shutdown may pass through.
            catch (Exception ex) when (ex is not OperationCanceledException || !ct.IsCancellationRequested)
            {
                logger.LogWarning(ex, "Could not send the reminder for booking {BookingId}; it will be retried", booking.Id);
            }
        }
        return sent;
    }
}

/// <summary>Runs <see cref="IAppointmentReminderJob"/> on a timer.</summary>
public sealed class AppointmentReminderWorker(
    IServiceScopeFactory scopes,
    IOptions<NotificationOptions> options,
    ILogger<AppointmentReminderWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var minutes = options.Value.ReminderCheckIntervalMinutes;
        if (minutes <= 0)
            return;

        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(minutes));
        do
        {
            try
            {
                await using var scope = scopes.CreateAsyncScope();
                var sent = await scope.ServiceProvider.GetRequiredService<IAppointmentReminderJob>().RunOnceAsync(stoppingToken);
                if (sent > 0)
                    logger.LogInformation("Sent {Count} appointment reminder(s)", sent);
            }
            // An exception leaving this loop would stop the whole API, so only a real shutdown may pass through.
            catch (Exception ex) when (ex is not OperationCanceledException || !stoppingToken.IsCancellationRequested)
            {
                logger.LogError(ex, "Appointment reminder run failed");
            }
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }
}
