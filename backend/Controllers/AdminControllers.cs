using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using NailsByLeah.Api.Contracts;
using NailsByLeah.Api.Domain;
using NailsByLeah.Api.Infrastructure;
using NailsByLeah.Api.Services;

namespace NailsByLeah.Api.Controllers;

// Administrator-only endpoints. Clients are refused (Ref 8.7).

[ApiController]
[Authorize(Roles = Roles.Administrator)]
[Route("api/admin/dashboard")]
public sealed class AdminDashboardController(IDashboardService dashboard) : ControllerBase
{
    [HttpGet]
    public Task<DashboardResponse> Get([FromQuery] DateOnly? date, CancellationToken ct) => dashboard.GetAsync(date, ct);
}

[ApiController]
[Authorize(Roles = Roles.Administrator)]
[Route("api/admin/bookings")]
public sealed class AdminBookingsController(IAdminBookingService bookings) : ControllerBase
{
    /// <summary>Search by booking date, status or client name (Ref 11.5).</summary>
    [HttpGet]
    public Task<PagedResponse<BookingResponse>> Search([FromQuery] BookingSearchQuery query, CancellationToken ct) =>
        bookings.SearchAsync(query, ct);

    [HttpGet("{id:int}")]
    public Task<BookingResponse> Get(int id, CancellationToken ct) => bookings.GetAsync(id, ct);

    [HttpGet("{id:int}/receipt")]
    public Task<ReceiptResponse> Receipt(int id, CancellationToken ct) => bookings.GetReceiptAsync(id, ct);

    /// <summary>How many bookings each day of a month has, for the calendar on the Bookings page.</summary>
    [HttpGet("calendar")]
    public Task<IReadOnlyList<BookingCalendarDayResponse>> Calendar([FromQuery] int year, [FromQuery] int month, CancellationToken ct) =>
        bookings.GetCalendarAsync(year, month, ct);

    /// <summary>Leyah books an appointment herself, for a client with an account or a walk-in. It is confirmed straight away.</summary>
    [HttpPost]
    public async Task<ActionResult<BookingResponse>> Create(AdminCreateBookingRequest request, CancellationToken ct) =>
        StatusCode(StatusCodes.Status201Created, await bookings.CreateByAdminAsync(User.GetUserId(), request, ct));

    [HttpPost("{id:int}/confirm")]
    public Task<BookingResponse> Confirm(int id, CancellationToken ct) => bookings.ConfirmAsync(User.GetUserId(), id, ct);

    /// <summary>The body is optional: send it when the balance was paid at the same time.</summary>
    [HttpPost("{id:int}/complete")]
    public Task<BookingResponse> Complete(int id, [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] CompleteBookingRequest? request, CancellationToken ct) =>
        bookings.CompleteAsync(id, request, ct);

    [HttpPost("{id:int}/refund")]
    public Task<BookingResponse> RecordRefund(int id, RecordRefundRequest request, CancellationToken ct) =>
        bookings.RecordRefundAsync(id, request, ct);

    [HttpPost("{id:int}/balance")]
    public Task<BookingResponse> RecordBalance(int id, RecordBalanceRequest request, CancellationToken ct) =>
        bookings.RecordBalanceAsync(id, request, ct);

    [HttpPost("{id:int}/no-show")]
    public Task<BookingResponse> NoShow(int id, CancellationToken ct) => bookings.MarkNoShowAsync(id, ct);

    /// <summary>Whether the salon has the shade a client asked for with "Can't find your colour?".</summary>
    [HttpPost("{id:int}/color-request")]
    public Task<BookingResponse> DecideColorRequest(int id, ColorRequestDecision request, CancellationToken ct) =>
        bookings.DecideColorRequestAsync(id, request, ct);

    [HttpPost("{id:int}/reschedule")]
    public Task<BookingResponse> Reschedule(int id, RescheduleRequest request, CancellationToken ct) =>
        bookings.RescheduleAsync(id, request, ct);

    /// <summary>Requires a reason; the explanation is optional (Ref 3.1, 3.2).</summary>
    [HttpPost("{id:int}/cancel")]
    public Task<BookingResponse> Cancel(int id, AdminCancelRequest request, CancellationToken ct) =>
        bookings.CancelAsync(User.GetUserId(), id, request, ct);
}

/// <summary>A client's request to delete their personal data (Data Privacy Act of 2012).</summary>
[ApiController]
[Authorize(Roles = Roles.Administrator)]
[Route("api/admin/clients")]
public sealed class AdminClientDataController(IClientDataService clients, IClientProfileService clientProfile) : ControllerBase
{
    /// <summary>A client's profile photo, so Leyah recognises who is coming.</summary>
    [HttpGet("{id:int}/photo")]
    public async Task<IActionResult> Photo(int id, CancellationToken ct)
    {
        var photo = await clientProfile.OpenPhotoAsync(id, ct);
        if (photo is null) return NotFound();
        Response.Headers.CacheControl = "private, max-age=86400";
        Response.Headers["X-Content-Type-Options"] = "nosniff";
        return File(photo.Value.Content, photo.Value.ContentType);
    }

