using NailsByLeah.Api.Contracts;
using NailsByLeah.Api.Data;
using NailsByLeah.Api.Domain;
using NailsByLeah.Api.Errors;
using NailsByLeah.Api.Infrastructure;
using NailsByLeah.Api.Validation;

namespace NailsByLeah.Api.Services;

public interface IClientDataService
{
    Task<ClientDataResponse> FindByEmailAsync(string email, CancellationToken ct = default);
    Task<ClientDataResponse> GetAsync(int clientId, CancellationToken ct = default);
    Task<PagedResponse<ClientListItemResponse>> SearchAsync(ClientSearchRequest request, CancellationToken ct = default);
    Task EraseAsync(int clientId, CancellationToken ct = default);
}

/// <summary>
/// A client's request to delete their personal data (Data Privacy Act of 2012). The account is anonymized rather than
/// removed: name, contact details, photos, notes, comments and security records go; bookings and payments stay under
/// "Deleted Client", so sales reports and payment records remain correct. It cannot be undone.
/// </summary>
public sealed class ClientDataService(
    IUserRepository users,
    IClientDataRepository clientData,
    IBookingDraftRepository drafts,
    IReferenceImageStore imageStore,
    IPasswordHasher hasher,
    IUnitOfWork unitOfWork,
    IAuditLogger audit,
    ISalonClock clock,
    ILogger<ClientDataService> logger) : IClientDataService
{
    public const string NotFoundMessage = "No client account was found with that email address.";

    public async Task<ClientDataResponse> FindByEmailAsync(string email, CancellationToken ct = default)
    {
        var client = await users.FindByEmailAsync(InputNormalizer.Email(email), ct);
        return await SummarizeAsync(client, ct);
    }

    public async Task<ClientDataResponse> GetAsync(int clientId, CancellationToken ct = default) =>
        await SummarizeAsync(await users.GetByIdAsync(clientId, ct), ct);

    public async Task<PagedResponse<ClientListItemResponse>> SearchAsync(ClientSearchRequest request, CancellationToken ct = default)
    {
        var page = Math.Max(1, request.Page);
        var pageSize = Math.Clamp(request.PageSize, 1, 100);
        var search = string.IsNullOrWhiteSpace(request.Search) ? null : InputNormalizer.Text(request.Search);
        var (items, total) = await users.SearchClientsAsync(search, page, pageSize, ct);
        return new PagedResponse<ClientListItemResponse>(
            items.Select(u => new ClientListItemResponse(u.Id, u.Username, u.FirstName, u.LastName, u.Email, u.PhoneNumber, u.EmailVerified, u.CreatedAt,
                ClientProfileService.AdminPhotoUrl(u))).ToList(),
            page, pageSize, total);
    }

    private async Task<ClientDataResponse> SummarizeAsync(User? client, CancellationToken ct)
    {
        if (client is null || client.Role != UserRole.Client)
            throw new NotFoundException(NotFoundMessage);

        var bookings = await clientData.GetBookingsAsync(client.Id, ct);
        var photos = await clientData.GetReferenceImagesAsync(client.Id, ct);
        var feedback = await clientData.GetFeedbackAsync(client.Id, ct);
        return new ClientDataResponse(client.Id, client.FirstName, client.LastName, client.Username, client.Email, client.PhoneNumber,
            bookings.Count, bookings.Count(b => b.IsActive), photos.Count(p => !p.IsDeleted), feedback.Count);
    }

    public async Task EraseAsync(int clientId, CancellationToken ct = default)
    {
        var client = await users.GetByIdAsync(clientId, ct);
        if (client is null || client.Role != UserRole.Client)
            throw new NotFoundException(NotFoundMessage);

        var bookings = await clientData.GetBookingsAsync(clientId, ct);
        if (bookings.Any(b => b.IsActive))
            throw new ConflictException("This client still has an open booking. Complete or cancel it first.", "client_has_active_bookings");

        // The placeholders keep the unique indexes and the 11-digit phone rule satisfied, and free the real
        // email, username and phone number in case the person signs up again. Real mobile numbers start with 09.
        client.FirstName = "Deleted";
        client.LastName = "Client";
        client.Username = $"deleted-{client.Id}";
        client.Email = $"deleted-{client.Id}@deleted.invalid";
        client.PhoneNumber = $"00{client.Id:D9}";
        var profilePhoto = client.PhotoFileName;
        client.PhotoFileName = null;
        client.PhotoContentType = null;
        client.ChangePassword(hasher.Hash(Guid.NewGuid().ToString("N"))); // a new security stamp also ends every session
        client.UpdatedAt = clock.UtcNow;
        client.IsDeleted = true;

        foreach (var booking in bookings)
        {
            booking.Note = null;
            if (booking.Cancellation is { } cancellation)
                cancellation.Explanation = null;
        }

        var photos = await clientData.GetReferenceImagesAsync(clientId, ct);
        var filesToDelete = photos.Where(p => !p.IsDeleted).Select(p => p.StoredFileName).ToList();
        if (profilePhoto is not null)
            filesToDelete.Add(profilePhoto);
        foreach (var photo in photos)
            photo.IsDeleted = true;

        foreach (var feedback in await clientData.GetFeedbackAsync(clientId, ct))
            feedback.Comment = null; // the star rating stays in the salon's totals, no longer tied to anyone

        foreach (var entry in await clientData.GetAuditLogsAsync(clientId, ct))
        {
            entry.IpAddress = null;
            entry.Details = null;
        }

        await clientData.RemoveTokensAsync(clientId, ct);
        await drafts.DeleteForClientAsync(clientId, ct);

        audit.Record(AuditActions.ClientDataDeleted, nameof(User), clientId);
        await unitOfWork.SaveChangesAsync(ct);

        // Files last: if saving fails, nothing has been lost.
        foreach (var file in filesToDelete)
        {
            try
            {
                await imageStore.DeleteAsync(file);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Could not delete a design photo file while erasing client {ClientId}", clientId);
            }
        }
    }
}
