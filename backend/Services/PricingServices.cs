using Microsoft.Extensions.Options;
using NailsByLeah.Api.Configuration;
using NailsByLeah.Api.Contracts;
using NailsByLeah.Api.Data;
using NailsByLeah.Api.Domain;
using NailsByLeah.Api.Errors;
using NailsByLeah.Api.Infrastructure;
using NailsByLeah.Api.Validation;

namespace NailsByLeah.Api.Services;

public sealed record PricedItem(Service Item, int Quantity);

public sealed record PriceQuote(IReadOnlyList<QuoteLineResponse> Lines, decimal Total, decimal Deposit, decimal BalanceDue);

/// <summary>A validated selection of one main service, an optional removal before it, and Stone add-ons.</summary>
public sealed record ServiceSelection(CatalogService Service, IReadOnlyList<(StoneAddOn AddOn, int NailCount, NailHand Hand)> AddOns, RemovalService? Removal = null)
{
    /// <summary>The deposit in force when the selection was checked (Leyah can change it).</summary>
    public decimal? Deposit { get; init; }

    /// <summary>The whole appointment: the removal first, then the main service.</summary>
    public int DurationMinutes => Service.DurationMinutes + (Removal?.DurationMinutes ?? 0);
}

public interface IPriceService
{
    /// <summary>Prices any mix of services. Works on the base <see cref="Service"/> type only.</summary>
    PriceQuote Calculate(IReadOnlyList<PricedItem> items);

    PriceQuote Calculate(ServiceSelection selection);

    Task<ServiceSelection> ResolveSelectionAsync(int serviceId, IReadOnlyList<AddOnSelection>? addOns, int? removalServiceId = null, CancellationToken ct = default);

}

/// <summary>All price calculations. The server's total is the authoritative one (Ref 10.4).</summary>
public sealed class PriceService(IServiceCatalogRepository catalog, IOptions<BookingOptions> bookingOptions, IBookingRulesService? rules = null) : IPriceService
{
    public PriceQuote Calculate(IReadOnlyList<PricedItem> items) => Calculate(items, bookingOptions.Value.DepositAmount);

    private static PriceQuote Calculate(IReadOnlyList<PricedItem> items, decimal deposit)
    {
        var lines = items
            .Select(i => new QuoteLineResponse(
                i.Item.Id, i.Item.Name, i.Item.Category, i.Item.PricingUnit, i.Item.Price, i.Quantity, i.Item.CalculatePrice(i.Quantity)))
            .ToList();

        var total = lines.Sum(l => l.LineTotal);
        return new PriceQuote(lines, total, deposit, Math.Max(0, total - deposit));
    }

    public PriceQuote Calculate(ServiceSelection selection) =>
        Calculate([
            .. selection.Removal is { } removal ? [new PricedItem(removal, 1)] : Array.Empty<PricedItem>(),
            new PricedItem(selection.Service, 1),
            .. selection.AddOns.Select(a => new PricedItem(a.AddOn, a.NailCount))], selection.Deposit ?? bookingOptions.Value.DepositAmount);

    public async Task<ServiceSelection> ResolveSelectionAsync(
        int serviceId, IReadOnlyList<AddOnSelection>? addOns, int? removalServiceId = null, CancellationToken ct = default)
    {
        var service = await catalog.FindServiceAsync(serviceId, ct);
        if (service is not { IsAvailable: true })
            throw new ValidationAppException("serviceId", "The selected service is not available.");

        RemovalService? removal = null;
        if (removalServiceId is { } removalId)
        {
            if (service is RemovalService)
                throw new ValidationAppException("removalServiceId", "A removal can only be added to a new set of nails, not to another removal.");
            removal = await catalog.FindServiceAsync(removalId, ct) as RemovalService;
            if (removal is not { IsAvailable: true })
                throw new ValidationAppException("removalServiceId", "The selected removal is not available.");
        }

        var requested = addOns ?? [];
        var found = requested.Count == 0
            ? new Dictionary<int, StoneAddOn>()
            : (await catalog.FindAddOnsAsync(requested.Select(a => a.AddOnId).ToList(), ct)).ToDictionary(a => a.Id);

        if (service is RemovalService && requested.Count > 0)
            throw new ValidationAppException("addOns", "Stone add-ons can't be added to a removal service. Choose a Soft Gel service to add them.");
        if (!service.TakesAddOns && requested.Count > 0)
            throw new ValidationAppException("addOns", $"Stone add-ons aren't available with {service.Name}. Choose another service to add them.");

        var resolved = new List<(StoneAddOn, int, NailHand)>();
        foreach (var selection in requested)
        {
            if (!found.TryGetValue(selection.AddOnId, out var addOn) || !addOn.IsAvailable)
                throw new ValidationAppException("addOns", $"Add-on #{selection.AddOnId} is not available.");
            resolved.Add((addOn, selection.NailCount, selection.Hand ?? NailHand.Both));
        }

        return new ServiceSelection(service, resolved, removal) { Deposit = rules is null ? null : (await rules.GetAsync(ct)).DepositAmount };
    }
}

