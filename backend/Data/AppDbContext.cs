using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using NailsByLeah.Api.Domain;

namespace NailsByLeah.Api.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<CatalogService> Services => Set<CatalogService>();
    public DbSet<StoneAddOn> AddOns => Set<StoneAddOn>();
    public DbSet<Booking> Bookings => Set<Booking>();
    public DbSet<BookingAddOn> BookingAddOns => Set<BookingAddOn>();
    public DbSet<Payment> Payments => Set<Payment>();
    public DbSet<Cancellation> Cancellations => Set<Cancellation>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<BlockedSlot> BlockedSlots => Set<BlockedSlot>();
    public DbSet<UserToken> UserTokens => Set<UserToken>();
    public DbSet<ReferenceImage> ReferenceImages => Set<ReferenceImage>();
    public DbSet<SalonSettings> SalonSettings => Set<SalonSettings>();
    public DbSet<BookingDraft> BookingDrafts => Set<BookingDraft>();
    public DbSet<Feedback> Feedback => Set<Feedback>();

    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        // Enums are stored as readable strings.
        configurationBuilder.Properties<UserRole>().HaveConversion<string>().HaveMaxLength(20);
        configurationBuilder.Properties<BookingStatus>().HaveConversion<string>().HaveMaxLength(20);
        configurationBuilder.Properties<PaymentMethod>().HaveConversion<string>().HaveMaxLength(20);
        configurationBuilder.Properties<PaymentStatus>().HaveConversion<string>().HaveMaxLength(20);
        configurationBuilder.Properties<UserTokenPurpose>().HaveConversion<string>().HaveMaxLength(30);
        configurationBuilder.Properties<NailHand>().HaveConversion<string>().HaveMaxLength(10);
        configurationBuilder.Properties<PaymentOption>().HaveConversion<string>().HaveMaxLength(10);

        configurationBuilder.Properties<decimal>().HavePrecision(10, 2);

        // All timestamps are stored in UTC; mark them as UTC when read back.
        configurationBuilder.Properties<DateTime>().HaveConversion<UtcDateTimeConverter>();
        configurationBuilder.Properties<DateTime?>().HaveConversion<UtcDateTimeConverter>();
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(AppDbContext).Assembly);

        // No cascading deletes anywhere: records are soft-deleted, and a booking with
        // payments can never be removed (Ref 13.4). SQL Server implements RESTRICT as NO ACTION.
        foreach (var foreignKey in modelBuilder.Model.GetEntityTypes().SelectMany(e => e.GetForeignKeys()))
            foreignKey.DeleteBehavior = DeleteBehavior.Restrict;
    }

    private sealed class UtcDateTimeConverter() : ValueConverter<DateTime, DateTime>(
        v => v.Kind == DateTimeKind.Utc ? v : v.ToUniversalTime(),
        v => DateTime.SpecifyKind(v, DateTimeKind.Utc));
}
