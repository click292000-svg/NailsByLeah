using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;
using NailsByLeah.Api.Configuration;

namespace NailsByLeah.Api.Infrastructure;

/// <summary>Names used in [EnableRateLimiting] on the endpoints that need a tighter limit than the overall one.</summary>
public static class RateLimitPolicies
{
    /// <summary>Signing in. Account lockout protects one account; this stops one visitor trying many accounts.</summary>
    public const string Login = "login";
    /// <summary>Endpoints that send an email (sign-up, resend code, forgot password), so Brevo's daily quota can't be used up.</summary>
    public const string Email = "email";
    /// <summary>Endpoints that check a code or reset link, so they can't be guessed.</summary>
    public const string Code = "code";
    /// <summary>Making, moving and cancelling bookings.</summary>
    public const string Booking = "booking";
    /// <summary>Uploading design photos.</summary>
    public const string Upload = "upload";
    /// <summary>Sending feedback.</summary>
    public const string Feedback = "feedback";
}

/// <summary>
/// Limits how often one visitor (by IP address) or one signed-in client (by account) can call the API. Every request
/// counts toward an overall per-visitor limit; the policies above add tighter limits on sensitive endpoints.
/// A refused request gets 429 with a Retry-After header and a message the website shows as is.
/// Behind a hosting proxy the visitor's real address comes from the forwarded-headers setting (go-live plan).
/// </summary>
public static class RateLimiting
{
    public static IServiceCollection AddNailsByLeahRateLimiting(this IServiceCollection services)
    {
        services.AddRateLimiter(_ => { });
        services.AddOptions<RateLimiterOptions>().Configure<IOptions<RateLimitOptions>>((options, settings) =>
        {
            var limits = settings.Value;
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            options.OnRejected = OnRejectedAsync;
            options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(context =>
                Partition($"all:{VisitorKey(context)}", limits.Overall));

            AddPolicy(options, RateLimitPolicies.Login, limits.Login, VisitorKey);
            AddPolicy(options, RateLimitPolicies.Email, limits.Email, VisitorKey);
            AddPolicy(options, RateLimitPolicies.Code, limits.Code, VisitorKey);
            AddPolicy(options, RateLimitPolicies.Booking, limits.Booking, AccountOrVisitorKey);
            AddPolicy(options, RateLimitPolicies.Upload, limits.Upload, AccountOrVisitorKey);
            AddPolicy(options, RateLimitPolicies.Feedback, limits.Feedback, AccountOrVisitorKey);
        });
        return services;
    }

    /// <summary>Turns the limits on unless RateLimits:Enabled is false. Runs after authentication so a signed-in client is limited by account.</summary>
    public static IApplicationBuilder UseNailsByLeahRateLimiting(this IApplicationBuilder app) =>
        app.ApplicationServices.GetRequiredService<IOptions<RateLimitOptions>>().Value.Enabled ? app.UseRateLimiter() : app;

    private static void AddPolicy(RateLimiterOptions options, string name, RateLimitRule rule, Func<HttpContext, string> key) =>
        options.AddPolicy(name, context => Partition($"{name}:{key(context)}", rule));

    private static RateLimitPartition<string> Partition(string key, RateLimitRule rule) =>
        RateLimitPartition.GetFixedWindowLimiter(key, _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = rule.PermitLimit,
            Window = TimeSpan.FromSeconds(rule.WindowSeconds),
            QueueLimit = 0,
            AutoReplenishment = true,
        });

    private static string VisitorKey(HttpContext context) => context.Connection.RemoteIpAddress?.ToString() ?? "unknown";

    private static string AccountOrVisitorKey(HttpContext context) =>
        context.User.FindUserId() is { } userId ? $"user:{userId}" : $"ip:{VisitorKey(context)}";

    private static async ValueTask OnRejectedAsync(OnRejectedContext rejected, CancellationToken ct)
    {
        var http = rejected.HttpContext;
        var wait = rejected.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter) ? retryAfter : TimeSpan.FromMinutes(1);
        var seconds = Math.Max(1, (int)Math.Ceiling(wait.TotalSeconds));
        http.Response.Headers.RetryAfter = seconds.ToString();

        // The path only: the visitor's address is personal data and stays out of the logs.
        http.RequestServices.GetRequiredService<ILoggerFactory>().CreateLogger(typeof(RateLimiting))
            .LogWarning("Rate limit reached for {Method} {Path}", http.Request.Method, http.Request.Path);

        var minutes = (int)Math.Ceiling(seconds / 60.0);
        var problem = new ProblemDetails
        {
            Status = StatusCodes.Status429TooManyRequests,
            Title = "Too many requests",
            Detail = $"Too many attempts. Please wait {(minutes <= 1 ? "a minute" : $"{minutes} minutes")} and try again.",
            Extensions = { ["code"] = "rate_limited", ["retryAfterSeconds"] = seconds },
        };
        await http.RequestServices.GetRequiredService<IProblemDetailsService>()
            .WriteAsync(new ProblemDetailsContext { HttpContext = http, ProblemDetails = problem });
    }
}
