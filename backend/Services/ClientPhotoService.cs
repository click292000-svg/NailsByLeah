using Microsoft.Extensions.Logging;
using NailsByLeah.Api.Data;
using NailsByLeah.Api.Domain;
using NailsByLeah.Api.Errors;
using NailsByLeah.Api.Infrastructure;

namespace NailsByLeah.Api.Services;

/// <summary>Reads an uploaded photo safely: size-limited, and its type taken from the file's own bytes, never its name.</summary>
public static class UploadedImage
{
    public const string Field = "file";

    public static async Task<(ReadOnlyMemory<byte> Bytes, ImageSignature.Format Format)> ReadAsync(
        IFormFile? file, int maxBytes, string sizeMessage, CancellationToken ct)
    {
        if (file is null || file.Length == 0)
            throw new ValidationAppException(Field, "Choose a photo to upload.", "image_missing");
        if (file.Length > maxBytes)
            throw new ValidationAppException(Field, sizeMessage, "image_too_large");
        var buffer = new MemoryStream();
        await using (var source = file.OpenReadStream())
            await ReferenceImageService.CopyLimitedAsync(source, buffer, maxBytes + 1, ct);
        if (buffer.Length > maxBytes)
            throw new ValidationAppException(Field, sizeMessage, "image_too_large");
        var bytes = buffer.GetBuffer().AsMemory(0, (int)buffer.Length);
        var format = ImageSignature.Detect(bytes.Span) ?? throw new ValidationAppException(Field, ReferenceImageService.TypeMessage, "image_type");
        return (bytes, format);
    }
}

/// <summary>
/// A client's own profile photo. Only the client changes it; the client and administrators can see it, so Leyah
/// recognises who is coming.
/// </summary>
public interface IClientProfileService
{
    Task<User> UploadPhotoAsync(int userId, IFormFile? file, CancellationToken ct = default);
    Task<User> RemovePhotoAsync(int userId, CancellationToken ct = default);
    Task<(Stream Content, string ContentType)?> OpenPhotoAsync(int userId, CancellationToken ct = default);
}

public sealed class ClientProfileService(
    IUserRepository users,
    IReferenceImageStore store,
    IUnitOfWork unitOfWork,
    IAuditLogger audit,
    ISalonClock clock,
    ILogger<ClientProfileService> logger) : IClientProfileService
{
    public const int PhotoMaxBytes = 2 * 1024 * 1024;

    /// <summary>Where a user's photo is served; the version changes with every new photo so browsers fetch it again.</summary>
    public static string? MyPhotoUrl(User u) => u.PhotoFileName is null ? null : $"/api/auth/me/photo?v={u.UpdatedAt.Ticks}";
    public static string? AdminPhotoUrl(User u) => u.PhotoFileName is null ? null : $"/api/admin/clients/{u.Id}/photo?v={u.UpdatedAt.Ticks}";

    public async Task<User> UploadPhotoAsync(int userId, IFormFile? file, CancellationToken ct = default)
    {
        var (bytes, format) = await UploadedImage.ReadAsync(file, PhotoMaxBytes, "The photo must be 2 MB or smaller.", ct);
        var user = await GetAsync(userId, ct);

        string storedName;
        try
        {
            storedName = await store.SaveAsync(bytes, format.Extension, ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException || !ct.IsCancellationRequested)
        {
            logger.LogCritical(ex, "Could not save a profile photo");
            throw new ConflictException(ReferenceImageService.StoreUnavailableMessage, "image_store_unavailable");
        }

        var old = user.PhotoFileName;
        user.PhotoFileName = storedName;
        user.PhotoContentType = format.ContentType;
        user.UpdatedAt = clock.UtcNow;
        audit.Record(AuditActions.ProfileUpdated, nameof(User), user.Id, "Profile photo changed", userId: user.Id);
        await unitOfWork.SaveChangesAsync(ct);
        await TryDeleteAsync(old);
        return user;
    }

    public async Task<User> RemovePhotoAsync(int userId, CancellationToken ct = default)
    {
        var user = await GetAsync(userId, ct);
        var old = user.PhotoFileName;
        if (old is null)
            return user;
        user.PhotoFileName = null;
        user.PhotoContentType = null;
        user.UpdatedAt = clock.UtcNow;
        audit.Record(AuditActions.ProfileUpdated, nameof(User), user.Id, "Profile photo removed", userId: user.Id);
        await unitOfWork.SaveChangesAsync(ct);
        await TryDeleteAsync(old);
        return user;
    }

    public async Task<(Stream Content, string ContentType)?> OpenPhotoAsync(int userId, CancellationToken ct = default)
    {
        var user = await users.GetByIdAsync(userId, ct);
        if (user?.PhotoFileName is null || user.PhotoContentType is null)
            return null;
        var stream = await store.OpenReadAsync(user.PhotoFileName, ct);
        return stream is null ? null : (stream, user.PhotoContentType);
    }

    private async Task<User> GetAsync(int userId, CancellationToken ct) =>
        await users.GetByIdAsync(userId, ct) ?? throw new UnauthorizedAppException("Please log in again.");

    private async Task TryDeleteAsync(string? storedName)
    {
        if (storedName is null) return;
        try
        {
            await store.DeleteAsync(storedName);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Could not delete an old profile photo file");
        }
    }
}
