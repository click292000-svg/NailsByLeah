namespace NailsByLeah.Api.Configuration;

// Strongly typed settings bound from appsettings.json / environment variables.
// Secrets (SMTP password, admin seed password, production connection string) belong in
// user secrets or environment variables, never in source control (Ref 14.3).

public sealed class AuthOptions
{
    public const string Section = "Auth";
    public int MaxFailedLoginAttempts { get; set; } = 5;
    public int LockoutMinutes { get; set; } = 15;
    public int SessionIdleTimeoutMinutes { get; set; } = 30;
    public int PasswordResetTokenMinutes { get; set; } = 15;
    public int EmailVerificationCodeHours { get; set; } = 24;
    public int MaxVerificationAttempts { get; set; } = 5;
    public int BcryptWorkFactor { get; set; } = 12;
}

public sealed class BookingOptions
{
    public const string Section = "Booking";
    public decimal DepositAmount { get; set; } = 150m;
    public int RescheduleMinimumHours { get; set; } = 24;
}

public sealed class ScheduleOptions
{
    public const string Section = "Schedule";
    public string TimeZoneId { get; set; } = "Asia/Manila";
    /// <summary>Official opening time. No appointment may start before it.</summary>
    public TimeOnly OpeningTime { get; set; } = new(11, 0);

    // The closing time is not here: administrators change it in the app (salon_settings table).

    /// <summary>Appointments start on this grid, counted from the opening time (11:00, 11:30, 12:00, ...).</summary>
    public int SlotIntervalMinutes { get; set; } = 30;

    /// <summary>Mandatory gap after every appointment's scheduled end before the next one may begin.</summary>
    public int BufferMinutes { get; set; } = 30;

    public int MaxDaysAhead { get; set; } = 60;
    public DayOfWeek[] ClosedDays { get; set; } = [];
}

public sealed class UploadOptions
{
    public const string Section = "Uploads";

    /// <summary>
    /// Folder for nail design reference photos. Relative paths are under the app's content root.
    /// It is outside any web root: files are only served through the authorized API endpoint.
    /// </summary>
    public string ReferenceImagePath { get; set; } = "App_Data/reference-images";
}

public sealed class LegalOptions
{
    public const string Section = "Legal";
    public string TermsVersion { get; set; } = "1.0";
}

public sealed class FrontendOptions
{
    public const string Section = "Frontend";
    public string BaseUrl { get; set; } = "http://localhost:5173";
}

public sealed class SmtpOptions
{
    public const string Section = "Smtp";
    public string? Host { get; set; }
    public int Port { get; set; } = 587;
    public bool EnableSsl { get; set; } = true;
    public string? Username { get; set; }
    public string? Password { get; set; }
    public string FromAddress { get; set; } = "no-reply@nailsbyleah.local";
    public string FromName { get; set; } = "Nails by Leyah";

    public bool IsConfigured => !string.IsNullOrWhiteSpace(Host);
}

public sealed class NotificationOptions
{
    public const string Section = "Notifications";

    /// <summary>How often the reminder job runs. 0 disables it.</summary>
    public int ReminderCheckIntervalMinutes { get; set; } = 15;
    public int ReminderLeadHours { get; set; } = 24;
}

public sealed class DatabaseOptions
{
    public const string Section = "Database";
    public bool ApplyMigrationsOnStartup { get; set; }
}

/// <summary>Optional first administrator account, created on startup if it does not exist.</summary>
public sealed class AdminSeedOptions
{
    public const string Section = "AdminSeed";
    public string? Username { get; set; }
    public string? Email { get; set; }
    public string? Password { get; set; }
    public string? PhoneNumber { get; set; }
    public string FirstName { get; set; } = "Leyah";
    public string LastName { get; set; } = "Admin";

    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(Username) && !string.IsNullOrWhiteSpace(Email) &&
        !string.IsNullOrWhiteSpace(Password) && !string.IsNullOrWhiteSpace(PhoneNumber);
}
