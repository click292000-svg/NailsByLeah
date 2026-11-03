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
        if (!services.GetRequiredService<IOptions<SmtpOptions>>().Value.IsConfigured)
            throw new InvalidOperationException("Smtp:Host must be configured outside Development; emails would otherwise only be logged.");
        if (services.GetRequiredService<IPaymentGateway>() is SimulatedPaymentGateway)
            throw new InvalidOperationException("The simulated payment gateway cannot be used outside Development. Register a real GCash/Maya gateway.");
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
        logger.LogInformation("Administrator account {Username} created", username);
    }

    /// <summary>Basic hardening headers for every API response.</summary>
    public static IApplicationBuilder UseSecurityHeaders(this IApplicationBuilder app) => app.Use(async (context, next) =>
    {
        var headers = context.Response.Headers;
        headers.XContentTypeOptions = "nosniff";
        headers.XFrameOptions = "DENY";
        headers["Referrer-Policy"] = "no-referrer";
        headers.ContentSecurityPolicy = "default-src 'none'; frame-ancestors 'none'";
        await next();
    });
}
