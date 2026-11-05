using System.Text.Encodings.Web;
using System.Text.Json.Serialization;
using FluentValidation;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using NailsByLeah.Api.Configuration;
using NailsByLeah.Api.Data;
using NailsByLeah.Api.Errors;
using NailsByLeah.Api.Notifications;
using NailsByLeah.Api.Payments;
using NailsByLeah.Api.Services;
using NailsByLeah.Api.Validation;

namespace NailsByLeah.Api.Infrastructure;

/// <summary>Composition root: every abstraction is bound to its implementation here (Ref 5.5).</summary>
public static class ServiceRegistration
{
    public static IServiceCollection AddNailsByLeah(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddOptions<AuthOptions>().Bind(configuration.GetSection(AuthOptions.Section));
        services.AddOptions<BookingOptions>().Bind(configuration.GetSection(BookingOptions.Section));
        services.AddOptions<ScheduleOptions>().Bind(configuration.GetSection(ScheduleOptions.Section));
        services.AddOptions<LegalOptions>().Bind(configuration.GetSection(LegalOptions.Section));
        services.AddOptions<FrontendOptions>().Bind(configuration.GetSection(FrontendOptions.Section));
        services.AddOptions<EmailOptions>().Bind(configuration.GetSection(EmailOptions.Section));
        services.AddOptions<BrevoOptions>().Bind(configuration.GetSection(BrevoOptions.Section));
        services.AddOptions<SmtpOptions>().Bind(configuration.GetSection(SmtpOptions.Section));
        services.AddOptions<NotificationOptions>().Bind(configuration.GetSection(NotificationOptions.Section));
        services.AddOptions<DatabaseOptions>().Bind(configuration.GetSection(DatabaseOptions.Section));
        services.AddOptions<AdminSeedOptions>().Bind(configuration.GetSection(AdminSeedOptions.Section));
        services.AddOptions<UploadOptions>().Bind(configuration.GetSection(UploadOptions.Section));
        services.AddOptions<RateLimitOptions>().Bind(configuration.GetSection(RateLimitOptions.Section));
        services.AddNailsByLeahRateLimiting();
        services.AddOptions<ProxyOptions>().Bind(configuration.GetSection(ProxyOptions.Section));
        services.AddProxyHeaders();

        services.AddSingleton(TimeProvider.System);
        services.AddSingleton<ISalonClock, SalonClock>();
        services.AddHttpContextAccessor();
        services.AddScoped<ICurrentUser, HttpCurrentUser>();

        // Data layer
        services.AddDbContext<AppDbContext>((sp, options) => options
            .UseSqlServer(sp.GetRequiredService<IConfiguration>().GetConnectionString("Default")
                          ?? throw new InvalidOperationException("ConnectionStrings:Default is not configured."))
            .UseSnakeCaseNamingConvention());
        services.AddScoped<IUnitOfWork, EfUnitOfWork>();
        services.AddScoped<IUserRepository, UserRepository>();
        services.AddScoped<IUserTokenRepository, UserTokenRepository>();
        services.AddScoped<IServiceCatalogRepository, ServiceCatalogRepository>();
        services.AddScoped<IBookingRepository, BookingRepository>();
        services.AddScoped<IPaymentRepository, PaymentRepository>();
        services.AddScoped<IBlockedSlotRepository, BlockedSlotRepository>();
        services.AddScoped<ISalonSettingsRepository, SalonSettingsRepository>();
        services.AddScoped<IAuditLogRepository, AuditLogRepository>();
        services.AddScoped<IReferenceImageRepository, ReferenceImageRepository>();
        services.AddScoped<IBookingDraftRepository, BookingDraftRepository>();
        services.AddScoped<IFeedbackRepository, FeedbackRepository>();
        services.AddScoped<IClientDataRepository, ClientDataRepository>();

        // Application services
        services.AddSingleton<IPasswordHasher, BcryptPasswordHasher>();
        services.AddScoped<IAuditLogger, AuditLogger>();
        services.AddScoped<IRegistrationService, RegistrationService>();
        services.AddScoped<IAuthService, AuthService>();
        services.AddScoped<IPasswordResetService, PasswordResetService>();
        services.AddScoped<IPriceService, PriceService>();
        services.AddScoped<IBookingDraftService, BookingDraftService>();
        services.AddScoped<IFeedbackService, FeedbackService>();
        services.AddScoped<IPaymentService, PaymentService>();
        services.AddScoped<IDashboardService, DashboardService>();
        services.AddScoped<IReportService, ReportService>();
        services.AddScoped<IActivityLogService, ActivityLogService>();
        services.AddScoped<IClientDataService, ClientDataService>();
        services.AddScopedFor<ServiceCatalogService, IServiceCatalog, IServiceManagement>();
        services.AddScopedFor<ScheduleService, ISlotAvailability, IScheduleManagement>();
        services.AddScopedFor<BookingService, IClientBookingService, IAdminBookingService>();
        services.AddScopedFor<ReferenceImageService, IReferenceImageService, IReferenceImageAttacher>();

        // External integrations
        services.AddSingleton<IPaymentGateway, SimulatedPaymentGateway>();
        services.AddScoped<INotificationService, EmailNotificationService>();
        // Email channel: Brevo's HTTPS API when a key is set, else SMTP (e.g. Gmail) when a host is set, else the log.
        services.AddHttpClient<BrevoEmailSender>((sp, client) =>
        {
            client.BaseAddress = new Uri(sp.GetRequiredService<IOptions<BrevoOptions>>().Value.BaseUrl);
            client.Timeout = TimeSpan.FromSeconds(20);
        });
        services.AddScoped<IEmailSender>(sp =>
            sp.GetRequiredService<IOptions<BrevoOptions>>().Value.IsConfigured ? sp.GetRequiredService<BrevoEmailSender>()
            : sp.GetRequiredService<IOptions<SmtpOptions>>().Value.IsConfigured ? ActivatorUtilities.CreateInstance<SmtpEmailSender>(sp)
            : ActivatorUtilities.CreateInstance<LoggingEmailSender>(sp));
        services.AddSingleton<IReferenceImageStore, FileSystemReferenceImageStore>();
        services.AddScoped<IAppointmentReminderJob, AppointmentReminderJob>();
        services.AddHostedService<AppointmentReminderWorker>();
        services.AddSingleton<QueuedBackgroundNotifications>();
        services.AddSingleton<IBackgroundNotifications>(sp => sp.GetRequiredService<QueuedBackgroundNotifications>());
        services.AddHostedService(sp => sp.GetRequiredService<QueuedBackgroundNotifications>());

        // Web
        // The strict encoder writes < > & ' " as \u escapes, so user text never appears as raw HTML (Ref 1.1).
        services.AddControllers(options => options.Filters.Add<ValidationFilter>())
            .AddJsonOptions(options =>
            {
                options.JsonSerializerOptions.Encoder = JavaScriptEncoder.Default;
                options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
            });
        services.ConfigureHttpJsonOptions(options => options.SerializerOptions.Encoder = JavaScriptEncoder.Default);
        services.AddValidatorsFromAssemblyContaining<RegisterRequestValidator>(ServiceLifetime.Singleton);
        services.AddProblemDetails();
        services.AddExceptionHandler<GlobalExceptionHandler>();
        services.AddOpenApi();
        services.AddHsts(options =>
        {
            options.MaxAge = TimeSpan.FromDays(365);
            options.IncludeSubDomains = true;
        });

        services.AddNailsByLeahAuthentication();
        services.AddWebsiteHosting();
        return services;
    }

