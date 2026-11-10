using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Options;
using NailsByLeah.Api.Configuration;
using NailsByLeah.Api.Data;
using NailsByLeah.Api.Domain;

namespace NailsByLeah.Api.Infrastructure;

/// <summary>Current time in UTC and in the salon's local time zone.</summary>
public interface ISalonClock
{
    DateTime UtcNow { get; }
    DateTime LocalNow { get; }
    DateOnly Today { get; }
    DateTime ToUtc(DateTime salonLocal);
    DateTime ToLocal(DateTime utc);
}

public sealed class SalonClock(TimeProvider time, IOptions<ScheduleOptions> options) : ISalonClock
{
    private readonly TimeZoneInfo _zone = TimeZoneInfo.FindSystemTimeZoneById(options.Value.TimeZoneId);

    public DateTime UtcNow => time.GetUtcNow().UtcDateTime;
    public DateTime LocalNow => TimeZoneInfo.ConvertTimeFromUtc(UtcNow, _zone);
    public DateOnly Today => DateOnly.FromDateTime(LocalNow);

    public DateTime ToUtc(DateTime salonLocal) =>
        TimeZoneInfo.ConvertTimeToUtc(DateTime.SpecifyKind(salonLocal, DateTimeKind.Unspecified), _zone);

    public DateTime ToLocal(DateTime utc) =>
        TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(utc, DateTimeKind.Utc), _zone);
}

public static class ClaimNames
{
    public const string SecurityStamp = "nbl:security_stamp";
}

public static class ClaimsPrincipalExtensions
{
    public static int? FindUserId(this ClaimsPrincipal principal) =>
        int.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : null;

    public static int GetUserId(this ClaimsPrincipal principal) =>
        principal.FindUserId() ?? throw new InvalidOperationException("The request has no authenticated user.");
}

/// <summary>Who is making the current request. Used for audit logging.</summary>
public interface ICurrentUser
{
    int? UserId { get; }
    string? IpAddress { get; }
}

public sealed class HttpCurrentUser(IHttpContextAccessor accessor) : ICurrentUser
{
    public int? UserId => accessor.HttpContext?.User.FindUserId();
    public string? IpAddress => accessor.HttpContext?.Connection.RemoteIpAddress?.ToString();
}

public interface IPasswordHasher
{
    string Hash(string password);
    bool Verify(string password, string hash);
}

/// <summary>bcrypt password hashing (Ref 8.1).</summary>
public sealed class BcryptPasswordHasher(IOptions<AuthOptions> options) : IPasswordHasher
{
    public string Hash(string password) => BCrypt.Net.BCrypt.HashPassword(password, options.Value.BcryptWorkFactor);

    public bool Verify(string password, string hash)
    {
        try
        {
            return BCrypt.Net.BCrypt.Verify(password, hash);
        }
        catch (BCrypt.Net.SaltParseException)
        {
            return false;
        }
    }
}

/// <summary>Random codes/tokens for email verification and password reset. Only their hashes are stored.</summary>
public static class SecureTokens
{
    public static string NewNumericCode(int digits = 6) =>
        RandomNumberGenerator.GetInt32(0, (int)Math.Pow(10, digits)).ToString(new string('0', digits));

    public static string NewUrlToken() =>
        Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    public static string Hash(string value) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value)));

    public static bool HashMatches(string value, string expectedHash) =>
        CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(Hash(value)), Encoding.ASCII.GetBytes(expectedHash));
}

/// <summary>Writes activity log entries (Ref 11.7). Entries are saved with the caller's unit of work.</summary>
public interface IAuditLogger
{
    void Record(string action, string? entityType = null, object? entityId = null, string? details = null, int? userId = null);
}

public sealed class AuditLogger(IAuditLogRepository logs, ICurrentUser currentUser, ISalonClock clock) : IAuditLogger
{
    public void Record(string action, string? entityType = null, object? entityId = null, string? details = null, int? userId = null)
    {
        logs.Add(new AuditLog
        {
            UserId = userId ?? currentUser.UserId,
            Action = action,
            EntityType = entityType,
            EntityId = entityId?.ToString(),
            Details = details is { Length: > 500 } ? details[..500] : details,
            IpAddress = currentUser.IpAddress,
            CreatedAt = clock.UtcNow,
        });
    }
}

