using System.Text;
using FluentValidation;

namespace NailsByLeah.Api.Validation;

/// <summary>
/// The single source of truth for input rules (Ref 14.2). Every validator reuses these
/// instead of repeating limits or regexes.
/// </summary>
public static class InputLimits
{
    public const int NameMaxLength = 75;
    public const int UsernameMinLength = 3;
    public const int UsernameMaxLength = 50;
    public const int EmailMaxLength = 254;
    /// <summary>Contact numbers are exactly 11 digits, e.g. 09171234567.</summary>
    public const int PhoneDigits = 11;
    public const int PasswordMinLength = 8;

    /// <summary>bcrypt only uses the first 72 bytes of a password.</summary>
    public const int PasswordMaxBytes = 72;

    public const int ExplanationMaxLength = 500;
    public const int ServiceNameMaxLength = 100;
    public const decimal MaxPrice = 100_000m;
    public const int BlockReasonMaxLength = 200;
    public const int FeedbackCommentMaxLength = 1000;
    public const int NoteMaxLength = 300;

    /// <summary>A saved booking draft (JSON): ample for a service, add-ons, a time, a note and three photo ids.</summary>
    public const int BookingDraftMaxLength = 4000;

    /// <summary>Service durations: 15 minutes to 8 hours, in 5-minute steps.</summary>
    public const int ServiceDurationMinMinutes = 15;
    public const int ServiceDurationMaxMinutes = 480;
    public const int ServiceDurationStepMinutes = 5;
}

/// <summary>Limits for uploaded nail design reference photos.</summary>
public static class UploadLimits
{
    public const int ReferenceImageMaxBytes = 5 * 1024 * 1024;
    public const string ReferenceImageMaxSizeLabel = "5 MB";
    public const int ReferenceImagesPerBooking = 3;

    /// <summary>Photos a client may have uploaded but not yet attached to a booking (stops storage abuse).</summary>
    public const int PendingReferenceImagesPerClient = 10;

    public static readonly string[] ReferenceImageContentTypes = ["image/jpeg", "image/png", "image/webp"];
}

public static class InputNormalizer
{
    /// <summary>Keeps digits only, so pasted values like "0917-123 4567" become "09171234567" (Ref 1.3).</summary>
    public static string DigitsOnly(string? value) =>
        value is null ? "" : new string(value.Where(char.IsAsciiDigit).ToArray());

    public static string Text(string? value) => value?.Trim() ?? "";

    public static string Email(string? value) => Text(value).ToLowerInvariant();
}

/// <summary>
/// Contact number rule: exactly 11 digits and nothing else. Letters, spaces and symbols are rejected
/// rather than stripped (the form strips them from pasted text before sending). Messages match
/// the frontend (src/validation/rules.js).
/// </summary>
public static class PhoneRule
{
    public const string Required = "Phone Number is required.";
    public const string DigitsOnly = "Phone Number can only contain numbers (0–9), with no letters, spaces or symbols.";
    public const string TooShort = "Phone Number is too short. Enter all 11 digits, e.g. 09171234567.";
    public const string TooLong = "Phone Number is too long. Enter exactly 11 digits, e.g. 09171234567.";

    public static bool IsDigitsOnly(string? value) =>
        !string.IsNullOrWhiteSpace(value) && InputNormalizer.Text(value).All(char.IsAsciiDigit);

    public static bool IsValid(string? value) =>
        IsDigitsOnly(value) && InputNormalizer.Text(value).Length == InputLimits.PhoneDigits;

    /// <summary>The first problem with the value, or null when it is valid.</summary>
    public static string? Problem(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return Required;
        if (!IsDigitsOnly(value)) return DigitsOnly;
        var length = InputNormalizer.Text(value).Length;
        return length < InputLimits.PhoneDigits ? TooShort : length > InputLimits.PhoneDigits ? TooLong : null;
    }
}