    private static void AddNailsByLeahAuthentication(this IServiceCollection services)
    {
        services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme).AddCookie();
        services.AddOptions<CookieAuthenticationOptions>(CookieAuthenticationDefaults.AuthenticationScheme)
            .Configure<IOptions<AuthOptions>, TimeProvider>((options, auth, time) =>
            {
                options.Cookie.Name = "nailsbyleah.session";
                options.Cookie.HttpOnly = true;
                options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
                options.Cookie.SameSite = SameSiteMode.Strict;
                options.ExpireTimeSpan = TimeSpan.FromMinutes(auth.Value.SessionIdleTimeoutMinutes);
                options.SlidingExpiration = true;
                options.TimeProvider = time;
                options.Events = new CookieAuthenticationEvents
                {
                    // An API answers with status codes instead of redirecting to a login page.
                    OnRedirectToLogin = context =>
                    {
                        context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                        return Task.CompletedTask;
                    },
                    OnRedirectToAccessDenied = context =>
                    {
                        context.Response.StatusCode = StatusCodes.Status403Forbidden;
                        return Task.CompletedTask;
                    },
                    OnValidatePrincipal = ValidateSessionAsync,
                };
            });

        // Every endpoint requires a signed-in user unless it is explicitly marked [AllowAnonymous].
        services.AddAuthorizationBuilder()
            .SetFallbackPolicy(new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build());
    }

    /// <summary>
    /// Rejects sessions whose user was deleted or whose password changed, and restarts the
    /// 30-minute idle timer on every request so the session ends exactly 30 minutes after the last one (Ref 8.4).
    /// </summary>
    private static async Task ValidateSessionAsync(CookieValidatePrincipalContext context)
    {
        var userId = context.Principal?.FindUserId();
        var stamp = context.Principal?.FindFirst(ClaimNames.SecurityStamp)?.Value;
        var auth = context.HttpContext.RequestServices.GetRequiredService<IAuthService>();

        if (userId is null || stamp is null ||
            await auth.GetValidSessionUserAsync(userId.Value, stamp, context.HttpContext.RequestAborted) is null)
        {
            context.RejectPrincipal();
            await context.HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            return;
        }

        context.ShouldRenew = true;
    }

    private static void AddScopedFor<TImplementation, TFirst, TSecond>(this IServiceCollection services)
        where TImplementation : class, TFirst, TSecond
        where TFirst : class
        where TSecond : class
    {
        services.AddScoped<TImplementation>();
        services.AddScoped<TFirst>(sp => sp.GetRequiredService<TImplementation>());
        services.AddScoped<TSecond>(sp => sp.GetRequiredService<TImplementation>());
    }
}
