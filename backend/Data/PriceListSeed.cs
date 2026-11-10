using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using NailsByLeah.Api.Domain;

namespace NailsByLeah.Api.Data;

/// <summary>
/// The approved price list (Ref 4), inserted by the initial migration. Durations as Leyah set them on 2026-11-10;
/// she can change them on the admin Services page.
/// </summary>
internal sealed class PriceListSeed : IEntityTypeConfiguration<SoftGelService>, IEntityTypeConfiguration<RemovalService>
{
    private static readonly DateTime SeededAt = new(2026, 11, 1, 0, 0, 0, DateTimeKind.Utc);

    public void Configure(EntityTypeBuilder<SoftGelService> b) => b.HasData(
        new SoftGelService { Id = 1, Name = "Plain", Price = 300m, DurationMinutes = 120, AllowsAddOns = false, CreatedAt = SeededAt, UpdatedAt = SeededAt },
        new SoftGelService { Id = 2, Name = "With Design", Price = 400m, DurationMinutes = 180, CreatedAt = SeededAt, UpdatedAt = SeededAt },
        new SoftGelService { Id = 3, Name = "BIAB", Price = 250m, DurationMinutes = 180, CreatedAt = SeededAt, UpdatedAt = SeededAt });

    public void Configure(EntityTypeBuilder<RemovalService> b) => b.HasData(
        new RemovalService { Id = 4, Name = "My Work", Price = 100m, DurationMinutes = 60, AllowsAddOns = false, CreatedAt = SeededAt, UpdatedAt = SeededAt },
        new RemovalService { Id = 5, Name = "Not My Work", Price = 150m, DurationMinutes = 60, AllowsAddOns = false, CreatedAt = SeededAt, UpdatedAt = SeededAt });

    internal sealed class AddOns : IEntityTypeConfiguration<StoneAddOn>
    {
        public void Configure(EntityTypeBuilder<StoneAddOn> b) => b.HasData(
            new StoneAddOn { Id = 1, Name = "French Tip", Price = 15m, CreatedAt = SeededAt, UpdatedAt = SeededAt },
            new StoneAddOn { Id = 2, Name = "Chrome", Price = 10m, CreatedAt = SeededAt, UpdatedAt = SeededAt },
            new StoneAddOn { Id = 3, Name = "Cat Eye Polish", Price = 10m, CreatedAt = SeededAt, UpdatedAt = SeededAt },
            new StoneAddOn { Id = 4, Name = "Blooming Gel", Price = 10m, CreatedAt = SeededAt, UpdatedAt = SeededAt },
            new StoneAddOn { Id = 5, Name = "Embossed Art", Price = 15m, CreatedAt = SeededAt, UpdatedAt = SeededAt });
    }
}
