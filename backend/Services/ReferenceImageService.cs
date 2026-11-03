using NailsByLeah.Api.Contracts;
using NailsByLeah.Api.Data;
using NailsByLeah.Api.Domain;
using NailsByLeah.Api.Errors;
using NailsByLeah.Api.Infrastructure;
using NailsByLeah.Api.Validation;

namespace NailsByLeah.Api.Services;

/// <summary>Nail design reference photos: upload while booking, attach to the booking, view (owner and salon).</summary>
public interface IReferenceImageService
{
    Task<ReferenceImageResponse> UploadAsync(int clientId, IFormFile? file, CancellationToken ct = default);

    /// <summary>Photos the client uploaded that are not on a booking yet, e.g. from a saved booking draft.</summary>
    Task<IReadOnlyList<ReferenceImageResponse>> GetPendingAsync(int clientId, CancellationToken ct = default);

    /// <summary>Removes a photo that is not on a booking yet. Photos on a booking are kept as part of its record.</summary>
    Task DeleteAsync(int clientId, int imageId, CancellationToken ct = default);

    /// <summary>The file, for its owner or an administrator. Anyone else gets "not found".</summary>
    Task<(Stream Content, string ContentType)> OpenAsync(int userId, bool isAdministrator, int imageId, CancellationToken ct = default);
}

/// <summary>Used by the booking service inside its create-booking transaction.</summary>
public interface IReferenceImageAttacher
{
    /// <summary>Attaches the client's pending photos to <paramref name="booking"/> (which must already have its id).</summary>
    Task AttachAsync(int clientId, Booking booking, IReadOnlyList<int>? imageIds, CancellationToken ct = default);
}

