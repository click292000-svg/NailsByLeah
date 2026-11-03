using System.Net;
using System.Net.Mail;
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
}

/// <summary>Delivery channel. An SMS sender can be added later behind its own interface.</summary>
public interface IEmailSender
{
    Task SendAsync(string toAddress, string toName, string subject, string textBody, CancellationToken ct = default);
}

/// <summary>Builds plain-text emails. Plain text means user-entered names cannot inject HTML.</summary>
public sealed class EmailNotificationService(
    IEmailSender email,
    IOptions<AuthOptions> authOptions) : INotificationService
{
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

public sealed class SmtpEmailSender(IOptions<SmtpOptions> options) : IEmailSender
{
    public async Task SendAsync(string toAddress, string toName, string subject, string textBody, CancellationToken ct = default)
    {
        var smtp = options.Value;
        using var message = new MailMessage(new MailAddress(smtp.FromAddress, smtp.FromName), new MailAddress(toAddress, toName))
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
            catch (Exception ex) when (ex is not OperationCanceledException)
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
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "Appointment reminder run failed");
            }
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }
}
