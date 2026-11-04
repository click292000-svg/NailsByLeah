using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using NailsByLeah.Api.Contracts;
using NailsByLeah.Api.Domain;
using NailsByLeah.Api.Infrastructure;
using NailsByLeah.Api.Services;

namespace NailsByLeah.Api.Controllers;

/// <summary>Client-only booking endpoints. Administrators are refused (Ref 8.7).</summary>
[ApiController]
[Authorize(Roles = Roles.Client)]
[Route("api/bookings")]
public sealed class BookingsController(IClientBookingService bookings) : ControllerBase
{
    /// <summary>
    /// Books a slot and pays the non-refundable deposit in one step. Sending the same
    /// <c>idempotencyKey</c> again returns the original booking instead of charging twice.
    /// </summary>
    [EnableRateLimiting(RateLimitPolicies.Booking)]
    [HttpPost]
    public async Task<ActionResult<CreateBookingResponse>> Create(CreateBookingRequest request, CancellationToken ct)
    {
        var (response, created) = await bookings.CreateAsync(User.GetUserId(), request, ct);
        return created ? CreatedAtAction(nameof(Get), new { id = response.Booking.Id }, response) : Ok(response);
    }

    /// <summary>Booking history with statuses (Ref 10.3).</summary>
    [HttpGet]
    public Task<IReadOnlyList<BookingResponse>> History(CancellationToken ct) => bookings.GetHistoryAsync(User.GetUserId(), ct);

    [HttpGet("{id:int}")]
    public Task<BookingResponse> Get(int id, CancellationToken ct) => bookings.GetAsync(User.GetUserId(), id, ct);

    [HttpGet("{id:int}/receipt")]
    public Task<ReceiptResponse> Receipt(int id, CancellationToken ct) => bookings.GetReceiptAsync(User.GetUserId(), id, ct);

    [EnableRateLimiting(RateLimitPolicies.Booking)]
    [HttpPost("{id:int}/reschedule")]
    public Task<BookingResponse> Reschedule(int id, RescheduleRequest request, CancellationToken ct) =>
        bookings.RescheduleAsync(User.GetUserId(), id, request, ct);

    [EnableRateLimiting(RateLimitPolicies.Booking)]
    [HttpPost("{id:int}/cancel")]
    public Task<BookingResponse> Cancel(int id, ClientCancelRequest request, CancellationToken ct) =>
        bookings.CancelAsync(User.GetUserId(), id, request, ct);
}

/// <summary>The booking the signed-in client started but hasn't paid for. 204 when there is none.</summary>
[ApiController]
[Authorize(Roles = Roles.Client)]
[Route("api/booking-draft")]
public sealed class BookingDraftController(IBookingDraftService drafts) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<BookingDraftResponse>> Get(CancellationToken ct) =>
        await drafts.GetAsync(User.GetUserId(), ct) is { } draft ? draft : NoContent();

    [HttpPut]
    public Task<BookingDraftResponse> Save(SaveBookingDraftRequest request, CancellationToken ct) =>
        drafts.SaveAsync(User.GetUserId(), request, ct);

    [HttpDelete]
    public async Task<IActionResult> Delete(CancellationToken ct)
    {
        await drafts.DeleteAsync(User.GetUserId(), ct);
        return NoContent();
    }
}

/// <summary>Clients rate their experience (1-5 stars, comment optional).</summary>
[ApiController]
[Authorize(Roles = Roles.Client)]
[Route("api/feedback")]
public sealed class FeedbackController(IFeedbackService feedback) : ControllerBase
{
    [EnableRateLimiting(RateLimitPolicies.Feedback)]
    [HttpPost]
    public async Task<ActionResult<FeedbackResponse>> Submit(SubmitFeedbackRequest request, CancellationToken ct)
    {
        var (response, created) = await feedback.SubmitAsync(User.GetUserId(), request, ct);
        return created ? StatusCode(StatusCodes.Status201Created, response) : Ok(response);
    }

    [HttpGet]
    public Task<IReadOnlyList<FeedbackResponse>> Mine(CancellationToken ct) => feedback.GetMineAsync(User.GetUserId(), ct);
}