public sealed class ReferenceImageService(
    IReferenceImageRepository images,
    IReferenceImageStore store,
    IUnitOfWork unitOfWork,
    IAuditLogger audit,
    ISalonClock clock,
    ILogger<ReferenceImageService> logger) : IReferenceImageService, IReferenceImageAttacher
{
    public const string FileField = "file";
    public const string IdsField = "referenceImageIds";

    public static readonly string TypeMessage = "Upload a JPG, PNG or WebP image.";
    public static readonly string SizeMessage = $"The image must be {UploadLimits.ReferenceImageMaxSizeLabel} or smaller.";
    public static readonly string EmptyMessage = "Choose an image to upload.";
    public static readonly string TooManyPendingMessage =
        $"You already have {UploadLimits.PendingReferenceImagesPerClient} photos waiting to be added to a booking. Remove one before uploading another.";
    public static readonly string TooManyPerBookingMessage = $"You can add up to {UploadLimits.ReferenceImagesPerBooking} reference photos per booking.";
    public static readonly string UnavailableMessage = "One of the reference photos is no longer available. Please upload it again.";

    public static ReferenceImageResponse ToResponse(ReferenceImage r) => new(r.Id, r.ContentType, r.SizeBytes, r.CreatedAt);

    public async Task<ReferenceImageResponse> UploadAsync(int clientId, IFormFile? file, CancellationToken ct = default)
    {
        if (file is null || file.Length == 0)
            throw new ValidationAppException(FileField, EmptyMessage, "image_missing");
        if (file.Length > UploadLimits.ReferenceImageMaxBytes)
            throw new ValidationAppException(FileField, SizeMessage, "image_too_large");

        // Read at most one byte over the limit, so a lying Content-Length cannot make us read more.
        using var buffer = new MemoryStream();
        await using (var source = file.OpenReadStream())
            await CopyLimitedAsync(source, buffer, UploadLimits.ReferenceImageMaxBytes + 1, ct);
        if (buffer.Length > UploadLimits.ReferenceImageMaxBytes)
            throw new ValidationAppException(FileField, SizeMessage, "image_too_large");

        // The type comes from the file's own bytes; its name and the browser's Content-Type are ignored.
        var bytes = buffer.GetBuffer().AsMemory(0, (int)buffer.Length);
        var format = ImageSignature.Detect(bytes.Span) ?? throw new ValidationAppException(FileField, TypeMessage, "image_type");

        if ((await images.GetPendingForClientAsync(clientId, ct)).Count >= UploadLimits.PendingReferenceImagesPerClient)
            throw new ConflictException(TooManyPendingMessage, "too_many_pending_images");

        var storedName = await store.SaveAsync(bytes, format.Extension, ct);
        var image = new ReferenceImage
        {
            ClientId = clientId,
            StoredFileName = storedName,
            ContentType = format.ContentType,
            SizeBytes = bytes.Length,
            CreatedAt = clock.UtcNow,
        };
        images.Add(image);
        try
        {
            await unitOfWork.SaveChangesAsync(ct);
        }
        catch
        {
            store.Delete(storedName); // no orphan files when the row could not be saved
            throw;
        }
        audit.Record(AuditActions.ReferenceImageUploaded, nameof(ReferenceImage), image.Id, $"{format.ContentType}, {image.SizeBytes} bytes");
        await unitOfWork.SaveChangesAsync(ct);
        return ToResponse(image);
    }

    public async Task<IReadOnlyList<ReferenceImageResponse>> GetPendingAsync(int clientId, CancellationToken ct = default) =>
        (await images.GetPendingForClientAsync(clientId, ct)).Select(ToResponse).ToList();

    public async Task DeleteAsync(int clientId, int imageId, CancellationToken ct = default)
    {
        var image = await images.FindAsync(imageId, ct);
        if (image is null || image.ClientId != clientId)
            throw new NotFoundException("Reference photo not found.");
        if (image.IsAttached)
            throw new ConflictException("This photo is part of a booking and can no longer be removed.", "image_attached");

        image.IsDeleted = true;
        audit.Record(AuditActions.ReferenceImageRemoved, nameof(ReferenceImage), image.Id);
        await unitOfWork.SaveChangesAsync(ct);
        try
        {
            store.Delete(image.StoredFileName);
        }
        catch (IOException ex)
        {
            logger.LogWarning(ex, "Could not delete the file of reference image {ImageId}", image.Id);
        }
    }

    public async Task<(Stream Content, string ContentType)> OpenAsync(int userId, bool isAdministrator, int imageId, CancellationToken ct = default)
    {
        var image = await images.FindAsync(imageId, ct);
        // Another client's photo looks exactly like a missing one.
        if (image is null || (!isAdministrator && image.ClientId != userId))
            throw new NotFoundException("Reference photo not found.");
        var content = store.OpenRead(image.StoredFileName) ?? throw new NotFoundException("Reference photo not found.");
        return (content, image.ContentType);
    }

    public async Task AttachAsync(int clientId, Booking booking, IReadOnlyList<int>? imageIds, CancellationToken ct = default)
    {
        if (imageIds is null || imageIds.Count == 0)
            return;
        if (imageIds.Count > UploadLimits.ReferenceImagesPerBooking)
            throw new ValidationAppException(IdsField, TooManyPerBookingMessage);

        var distinct = imageIds.Distinct().ToList();
        var found = await images.FindManyAsync(distinct, ct);
        if (found.Count != distinct.Count || found.Any(r => r.ClientId != clientId || r.IsAttached))
            throw new ValidationAppException(IdsField, UnavailableMessage, "image_unavailable");

        foreach (var image in found)
            image.BookingId = booking.Id;
    }

    private static async Task CopyLimitedAsync(Stream source, Stream destination, long limit, CancellationToken ct)
    {
        var chunk = new byte[81920];
        long total = 0;
        int read;
        while (total < limit && (read = await source.ReadAsync(chunk.AsMemory(0, (int)Math.Min(chunk.Length, limit - total)), ct)) > 0)
        {
            await destination.WriteAsync(chunk.AsMemory(0, read), ct);
            total += read;
        }
    }
}
