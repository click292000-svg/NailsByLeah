using Microsoft.Extensions.Logging;
using NailsByLeah.Api.Contracts;
using NailsByLeah.Api.Data;
using NailsByLeah.Api.Domain;
using NailsByLeah.Api.Errors;
using NailsByLeah.Api.Infrastructure;
using NailsByLeah.Api.Validation;

namespace NailsByLeah.Api.Services;

/// <summary>Which salon email alert an event belongs to; Leyah can switch each one off on her profile.</summary>
public enum SalonAlert
{
    NewBooking,
    Cancellation,
    Reschedule,
}

/// <summary>
/// The salon's public details (phone, payment account name, social links, bio, Leyah's photo) and her email alert
/// switches, all kept on the single salon_settings row. The website reads the public part; only administrators change it.
/// </summary>
public interface ISalonProfileService
{
    Task<SalonProfileResponse> GetPublicAsync(CancellationToken ct = default);
    Task<SalonSettingsResponse> GetAsync(CancellationToken ct = default);
    Task<SalonSettingsResponse> UpdateAsync(int adminId, UpdateSalonSettingsRequest request, CancellationToken ct = default);
    Task<SalonSettingsResponse> UploadPhotoAsync(int adminId, IFormFile? file, CancellationToken ct = default);
    Task<SalonSettingsResponse> RemovePhotoAsync(int adminId, CancellationToken ct = default);

    /// <summary>The photo's bytes and type, or null when there is none.</summary>
    Task<(Stream Content, string ContentType)?> OpenPhotoAsync(CancellationToken ct = default);

    Task<bool> WantsAlertAsync(SalonAlert alert, CancellationToken ct = default);
}

