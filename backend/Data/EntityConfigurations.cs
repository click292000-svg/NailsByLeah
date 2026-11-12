using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using NailsByLeah.Api.Domain;
using NailsByLeah.Api.Validation;

namespace NailsByLeah.Api.Data;

// Table and column names are snake_case (UseSnakeCaseNamingConvention).
// CHECK / UNIQUE / NOT NULL constraints implement the Consistency rules of Ref 6.2.

internal sealed class UserConfiguration : IEntityTypeConfiguration<User>
{
    public void Configure(EntityTypeBuilder<User> b)
    {
        b.ToTable("users", t =>
        {
            t.HasCheckConstraint("ck_users_first_name_length", $"LEN([first_name]) BETWEEN 1 AND {InputLimits.NameMaxLength}");
            t.HasCheckConstraint("ck_users_last_name_length", $"LEN([last_name]) BETWEEN 1 AND {InputLimits.NameMaxLength}");
            t.HasCheckConstraint("ck_users_phone_digits",
                $"[phone_number] NOT LIKE '%[^0-9]%' AND LEN([phone_number]) = {InputLimits.PhoneDigits}");
            t.HasCheckConstraint("ck_users_failed_login_count", "[failed_login_count] >= 0");
        });
        b.Property(x => x.PhotoFileName).HasMaxLength(100);
        b.Property(x => x.PhotoContentType).HasMaxLength(40);

        b.Property(u => u.FirstName).HasMaxLength(InputLimits.NameMaxLength).IsRequired();
        b.Property(u => u.LastName).HasMaxLength(InputLimits.NameMaxLength).IsRequired();
        b.Property(u => u.Username).HasMaxLength(InputLimits.UsernameMaxLength).IsRequired();
        b.Property(u => u.Email).HasMaxLength(InputLimits.EmailMaxLength).IsRequired();
        b.Property(u => u.PhoneNumber).HasMaxLength(InputLimits.PhoneDigits).IsRequired();
        b.Property(u => u.PasswordHash).HasMaxLength(100).IsRequired();
        b.Property(u => u.TermsVersion).HasMaxLength(20);
        b.Property(u => u.SecurityStamp).HasMaxLength(40).IsRequired();
        b.Property(u => u.AdminNote).HasMaxLength(InputLimits.AdminNoteMaxLength);

        // Indexes on username and email (Ref 13.3) double as the UNIQUE constraints (Ref 6.2).
        b.HasIndex(u => u.Username).IsUnique().HasDatabaseName(IndexNames.UsersUsername);
        b.HasIndex(u => u.Email).IsUnique().HasDatabaseName(IndexNames.UsersEmail);
        b.HasIndex(u => u.PhoneNumber).IsUnique().HasDatabaseName(IndexNames.UsersPhoneNumber);
    }
}

internal sealed class CatalogServiceConfiguration : IEntityTypeConfiguration<CatalogService>
{
    public void Configure(EntityTypeBuilder<CatalogService> b)
    {
        b.ToTable("services", t =>
        {
            t.HasCheckConstraint("ck_services_price_non_negative", "[price] >= 0");
            t.HasCheckConstraint("ck_services_duration_range",
                $"[duration_minutes] BETWEEN {InputLimits.ServiceDurationMinMinutes} AND {InputLimits.ServiceDurationMaxMinutes}");
        });
        b.Property(s => s.DurationMinutes).HasDefaultValue(CatalogService.DefaultDurationMinutes);
        b.Property(s => s.Name).HasMaxLength(InputLimits.ServiceNameMaxLength).IsRequired();
        b.HasOne<CatalogService>().WithMany().HasForeignKey(s => s.DesignOptionOfId).OnDelete(DeleteBehavior.Restrict);

        b.HasDiscriminator<string>("category")
            .HasValue<SoftGelService>(SoftGelService.CategoryKey)
            .HasValue<RemovalService>(RemovalService.CategoryKey);
        b.Property("category").HasMaxLength(30);

        b.HasIndex("category", nameof(Service.Name)).IsUnique().HasDatabaseName("ux_services_category_name");
    }
}

internal sealed class StoneAddOnConfiguration : IEntityTypeConfiguration<StoneAddOn>
{
    public void Configure(EntityTypeBuilder<StoneAddOn> b)
    {
        b.ToTable("addons", t => t.HasCheckConstraint("ck_addons_price_non_negative", "[price] >= 0"));
        b.Property(a => a.Name).HasMaxLength(InputLimits.ServiceNameMaxLength).IsRequired();
        b.HasIndex(a => a.Name).IsUnique().HasDatabaseName("ux_addons_name");
    }
}

