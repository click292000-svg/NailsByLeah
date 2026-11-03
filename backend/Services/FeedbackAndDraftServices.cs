using System.Text.Json;
using NailsByLeah.Api.Contracts;
using NailsByLeah.Api.Data;
using NailsByLeah.Api.Domain;
using NailsByLeah.Api.Errors;
using NailsByLeah.Api.Infrastructure;
using NailsByLeah.Api.Validation;

namespace NailsByLeah.Api.Services;

/// <summary>A client's unfinished booking, saved as they go so they can continue later.</summary>
public interface IBookingDraftService
{
    Task<BookingDraftResponse?> GetAsync(int clientId, CancellationToken ct = default);
    Task<BookingDraftResponse> SaveAsync(int clientId, SaveBookingDraftRequest request, CancellationToken ct = default);
    Task DeleteAsync(int clientId, CancellationToken ct = default);
}

/// <summary>
/// Stores the booking page's selections as-is. A draft reserves nothing and is never shown as an appointment; when the
/// client pays, the booking is checked from scratch (service still offered, current prices, time still free) and the
/// draft is deleted in the same transaction.
/// </summary>
public sealed class BookingDraftService(IBookingDraftRepository drafts, IUnitOfWork unitOfWork, ISalonClock clock) : IBookingDraftService
{
    public async Task<BookingDraftResponse?> GetAsync(int clientId, CancellationToken ct = default) =>
        await drafts.GetForClientAsync(clientId, ct) is { } draft ? ToResponse(draft) : null;

    public async Task<BookingDraftResponse> SaveAsync(int clientId, SaveBookingDraftRequest request, CancellationToken ct = default)
    {
        if (request.Data.ValueKind != JsonValueKind.Object)
            throw new ValidationAppException("data", "The booking draft must be a JSON object.");
        var json = request.Data.GetRawText();
        if (json.Length > InputLimits.BookingDraftMaxLength)
            throw new ValidationAppException("data", "The booking draft is too large.");

        var draft = await drafts.GetForClientAsync(clientId, ct);
        if (draft is null)
        {
            draft = new BookingDraft { ClientId = clientId };
            drafts.Add(draft);
        }
        draft.Data = json;
        draft.UpdatedAt = clock.UtcNow;

        try
        {
            await unitOfWork.SaveChangesAsync(ct);
        }
        catch (UniqueConstraintViolationException ex) when (ex.IndexName == IndexNames.BookingDraftsClient)
        {
            // Two tabs saved the first draft at the same moment: update the row the other one created.
            unitOfWork.DiscardChanges();
            draft = await drafts.GetForClientAsync(clientId, ct) ?? throw new InvalidOperationException("Booking draft disappeared.", ex);
            draft.Data = json;
            draft.UpdatedAt = clock.UtcNow;
            await unitOfWork.SaveChangesAsync(ct);
        }
        return ToResponse(draft);
    }

    public async Task DeleteAsync(int clientId, CancellationToken ct = default)
    {
        if (await drafts.GetForClientAsync(clientId, ct) is not { } draft)
            return;
        drafts.Remove(draft);
        await unitOfWork.SaveChangesAsync(ct);
    }

    private static BookingDraftResponse ToResponse(BookingDraft draft)
    {
        using var document = JsonDocument.Parse(draft.Data);
        return new BookingDraftResponse(document.RootElement.Clone(), draft.UpdatedAt);
    }
}

public interface IFeedbackService
{
    /// <summary><c>Created</c> is false when the same submission was already saved (a repeated click).</summary>
    Task<(FeedbackResponse Response, bool Created)> SubmitAsync(int clientId, SubmitFeedbackRequest request, CancellationToken ct = default);

    Task<IReadOnlyList<FeedbackResponse>> GetMineAsync(int clientId, CancellationToken ct = default);
    Task<FeedbackListResponse> GetAllAsync(int page, int pageSize, CancellationToken ct = default);
}

/// <summary>Star ratings (1-5) with optional comments. Clients rate the salon; the administrator reads them.</summary>
public sealed class FeedbackService(IFeedbackRepository feedback, IUnitOfWork unitOfWork, IAuditLogger audit, ISalonClock clock) : IFeedbackService
{
    public async Task<(FeedbackResponse Response, bool Created)> SubmitAsync(int clientId, SubmitFeedbackRequest request, CancellationToken ct = default)
    {
        if (await feedback.FindBySubmissionKeyAsync(request.SubmissionKey, ct) is { } earlier)
            return (Replay(earlier, clientId), false);

        var item = new Feedback
        {
            ClientId = clientId,
            Rating = request.Rating,
            Comment = string.IsNullOrWhiteSpace(request.Comment) ? null : InputNormalizer.Text(request.Comment),
            SubmissionKey = request.SubmissionKey,
            CreatedAt = clock.UtcNow,
        };
        feedback.Add(item);
        try
        {
            await unitOfWork.SaveChangesAsync(ct);
        }
        catch (UniqueConstraintViolationException ex) when (ex.IndexName == IndexNames.FeedbackSubmissionKey)
        {
            // A second click arrived at the same moment and was saved first.
            unitOfWork.DiscardChanges();
            var winner = await feedback.FindBySubmissionKeyAsync(request.SubmissionKey, ct)
                         ?? throw new InvalidOperationException("Feedback with this submission key disappeared.", ex);
            return (Replay(winner, clientId), false);
        }

        audit.Record(AuditActions.FeedbackSubmitted, nameof(Feedback), item.Id, $"{item.Rating} star(s)");
        await unitOfWork.SaveChangesAsync(ct);
        return (ToResponse(item, includeClient: false), true);
    }

    public async Task<IReadOnlyList<FeedbackResponse>> GetMineAsync(int clientId, CancellationToken ct = default) =>
        (await feedback.GetForClientAsync(clientId, ct)).Select(f => ToResponse(f, includeClient: false)).ToList();

    public async Task<FeedbackListResponse> GetAllAsync(int page, int pageSize, CancellationToken ct = default)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);
        var (items, total) = await feedback.GetPageAsync(page, pageSize, ct);
        var counts = await feedback.CountByRatingAsync(ct);
        var byRating = Enumerable.Range(Feedback.MinRating, Feedback.MaxRating).ToDictionary(r => r, r => counts.GetValueOrDefault(r));
        var average = total == 0 ? 0m : Math.Round((decimal)byRating.Sum(p => p.Key * p.Value) / total, 1);
        return new FeedbackListResponse(items.Select(f => ToResponse(f, includeClient: true)).ToList(), page, pageSize, total, average, byRating);
    }

    private static FeedbackResponse Replay(Feedback earlier, int clientId) =>
        earlier.ClientId == clientId
            ? ToResponse(earlier, includeClient: false)
            : throw new ConflictException("This submission key has already been used.", "submission_key_reused");

    private static FeedbackResponse ToResponse(Feedback f, bool includeClient) => new(
        f.Id, f.Rating, f.Comment, f.CreatedAt,
        includeClient ? new ClientSummaryResponse(f.Client.Id, f.Client.FirstName, f.Client.LastName, f.Client.Username, f.Client.Email, f.Client.PhoneNumber) : null);
}
