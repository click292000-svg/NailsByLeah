using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using NailsByLeah.Api.Configuration;
using NailsByLeah.Api.Notifications;
using NailsByLeah.Api.Tests.Integration;

namespace NailsByLeah.Api.Tests.Unit;

/// <summary>A background job that lets an exception escape stops the whole API, so email timeouts must stay inside them.</summary>
public sealed class BackgroundEmailTests
{
    private static readonly TimeSpan Patience = TimeSpan.FromSeconds(10);

    [Fact]
    public async Task Email_queue_keeps_working_after_a_timeout_and_a_failure()
    {
        using var provider = new ServiceCollection()
            .AddSingleton<INotificationService>(new CapturingNotificationService())
            .BuildServiceProvider();
        var queue = new QueuedBackgroundNotifications(provider.GetRequiredService<IServiceScopeFactory>(), NullLogger<QueuedBackgroundNotifications>.Instance);
        var thirdSent = new TaskCompletionSource();
        await queue.StartAsync(CancellationToken.None);

        await queue.EnqueueAsync((_, _) => throw new TaskCanceledException("HttpClient.Timeout elapsed"), "first email");
        await queue.EnqueueAsync((_, _) => throw new InvalidOperationException("Brevo returned 503"), "second email");
        await queue.EnqueueAsync((_, _) => { thirdSent.SetResult(); return Task.CompletedTask; }, "third email");

        await thirdSent.Task.WaitAsync(Patience);
        await queue.StopAsync(CancellationToken.None);
    }

    [Fact]
    public async Task Reminder_worker_survives_an_email_timeout()
    {
        var job = new TimingOutReminderJob();
        await using var provider = new ServiceCollection()
            .AddScoped<IAppointmentReminderJob>(_ => job)
            .BuildServiceProvider();
        var worker = new AppointmentReminderWorker(provider.GetRequiredService<IServiceScopeFactory>(),
            Options.Create(new NotificationOptions { ReminderCheckIntervalMinutes = 1 }), NullLogger<AppointmentReminderWorker>.Instance);

        await worker.StartAsync(CancellationToken.None);
        await job.Ran.Task.WaitAsync(Patience);
        await Task.Delay(100); // long enough for an escaped exception to end the worker

        Assert.False(worker.ExecuteTask!.IsCompleted, "The worker must keep running after an email timeout.");
        await worker.StopAsync(CancellationToken.None);
    }

    private sealed class TimingOutReminderJob : IAppointmentReminderJob
    {
        public TaskCompletionSource Ran { get; } = new();

        public Task<int> RunOnceAsync(CancellationToken ct = default)
        {
            Ran.TrySetResult();
            throw new TaskCanceledException("HttpClient.Timeout elapsed");
        }
    }
}
