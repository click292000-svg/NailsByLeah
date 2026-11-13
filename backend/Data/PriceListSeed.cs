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
        // Plain's design version, retired on 2026-11-13 (only Soft Gel Extension and BIAB take a design). Kept so bookings
        // made with it still show their service.
        new SoftGelService { Id = 2, Name = "With Design", Price = 400m, DurationMinutes = 180, DesignOptionOfId = 1, IsActive = false, IsDeleted = true, CreatedAt = SeededAt, UpdatedAt = SeededAt },
        new SoftGelService { Id = 3, Name = "BIAB", Price = 250m, DurationMinutes = 180, CreatedAt = SeededAt, UpdatedAt = SeededAt },
        // Added with Leyah's revisions (2026-11-12). Soft Gel Extension takes 1-2 hours, so its slot is 2 hours.
        new SoftGelService { Id = 6, Name = "BIAB with Design", Price = 350m, DurationMinutes = 240, DesignOptionOfId = 3, CreatedAt = SeededAt, UpdatedAt = SeededAt },
        new SoftGelService { Id = 7, Name = "Soft Gel Extension", Price = 399m, DurationMinutes = 120, CreatedAt = SeededAt, UpdatedAt = SeededAt },
        // A design adds ₱100 and 1 hour to its set (CatalogService.FollowSet).
        new SoftGelService { Id = 8, Name = "Soft Gel Extension with Design", Price = 499m, DurationMinutes = 180, DesignOptionOfId = 7, CreatedAt = SeededAt, UpdatedAt = SeededAt });

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
            new StoneAddOn { Id = 5, Name = "Embossed Art", Price = 15m, CreatedAt = SeededAt, UpdatedAt = SeededAt },
            new StoneAddOn { Id = 6, Name = "Rhinestone", Price = 15m, CreatedAt = SeededAt, UpdatedAt = SeededAt });
    }
}