    /// <summary>POST so the client's email stays out of addresses, which web servers and proxies log.</summary>
    [HttpPost("find")]
    public Task<ClientDataResponse> Find(EmailRequest request, CancellationToken ct) => clients.FindByEmailAsync(request.Email, ct);

    /// <summary>Every client, A to Z by username, one page at a time. POST keeps the search text out of logged addresses.</summary>
    [HttpPost("search")]
    public Task<PagedResponse<ClientListItemResponse>> Search(ClientSearchRequest request, CancellationToken ct) => clients.SearchAsync(request, ct);

    [HttpGet("{id:int}")]
    public Task<ClientDataResponse> Get(int id, CancellationToken ct) => clients.GetAsync(id, ct);

    /// <summary>Leyah's private note about the client; never shown to the client.</summary>
    [HttpPut("{id:int}/note")]
    public Task<ClientDataResponse> UpdateNote(int id, UpdateClientNoteRequest request, CancellationToken ct) => clients.UpdateNoteAsync(id, request, ct);

    /// <summary>Permanently erases the client's personal data. Refused while they have an open booking.</summary>
    [HttpPost("{id:int}/delete-data")]
    public async Task<IActionResult> DeleteData(int id, CancellationToken ct)
    {
        await clients.EraseAsync(id, ct);
        return NoContent();
    }
}

/// <summary>Change prices and add-ons without code changes (Ref 11.3).</summary>
[ApiController]
[Authorize(Roles = Roles.Administrator)]
[Route("api/admin")]
public sealed class AdminServicesController(IServiceManagement services) : ControllerBase
{
    [HttpGet("services")]
    public Task<CatalogResponse> GetAll(CancellationToken ct) => services.GetAllAsync(ct);

    [HttpPost("services")]
    public async Task<ActionResult<ServiceItemResponse>> CreateService(CreateServiceRequest request, CancellationToken ct) =>
        StatusCode(StatusCodes.Status201Created, await services.CreateServiceAsync(request, ct));

    [HttpPut("services/{id:int}")]
    public Task<ServiceItemResponse> UpdateService(int id, UpdateServiceRequest request, CancellationToken ct) =>
        services.UpdateServiceAsync(id, request, ct);

    [HttpDelete("services/{id:int}")]
    public async Task<IActionResult> DeleteService(int id, CancellationToken ct)
    {
        await services.DeleteServiceAsync(id, ct);
        return NoContent();
    }

    [HttpPost("addons")]
    public async Task<ActionResult<ServiceItemResponse>> CreateAddOn(CreateAddOnRequest request, CancellationToken ct) =>
        StatusCode(StatusCodes.Status201Created, await services.CreateAddOnAsync(request, ct));

    [HttpPut("addons/{id:int}")]
    public Task<ServiceItemResponse> UpdateAddOn(int id, UpdateServiceRequest request, CancellationToken ct) =>
        services.UpdateAddOnAsync(id, request, ct);

    [HttpDelete("addons/{id:int}")]
    public async Task<IActionResult> DeleteAddOn(int id, CancellationToken ct)
    {
        await services.DeleteAddOnAsync(id, ct);
        return NoContent();
    }
}

/// <summary>Opening hours: the opening time is fixed at 11:00 AM; administrators set the closing time.</summary>
[ApiController]
[Authorize(Roles = Roles.Administrator)]
[Route("api/admin/salon-hours")]
public sealed class AdminSalonHoursController(ISlotAvailability slots, IScheduleManagement schedule) : ControllerBase
{
    [HttpGet]
    public Task<SalonHoursResponse> Get(CancellationToken ct) => slots.GetHoursAsync(ct);

    [HttpPut]
    public Task<SalonHoursResponse> Update(UpdateSalonHoursRequest request, CancellationToken ct) =>
        schedule.UpdateHoursAsync(User.GetUserId(), request, ct);
}

/// <summary>Block days off, holidays or single slots (Ref 11.4).</summary>
[ApiController]
[Authorize(Roles = Roles.Administrator)]
[Route("api/admin/blocked-slots")]
public sealed class AdminScheduleController(IScheduleManagement schedule) : ControllerBase
{
    [HttpGet]
    public Task<IReadOnlyList<BlockedSlotResponse>> Get([FromQuery] DateOnly from, [FromQuery] DateOnly to, CancellationToken ct) =>
        schedule.GetBlockedAsync(from, to, ct);

    [HttpPost]
    public async Task<ActionResult<BlockedSlotResponse>> Block(BlockSlotRequest request, CancellationToken ct) =>
        StatusCode(StatusCodes.Status201Created, await schedule.BlockAsync(User.GetUserId(), request, ct));

    [HttpPut("{id:int}")]
    public Task<BlockedSlotResponse> Update(int id, BlockSlotRequest request, CancellationToken ct) =>
        schedule.UpdateBlockAsync(User.GetUserId(), id, request, ct);

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Unblock(int id, CancellationToken ct)
    {
        await schedule.UnblockAsync(id, ct);
        return NoContent();
    }
}