public static class PasswordPolicy
{
    public const string Description = "Password must be at least 8 characters and include at least one letter and one number.";

    /// <summary>At least 8 characters with at least one letter and one number (Ref 8.2).</summary>
    public static bool IsSatisfiedBy(string? password) =>
        password is not null &&
        password.Length >= InputLimits.PasswordMinLength &&
        Encoding.UTF8.GetByteCount(password) <= InputLimits.PasswordMaxBytes &&
        password.Any(char.IsLetter) &&
        password.Any(char.IsDigit);
}

public static class ValidationRuleExtensions
{
    /// <summary>First/last name: any letters, numbers or special characters, 1–75 characters (Ref 1.1).</summary>
    public static IRuleBuilderOptions<T, string> PersonName<T>(this IRuleBuilder<T, string> rule, string label) =>
        rule
            .Must(v => !string.IsNullOrWhiteSpace(v)).WithMessage($"{label} is required.")
            .Must(v => InputNormalizer.Text(v).Length <= InputLimits.NameMaxLength)
            .WithMessage($"{label} must be {InputLimits.NameMaxLength} characters or fewer.");

    public static IRuleBuilderOptions<T, string> Username<T>(this IRuleBuilder<T, string> rule) =>
        rule
            .Must(v => !string.IsNullOrWhiteSpace(v)).WithMessage("Username is required.")
            .Must(v => InputNormalizer.Text(v).Length is >= InputLimits.UsernameMinLength and <= InputLimits.UsernameMaxLength)
            .WithMessage($"Username must be {InputLimits.UsernameMinLength} to {InputLimits.UsernameMaxLength} characters.");

    public static IRuleBuilderOptions<T, string> EmailAddressRule<T>(this IRuleBuilder<T, string> rule) =>
        rule
            .Must(v => !string.IsNullOrWhiteSpace(v)).WithMessage("Email address is required.")
            .EmailAddress().WithMessage("Enter a valid email address.")
            .MaximumLength(InputLimits.EmailMaxLength).WithMessage("Email address is too long.");

    /// <summary>Exactly 11 digits (Ref 1.3); see <see cref="PhoneRule"/>.</summary>
    public static IRuleBuilderOptionsConditions<T, string> PhoneNumber<T>(this IRuleBuilder<T, string> rule) =>
        rule.Custom((value, context) =>
        {
            if (PhoneRule.Problem(value) is { } problem)
                context.AddFailure(problem);
        });

    public static IRuleBuilderOptions<T, string> Password<T>(this IRuleBuilder<T, string> rule) =>
        rule.Must(PasswordPolicy.IsSatisfiedBy).WithMessage(PasswordPolicy.Description);

    public static IRuleBuilderOptions<T, decimal> PriceRule<T>(this IRuleBuilder<T, decimal> rule) =>
        rule.InclusiveBetween(0, InputLimits.MaxPrice).WithMessage($"Price must be between 0 and {InputLimits.MaxPrice:N0}.");

    public static bool IsValidDuration(int minutes) =>
        minutes is >= InputLimits.ServiceDurationMinMinutes and <= InputLimits.ServiceDurationMaxMinutes
        && minutes % InputLimits.ServiceDurationStepMinutes == 0;

    public const string DurationMessage = "Duration must be between 15 minutes and 8 hours, in steps of 5 minutes.";

    public static IRuleBuilderOptions<T, int> DurationRule<T>(this IRuleBuilder<T, int> rule) =>
        rule.Must(IsValidDuration).WithMessage(DurationMessage);

    public static IRuleBuilderOptions<T, string> ServiceName<T>(this IRuleBuilder<T, string> rule) =>
        rule
            .Must(v => !string.IsNullOrWhiteSpace(v)).WithMessage("Name is required.")
            .Must(v => InputNormalizer.Text(v).Length <= InputLimits.ServiceNameMaxLength)
            .WithMessage($"Name must be {InputLimits.ServiceNameMaxLength} characters or fewer.");
}