internal sealed class BookingConfiguration : IEntityTypeConfiguration<Booking>
{
    public void Configure(EntityTypeBuilder<Booking> b)
    {
        b.ToTable("bookings", t =>
        {
            t.HasCheckConstraint("ck_bookings_service_price_non_negative", "[service_price] >= 0");
            t.HasCheckConstraint("ck_bookings_deposit_non_negative", "[deposit_amount] >= 0");
            t.HasCheckConstraint("ck_bookings_duration_positive", "[duration_minutes] > 0");
            t.HasCheckConstraint("ck_bookings_amount_paid_non_negative", "[amount_paid] >= 0");
            t.HasCheckConstraint("ck_bookings_balance_received_non_negative", "[balance_received] >= 0");
            t.HasCheckConstraint("ck_bookings_removal_price_non_negative", "[removal_price] >= 0");
            t.HasCheckConstraint("ck_bookings_refund_due_non_negative", "[refund_due] >= 0");
        });

        b.Property(x => x.NailColor).HasMaxLength(InputLimits.NailColorMaxLength);
        b.Property(x => x.PerNailColors).HasMaxLength(InputLimits.PerNailColorsMaxLength);
        b.Property(x => x.ColorRequest).HasMaxLength(InputLimits.ColorRequestMaxLength);
        b.Property(x => x.TermsVersion).HasMaxLength(20);
        b.HasOne(x => x.RemovalService).WithMany().HasForeignKey(x => x.RemovalServiceId).OnDelete(DeleteBehavior.Restrict);

        b.Property(x => x.RowVersion).IsRowVersion();
        b.Property(x => x.Note).HasMaxLength(InputLimits.NoteMaxLength);
        b.Property(x => x.GuestName).HasMaxLength(InputLimits.GuestNameMaxLength);
        b.Property(x => x.GuestPhone).HasMaxLength(InputLimits.PhoneDigits);
        b.Property(x => x.BalanceReference).HasMaxLength(InputLimits.BalanceReferenceMaxLength);
        b.Property(x => x.RefundReference).HasMaxLength(InputLimits.BalanceReferenceMaxLength);
        b.HasOne(x => x.ConfirmedBy).WithMany().HasForeignKey(x => x.ConfirmedByUserId);
        b.HasOne(x => x.Client).WithMany().HasForeignKey(x => x.ClientId);
        b.HasOne(x => x.Service).WithMany().HasForeignKey(x => x.ServiceId);
        b.HasMany(x => x.AddOns).WithOne(a => a.Booking).HasForeignKey(a => a.BookingId);
        b.HasMany(x => x.Payments).WithOne(p => p.Booking).HasForeignKey(p => p.BookingId);
        b.HasOne(x => x.Cancellation).WithOne(c => c.Booking).HasForeignKey<Cancellation>(c => c.BookingId);

        // booking_date and status indexes (Ref 13.3).
        b.HasIndex(x => new { x.BookingDate, x.StartTime }, "ix_bookings_booking_date_start_time")
            .HasDatabaseName("ix_bookings_booking_date_start_time");
        b.HasIndex(x => x.Status).HasDatabaseName("ix_bookings_status");
        b.HasIndex(x => x.ClientId).HasDatabaseName("ix_bookings_client_id");

        // Overlaps are prevented under the per-day booking lock (IBookingRepository.LockDayAsync). This index
        // is the last line of defence for the simplest case: two active bookings starting at the same time.
        b.HasIndex(x => new { x.BookingDate, x.StartTime }, IndexNames.BookingsActiveSlot)
            .HasDatabaseName(IndexNames.BookingsActiveSlot)
            .IsUnique()
            .HasFilter("[status] IN ('Pending', 'Confirmed') AND [is_deleted] = 0");
    }
}

internal sealed class BookingAddOnConfiguration : IEntityTypeConfiguration<BookingAddOn>
{
    public void Configure(EntityTypeBuilder<BookingAddOn> b)
    {
        b.ToTable("booking_addons", t =>
        {
            t.HasCheckConstraint("ck_booking_addons_nail_count", $"[nail_count] BETWEEN 1 AND {StoneAddOn.MaxNails}");
            t.HasCheckConstraint("ck_booking_addons_line_price_non_negative", "[line_price] >= 0");
            t.HasCheckConstraint("ck_booking_addons_hand",
                $"[hand] = 'Both' OR ([hand] IN ('Left', 'Right') AND [nail_count] <= {StoneAddOn.MaxNailsPerHand})");
        });
        b.HasOne(x => x.AddOn).WithMany().HasForeignKey(x => x.AddOnId);
        b.HasIndex(x => new { x.BookingId, x.AddOnId }).IsUnique().HasDatabaseName("ux_booking_addons_booking_addon");
    }
}