public static class AuditActions
{
    public const string UserRegistered = "UserRegistered";
    public const string EmailVerified = "EmailVerified";
    public const string LoginSucceeded = "LoginSucceeded";
    public const string LoginFailed = "LoginFailed";
    public const string AccountLocked = "AccountLocked";
    public const string PasswordResetRequested = "PasswordResetRequested";
    public const string PasswordReset = "PasswordReset";
    public const string BookingCreated = "BookingCreated";
    public const string BookingConfirmed = "BookingConfirmed";
    public const string BookingRescheduled = "BookingRescheduled";
    public const string BookingCompleted = "BookingCompleted";
    public const string BookingCancelled = "BookingCancelled";
    public const string BookingNoShow = "BookingNoShow";
    public const string BalanceReceived = "BalanceReceived";
    public const string RefundSent = "RefundSent";
    public const string SalonDetailsChanged = "SalonDetailsChanged";
    public const string SalonPhotoChanged = "SalonPhotoChanged";
    public const string PasswordChanged = "PasswordChanged";
    public const string SignedOutEverywhere = "SignedOutEverywhere";
    public const string PaymentSucceeded = "PaymentSucceeded";
    public const string PaymentFailed = "PaymentFailed";
    public const string ServiceCreated = "ServiceCreated";
    public const string ServiceUpdated = "ServiceUpdated";
    public const string ServiceDeleted = "ServiceDeleted";
    public const string SlotBlocked = "SlotBlocked";
    public const string SlotUnblocked = "SlotUnblocked";
    public const string SlotBlockChanged = "SlotBlockChanged";
    public const string SalonHoursChanged = "SalonHoursChanged";
    public const string ReferenceImageUploaded = "ReferenceImageUploaded";
    public const string ReferenceImageRemoved = "ReferenceImageRemoved";
    public const string FeedbackSubmitted = "FeedbackSubmitted";
    public const string ClientDataDeleted = "ClientDataDeleted";
    public const string ProfileUpdated = "ProfileUpdated";
}

/// <summary>
/// The wait between verification emails, kept per email address in memory (the API runs as one instance). Kept for
/// addresses with no account too, so the wait itself can't reveal which emails are registered.
/// </summary>
public sealed class ResendCooldown(TimeProvider time, Microsoft.Extensions.Options.IOptions<NailsByLeah.Api.Configuration.AuthOptions> options)
{
    private readonly System.Collections.Concurrent.ConcurrentDictionary<string, DateTimeOffset> _sentAt = new(StringComparer.Ordinal);

    private TimeSpan Wait => TimeSpan.FromSeconds(options.Value.VerificationResendCooldownSeconds);

    /// <summary>Starts the wait for this address, or throws <see cref="Errors.CooldownException"/> while one is running.</summary>
    public void Start(string email)
    {
        var now = time.GetUtcNow();
        while (true)
        {
            if (_sentAt.TryGetValue(email, out var last))
            {
                var left = last + Wait - now;
                if (left > TimeSpan.Zero)
                    throw new Errors.CooldownException((int)Math.Ceiling(left.TotalSeconds));
                if (_sentAt.TryUpdate(email, now, last))
                    break;
            }
            else if (_sentAt.TryAdd(email, now))
                break;
        }

        // Forget addresses whose wait is long over, so the list can't grow without end.
        if (_sentAt.Count > 1000)
            foreach (var (key, sent) in _sentAt)
                if (sent + Wait < now)
                    _sentAt.TryRemove(key, out _);
    }

    /// <summary>A code was just sent another way (sign-up), so the wait starts now.</summary>
    public void MarkSent(string email) => _sentAt[email] = time.GetUtcNow();

    /// <summary>The email could not be queued, so the client may try again straight away.</summary>
    public void Cancel(string email) => _sentAt.TryRemove(email, out _);
}
