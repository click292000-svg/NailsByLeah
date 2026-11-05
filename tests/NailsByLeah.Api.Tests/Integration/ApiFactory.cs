using System.Collections.Concurrent;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Time.Testing;
using NailsByLeah.Api.Data;
using NailsByLeah.Api.Domain;
using NailsByLeah.Api.Notifications;
using NailsByLeah.Api.Payments;

namespace NailsByLeah.Api.Tests.Integration;

/// <summary>
/// Hosts the real API against a throwaway LocalDB database. Time, outgoing messages and the
/// payment provider are replaced with test doubles the tests can control and inspect.
/// </summary>
public sealed class ApiFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    public const string AdminUsername = "test.admin";
    public const string AdminPassword = "AdminPass123";
    public const string DefaultPassword = "ClientPass123";

    /// <summary>2026-11-02 08:00 in Manila.</summary>
    public static readonly DateTimeOffset StartTime = new(2026, 11, 2, 0, 0, 0, TimeSpan.Zero);
    public static readonly DateOnly StartDate = new(2026, 11, 2);
    /// <summary>Two hours apart: room for the longest seeded service (90 minutes) plus the 30-minute break.</summary>
    public static readonly TimeOnly[] SlotTimes = [new(11, 0), new(13, 0), new(15, 0), new(17, 0), new(19, 0)];

    private readonly string _databaseName = $"NailsByLeah_Tests_{Guid.NewGuid():N}";

    /// <summary>Throwaway folder for uploaded reference photos.</summary>
    public string UploadFolder { get; } = Path.Combine(Path.GetTempPath(), $"nbl-test-uploads-{Guid.NewGuid():N}");
    private int _userCounter;
    private int _slotCounter;

    public FakeTimeProvider Clock { get; } = new(StartTime);
    public CapturingNotificationService Notifications { get; } = new();
    public TestPaymentGateway Gateway { get; } = new();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");
        builder.UseSetting("ConnectionStrings:Default",
            $"Server=(localdb)\\MSSQLLocalDB;Database={_databaseName};Trusted_Connection=True;TrustServerCertificate=True");
        builder.UseSetting("Database:ApplyMigrationsOnStartup", "true");
        builder.UseSetting("Auth:BcryptWorkFactor", "4");
        builder.UseSetting("Notifications:ReminderCheckIntervalMinutes", "0");
        builder.UseSetting("AdminSeed:Username", AdminUsername);
        builder.UseSetting("AdminSeed:Email", "admin@test.local");
        builder.UseSetting("AdminSeed:Password", AdminPassword);
        builder.UseSetting("AdminSeed:PhoneNumber", "09990000000");
        builder.UseSetting("Uploads:ReferenceImagePath", UploadFolder);
        // User secrets load in tests too: without this, tests would write to the developer's real bucket.
        builder.UseSetting("Supabase:Url", "");
        builder.UseSetting("Supabase:SecretKey", "");
        // Many tests share one test client address; RateLimitTests turns the limits back on with small numbers.
        builder.UseSetting("RateLimits:Enabled", "false");

        builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<TimeProvider>();
            services.AddSingleton<TimeProvider>(Clock);
            services.RemoveAll<INotificationService>();
            services.AddSingleton<INotificationService>(Notifications);
            // Emails queued to send after the answer are sent straight away, so tests can read them right after a request.
            services.RemoveAll<IBackgroundNotifications>();
            services.AddSingleton<IBackgroundNotifications>(new InlineBackgroundNotifications(Notifications));
            services.RemoveAll<IPaymentGateway>();
            services.AddSingleton<IPaymentGateway>(Gateway);
        });
    }

    public HttpClient NewClient() => CreateClient(new WebApplicationFactoryClientOptions
    {
        BaseAddress = new Uri("https://localhost"),
        HandleCookies = true,
        AllowAutoRedirect = false,
    });

    public int NextUserNumber() => Interlocked.Increment(ref _userCounter);

    /// <summary>A future slot no other test in this factory has used (day 2 onwards, so always more than 24 hours away).</summary>
    public (DateOnly Date, TimeOnly Time) NextSlot()
    {
        var index = Interlocked.Increment(ref _slotCounter) - 1;
        return (StartDate.AddDays(2 + index / SlotTimes.Length), SlotTimes[index % SlotTimes.Length]);
    }

    public T WithDb<T>(Func<AppDbContext, T> query)
    {
        using var scope = Services.CreateScope();
        return query(scope.ServiceProvider.GetRequiredService<AppDbContext>());
    }

    public Task InitializeAsync()
    {
        _ = Server; // starts the host: applies migrations and seeds the administrator
        return Task.CompletedTask;
    }

    async Task IAsyncLifetime.DisposeAsync()
    {
        await using (var scope = Services.CreateAsyncScope())
            await scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.EnsureDeletedAsync();
        await base.DisposeAsync();
        if (Directory.Exists(UploadFolder))
            Directory.Delete(UploadFolder, recursive: true);
    }
}

/// <summary>Sends queued emails immediately and, like the real queue, swallows a failure instead of failing the request.</summary>
public sealed class InlineBackgroundNotifications(INotificationService notifications) : IBackgroundNotifications
{
    public async ValueTask EnqueueAsync(Func<INotificationService, CancellationToken, Task> send, string description)
    {
        try
        {
            await send(notifications, CancellationToken.None);
        }
        catch (InvalidOperationException)
        {
            // The real queue logs this; the request has already been answered normally.
        }
    }
}