internal sealed class PaymentConfiguration : IEntityTypeConfiguration<Payment>
{
    public void Configure(EntityTypeBuilder<Payment> b)
    {
        b.ToTable("payments", t =>
        {
            t.HasCheckConstraint("ck_payments_amount_positive", "[amount] > 0");
            t.HasCheckConstraint("ck_payments_balance_after", "[balance_after] >= 0 AND [total_amount] >= 0");
        });
        b.HasOne<User>().WithMany().HasForeignKey(x => x.ClientId);
        b.HasOne<User>().WithMany().HasForeignKey(x => x.VerifiedByUserId);
        b.Property(x => x.ReferenceNumber).HasMaxLength(64).IsRequired();
        b.HasIndex(x => x.ReferenceNumber).IsUnique().HasDatabaseName("ux_payments_reference_number");
        b.HasIndex(x => x.IdempotencyKey).IsUnique().HasDatabaseName(IndexNames.PaymentsIdempotencyKey);
        b.HasIndex(x => x.PaidAt).HasDatabaseName("ix_payments_paid_at");
    }
}

internal sealed class CancellationConfiguration : IEntityTypeConfiguration<Cancellation>
{
    public void Configure(EntityTypeBuilder<Cancellation> b)
    {
        b.ToTable("cancellations");
        b.Property(x => x.Reason).HasMaxLength(40).IsRequired();
        b.Property(x => x.Explanation).HasMaxLength(InputLimits.ExplanationMaxLength);
        b.HasOne(x => x.CancelledBy).WithMany().HasForeignKey(x => x.CancelledByUserId);
        b.HasIndex(x => x.BookingId).IsUnique().HasDatabaseName("ux_cancellations_booking_id");
    }
}

internal sealed class AuditLogConfiguration : IEntityTypeConfiguration<AuditLog>
{
    public void Configure(EntityTypeBuilder<AuditLog> b)
    {
        b.ToTable("audit_logs");
        b.Property(x => x.Action).HasMaxLength(100).IsRequired();
        b.Property(x => x.EntityType).HasMaxLength(50);
        b.Property(x => x.EntityId).HasMaxLength(50);
        b.Property(x => x.Details).HasMaxLength(500);
        b.Property(x => x.IpAddress).HasMaxLength(45);
        b.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId);
        b.HasIndex(x => x.CreatedAt).HasDatabaseName("ix_audit_logs_created_at");
    }
}

internal sealed class BlockedSlotConfiguration : IEntityTypeConfiguration<BlockedSlot>
{
    public void Configure(EntityTypeBuilder<BlockedSlot> b)
    {
        b.ToTable("blocked_slots", t =>
        {
            t.HasCheckConstraint("ck_blocked_slots_period", "([start_time] IS NULL AND [end_time] IS NULL) OR [end_time] > [start_time]");
        });
        b.Property(x => x.Reason).HasMaxLength(InputLimits.BlockReasonMaxLength);
        b.HasOne(x => x.CreatedBy).WithMany().HasForeignKey(x => x.CreatedByUserId);
        b.HasIndex(x => x.Date).HasDatabaseName("ix_blocked_slots_date");
    }
}

internal sealed class UserTokenConfiguration : IEntityTypeConfiguration<UserToken>
{
    public void Configure(EntityTypeBuilder<UserToken> b)
    {
        b.ToTable("user_tokens");
        b.Property(x => x.TokenHash).HasMaxLength(64).IsRequired();
        b.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId);
        b.HasIndex(x => x.TokenHash).IsUnique().HasDatabaseName("ux_user_tokens_token_hash");
        b.HasIndex(x => new { x.UserId, x.Purpose }).HasDatabaseName("ix_user_tokens_user_purpose");
    }
}

internal sealed class ReferenceImageConfiguration : IEntityTypeConfiguration<ReferenceImage>
{
    public void Configure(EntityTypeBuilder<ReferenceImage> b)
    {
        b.ToTable("reference_images", t =>
        {
            t.HasCheckConstraint("ck_reference_images_size", $"[size_bytes] > 0 AND [size_bytes] <= {UploadLimits.ReferenceImageMaxBytes}");
            t.HasCheckConstraint("ck_reference_images_content_type", "[content_type] IN ('image/jpeg', 'image/png', 'image/webp')");
        });
        b.Ignore(x => x.IsAttached);
        b.Property(x => x.StoredFileName).HasMaxLength(64).IsRequired();
        b.Property(x => x.ContentType).HasMaxLength(20).IsRequired();
        b.HasOne(x => x.Client).WithMany().HasForeignKey(x => x.ClientId);
        b.HasOne(x => x.Booking).WithMany(x => x.ReferenceImages).HasForeignKey(x => x.BookingId);
        b.HasIndex(x => x.StoredFileName).IsUnique().HasDatabaseName("ux_reference_images_stored_file_name");
        b.HasIndex(x => x.BookingId).HasDatabaseName("ix_reference_images_booking_id");
        b.HasIndex(x => new { x.ClientId, x.BookingId }).HasDatabaseName("ix_reference_images_client_booking");
    }
}

