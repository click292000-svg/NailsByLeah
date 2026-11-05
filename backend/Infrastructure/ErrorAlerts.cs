using System.Threading.Channels;
using Microsoft.Extensions.Options;
using NailsByLeah.Api.Configuration;
using NailsByLeah.Api.Notifications;

namespace NailsByLeah.Api.Infrastructure;

/// <summary>One error worth telling someone about. The exception's own message is left out: it can repeat client details.</summary>
public sealed record ErrorAlert(string Category, string Message, string? ExceptionType);

/// <summary>Holds errors for sending; logging must never wait for an email. During an outage the oldest are dropped.</summary>
public sealed class ErrorAlertQueue
{
    private readonly Channel<ErrorAlert> _channel = Channel.CreateBounded<ErrorAlert>(
        new BoundedChannelOptions(100) { FullMode = BoundedChannelFullMode.DropOldest, SingleReader = true });

    public void Add(ErrorAlert alert) => _channel.Writer.TryWrite(alert);
    public IAsyncEnumerable<ErrorAlert> ReadAllAsync(CancellationToken ct) => _channel.Reader.ReadAllAsync(ct);
}

/// <summary>
/// Passes the app's Critical logs to the queue: only the failures someone must act on (a page crashing, the database
/// unreachable, reminders failing, photos failing to save). Ordinary errors stay in the server log. Framework logs are
/// skipped: they can include SQL and duplicate the app's own entry.
/// </summary>
public sealed class ErrorAlertLoggerProvider(ErrorAlertQueue queue) : ILoggerProvider
{
    private const string AppCategoryPrefix = "NailsByLeah.";

    public ILogger CreateLogger(string categoryName) => new AlertLogger(categoryName, queue);
    public void Dispose() { }

    private sealed class AlertLogger(string category, ErrorAlertQueue queue) : ILogger
    {
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => logLevel >= LogLevel.Critical && category.StartsWith(AppCategoryPrefix, StringComparison.Ordinal);

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
            if (IsEnabled(logLevel))
                queue.Add(new ErrorAlert(category, formatter(state, null), exception?.GetType().Name));
        }
    }
}

/// <summary>
/// Emails the address in Alerts:Email about serious problems, with limits so an outage can't use up the daily email quota that real
/// clients' codes and confirmations depend on. Errors inside a quiet period are counted and reported in the next email.
/// </summary>
public sealed class ErrorAlertSender(IServiceScopeFactory scopes, IOptions<AlertOptions> options, TimeProvider time, ILogger<ErrorAlertSender> logger)
{
    private readonly AlertOptions _options = options.Value;
    private DateTimeOffset? _lastSent;
    private DateOnly _day;
    private int _sentToday;
    private int _unreported;

    public async Task HandleAsync(ErrorAlert alert, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(_options.Email))
            return;

        var now = time.GetUtcNow();
        var today = DateOnly.FromDateTime(now.UtcDateTime);
        if (today != _day)
            (_day, _sentToday) = (today, 0);

        var tooSoon = _lastSent is { } last && now - last < TimeSpan.FromMinutes(_options.MinutesBetweenEmails);
        if (tooSoon || _sentToday >= _options.MaxEmailsPerDay)
        {
            _unreported++;
            return;
        }

        // Counted before sending: when email itself is what's failing, retrying on every error wouldn't help.
        _lastSent = now;
        _sentToday++;
        var others = _unreported;
        _unreported = 0;
        try
        {
            await using var scope = scopes.CreateAsyncScope();
            await scope.ServiceProvider.GetRequiredService<IEmailSender>().SendAsync(_options.Email, "Nails by Leyah alerts",
                "Nails by Leyah: an error happened on the website", Body(alert, now, others), ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException || !ct.IsCancellationRequested)
        {
            // Warning, not Error: an error here would become another alert about the alerts failing.
            logger.LogWarning(ex, "Could not send an error alert email");
        }
    }

    private static string Body(ErrorAlert alert, DateTimeOffset now, int others) =>
        $"""
        An error happened on the website.

        Time (UTC): {now:yyyy-MM-dd HH:mm:ss}
        What: {alert.Message}
        Error type: {alert.ExceptionType ?? "not given"}
        Where: {alert.Category}
        Other errors since the last alert: {others}

        Client details are left out of this email. The server logs have the full error.
        """;
}

/// <summary>Sends queued alerts. Nothing may escape this loop: a background job that fails stops the whole API.</summary>
public sealed class ErrorAlertWorker(ErrorAlertQueue queue, ErrorAlertSender sender, ILogger<ErrorAlertWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await foreach (var alert in queue.ReadAllAsync(stoppingToken))
        {
            try
            {
                await sender.HandleAsync(alert, stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException || !stoppingToken.IsCancellationRequested)
            {
                logger.LogWarning(ex, "Error alert could not be handled");
            }
        }
    }
}