public sealed class CapturingNotificationService : INotificationService
{
    private int _failNext;

    /// <summary>The next verification or password reset email throws, like Brevo being down.</summary>
    public void FailNextEmail() => Interlocked.Exchange(ref _failNext, 1);

    private int _timeOutNextReminder;

    /// <summary>The next reminder times out the way HttpClient does when Brevo takes too long.</summary>
    public void TimeOutNextReminder() => Interlocked.Exchange(ref _timeOutNextReminder, 1);

    private void ThrowIfFailing()
    {
        if (Interlocked.Exchange(ref _failNext, 0) == 1)
            throw new InvalidOperationException("Brevo returned 503.");
    }

    private readonly ConcurrentDictionary<string, string> _verificationCodes = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, string> _resetLinks = new(StringComparer.OrdinalIgnoreCase);

    public ConcurrentBag<int> ConfirmedBookingIds { get; } = [];
    public ConcurrentBag<int> RemindedBookingIds { get; } = [];
    public ConcurrentBag<int> ApprovedBookingIds { get; } = [];

    public string VerificationCodeFor(string email) => _verificationCodes[email];

    public string ResetLinkFor(string email) => _resetLinks[email];

    public string ResetTokenFor(string email)
    {
        var link = _resetLinks[email];
        return Uri.UnescapeDataString(link[(link.IndexOf("token=", StringComparison.Ordinal) + "token=".Length)..]);
    }

    public Task SendEmailVerificationAsync(User user, string code, CancellationToken ct = default)
    {
        ThrowIfFailing();
        _verificationCodes[user.Email] = code;
        return Task.CompletedTask;
    }

    public Task SendPasswordResetAsync(User user, string resetLink, CancellationToken ct = default)
    {
        ThrowIfFailing();
        _resetLinks[user.Email] = resetLink;
        return Task.CompletedTask;
    }

    public Task SendBookingConfirmationAsync(Booking booking, Payment payment, CancellationToken ct = default)
    {
        ThrowIfFailing();
        ConfirmedBookingIds.Add(booking.Id);
        return Task.CompletedTask;
    }

    public Task SendBookingApprovedAsync(Booking booking, CancellationToken ct = default)
    {
        ApprovedBookingIds.Add(booking.Id);
        return Task.CompletedTask;
    }

    public Task SendAppointmentReminderAsync(Booking booking, CancellationToken ct = default)
    {
        if (Interlocked.Exchange(ref _timeOutNextReminder, 0) == 1)
            throw new TaskCanceledException("The request was canceled due to the configured HttpClient.Timeout of 20 seconds elapsing.");
        RemindedBookingIds.Add(booking.Id);
        return Task.CompletedTask;
    }

    public ConcurrentBag<int> SalonNewBookingIds { get; } = [];
    public ConcurrentDictionary<int, string> SalonCancellationReasons { get; } = new();
    public ConcurrentDictionary<int, (DateOnly Date, TimeOnly Time)> SalonReschedules { get; } = new();

    public Task SendSalonNewBookingAsync(Booking booking, Payment payment, CancellationToken ct = default)
    {
        SalonNewBookingIds.Add(booking.Id);
        return Task.CompletedTask;
    }

    public Task SendSalonCancellationAsync(Booking booking, string reasonLabel, CancellationToken ct = default)
    {
        SalonCancellationReasons[booking.Id] = reasonLabel;
        return Task.CompletedTask;
    }

    public Task SendSalonRescheduleAsync(Booking booking, DateOnly fromDate, TimeOnly fromTime, CancellationToken ct = default)
    {
        SalonReschedules[booking.Id] = (fromDate, fromTime);
        return Task.CompletedTask;
    }
}

/// <summary>Approves charges like the simulated gateway, but counts them and can be told to fail.</summary>
public sealed class TestPaymentGateway : IPaymentGateway
{
    private int _referenceCounter;
    private int _failNext;

    public ConcurrentDictionary<Guid, int> ChargesByKey { get; } = new();

    /// <summary>The amount asked for with each payment key, to check the server charged the right amount.</summary>
    public ConcurrentDictionary<Guid, decimal> AmountsByKey { get; } = new();

    public void FailNextCharge() => Interlocked.Exchange(ref _failNext, 1);

    public int ChargeCount(Guid key) => ChargesByKey.TryGetValue(key, out var count) ? count : 0;

    public Task<PaymentChargeResult> ChargeAsync(PaymentCharge charge, CancellationToken ct = default)
    {
        ChargesByKey.AddOrUpdate(charge.IdempotencyKey, 1, (_, count) => count + 1);
        AmountsByKey[charge.IdempotencyKey] = charge.Amount;
        if (Interlocked.Exchange(ref _failNext, 0) == 1)
            return Task.FromResult(PaymentChargeResult.Failure("The e-wallet declined the payment."));

        var reference = $"TEST-{Interlocked.Increment(ref _referenceCounter):D6}-{Guid.NewGuid():N}"[..24];
        return Task.FromResult(PaymentChargeResult.Success(reference));
    }
}
