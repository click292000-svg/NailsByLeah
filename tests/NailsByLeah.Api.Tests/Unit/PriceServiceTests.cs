using Microsoft.Extensions.Options;
using NailsByLeah.Api.Configuration;
using NailsByLeah.Api.Domain;
using NailsByLeah.Api.Errors;
using NailsByLeah.Api.Services;

namespace NailsByLeah.Api.Tests.Unit;

/// <summary>Test 9.1.1: price calculations against the approved price list.</summary>
public sealed class PriceServiceTests
{
    private static readonly SoftGelService Plain = new() { Id = 1, Name = "Plain", Price = 300m };
    private static readonly SoftGelService WithDesign = new() { Id = 2, Name = "With Design", Price = 400m };
    private static readonly RemovalService NotMyWork = new() { Id = 5, Name = "Not My Work", Price = 150m };
    private static readonly StoneAddOn FrenchTip = new() { Id = 1, Name = "French Tip", Price = 15m };
    private static readonly StoneAddOn Chrome = new() { Id = 2, Name = "Chrome", Price = 10m };

    private readonly PriceService _prices = new(catalog: null!, Options.Create(new BookingOptions { DepositAmount = 150m }));

    [Fact]
    public void Service_without_add_ons_costs_its_base_price()
    {
        var quote = _prices.Calculate(new ServiceSelection(Plain, []));

        Assert.Equal(300m, quote.Total);
        Assert.Equal(150m, quote.Deposit);
        Assert.Equal(150m, quote.BalanceDue);
    }

    [Fact]
    public void Stone_add_ons_are_charged_per_nail()
    {
        var quote = _prices.Calculate(new ServiceSelection(WithDesign, [(FrenchTip, 3, NailHand.Right), (Chrome, 10, NailHand.Both)]));

        Assert.Equal([400m, 45m, 100m], quote.Lines.Select(l => l.LineTotal));
        Assert.Equal(545m, quote.Total);
        Assert.Equal(395m, quote.BalanceDue);
    }

    [Fact]
    public void Balance_never_goes_below_zero()
    {
        var cheap = new RemovalService { Id = 9, Name = "Cheap", Price = 100m };

        Assert.Equal(0m, _prices.Calculate(new ServiceSelection(cheap, [])).BalanceDue);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(11)]
    public void Stone_nail_count_must_be_between_1_and_10(int nails)
    {
        Assert.Throws<ValidationAppException>(() => _prices.Calculate(new ServiceSelection(Plain, [(Chrome, nails, NailHand.Both)])));
    }

    [Fact] // Liskov Substitution: every service type is priced through the base type.
    public void Any_service_type_can_be_priced_as_a_Service()
    {
        List<PricedItem> items = [new(Plain, 1), new(NotMyWork, 1), new(FrenchTip, 2)];

        Assert.Equal(480m, _prices.Calculate(items).Total);
    }

    [Fact]
    public void Main_services_can_only_be_ordered_once_per_booking()
    {
        Assert.Throws<ValidationAppException>(() => _prices.Calculate([new PricedItem(Plain, 2)]));
    }
}
