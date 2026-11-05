using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using NailsByLeah.Api.Configuration;
using NailsByLeah.Api.Data;
using NailsByLeah.Api.Domain;
using NailsByLeah.Api.Payments;
using NailsByLeah.Api.Validation;

namespace NailsByLeah.Api.Infrastructure;

public static class StartupTasks
{
    public static async Task RunStartupTasksAsync(this WebApplication app)
    {
        await using var scope = app.Services.CreateAsyncScope();
        var services = scope.ServiceProvider;
        var logger = services.GetRequiredService<ILoggerFactory>().CreateLogger("Startup");

        if (!app.Environment.IsDevelopment())
            EnsureProductionReady(services);

        var db = services.GetRequiredService<AppDbContext>();
        if (services.GetRequiredService<IOptions<DatabaseOptions>>().Value.ApplyMigrationsOnStartup)
        {
            await db.Database.MigrateAsync();
            logger.LogInformation("Database migrations applied");
        }

        await SeedAdministratorAsync(services, db, logger);
    }

    /// <summary>Refuses to start a non-development environment with development-only stand-ins.</summary>
    private static void EnsureProductionReady(IServiceProvider services)
    {
        if (!services.GetRequiredService<IOptions<BrevoOptions>>().Value.IsConfigured && !services.GetRequiredService<IOptions<SmtpOptions>>().Value.IsConfigured)
            throw new InvalidOperationException("Brevo:ApiKey (or Smtp:Host) must be configured outside Development; emails would otherwise only be logged.");
        if (services.GetRequiredService<IPaymentGateway>() is SimulatedPaymentGateway)
            throw new InvalidOperationException("The simulated payment gateway cannot be used outside Development. Register a real GCash/Maya gateway.");
        if (!services.GetRequiredService<IOptions<ProxyOptions>>().Value.Enabled)
            throw new InvalidOperationException("ForwardedHeaders:Enabled must be true outside Development: behind the host's proxy, all visitors would otherwise share one rate limit.");
        if (AllowedHostsProblem(services.GetRequiredService<IConfiguration>()["AllowedHosts"]) is { } problem)
            throw new InvalidOperationException(problem);
        if (WebsiteAddressProblem(services.GetRequiredService<IOptions<FrontendOptions>>().Value.BaseUrl) is { } addressProblem)
            throw new InvalidOperationException(addressProblem);
    }

    /// <summary>Why this address can't be used in emailed links on the live site, or null if it can.</summary>
    public static string? WebsiteAddressProblem(string? baseUrl)
    {
        if (!Uri.TryCreate(baseUrl, UriKind.Absolute, out var address) || address.Scheme != Uri.UriSchemeHttps || address.IsLoopback)
            return "Frontend:BaseUrl must be the site's real https:// address outside Development; every link in emails is built from it.";
        return null;
    }

    /// <summary>
    /// Why this AllowedHosts value is not fit for the live site, or null if it is. It must name the site's real
    /// addresses: no wildcards (any address would be accepted) and more than this computer's own addresses.
    /// </summary>
    public static string? AllowedHostsProblem(string? allowedHosts)
    {
        var hosts = (allowedHosts ?? "").Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (hosts.Any(h => h.Contains('*')))
            return "AllowedHosts must list the site's real addresses outside Development, without wildcards.";
        if (!hosts.Except(["localhost", "127.0.0.1", "[::1]"], StringComparer.OrdinalIgnoreCase).Any())
            return "AllowedHosts must be set to the site's real address outside Development (for example nailsbyleyah.onrender.com).";
        return null;
    }

    private static async Task SeedAdministratorAsync(IServiceProvider services, AppDbContext db, ILogger logger)
    {
        var seed = services.GetRequiredService<IOptions<AdminSeedOptions>>().Value;
        if (!seed.IsConfigured)
        {
            logger.LogInformation("AdminSeed is not configured; no administrator account was created");
            return;
        }

        var username = InputNormalizer.Text(seed.Username);
        if (await db.Users.AnyAsync(u => u.Username == username))
            return;

        if (!PasswordPolicy.IsSatisfiedBy(seed.Password))
            throw new InvalidOperationException($"AdminSeed:Password is too weak. {PasswordPolicy.Description}");
        var phone = InputNormalizer.DigitsOnly(seed.PhoneNumber);
        if (!PhoneRule.IsValid(phone))
            throw new InvalidOperationException($"AdminSeed:PhoneNumber is invalid. {PhoneRule.Problem(phone)}");

        var now = services.GetRequiredService<ISalonClock>().UtcNow;
        db.Users.Add(new User
        {
            FirstName = InputNormalizer.Text(seed.FirstName),
            LastName = InputNormalizer.Text(seed.LastName),
            Username = username,
            Email = InputNormalizer.Email(seed.Email),
            PhoneNumber = phone,
            PasswordHash = services.GetRequiredService<IPasswordHasher>().Hash(seed.Password!),
            Role = UserRole.Administrator,
            EmailVerified = true,
            EmailVerifiedAt = now,
            CreatedAt = now,
            UpdatedAt = now,
        });
        await db.SaveChangesAsync();
        logger.LogInformation("Administrator account created"); // no username: logs are kept by the host
    }

    /// <summary>Basic hardening headers for every response; pages and API answers each get their own security rule.</summary>
    public static IApplicationBuilder UseSecurityHeaders(this IApplicationBuilder app) => app.Use(async (context, next) =>
    {
        var headers = context.Response.Headers;
        headers.XContentTypeOptions = "nosniff";
        headers.XFrameOptions = "DENY";
        headers["Referrer-Policy"] = "no-referrer";
        headers.ContentSecurityPolicy = WebsiteHosting.IsApiRequest(context)
            ? WebsiteHosting.ApiContentSecurityPolicy
            : WebsiteHosting.WebsiteContentSecurityPolicy;
        await next();
    });
}