public sealed class SalonProfileService(
    ISalonSettingsRepository settings,
    IReferenceImageStore store,
    IUnitOfWork unitOfWork,
    IAuditLogger audit,
    ISalonClock clock,
    ILogger<SalonProfileService> logger) : ISalonProfileService
{
    public const int PaymentNameMaxLength = 60;
    public const int UrlMaxLength = 200;
    public const int HandleMaxLength = 31; // "@" plus Instagram's 30 characters
    public const int BioMaxLength = 300;
    public const int PhotoMaxBytes = 2 * 1024 * 1024;

    public async Task<SalonProfileResponse> GetPublicAsync(CancellationToken ct = default) => ToProfile(await settings.GetAsync(ct));

    public async Task<SalonSettingsResponse> GetAsync(CancellationToken ct = default) => ToSettings(await settings.GetAsync(ct));

    public async Task<SalonSettingsResponse> UpdateAsync(int adminId, UpdateSalonSettingsRequest request, CancellationToken ct = default)
    {
        var errors = new Dictionary<string, string[]>();
        string? Check(string field, string? problem)
        {
            if (problem is not null) errors[field] = [problem];
            return problem;
        }

        var phone = Clean(request.Phone);
        if (phone is not null && Check("phone", PhoneRule.Problem(phone)) is null)
            phone = PhoneRule.Normalize(phone);
        var paymentName = Clean(request.PaymentAccountName);
        if (paymentName?.Length > PaymentNameMaxLength) Check("paymentAccountName", $"Keep the name to {PaymentNameMaxLength} characters or fewer.");
        var facebook = CleanUrl(request.FacebookUrl, "facebookUrl", "facebook.com", "Facebook", Check);
        var instagram = CleanUrl(request.InstagramUrl, "instagramUrl", "instagram.com", "Instagram", Check);
        var handle = Clean(request.InstagramHandle)?.TrimStart('@');
        if (handle is not null && (handle.Length > HandleMaxLength - 1 || !handle.All(c => char.IsAsciiLetterOrDigit(c) || c is '.' or '_')))
            Check("instagramHandle", "Use letters, numbers, dots and underscores only, up to 30 characters.");
        var bio = Clean(request.Bio);
        if (bio?.Length > BioMaxLength) Check("bio", $"Keep the bio to {BioMaxLength} characters or fewer.");
        if (errors.Count > 0)
            throw new ValidationAppException(errors);

        var row = await settings.GetAsync(ct);
        row.Phone = phone;
        row.PaymentAccountName = paymentName;
        row.FacebookUrl = facebook;
        row.InstagramUrl = instagram;
        row.InstagramHandle = handle is null ? null : "@" + handle;
        row.Bio = bio;
        row.AlertNewBooking = request.AlertNewBooking;
        row.AlertCancellation = request.AlertCancellation;
        row.AlertReschedule = request.AlertReschedule;
        Touch(row, adminId);
        audit.Record(AuditActions.SalonDetailsChanged, nameof(SalonSettings), row.Id,
            $"Alerts: new booking {OnOff(row.AlertNewBooking)}, cancellation {OnOff(row.AlertCancellation)}, reschedule {OnOff(row.AlertReschedule)}");
        await unitOfWork.SaveChangesAsync(ct);
        return ToSettings(row);
    }

    public async Task<SalonSettingsResponse> UploadPhotoAsync(int adminId, IFormFile? file, CancellationToken ct = default)
    {
        const string field = "file";
        if (file is null || file.Length == 0)
            throw new ValidationAppException(field, "Choose a photo to upload.", "image_missing");
        if (file.Length > PhotoMaxBytes)
            throw new ValidationAppException(field, "The photo must be 2 MB or smaller.", "image_too_large");

        using var buffer = new MemoryStream();
        await using (var source = file.OpenReadStream())
            await ReferenceImageService.CopyLimitedAsync(source, buffer, PhotoMaxBytes + 1, ct);
        if (buffer.Length > PhotoMaxBytes)
            throw new ValidationAppException(field, "The photo must be 2 MB or smaller.", "image_too_large");
        // The type comes from the file's own bytes, never its name.
        var bytes = buffer.GetBuffer().AsMemory(0, (int)buffer.Length);
        var format = ImageSignature.Detect(bytes.Span) ?? throw new ValidationAppException(field, ReferenceImageService.TypeMessage, "image_type");

        string storedName;
        try
        {
            storedName = await store.SaveAsync(bytes, format.Extension, ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException || !ct.IsCancellationRequested)
        {
            logger.LogCritical(ex, "Could not save the salon photo");
            throw new ConflictException(ReferenceImageService.StoreUnavailableMessage, "image_store_unavailable");
        }

        var row = await settings.GetAsync(ct);
        var old = row.PhotoFileName;
        row.PhotoFileName = storedName;
        row.PhotoContentType = format.ContentType;
        Touch(row, adminId);
        audit.Record(AuditActions.SalonPhotoChanged, nameof(SalonSettings), row.Id, $"{format.ContentType}, {bytes.Length} bytes");
        await unitOfWork.SaveChangesAsync(ct);
        await TryDeleteAsync(old);
        return ToSettings(row);
    }

    public async Task<SalonSettingsResponse> RemovePhotoAsync(int adminId, CancellationToken ct = default)
    {
        var row = await settings.GetAsync(ct);
        var old = row.PhotoFileName;
        if (old is null)
            return ToSettings(row);
        row.PhotoFileName = null;
        row.PhotoContentType = null;
        Touch(row, adminId);
        audit.Record(AuditActions.SalonPhotoChanged, nameof(SalonSettings), row.Id, "Photo removed");
        await unitOfWork.SaveChangesAsync(ct);
        await TryDeleteAsync(old);
        return ToSettings(row);
    }

    public async Task<(Stream Content, string ContentType)?> OpenPhotoAsync(CancellationToken ct = default)
    {
        var row = await settings.GetAsync(ct);
        if (row.PhotoFileName is null || row.PhotoContentType is null)
            return null;
        var stream = await store.OpenReadAsync(row.PhotoFileName, ct);
        return stream is null ? null : (stream, row.PhotoContentType);
    }

    public async Task<bool> WantsAlertAsync(SalonAlert alert, CancellationToken ct = default)
    {
        var row = await settings.GetAsync(ct);
        return alert switch
        {
            SalonAlert.NewBooking => row.AlertNewBooking,
            SalonAlert.Cancellation => row.AlertCancellation,
            SalonAlert.Reschedule => row.AlertReschedule,
            _ => true,
        };
    }

    private void Touch(SalonSettings row, int adminId)
    {
        row.UpdatedAt = clock.UtcNow;
        row.UpdatedByUserId = adminId;
    }

    private async Task TryDeleteAsync(string? storedName)
    {
        if (storedName is null) return;
        try
        {
            await store.DeleteAsync(storedName);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Could not delete the old salon photo file");
        }
    }

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : InputNormalizer.Text(value);

    /// <summary>Only https links to the named site, so the website never links somewhere unexpected.</summary>
    private static string? CleanUrl(string? value, string field, string host, string siteName, Func<string, string?, string?> check)
    {
        var url = Clean(value);
        if (url is null) return null;
        if (!url.StartsWith("http", StringComparison.OrdinalIgnoreCase)) url = "https://" + url;
        var ok = url.Length <= UrlMaxLength && Uri.TryCreate(url, UriKind.Absolute, out var uri) && uri.Scheme == Uri.UriSchemeHttps &&
                 (uri.Host.Equals(host, StringComparison.OrdinalIgnoreCase) || uri.Host.EndsWith("." + host, StringComparison.OrdinalIgnoreCase));
        if (!ok) check(field, $"Enter your {siteName} page link, starting with https://{host}/");
        return url;
    }

    private static string OnOff(bool on) => on ? "on" : "off";

    private static SalonProfileResponse ToProfile(SalonSettings s) => new(
        s.Phone, s.PaymentAccountName, s.FacebookUrl, s.InstagramUrl, s.InstagramHandle, s.Bio,
        s.PhotoFileName is null ? null : $"/api/salon/photo?v={s.UpdatedAt.Ticks}");

    private static SalonSettingsResponse ToSettings(SalonSettings s) =>
        new(ToProfile(s), s.AlertNewBooking, s.AlertCancellation, s.AlertReschedule);
}
