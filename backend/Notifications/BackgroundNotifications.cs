using System.Threading.Channels;

namespace NailsByLeah.Api.Notifications;

/// <summary>
/// Sends an email after the request has answered. Used where the answer must not depend on whether an account exists
/// ("forgot password", "resend code"): the reply is equally fast for every address, and an email failure is logged
/// instead of turning into an error only real accounts would see.
/// </summary>
public interface IBackgroundNotifications
{
    /// <summary>Queues <paramref name="send"/>; <paramref name="description"/> names it in the log if it fails.</summary>
    ValueTask EnqueueAsync(Func<INotificationService, CancellationToken, Task> send, string description);
}

/// <summary>An in-memory queue worked through by one background loop, each email in its own service scope.</summary>
public sealed class QueuedBackgroundNotifications(IServiceScopeFactory scopes, ILogger<QueuedBackgroundNotifications> logger)
    : BackgroundService, IBackgroundNotifications
{
    private readonly Channel<(Func<INotificationService, CancellationToken, Task> Send, string Description)> _queue =
        Channel.CreateBounded<(Func<INotificationService, CancellationToken, Task>, string)>(
            new BoundedChannelOptions(500) { FullMode = BoundedChannelFullMode.DropWrite, SingleReader = true });

    public ValueTask EnqueueAsync(Func<INotificationService, CancellationToken, Task> send, string description)
    {
        // A full queue means something is badly wrong (rate limits keep it small); drop rather than slow the request.
        if (!_queue.Writer.TryWrite((send, description)))
            logger.LogWarning("Email queue is full; dropped the {Description}", description);
        return ValueTask.CompletedTask;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await foreach (var (send, description) in _queue.Reader.ReadAllAsync(stoppingToken))
        {
            try
            {
                await using var scope = scopes.CreateAsyncScope();
                await send(scope.ServiceProvider.GetRequiredService<INotificationService>(), stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException || !stoppingToken.IsCancellationRequested)
            {
                logger.LogError(ex, "Could not send the {Description}", description);
            }
        }
    }
}
