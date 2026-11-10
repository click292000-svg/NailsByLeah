using NailsByLeah.Api.Errors;

namespace NailsByLeah.Api.Domain;

/// <summary>
/// Common base for everything on the price list (Liskov Substitution Principle, Ref 5.3).
/// Soft Gel, Removal and Stone items can all be priced through this type without knowing which one they are.
/// </summary>
public abstract class Service : ISoftDeletable
{
    public int Id { get; set; }
    public string Name { get; set; } = "";

    /// <summary>Base price in PHP. For per-nail items this is the price of one nail.</summary>
    public decimal Price { get; set; }

    public bool IsActive { get; set; } = true;
    public bool IsDeleted { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    /// <summary>Stable category key, e.g. "SoftGel".</summary>
    public abstract string Category { get; }

    public abstract string CategoryLabel { get; }

    /// <summary>"per service" or "per nail".</summary>
    public virtual string PricingUnit => "per service";

    /// <summary>Largest quantity that can be ordered on one booking.</summary>
    public virtual int MaxQuantity => 1;

    public bool IsAvailable => IsActive && !IsDeleted;

    public decimal CalculatePrice(int quantity)
    {
        if (quantity < 1 || quantity > MaxQuantity)
            throw new ValidationAppException("quantity", $"{Name} quantity must be between 1 and {MaxQuantity}.");
        return Price * quantity;
    }
}

/// <summary>Main services stored in the <c>services</c> table. Subclasses are told apart by the <c>category</c> column.</summary>
public abstract class CatalogService : Service
{
    public const int DefaultDurationMinutes = 60;

    /// <summary>How long the service takes. Administrators change it in the app; it decides which times can be booked.</summary>
    public int DurationMinutes { get; set; } = DefaultDurationMinutes;

    /// <summary>Whether Stone add-ons can be chosen with it. Plain has none; a removal never does.</summary>
    public bool AllowsAddOns { get; set; } = true;

    public virtual bool TakesAddOns => AllowsAddOns;
}

public sealed class SoftGelService : CatalogService
{
    public const string CategoryKey = "SoftGel";
    public override string Category => CategoryKey;
    public override string CategoryLabel => "Soft Gel";
}

public sealed class RemovalService : CatalogService
{
    public const string CategoryKey = "Removal";
    public override string Category => CategoryKey;
    public override string CategoryLabel => "Removal";

    /// <summary>Taking off old nails comes before a new set, so it never has add-ons of its own.</summary>
    public override bool TakesAddOns => false;
}

public static class CatalogServiceExtensions
{
    /// <summary>A new set of nails needs a colour; a removal on its own doesn't.</summary>
    public static bool NeedsColor(this CatalogService service) => service is not RemovalService;
}

/// <summary>
/// Stone add-ons stored in the <c>addons</c> table. Priced per nail.
/// The per-nail rule is an assumption still to be confirmed against Kyla's official price list.
/// </summary>
public sealed class StoneAddOn : Service
{
    public const string CategoryKey = "Stone";

    /// <summary>Assumed maximum: ten fingernails.</summary>
    public const int MaxNails = 10;

    /// <summary>Nails on one hand: the most an add-on on just the left or right hand can cover.</summary>
    public const int MaxNailsPerHand = 5;

    public static bool FitsOn(NailHand hand, int nailCount) => hand == NailHand.Both || nailCount <= MaxNailsPerHand;

    public override string Category => CategoryKey;
    public override string CategoryLabel => "Stone (Add-on)";
    public override string PricingUnit => "per nail";
    public override int MaxQuantity => MaxNails;
}

/// <summary>
/// Creates main services by category key. Adding a new category means adding a subclass and one entry here;
/// adding new services in an existing category is just a new database row (Open/Closed Principle, Ref 5.2).
/// </summary>
public static class CatalogServiceFactory
{
    private static readonly Dictionary<string, Func<CatalogService>> Factories = new(StringComparer.OrdinalIgnoreCase)
    {
        [SoftGelService.CategoryKey] = () => new SoftGelService(),
        [RemovalService.CategoryKey] = () => new RemovalService(),
    };

    public static IReadOnlyCollection<string> Categories => Factories.Keys;

    public static bool IsKnownCategory(string? category) => category is not null && Factories.ContainsKey(category);

    public static CatalogService Create(string category) =>
        Factories.TryGetValue(category, out var create)
            ? create()
            : throw new ValidationAppException("category", $"Unknown service category '{category}'.");
}