[ApiController]
[Authorize(Roles = Roles.Administrator)]
[Route("api/admin/reports")]
public sealed class AdminReportsController(IReportService reports) : ControllerBase
{
    [HttpGet("daily")]
    public Task<DailySalesReport> Daily([FromQuery] DateOnly date, CancellationToken ct) => reports.GetDailyAsync(date, ct);

    [HttpGet("monthly")]
    public Task<MonthlySalesReport> Monthly([FromQuery] int year, [FromQuery] int month, CancellationToken ct) =>
        reports.GetMonthlyAsync(year, month, ct);
}

[ApiController]
[Authorize(Roles = Roles.Administrator)]
[Route("api/admin/activity-logs")]
public sealed class AdminActivityLogsController(IActivityLogService logs) : ControllerBase
{
    [HttpGet]
    public Task<PagedResponse<ActivityLogResponse>> Search([FromQuery] ActivityLogQuery query, CancellationToken ct) =>
        logs.SearchAsync(query, ct);
}

[ApiController]
[Authorize(Roles = Roles.Administrator)]
[Route("api/admin/feedback")]
public sealed class AdminFeedbackController(IFeedbackService feedback) : ControllerBase
{
    /// <summary>Newest first, with the average rating and how many of each star rating there are.</summary>
    [HttpGet]
    public Task<FeedbackListResponse> List([FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default) =>
        feedback.GetAllAsync(page, pageSize, ct);

    /// <summary>Leyah's reply, shown to the client on their Feedback page; an empty reply removes it.</summary>
    [HttpPut("{id:int}/reply")]
    public Task<FeedbackResponse> Reply(int id, FeedbackReplyRequest request, CancellationToken ct) => feedback.ReplyAsync(id, request, ct);
}

/// <summary>The deposit, reschedule rules, how far ahead clients can book, and which shades are out of stock.</summary>
[ApiController]
[Authorize(Roles = Roles.Administrator)]
[Route("api/admin/booking-rules")]
public sealed class AdminBookingRulesController(IBookingRulesService rules) : ControllerBase
{
    [HttpGet]
    public Task<BookingRulesResponse> Get(CancellationToken ct) => rules.GetSettingsAsync(ct);

    [HttpPut]
    public Task<BookingRulesResponse> Update(UpdateBookingRulesRequest request, CancellationToken ct) => rules.UpdateAsync(User.GetUserId(), request, ct);

    [HttpPut("colors")]
    public Task<BookingRulesResponse> SetColorStock(ColorStockRequest request, CancellationToken ct) => rules.SetColorStockAsync(User.GetUserId(), request, ct);
}

/// <summary>Leyah's photos for the home page's Our Works gallery.</summary>
[ApiController]
[Authorize(Roles = Roles.Administrator)]
[Route("api/admin/gallery")]
public sealed class AdminGalleryController(IGalleryService gallery) : ControllerBase
{
    [HttpGet]
    public Task<IReadOnlyList<GalleryPhotoResponse>> List(CancellationToken ct) => gallery.GetAllAsync(ct);

    [HttpPost]
    [RequestSizeLimit(GalleryService.PhotoMaxBytes + 64 * 1024)]
    [RequestFormLimits(MultipartBodyLengthLimit = GalleryService.PhotoMaxBytes + 64 * 1024)]
    public async Task<ActionResult<GalleryPhotoResponse>> Add(IFormFile? file, [FromForm] string? caption, CancellationToken ct) =>
        StatusCode(StatusCodes.Status201Created, await gallery.AddAsync(User.GetUserId(), file, caption, ct));

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Remove(int id, CancellationToken ct)
    {
        await gallery.RemoveAsync(id, ct);
        return NoContent();
    }
}

/// <summary>Leyah's salon details, photo and email alert switches (her profile page).</summary>
[ApiController]
[Authorize(Roles = Roles.Administrator)]
[Route("api/admin/salon-settings")]
public sealed class AdminSalonSettingsController(ISalonProfileService salon) : ControllerBase
{
    [HttpGet]
    public Task<SalonSettingsResponse> Get(CancellationToken ct) => salon.GetAsync(ct);

    [HttpPut]
    public Task<SalonSettingsResponse> Update(UpdateSalonSettingsRequest request, CancellationToken ct) =>
        salon.UpdateAsync(User.GetUserId(), request, ct);

    [HttpPost("photo")]
    [RequestSizeLimit(SalonProfileService.PhotoMaxBytes + 64 * 1024)]
    [RequestFormLimits(MultipartBodyLengthLimit = SalonProfileService.PhotoMaxBytes + 64 * 1024)]
    public Task<SalonSettingsResponse> UploadPhoto(IFormFile? file, CancellationToken ct) => salon.UploadPhotoAsync(User.GetUserId(), file, ct);

    [HttpDelete("photo")]
    public Task<SalonSettingsResponse> RemovePhoto(CancellationToken ct) => salon.RemovePhotoAsync(User.GetUserId(), ct);
}