public interface IServiceCatalog
{
    Task<CatalogResponse> GetCatalogAsync(CancellationToken ct = default);
}

public interface IServiceManagement
{
    Task<CatalogResponse> GetAllAsync(CancellationToken ct = default);
    Task<ServiceItemResponse> CreateServiceAsync(CreateServiceRequest request, CancellationToken ct = default);
    Task<ServiceItemResponse> UpdateServiceAsync(int id, UpdateServiceRequest request, CancellationToken ct = default);
    Task DeleteServiceAsync(int id, CancellationToken ct = default);
    Task<ServiceItemResponse> CreateAddOnAsync(CreateAddOnRequest request, CancellationToken ct = default);
    Task<ServiceItemResponse> UpdateAddOnAsync(int id, UpdateServiceRequest request, CancellationToken ct = default);
    Task DeleteAddOnAsync(int id, CancellationToken ct = default);
}

/// <summary>Public price list (Ref 2.2) and administrator price management without code changes (Ref 11.3).</summary>
public sealed class ServiceCatalogService(
    IServiceCatalogRepository catalog,
    IUnitOfWork unitOfWork,
    IAuditLogger audit,
    ISalonClock clock,
    IBookingRulesService rules,
    IOptions<LegalOptions> legalOptions) : IServiceCatalog, IServiceManagement
{
    public Task<CatalogResponse> GetCatalogAsync(CancellationToken ct = default) => BuildAsync(includeInactive: false, ct);

    public Task<CatalogResponse> GetAllAsync(CancellationToken ct = default) => BuildAsync(includeInactive: true, ct);

    public async Task<ServiceItemResponse> CreateServiceAsync(CreateServiceRequest request, CancellationToken ct = default)
    {
        var service = CatalogServiceFactory.Create(request.Category);
        var name = InputNormalizer.Text(request.Name);
        if (await catalog.ServiceNameExistsAsync(service.Category, name, null, ct))
            throw new ConflictException($"A {service.CategoryLabel} service named '{name}' already exists.", "duplicate_name");

        var now = clock.UtcNow;
        service.Name = name;
        service.Price = request.Price;
        service.DurationMinutes = request.DurationMinutes;
        service.AllowsAddOns = request.AllowsAddOns && service is not RemovalService;
        service.CreatedAt = now;
        service.UpdatedAt = now;
        catalog.AddService(service);
        await unitOfWork.SaveChangesAsync(ct);

        audit.Record(AuditActions.ServiceCreated, "Service", service.Id, $"{service.CategoryLabel} '{service.Name}' at PHP {service.Price:0.00}, {service.DurationMinutes} min");
        await unitOfWork.SaveChangesAsync(ct);
        return ToResponse(service);
    }

    public async Task<ServiceItemResponse> UpdateServiceAsync(int id, UpdateServiceRequest request, CancellationToken ct = default)
    {
        var service = await catalog.FindServiceAsync(id, ct) ?? throw new NotFoundException("Service not found.");
        var name = InputNormalizer.Text(request.Name);
        if (await catalog.ServiceNameExistsAsync(service.Category, name, id, ct))
            throw new ConflictException($"A {service.CategoryLabel} service named '{name}' already exists.", "duplicate_name");

        // Existing bookings keep the price and duration stored on them (Ref 13.6); only new bookings use the new values.
        var details = Describe(service, name, request);
        if (request.DurationMinutes is { } minutes)
        {
            details += $", {service.DurationMinutes} -> {minutes} min";
            service.DurationMinutes = minutes;
        }
        if (request.AllowsAddOns is { } allows && service is not RemovalService && allows != service.AllowsAddOns)
        {
            details += $", add-ons {(allows ? "allowed" : "not allowed")}";
            service.AllowsAddOns = allows;
        }
        Apply(service, name, request);
        audit.Record(AuditActions.ServiceUpdated, "Service", service.Id, details);
        await unitOfWork.SaveChangesAsync(ct);
        return ToResponse(service);
    }

    public async Task DeleteServiceAsync(int id, CancellationToken ct = default)
    {
        var service = await catalog.FindServiceAsync(id, ct) ?? throw new NotFoundException("Service not found.");
        SoftDelete(service);
        audit.Record(AuditActions.ServiceDeleted, "Service", service.Id, service.Name);
        await unitOfWork.SaveChangesAsync(ct);
    }

    public async Task<ServiceItemResponse> CreateAddOnAsync(CreateAddOnRequest request, CancellationToken ct = default)
    {
        var name = InputNormalizer.Text(request.Name);
        if (await catalog.AddOnNameExistsAsync(name, null, ct))
            throw new ConflictException($"An add-on named '{name}' already exists.", "duplicate_name");

        var now = clock.UtcNow;
        var addOn = new StoneAddOn { Name = name, Price = request.Price, CreatedAt = now, UpdatedAt = now };
        catalog.AddAddOn(addOn);
        await unitOfWork.SaveChangesAsync(ct);

        audit.Record(AuditActions.ServiceCreated, "AddOn", addOn.Id, $"Add-on '{addOn.Name}' at PHP {addOn.Price:0.00} per nail");
        await unitOfWork.SaveChangesAsync(ct);
        return ToResponse(addOn);
    }

    public async Task<ServiceItemResponse> UpdateAddOnAsync(int id, UpdateServiceRequest request, CancellationToken ct = default)
    {
        var addOn = await catalog.FindAddOnAsync(id, ct) ?? throw new NotFoundException("Add-on not found.");
        var name = InputNormalizer.Text(request.Name);
        if (await catalog.AddOnNameExistsAsync(name, id, ct))
            throw new ConflictException($"An add-on named '{name}' already exists.", "duplicate_name");

        var details = Describe(addOn, name, request);
        Apply(addOn, name, request);
        audit.Record(AuditActions.ServiceUpdated, "AddOn", addOn.Id, details);
        await unitOfWork.SaveChangesAsync(ct);
        return ToResponse(addOn);
    }

    public async Task DeleteAddOnAsync(int id, CancellationToken ct = default)
    {
        var addOn = await catalog.FindAddOnAsync(id, ct) ?? throw new NotFoundException("Add-on not found.");
        SoftDelete(addOn);
        audit.Record(AuditActions.ServiceDeleted, "AddOn", addOn.Id, addOn.Name);
        await unitOfWork.SaveChangesAsync(ct);
    }

    public static ServiceItemResponse ToResponse(Service s) =>
        new(s.Id, s.Category, s.CategoryLabel, s.Name, s.Price, s.PricingUnit, s.MaxQuantity, s.IsActive,
            (s as CatalogService)?.DurationMinutes,
            (s as CatalogService)?.TakesAddOns ?? false,
            (s as CatalogService)?.DesignOptionOfId);

    private async Task<CatalogResponse> BuildAsync(bool includeInactive, CancellationToken ct)
    {
        var services = await catalog.GetServicesAsync(includeInactive, ct);
        var addOns = await catalog.GetAddOnsAsync(includeInactive, ct);
        var current = await rules.GetAsync(ct);
        return new CatalogResponse(
            services.Select(ToResponse).ToList(),
            addOns.Select(ToResponse).ToList(),
            current.DepositAmount,
            DepositRefundable: false,
            Currency: "PHP",
            current.NailColors,
            legalOptions.Value.TermsVersion,
            current.OutOfStockColors,
            current.RescheduleLimit,
            current.RescheduleMinimumHours,
            current.MaxDaysAhead);
    }

    private void Apply(Service item, string name, UpdateServiceRequest request)
    {
        item.Name = name;
        item.Price = request.Price;
        item.IsActive = request.IsActive;
        item.UpdatedAt = clock.UtcNow;
    }

    private void SoftDelete(Service item)
    {
        item.IsDeleted = true;
        item.IsActive = false;
        item.UpdatedAt = clock.UtcNow;
    }

    private static string Describe(Service item, string newName, UpdateServiceRequest request) =>
        $"'{item.Name}' -> '{newName}', PHP {item.Price:0.00} -> {request.Price:0.00}, active {item.IsActive} -> {request.IsActive}";
}