internal sealed class BookingDraftConfiguration : IEntityTypeConfiguration<BookingDraft>
{
    public void Configure(EntityTypeBuilder<BookingDraft> b)
    {
        b.ToTable("booking_drafts", t => t.HasCheckConstraint("ck_booking_drafts_data_json", "ISJSON([data]) = 1"));
        b.Property(x => x.Data).HasMaxLength(InputLimits.BookingDraftMaxLength).IsRequired();
        b.HasOne(x => x.Client).WithMany().HasForeignKey(x => x.ClientId);
        // One draft per client.
        b.HasIndex(x => x.ClientId).IsUnique().HasDatabaseName(IndexNames.BookingDraftsClient);
    }
}

internal sealed class FeedbackConfiguration : IEntityTypeConfiguration<Feedback>
{
    public void Configure(EntityTypeBuilder<Feedback> b)
    {
        b.ToTable("feedback", t =>
            t.HasCheckConstraint("ck_feedback_rating", $"[rating] BETWEEN {Feedback.MinRating} AND {Feedback.MaxRating}"));
        b.Property(x => x.Comment).HasMaxLength(InputLimits.FeedbackCommentMaxLength);
        b.Property(x => x.Reply).HasMaxLength(InputLimits.FeedbackReplyMaxLength);
        b.HasOne(x => x.Client).WithMany().HasForeignKey(x => x.ClientId);
        b.HasIndex(x => x.SubmissionKey).IsUnique().HasDatabaseName(IndexNames.FeedbackSubmissionKey);
        b.HasIndex(x => x.CreatedAt).HasDatabaseName("ix_feedback_created_at");
        b.HasIndex(x => x.ClientId).HasDatabaseName("ix_feedback_client_id");
    }
}

internal sealed class GalleryPhotoConfiguration : IEntityTypeConfiguration<GalleryPhoto>
{
    public void Configure(EntityTypeBuilder<GalleryPhoto> b)
    {
        b.ToTable("gallery_photos");
        b.Property(x => x.FileName).HasMaxLength(100).IsRequired();
        b.Property(x => x.ContentType).HasMaxLength(40).IsRequired();
        b.Property(x => x.Caption).HasMaxLength(InputLimits.GalleryCaptionMaxLength);
        b.HasIndex(x => x.CreatedAt).HasDatabaseName("ix_gallery_photos_created_at");
    }
}

public static class IndexNames
{
    public const string BookingDraftsClient = "ux_booking_drafts_client_id";
    public const string FeedbackSubmissionKey = "ux_feedback_submission_key";
    public const string UsersUsername = "ux_users_username";
    public const string UsersEmail = "ux_users_email";
    public const string UsersPhoneNumber = "ux_users_phone_number";
    public const string BookingsActiveSlot = "ux_bookings_active_slot";
    public const string PaymentsIdempotencyKey = "ux_payments_idempotency_key";
}

internal sealed class SalonSettingsConfiguration : IEntityTypeConfiguration<SalonSettings>
{
    public void Configure(EntityTypeBuilder<SalonSettings> b)
    {
        b.ToTable("salon_settings", t => t.HasCheckConstraint("ck_salon_settings_single_row", $"[id] = {SalonSettings.SingletonId}"));
        b.Property(x => x.Id).ValueGeneratedNever();
        b.Property(x => x.Phone).HasMaxLength(20);
        b.Property(x => x.PaymentAccountName).HasMaxLength(Services.SalonProfileService.PaymentNameMaxLength);
        b.Property(x => x.FacebookUrl).HasMaxLength(Services.SalonProfileService.UrlMaxLength);
        b.Property(x => x.InstagramUrl).HasMaxLength(Services.SalonProfileService.UrlMaxLength);
        b.Property(x => x.InstagramHandle).HasMaxLength(Services.SalonProfileService.HandleMaxLength);
        b.Property(x => x.Bio).HasMaxLength(Services.SalonProfileService.BioMaxLength);
        b.Property(x => x.PhotoFileName).HasMaxLength(100);
        b.Property(x => x.PhotoContentType).HasMaxLength(40);
        b.Property(x => x.OutOfStockColors).HasMaxLength(2000);
        b.HasData(new SalonSettings
        {
            Id = SalonSettings.SingletonId,
            ClosingTime = SalonSettings.DefaultClosingTime,
            UpdatedAt = new DateTime(2026, 11, 2, 0, 0, 0, DateTimeKind.Utc),
        });
    }
}
