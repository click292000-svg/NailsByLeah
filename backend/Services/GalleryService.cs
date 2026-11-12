using Microsoft.Extensions.Logging;
using NailsByLeah.Api.Contracts;
using NailsByLeah.Api.Data;
using NailsByLeah.Api.Domain;
using NailsByLeah.Api.Errors;
using NailsByLeah.Api.Infrastructure;
using NailsByLeah.Api.Validation;

namespace NailsByLeah.Api.Services;

public interface IGalleryService
{
    Task<IReadOnlyList<GalleryPhotoResponse>> GetAllAsync(CancellationToken ct = default);
    Task<GalleryPhotoResponse> AddAsync(int adminId, IFormFile? file, string? caption, CancellationToken ct = default);
    Task RemoveAsync(int id, CancellationToken ct = default);

    /// <summary>The photo's bytes and type, or null when it no longer exists.</summary>
    Task<(Stream Content, string ContentType)?> OpenAsync(int id, CancellationToken ct = default);
}

/// <summary>
/// Leyah's own photos for the home page's Our Works gallery. Uploaded files are checked by their bytes (JPG, PNG or WebP)
/// and kept in the same private storage as design photos; the public reads them through /api/gallery/{id}/photo.
/// </summary>
public sealed class GalleryService(
    IGalleryPhotoRepository photos,
    IReferenceImageStore store,
    IUnitOfWork unitOfWork,
    IAuditLogger audit,
    ISalonClock clock,
    ILogger<GalleryService> logger) : IGalleryService
{
    public const int PhotoMaxBytes = UploadLimits.ReferenceImageMaxBytes;

    public async Task<IReadOnlyList<GalleryPhotoResponse>> GetAllAsync(CancellationToken ct = default) =>
        (await photos.GetAllAsync(ct)).Select(ToResponse).ToList();

    public async Task<GalleryPhotoResponse> AddAsync(int adminId, IFormFile? file, string? caption, CancellationToken ct = default)
    {
        const string field = "file";
        var text = string.IsNullOrWhiteSpace(caption) ? null : InputNormalizer.Text(caption);
        if (text?.Length > InputLimits.GalleryCaptionMaxLength)
            throw new ValidationAppException("caption", $"The caption must be {InputLimits.GalleryCaptionMaxLength} characters or fewer.");
        if (await photos.CountAsync(ct) >= GalleryPhoto.MaxPhotos)
            throw new ConflictException($"The gallery holds up to {GalleryPhoto.MaxPhotos} photos. Remove one to add another.", "gallery_full");
        if (file is null || file.Length == 0)
            throw new ValidationAppException(field, "Choose a photo to upload.", "image_missing");
        if (file.Length > PhotoMaxBytes)
            throw new ValidationAppException(field, $"The photo must be {UploadLimits.ReferenceImageMaxSizeLabel} or smaller.", "image_too_large");

        using var buffer = new MemoryStream();
        await using (var source = file.OpenReadStream())
            await ReferenceImageService.CopyLimitedAsync(source, buffer, PhotoMaxBytes + 1, ct);
        if (buffer.Length > PhotoMaxBytes)
            throw new ValidationAppException(field, $"The photo must be {UploadLimits.ReferenceImageMaxSizeLabel} or smaller.", "image_too_large");
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
            logger.LogCritical(ex, "Could not save a gallery photo");
            throw new ConflictException(ReferenceImageService.StoreUnavailableMessage, "image_store_unavailable");
        }

        var photo = new GalleryPhoto
        {
            FileName = storedName,
            ContentType = format.ContentType,
            Caption = text,
            CreatedAt = clock.UtcNow,
            CreatedByUserId = adminId,
        };
        photos.Add(photo);
        await unitOfWork.SaveChangesAsync(ct);
        audit.Record(AuditActions.GalleryPhotoAdded, nameof(GalleryPhoto), photo.Id, $"{format.ContentType}, {bytes.Length} bytes");
        await unitOfWork.SaveChangesAsync(ct);
        return ToResponse(photo);
    }

    public async Task RemoveAsync(int id, CancellationToken ct = default)
    {
        var photo = await photos.GetByIdAsync(id, ct) ?? throw new NotFoundException("This photo has already been removed.");
        photos.Remove(photo);
        audit.Record(AuditActions.GalleryPhotoRemoved, nameof(GalleryPhoto), id);
        await unitOfWork.SaveChangesAsync(ct);
        try
        {
            await store.DeleteAsync(photo.FileName, ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException || !ct.IsCancellationRequested)
        {
            logger.LogWarning(ex, "Could not delete the file of gallery photo {PhotoId}", id);
        }
    }

    public async Task<(Stream Content, string ContentType)?> OpenAsync(int id, CancellationToken ct = default)
    {
        var photo = await photos.GetByIdAsync(id, ct);
        if (photo is null)
            return null;
        var stream = await store.OpenReadAsync(photo.FileName, ct);
        return stream is null ? null : (stream, photo.ContentType);
    }

    // The stored name is in the address as a version, so a cached photo is never confused with a later one.
    private static GalleryPhotoResponse ToResponse(GalleryPhoto p) =>
        new(p.Id, $"/api/gallery/{p.Id}/photo?v={p.FileName[..Math.Min(8, p.FileName.Length)]}", p.Caption, p.CreatedAt);
}
