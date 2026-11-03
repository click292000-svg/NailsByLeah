using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using NailsByLeah.Api.Contracts;
using NailsByLeah.Api.Domain;
using NailsByLeah.Api.Infrastructure;
using NailsByLeah.Api.Services;
using NailsByLeah.Api.Validation;

namespace NailsByLeah.Api.Controllers;

/// <summary>Nail design reference photos. Clients upload and remove their own; administrators can view any.</summary>
[ApiController]
[Route("api/reference-images")]
public sealed class ReferenceImagesController(IReferenceImageService images) : ControllerBase
{
    /// <summary>Uploads one JPG, PNG or WebP photo (5 MB max) as multipart form field "file".</summary>
    [HttpPost]
    [Authorize(Roles = Roles.Client)]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(UploadLimits.ReferenceImageMaxBytes + 64 * 1024)]
    [RequestFormLimits(MultipartBodyLengthLimit = UploadLimits.ReferenceImageMaxBytes + 64 * 1024)]
    public async Task<ActionResult<ReferenceImageResponse>> Upload(IFormFile? file, CancellationToken ct) =>
        StatusCode(StatusCodes.Status201Created, await images.UploadAsync(User.GetUserId(), file, ct));

    /// <summary>Photos uploaded for a booking that has not been made yet (restores a saved booking draft).</summary>
    [HttpGet("pending")]
    [Authorize(Roles = Roles.Client)]
    public Task<IReadOnlyList<ReferenceImageResponse>> Pending(CancellationToken ct) => images.GetPendingAsync(User.GetUserId(), ct);

    [HttpDelete("{id:int}")]
    [Authorize(Roles = Roles.Client)]
    public async Task<IActionResult> Delete(int id, CancellationToken ct)
    {
        await images.DeleteAsync(User.GetUserId(), id, ct);
        return NoContent();
    }

    /// <summary>The photo itself, for the client who uploaded it and for administrators.</summary>
    [HttpGet("{id:int}")]
    [Authorize(Roles = $"{Roles.Client},{Roles.Administrator}")]
    public async Task<IActionResult> Get(int id, CancellationToken ct)
    {
        var (content, contentType) = await images.OpenAsync(User.GetUserId(), User.IsInRole(Roles.Administrator), id, ct);
        Response.Headers.CacheControl = "private, max-age=3600";
        return File(content, contentType);
    }
}
