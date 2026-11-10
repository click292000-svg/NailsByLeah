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

    /// <summary>How many bookings each day of a month has, for the calendar on the Bookings page.</summary>
    [HttpGet("calendar")]
    public Task<IReadOnlyList<BookingCalendarDayResponse>> Calendar([FromQuery] int year, [FromQuery] int month, CancellationToken ct) =>
        bookings.GetCalendarAsync(year, month, ct);

    [HttpPost("{id:int}/confirm")]
    public Task<BookingResponse> Confirm(int id, CancellationToken ct) => bookings.ConfirmAsync(User.GetUserId(), id, ct);

    /// <summary>The body is optional: send it when the balance was paid at the same time.</summary>
    [HttpPost("{id:int}/complete")]
    public Task<BookingResponse> Complete(int id, [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] CompleteBookingRequest? request, CancellationToken ct) =>
        bookings.CompleteAsync(id, request, ct);

    [HttpPost("{id:int}/balance")]
    public Task<BookingResponse> RecordBalance(int id, RecordBalanceRequest request, CancellationToken ct) =>
        bookings.RecordBalanceAsync(id, request, ct);

    [HttpPost("{id:int}/no-show")]
    public Task<BookingResponse> NoShow(int id, CancellationToken ct) => bookings.MarkNoShowAsync(id, ct);

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
public sealed class AdminClientDataController(IClientDataService clients) : ControllerBase
{
    /// <summary>POST so the client's email stays out of addresses, which web servers and proxies log.</summary>
    [HttpPost("find")]
    public Task<ClientDataResponse> Find(EmailRequest request, CancellationToken ct) => clients.FindByEmailAsync(request.Email, ct);

    /// <summary>Every client, A to Z by username, one page at a time. POST keeps the search text out of logged addresses.</summary>
    [HttpPost("search")]
    public Task<PagedResponse<ClientListItemResponse>> Search(ClientSearchRequest request, CancellationToken ct) => clients.SearchAsync(request, ct);

    [HttpGet("{id:int}")]
    public Task<ClientDataResponse> Get(int id, CancellationToken ct) => clients.GetAsync(id, ct);

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
}
