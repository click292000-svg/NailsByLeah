using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using NailsByLeah.Api.Configuration;
using NailsByLeah.Api.Contracts;
using NailsByLeah.Api.Domain;
using NailsByLeah.Api.Services;

namespace NailsByLeah.Api.Controllers;

// Endpoints anyone can use before logging in: the price list, live price quotes,
// available slots and dropdown options.

[ApiController]
[AllowAnonymous]
[Route("api/services")]
public sealed class ServicesController(IServiceCatalog catalog) : ControllerBase
{
    /// <summary>Every active service and add-on with its base price (Ref 2.2).</summary>
    [HttpGet]
    public Task<CatalogResponse> Get(CancellationToken ct) => catalog.GetCatalogAsync(ct);
}

[ApiController]
[AllowAnonymous]
[Route("api/slots")]
public sealed class SlotsController(ISlotAvailability slots) : ControllerBase
{
    /// <summary>
    /// Start times for one day: Open, Booked, Blocked, Past, or TooShort when the chosen service would run past
    /// closing or into another appointment (Ref 10.1).
    /// </summary>
    [HttpGet]
    public Task<DaySlotsResponse> Get([FromQuery] DateOnly date, [FromQuery] int? serviceId, CancellationToken ct) =>
        slots.GetDayAsync(date, serviceId, ct);
}

[ApiController]
[AllowAnonymous]
[Route("api/salon-hours")]
public sealed class SalonHoursController(ISlotAvailability slots) : ControllerBase
{
    /// <summary>Opening and closing time for the website.</summary>
    [HttpGet]
    public Task<SalonHoursResponse> Get(CancellationToken ct) => slots.GetHoursAsync(ct);
}

[ApiController]
[AllowAnonymous]
[Route("api/lookups")]
public sealed class LookupsController(IOptions<LegalOptions> legal) : ControllerBase
{
    [HttpGet]
    public LookupsResponse Get() => new(
        Labels.NoteSuggestions,
        Labels.ClientCancellationReasons.Select(p => new LookupItem(p.Key.ToString(), p.Value)).ToList(),
        Labels.AdminCancellationReasons.Select(p => new LookupItem(p.Key.ToString(), p.Value)).ToList(),
        Enum.GetValues<PaymentMethod>().Select(m => new LookupItem(m.ToString(), m.ToString())).ToList(),
        Enum.GetValues<BookingStatus>().Select(s => new LookupItem(s.ToString(), s == BookingStatus.NoShow ? "No-show" : s.ToString())).ToList(),
        legal.Value.TermsVersion);
}
