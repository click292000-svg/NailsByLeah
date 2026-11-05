using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Time.Testing;
using NailsByLeah.Api.Configuration;
using NailsByLeah.Api.Infrastructure;
using NailsByLeah.Api.Notifications;

namespace NailsByLeah.Api.Tests.Unit;

/// <summary>Error emails: who gets them, the limits that protect the email quota, and what they leave out.</summary>
public sealed class ErrorAlertTests
{
    private static readonly ErrorAlert Alert = new("NailsByLeah.Api.Errors.GlobalExceptionHandler", "Unhandled exception for GET /api/bookings", "InvalidOperationException");

    private readonly FakeTimeProvider _time = new(new DateTimeOffset(2026, 11, 5, 8, 0, 0, TimeSpan.Zero));
    private readonly FakeEmail _email = new();

    private ErrorAlertSender Sender(string? address = "owner@example.test", int minutes = 60, int perDay = 3)
    {
        var scopes = new ServiceCollection().AddSingleton<IEmailSender>(_email).BuildServiceProvider().GetRequiredService<IServiceScopeFactory>();
        return new ErrorAlertSender(scopes, Options.Create(new AlertOptions { Email = address, MinutesBetweenEmails = minutes, MaxEmailsPerDay = perDay }),
            _time, NullLogger<ErrorAlertSender>.Instance);
    }

    [Fact]
    public void The_defaults_keep_alerts_rare()
    {
        var defaults = new AlertOptions();

        Assert.Equal((3, 60), (defaults.MaxEmailsPerDay, defaults.MinutesBetweenEmails));
    }

    [Fact]
    public async Task An_error_emails_the_alert_address()
    {
        await Sender().HandleAsync(Alert);

        var sent = Assert.Single(_email.Sent);
        Assert.Equal("owner@example.test", sent.To);
        Assert.Contains("GET /api/bookings", sent.Body);
        Assert.Contains("InvalidOperationException", sent.Body);
    }

    [Fact]
    public async Task No_address_means_no_email()
    {
        await Sender(address: "").HandleAsync(Alert);

        Assert.Empty(_email.Sent);
    }

    [Fact]
    public async Task Errors_during_the_quiet_period_are_counted_and_reported_next_time()
    {
        var sender = Sender();
        await sender.HandleAsync(Alert);
        await sender.HandleAsync(Alert);
        await sender.HandleAsync(Alert);
        Assert.Single(_email.Sent);

        _time.Advance(TimeSpan.FromMinutes(60));
        await sender.HandleAsync(Alert);

        Assert.Equal(2, _email.Sent.Count);
        Assert.Contains("Other errors since the last alert: 2", _email.Sent[1].Body);
    }

    [Fact]
    public async Task The_daily_limit_protects_the_email_quota_and_resets_the_next_day()
    {
        var sender = Sender(minutes: 0, perDay: 2);
        for (var i = 0; i < 5; i++)
            await sender.HandleAsync(Alert);
        Assert.Equal(2, _email.Sent.Count);

        _time.Advance(TimeSpan.FromDays(1));
        await sender.HandleAsync(Alert);

        Assert.Equal(3, _email.Sent.Count);
        Assert.Contains("Other errors since the last alert: 3", _email.Sent[2].Body);
    }

    [Fact]
    public async Task A_failed_alert_email_does_not_throw_even_on_a_timeout()
    {
        _email.Failure = new TaskCanceledException("HttpClient.Timeout elapsed");

        await Sender().HandleAsync(Alert);

        Assert.Empty(_email.Sent);
    }

    [Fact]
    public void Only_the_apps_serious_problems_become_alerts_and_exception_messages_stay_out()
    {
        var queue = new ErrorAlertQueue();
        var provider = new ErrorAlertLoggerProvider(queue);
        var app = provider.CreateLogger("NailsByLeah.Api.Services.BookingService");

        Assert.True(app.IsEnabled(LogLevel.Critical));
        Assert.False(app.IsEnabled(LogLevel.Error));
        Assert.False(provider.CreateLogger("Microsoft.EntityFrameworkCore.Database.Command").IsEnabled(LogLevel.Critical));

        app.LogCritical(new InvalidOperationException("Duplicate value kyla@example.test"), "Could not save booking {Id}", 5);

        var alert = ReadOne(queue);
        Assert.Equal("Could not save booking 5", alert.Message);
        Assert.Equal("InvalidOperationException", alert.ExceptionType);
        Assert.DoesNotContain("kyla@example.test", alert.ToString());
    }

    [Fact]
    public async Task The_worker_keeps_running_after_a_failure()
    {
        var queue = new ErrorAlertQueue();
        _email.Failure = new InvalidOperationException("Brevo returned 503");
        var worker = new ErrorAlertWorker(queue, Sender(minutes: 0), NullLogger<ErrorAlertWorker>.Instance);

        await worker.StartAsync(CancellationToken.None);
        queue.Add(Alert);
        await Task.Delay(100);
        _email.Failure = null;
        queue.Add(Alert);
        await WaitUntilAsync(() => _email.Sent.Count == 1);

        Assert.False(worker.ExecuteTask!.IsCompleted);
        await worker.StopAsync(CancellationToken.None);
    }

    private static ErrorAlert ReadOne(ErrorAlertQueue queue)
    {
        using var stop = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        var reader = queue.ReadAllAsync(stop.Token).GetAsyncEnumerator(stop.Token);
        Assert.True(reader.MoveNextAsync().AsTask().GetAwaiter().GetResult());
        return reader.Current;
    }

    private static async Task WaitUntilAsync(Func<bool> condition)
    {
        for (var i = 0; i < 100 && !condition(); i++)
            await Task.Delay(50);
        Assert.True(condition());
    }

    private sealed record SentEmail(string To, string Subject, string Body);

    private sealed class FakeEmail : IEmailSender
    {
        public List<SentEmail> Sent { get; } = [];
        public Exception? Failure { get; set; }

        public Task SendAsync(string toAddress, string toName, string subject, string textBody, CancellationToken ct = default)
        {
            if (Failure is not null)
                return Task.FromException(Failure);
            Sent.Add(new SentEmail(toAddress, subject, textBody));
            return Task.CompletedTask;
        }
    }
}
